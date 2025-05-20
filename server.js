const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  }
});

const PORT = process.env.PORT || 10000;

// Oda ve oyuncu yönetimi
let waitingPlayer = null;
let rooms = {}; // roomId: { players: [socket1, socket2], gameState: {...}, turn: 0 or 1 }

function createNewGame(player1, player2, roomId) {
  // Rastgele güçler (örnek: health ve mana başlangıçları)
  const player1Data = {
    health: 100,
    mana: 50,
    power: Math.floor(Math.random() * 20) + 10, // 10-30 arası rastgele güç
    lastMoveTime: 0,
  };
  const player2Data = {
    health: 100,
    mana: 50,
    power: Math.floor(Math.random() * 20) + 10,
    lastMoveTime: 0,
  };

  rooms[roomId] = {
    players: [player1, player2],
    gameState: [player1Data, player2Data],
    turn: 0, // player1 başlar
  };

  // Odaya sok
  player1.join(roomId);
  player2.join(roomId);

  // Oyun başlangıcı bilgisi gönder
  io.to(roomId).emit('gameStart', {
    player: player1Data,
    enemy: player2Data,
  });
}

function applyMove(playerState, enemyState, move) {
  const now = Date.now();
  if (now - playerState.lastMoveTime < 3000) {
    return { success: false, error: 'Cooldown active, wait before next move.' };
  }

  switch (move) {
    case 'attack':
      if (playerState.mana < 10) return { success: false, error: 'Not enough mana for attack.' };
      enemyState.health -= 10 + playerState.power;
      playerState.mana -= 10;
      break;

    case 'defend':
      if (playerState.mana < 5) return { success: false, error: 'Not enough mana for defend.' };
      playerState.health += 5; // Defend ile biraz can kazan
      if (playerState.health > 100) playerState.health = 100;
      playerState.mana -= 5;
      break;

    case 'skill':
      if (playerState.mana < 20) return { success: false, error: 'Not enough mana for skill.' };
      enemyState.health -= 25 + playerState.power;
      playerState.mana -= 20;
      break;

    case 'mana':
      // Mana artışı
      playerState.mana += 15;
      if (playerState.mana > 50) playerState.mana = 50;
      break;

    default:
      return { success: false, error: 'Unknown move.' };
  }

  if (enemyState.health < 0) enemyState.health = 0;
  if (playerState.health < 0) playerState.health = 0;

  playerState.lastMoveTime = now;
  return { success: true };
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  if (waitingPlayer === null) {
    waitingPlayer = socket;
    socket.emit('waitingForOpponent');
  } else {
    // Rakip bulundu, yeni oda oluştur
    const roomId = `room-${socket.id}-${waitingPlayer.id}`;
    createNewGame(waitingPlayer, socket, roomId);
    waitingPlayer = null;
  }

  socket.on('playerMove', (data) => {
    // Hangi odada, hangi oyuncu?
    const roomsOfSocket = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (roomsOfSocket.length === 0) {
      socket.emit('errorMessage', 'You are not in a game room.');
      return;
    }
    const roomId = roomsOfSocket[0];
    const room = rooms[roomId];
    if (!room) {
      socket.emit('errorMessage', 'Game room not found.');
      return;
    }

    const playerIndex = room.players.indexOf(socket);
    if (playerIndex === -1) {
      socket.emit('errorMessage', 'You are not a player in this room.');
      return;
    }

    if (room.turn !== playerIndex) {
      socket.emit('errorMessage', 'Not your turn.');
      return;
    }

    const playerState = room.gameState[playerIndex];
    const enemyIndex = playerIndex === 0 ? 1 : 0;
    const enemyState = room.gameState[enemyIndex];

    // Hamleyi uygula
    const result = applyMove(playerState, enemyState, data.move);

    if (!result.success) {
      socket.emit('errorMessage', result.error);
      return;
    }

    // Hamle başarılıysa
    // Oyun sonu kontrolü
    if (enemyState.health <= 0) {
      io.to(roomId).emit('gameOver', { winner: 'player' });
      delete rooms[roomId];
      return;
    }
    if (playerState.health <= 0) {
      io.to(roomId).emit('gameOver', { winner: 'enemy' });
      delete rooms[roomId];
      return;
    }

    // Hamle onayı ve durum güncelleme
    socket.emit('moveConfirmed', {
      player: playerState,
      enemy: enemyState,
    });

    // Rakibe hamleyi gönder
    room.players[enemyIndex].emit('enemyMove', {
      move: data.move,
      player: enemyState,
      enemy: playerState,
    });

    // Sıra diğer oyuncuya geçsin
    room.turn = enemyIndex;
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Oyuncu disconnect olunca odadan çıkar ve rakip kazanır
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.includes(socket)) {
        const otherPlayer = room.players.find(p => p !== socket);
        if (otherPlayer) {
          otherPlayer.emit('gameOver', { winner: 'player' });
        }
        delete rooms[roomId];
      }
    }
    if (waitingPlayer === socket) waitingPlayer = null;
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
