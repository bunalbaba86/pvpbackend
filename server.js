const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// Oyun odaları
let waitingPlayer = null;
const games = new Map(); // roomId -> gameState

// Oyun başlangıç parametreleri
function createNewGame(player1Id, player2Id) {
  return {
    players: [player1Id, player2Id],
    turnIndex: 0, // 0 veya 1
    playersData: [
      { health: 100, mana: 50 },
      { health: 100, mana: 50 }
    ],
    gameOver: false
  };
}

function canPerformMove(move, playerData) {
  // Mana kontrolü
  switch(move) {
    case 'attack': return playerData.mana >= 10;
    case 'defend': return playerData.mana >= 5;
    case 'skill':  return playerData.mana >= 20;
    case 'mana':   return true;
    default: return false;
  }
}

function applyMove(move, currentPlayerData, otherPlayerData) {
  switch(move) {
    case 'attack':
      currentPlayerData.mana -= 10;
      otherPlayerData.health -= 15;
      break;
    case 'defend':
      currentPlayerData.mana -= 5;
      currentPlayerData.health += 10; // Defend healing
      if (currentPlayerData.health > 100) currentPlayerData.health = 100;
      break;
    case 'skill':
      currentPlayerData.mana -= 20;
      otherPlayerData.health -= 30;
      break;
    case 'mana':
      currentPlayerData.mana += 15;
      if (currentPlayerData.mana > 50) currentPlayerData.mana = 50;
      break;
  }
}

function checkGameOver(game) {
  if (game.playersData[0].health <= 0) {
    game.gameOver = true;
    return 1; // player 1 lost, player 2 won (index 1)
  }
  if (game.playersData[1].health <= 0) {
    game.gameOver = true;
    return 0; // player 0 won
  }
  return -1; // oyun devam ediyor
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  if (waitingPlayer === null) {
    waitingPlayer = socket.id;
    socket.emit('waitingForOpponent');
  } else {
    // Yeni oyun başlat
    const roomId = waitingPlayer + '#' + socket.id;
    const game = createNewGame(waitingPlayer, socket.id);
    games.set(roomId, game);

    socket.join(roomId);
    io.sockets.sockets.get(waitingPlayer)?.join(roomId);

    // Oyunculara bilgi gönder
    io.to(waitingPlayer).emit('gameStart', {
      yourIndex: 0,
      you: game.playersData[0],
      enemy: game.playersData[1]
    });

    io.to(socket.id).emit('gameStart', {
      yourIndex: 1,
      you: game.playersData[1],
      enemy: game.playersData[0]
    });

    // Bekleyen oyuncu boşaltıldı
    waitingPlayer = null;

    // Oyun odasında hareketleri dinle
    io.in(roomId).on('playerMove', (data) => {
      // Boş, oyunu başlatan taraf handle eder
    });
  }

  socket.on('playerMove', ({ move }) => {
    // Oyuncunun odasını bul
    let playerRoom = null;
    for (let room of socket.rooms) {
      if (room !== socket.id) {
        playerRoom = room;
        break;
      }
    }
    if (!playerRoom) {
      socket.emit('errorMessage', 'You are not in a game room.');
      return;
    }

    const game = games.get(playerRoom);
    if (!game || game.gameOver) {
      socket.emit('errorMessage', 'Game is not active.');
      return;
    }

    const playerIndex = game.players.indexOf(socket.id);
    if (playerIndex !== game.turnIndex) {
      socket.emit('errorMessage', 'Not your turn.');
      return;
    }

    const currentPlayerData = game.playersData[playerIndex];
    const otherPlayerData = game.playersData[1 - playerIndex];

    if (!canPerformMove(move, currentPlayerData)) {
      socket.emit('errorMessage', 'Not enough mana or invalid move.');
      return;
    }

    applyMove(move, currentPlayerData, otherPlayerData);

    // Sağlık 0 altına inmesin
    if (currentPlayerData.health < 0) currentPlayerData.health = 0;
    if (otherPlayerData.health < 0) otherPlayerData.health = 0;

    // Sıra değiştir
    game.turnIndex = 1 - game.turnIndex;

    // Kazanan var mı?
    const winnerIndex = checkGameOver(game);

    if (winnerIndex !== -1) {
      game.gameOver = true;

      io.to(playerRoom).emit('gameOver', {
        winner: winnerIndex === playerIndex ? 'player' : 'enemy'
      });
      return;
    }

    // Güncel durumu oyunculara yolla
    // Kendi oyuncusuna farklı, diğer oyuncuya ters yansıtacağız

    // Aktif oyuncuya hareket onay mesajı
    socket.emit('moveConfirmed', {
      you: game.playersData[playerIndex],
      enemy: game.playersData[1 - playerIndex]
    });

    // Diğer oyuncuya hamle bildirimi ve sıra geçişi
    const otherPlayerId = game.players[1 - playerIndex];
    io.to(otherPlayerId).emit('enemyMove', {
      you: game.playersData[1 - playerIndex],
      enemy: game.playersData[playerIndex]
    });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    // Bekliyorsa bekleyen oyuncu sıfırlanır
    if (waitingPlayer === socket.id) waitingPlayer = null;

    // Oyuncunun oyun odasını bul ve rakibine oyunun bittiğini bildir
    for (const [roomId, game] of games.entries()) {
      if (game.players.includes(socket.id)) {
        games.delete(roomId);
        const otherPlayerId = game.players.find(id => id !== socket.id);
        if (otherPlayerId) {
          io.to(otherPlayerId).emit('gameOver', {
            winner: 'player' // Oyuncu rakip disconnect olunca kazandı sayılır
          });
        }
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
