const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Game state
const waitingPlayers = [];
const activeGames = new Map();

// Simple Kryptomon data
const createKryptomon = (id) => ({
  id,
  hp: 100,
  maxHp: 100,
  mana: 100,
  maxMana: 100,
  isAlive: true,
  ultimateUsed: false
});

// Create random team
function generateTeam() {
  return [
    createKryptomon(1),
    createKryptomon(2),
    createKryptomon(3)
  ];
}

// Battle moves
const moves = {
  attack: { manaCost: 10, damage: 25 },
  defend: { manaCost: 5, heal: 15 },
  skill: { manaCost: 20, damage: 40 },
  ultimate: { manaCost: 40, damage: 60 },
  manaRestore: { manaGain: 25 }
};

// Process move
function processMove(game, playerIndex, moveType) {
  const player = game.players[playerIndex];
  const opponent = game.players[1 - playerIndex];
  const currentKryptomon = player.team[player.currentKryptomon];
  const enemyKryptomon = opponent.team[opponent.currentKryptomon];
  const move = moves[moveType];

  if (!move || !currentKryptomon.isAlive) return { success: false };

  // Check mana
  if (move.manaCost && currentKryptomon.mana < move.manaCost) {
    return { success: false };
  }

  // Use mana
  if (move.manaCost) {
    currentKryptomon.mana = Math.max(0, currentKryptomon.mana - move.manaCost);
  }

  const result = { success: true, moveType, effects: [] };

  switch (moveType) {
    case 'attack':
    case 'skill':
    case 'ultimate':
      const damage = move.damage + Math.floor(Math.random() * 10) - 5;
      enemyKryptomon.hp = Math.max(0, enemyKryptomon.hp - damage);
      
      if (enemyKryptomon.hp <= 0) {
        enemyKryptomon.isAlive = false;
        // Switch to next alive Kryptomon
        for (let i = 0; i < opponent.team.length; i++) {
          if (opponent.team[i].isAlive) {
            opponent.currentKryptomon = i;
            break;
          }
        }
        // Check if all are dead
        if (!opponent.team.some(k => k.isAlive)) {
          game.winner = playerIndex;
          game.gameOver = true;
        }
      }
      
      if (moveType === 'ultimate') {
        currentKryptomon.ultimateUsed = true;
      }
      break;

    case 'defend':
      currentKryptomon.hp = Math.min(currentKryptomon.maxHp, currentKryptomon.hp + move.heal);
      break;

    case 'manaRestore':
      currentKryptomon.mana = Math.min(currentKryptomon.maxMana, currentKryptomon.mana + move.manaGain);
      break;
  }

  return result;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('joinGame', (data) => {
    console.log(`Player ${data.username} joining game`);
    
    const player = {
      id: socket.id,
      username: data.username || `Player_${Math.floor(Math.random() * 1000)}`,
      team: generateTeam(),
      currentKryptomon: 0
    };

    // Add to waiting list
    waitingPlayers.push(player);
    socket.emit('waitingForOpponent');

    console.log(`Waiting players: ${waitingPlayers.length}`);

    // Match players if we have 2 or more
    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();

      const gameId = `game_${Date.now()}`;
      const game = {
        id: gameId,
        players: [player1, player2],
        currentTurn: 0,
        gameOver: false,
        winner: null
      };

      activeGames.set(gameId, game);

      // Get sockets
      const socket1 = io.sockets.sockets.get(player1.id);
      const socket2 = io.sockets.sockets.get(player2.id);

      if (socket1 && socket2) {
        socket1.join(gameId);
        socket2.join(gameId);

        console.log(`Game started: ${gameId}`);

        // Start countdown
        let countdown = 3;
        const countdownInterval = setInterval(() => {
          io.to(gameId).emit('gameStartCountdown', { countdown });
          countdown--;

          if (countdown < 0) {
            clearInterval(countdownInterval);
            
            // Start game
            socket1.emit('gameStart', {
              gameRoom: game,
              yourIndex: 0
            });
            
            socket2.emit('gameStart', {
              gameRoom: game,
              yourIndex: 1
            });
          }
        }, 1000);
      }
    }
  });

  socket.on('battleMove', (data) => {
    // Find game
    let currentGame = null;
    let playerIndex = -1;

    for (const [gameId, game] of activeGames.entries()) {
      const index = game.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        currentGame = game;
        playerIndex = index;
        break;
      }
    }

    if (!currentGame || playerIndex === -1) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (currentGame.currentTurn !== playerIndex) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    if (currentGame.gameOver) {
      socket.emit('error', { message: 'Game is over' });
      return;
    }

    // Process move
    const result = processMove(currentGame, playerIndex, data.moveType);

    if (!result.success) {
      socket.emit('error', { message: 'Invalid move' });
      return;
    }

    // Switch turn
    if (!currentGame.gameOver) {
      currentGame.currentTurn = 1 - currentGame.currentTurn;
    }

    // Send result to both players
    io.to(currentGame.id).emit('turnResult', {
      result,
      gameRoom: currentGame
    });

    // Check game over
    if (currentGame.gameOver) {
      io.to(currentGame.id).emit('gameEnd', {
        winner: currentGame.winner,
        gameRoom: currentGame
      });
      
      activeGames.delete(currentGame.id);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove from waiting list
    const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    // Handle active games
    for (const [gameId, game] of activeGames.entries()) {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        // End game
        socket.to(gameId).emit('gameEnd', {
          winner: 1 - playerIndex,
          reason: 'opponent_disconnected'
        });
        activeGames.delete(gameId);
        break;
      }
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🎮 Kryptomon Battle Arena ready!`);
});
