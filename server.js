const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

let waitingPlayer = null;
const games = new Map(); // roomId -> gameState

function createNewGame(player1Id, player2Id) {
  return {
    players: [player1Id, player2Id],
    turnIndex: 0,
    playersData: [
      { health: 100, mana: 50, defend: false },
      { health: 100, mana: 50, defend: false }
    ],
    gameOver: false
  };
}

function canPerformMove(move, playerData) {
  switch (move) {
    case 'attack': return playerData.mana >= 10;
    case 'defend': return playerData.mana >= 5;
    case 'skill': return playerData.mana >= 20;
    case 'mana': return true;
    default: return false;
  }
}

function getRandom(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applyMove(move, currentPlayerData, otherPlayerData) {
  let result = { move, damage: 0, heal: 0, manaGain: 0 };

  switch (move) {
    case 'attack': {
      currentPlayerData.mana -= 10;
      const baseDamage = getRandom(10, 20);
      const damage = otherPlayerData.defend ? Math.floor(baseDamage / 2) : baseDamage;
      otherPlayerData.health -= damage;
      otherPlayerData.defend = false;
      result.damage = damage;
      break;
    }
    case 'defend': {
      currentPlayerData.mana -= 5;
      currentPlayerData.defend = true;
      result.damage = 0;
      break;
    }
    case 'skill': {
      currentPlayerData.mana -= 20;
      const baseDamage = getRandom(25, 40);
      const damage = otherPlayerData.defend ? Math.floor(baseDamage / 2) : baseDamage;
      otherPlayerData.health -= damage;
      otherPlayerData.defend = false;
      result.damage = damage;
      break;
    }
    case 'mana': {
      const manaGain = getRandom(10, 20);
      currentPlayerData.mana += manaGain;
      if (currentPlayerData.mana > 50) currentPlayerData.mana = 50;
      result.manaGain = manaGain;
      break;
    }
  }

  currentPlayerData.mana = Math.max(0, currentPlayerData.mana);
  currentPlayerData.health = Math.min(100, currentPlayerData.health);
  otherPlayerData.health = Math.max(0, otherPlayerData.health);

  return result;
}

function checkGameOver(game) {
  if (game.playersData[0].health <= 0) {
    game.gameOver = true;
    return 1;
  }
  if (game.playersData[1].health <= 0) {
    game.gameOver = true;
    return 0;
  }
  return -1;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  socket.playerIndex = null;
  socket.roomId = null;

  if (waitingPlayer === null) {
    waitingPlayer = socket.id;
    socket.emit('waitingForOpponent');
  } else {
    const roomId = waitingPlayer + '#' + socket.id;
    const game = createNewGame(waitingPlayer, socket.id);
    games.set(roomId, game);

    const player1Socket = io.sockets.sockets.get(waitingPlayer);
    const player2Socket = socket;

    player1Socket.join(roomId);
    player2Socket.join(roomId);

    player1Socket.playerIndex = 0;
    player1Socket.roomId = roomId;
    player2Socket.playerIndex = 1;
    player2Socket.roomId = roomId;

    player1Socket.emit('gameStart', {
      yourIndex: 0,
      you: game.playersData[0],
      enemy: game.playersData[1]
    });

    player2Socket.emit('gameStart', {
      yourIndex: 1,
      you: game.playersData[1],
      enemy: game.playersData[0]
    });

    waitingPlayer = null;
  }

  socket.on('chatMessage', ({ message }) => {
    if (!socket.roomId || socket.playerIndex === null) return;
    socket.to(socket.roomId).emit('chatMessage', {
      message,
      fromIndex: socket.playerIndex
    });
  });

  socket.on('playerMove', ({ move }) => {
    const roomId = socket.roomId;
    const playerIndex = socket.playerIndex;

    if (!roomId || playerIndex === null) {
      socket.emit('errorMessage', 'You are not in a game room.');
      return;
    }

    const game = games.get(roomId);
    if (!game || game.gameOver) {
      socket.emit('errorMessage', 'Game is not active.');
      return;
    }

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

    const result = applyMove(move, currentPlayerData, otherPlayerData);

    const winnerIndex = checkGameOver(game);
    if (winnerIndex !== -1) {
      io.to(roomId).emit('gameOver', {
        winner: winnerIndex === playerIndex ? 'player' : 'enemy'
      });
      games.delete(roomId);
      return;
    }

    // +5 mana her tur başında
    game.playersData[1 - playerIndex].mana = Math.min(50, game.playersData[1 - playerIndex].mana + 5);

    game.turnIndex = 1 - game.turnIndex;

    socket.emit('moveConfirmed', {
      you: currentPlayerData,
      enemy: otherPlayerData,
      result
    });

    const otherPlayerId = game.players[1 - playerIndex];
    io.to(otherPlayerId).emit('enemyMove', {
      you: otherPlayerData,
      enemy: currentPlayerData,
      result
    });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }

    const roomId = socket.roomId;
    if (roomId && games.has(roomId)) {
      const game = games.get(roomId);
      games.delete(roomId);
      const otherPlayerId = game.players.find(id => id !== socket.id);
      if (otherPlayerId) {
        io.to(otherPlayerId).emit('gameOver', {
          winner: 'player'
        });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
