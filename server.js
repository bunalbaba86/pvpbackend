const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 10000;

let waitingPlayer = null;
let rooms = {};

function createNewGame(player1, player2, roomId) {
  const player1Data = {
    health: 100,
    mana: 50,
    power: Math.floor(Math.random() * 20) + 10,
    lastMoveTime: 0
  };
  const player2Data = {
    health: 100,
    mana: 50,
    power: Math.floor(Math.random() * 20) + 10,
    lastMoveTime: 0
  };

  rooms[roomId] = {
    players: [player1, player2],
    gameState: [player1Data, player2Data],
    turn: 0
  };

  player1.join(roomId);
  player2.join(roomId);

  // Oyunculara kendi ID'sini ve rakibini gönder
  player1.emit('gameStart', {
    you: player1Data,
    enemy: player2Data,
    yourIndex: 0
  });

  player2.emit('gameStart', {
    you: player2Data,
    enemy: player1Data,
    yourIndex: 1
  });
}

function applyMove(player, enemy, move) {
  const now = Date.now();
  if (now - player.lastMoveTime < 3000) {
    return { success: false, error: 'Cooldown active. Wait a moment.' };
  }

  switch (move) {
    case 'attack':
      if (player.mana < 10) return { success: false, error: 'Not enough mana.' };
      enemy.health -= 10 + player.power;
      player.mana -= 10;
      break;

    case 'defend':
      if (player.mana < 5) return { success: false, error: 'Not enough mana.' };
      player.health = Math.min(player.health + 10, 100);
      player.mana -= 5;
      break;

    case 'skill':
      if (player.mana < 20) return { success: false, error: 'Not enough mana.' };
      enemy.health -= 25 + player.power;
      player.mana -= 20;
      break;

    case 'mana':
      player.mana = Math.min(player.mana + 15, 50);
      break;

    default:
      return { success: false, error: 'Invalid move.' };
  }

  if (enemy.health < 0) enemy.health = 0;
  if (player.health < 0) player.health = 0;
  player.lastMoveTime = now;
  return { success: true };
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  if (!waitingPlayer) {
    waitingPlayer = socket;
    socket.emit('waitingForOpponent');
  } else {
    const roomId = `room-${waitingPlayer.id}-${socket.id}`;
    createNewGame(waitingPlayer, socket, roomId);
    waitingPlayer = null;
  }

  socket.on('playerMove', ({ move }) => {
    const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
    const room = rooms[roomId];
    if (!room) return;

    const playerIndex = room.players.indexOf(socket);
    const enemyIndex = playerIndex === 0 ? 1 : 0;

    if (room.turn !== playerIndex) {
      socket.emit('errorMessage', 'Not your turn!');
      return;
    }

    const player = room.gameState[playerIndex];
    const enemy = room.gameState[enemyIndex];

    const result = applyMove(player, enemy, move);
    if (!result.success) {
      socket.emit('errorMessage', result.error);
      return;
    }

    // Kazanma kontrolü
    if (enemy.health <= 0) {
      room.players[playerIndex].emit('gameOver', { winner: true });
      room.players[enemyIndex].emit('gameOver', { winner: false });
      delete rooms[roomId];
      return;
    }

    if (player.health <= 0) {
      room.players[playerIndex].emit('gameOver', { winner: false });
      room.players[enemyIndex].emit('gameOver', { winner: true });
      delete rooms[roomId];
      return;
    }

    // Sıra değiştir ve oyuncuları bilgilendir
    room.turn = enemyIndex;

    room.players[playerIndex].emit('moveConfirmed', {
      you: player,
      enemy: enemy
    });

    room.players[enemyIndex].emit('enemyMove', {
      move,
      you: enemy,
      enemy: player
    });
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);

    if (waitingPlayer === socket) {
      waitingPlayer = null;
      return;
    }

    // Odayı bul ve rakibe bildir
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.includes(socket)) {
        const enemy = room.players.find(s => s !== socket);
        if (enemy) {
          enemy.emit('gameOver', { winner: true, reason: 'opponent_disconnected' });
        }
        delete rooms[roomId];
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
