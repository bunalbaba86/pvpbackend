const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let waitingPlayers = [];
let activeGames = new Map();

// Kryptomon stats calculation
function calculateKryptomonStats(tokenId) {
  const tokenNum = parseInt(tokenId) || 0;
  
  let health = 100 + (tokenNum * 3) % 50;
  let attack = 15 + (tokenNum * 5) % 20;
  let defense = 10 + (tokenNum * 7) % 15;
  let speed = 12 + (tokenNum * 11) % 18;
  
  return {
    health: Math.min(health, 150),
    attack: Math.min(attack, 35),
    defense: Math.min(defense, 25),
    speed: Math.min(speed, 30)
  };
}

// Game logic functions
function createGameState(player1, player2) {
  const p1Stats = calculateKryptomonStats(player1.selectedKryptomon[0].nft.tokenId);
  const p2Stats = calculateKryptomonStats(player2.selectedKryptomon[0].nft.tokenId);
  
  return {
    players: [player1, player2],
    gameData: [
      {
        health: p1Stats.health,
        maxHealth: p1Stats.health,
        mana: 50,
        maxMana: 100,
        attack: p1Stats.attack,
        defense: p1Stats.defense,
        activeKryptomon: 0,
        kryptomonTeam: player1.selectedKryptomon,
        ultimateUsed: false,
        defending: false
      },
      {
        health: p2Stats.health,
        maxHealth: p2Stats.health,
        mana: 50,
        maxMana: 100,
        attack: p2Stats.attack,
        defense: p2Stats.defense,
        activeKryptomon: 0,
        kryptomonTeam: player2.selectedKryptomon,
        ultimateUsed: false,
        defending: false
      }
    ],
    currentTurn: 0,
    gameActive: true,
    turnCount: 1
  };
}

function processMove(gameState, playerIndex, move, activeKryptomon) {
  const player = gameState.gameData[playerIndex];
  const opponent = gameState.gameData[1 - playerIndex];
  
  // Reset defending status
  player.defending = false;
  
  // Switch active Kryptomon if specified
  if (activeKryptomon !== undefined && activeKryptomon >= 0 && activeKryptomon < 3) {
    player.activeKryptomon = activeKryptomon;
    const newKryptomon = player.kryptomonTeam[activeKryptomon];
    if (newKryptomon) {
      const newStats = calculateKryptomonStats(newKryptomon.nft.tokenId);
      player.health = newStats.health;
      player.maxHealth = newStats.health;
      player.attack = newStats.attack;
      player.defense = newStats.defense;
    }
  }
  
  switch (move) {
    case 'attack':
      if (player.mana >= 10) {
        player.mana -= 10;
        let damage = Math.max(1, player.attack - (opponent.defending ? opponent.defense * 2 : opponent.defense));
        opponent.health = Math.max(0, opponent.health - damage);
      }
      break;
      
    case 'defend':
      if (player.mana >= 5) {
        player.mana -= 5;
        player.defending = true;
        player.health = Math.min(player.maxHealth, player.health + 5);
      }
      break;
      
    case 'skill':
      if (player.mana >= 20) {
        player.mana -= 20;
        let damage = Math.max(1, Math.floor(player.attack * 1.5) - opponent.defense);
        opponent.health = Math.max(0, opponent.health - damage);
      }
      break;
      
    case 'mana':
      player.mana = Math.min(player.maxMana, player.mana + 25);
      break;
      
    case 'hydra':
      if (player.mana >= 30 && !player.ultimateUsed) {
        player.mana -= 30;
        player.ultimateUsed = true;
        let damage = Math.max(1, player.attack * 2 - opponent.defense);
        opponent.health = Math.max(0, opponent.health - damage);
      }
      break;
  }
  
  // Add mana regeneration each turn
  player.mana = Math.min(player.maxMana, player.mana + 5);
  
  // Check for game over
  if (opponent.health <= 0) {
    gameState.gameActive = false;
    return playerIndex; // Winner
  }
  
  // Switch turns
  gameState.currentTurn = 1 - gameState.currentTurn;
  gameState.turnCount++;
  
  return null; // No winner yet
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('playerMove', (data) => {
    try {
      if (data.move === 'join') {
        // Player wants to join a game
        const playerData = {
          socketId: socket.id,
          walletAddress: data.walletAddress,
          selectedKryptomon: data.selectedKryptomon || []
        };

        // Remove player from waiting list if already there
        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
        
        // Add to waiting list
        waitingPlayers.push(playerData);
        
        console.log(`Player ${socket.id} joined queue. Queue length: ${waitingPlayers.length}`);

        if (waitingPlayers.length >= 2) {
          // Start a new game
          const player1 = waitingPlayers.shift();
          const player2 = waitingPlayers.shift();
          
          const gameId = `${player1.socketId}-${player2.socketId}`;
          const gameState = createGameState(player1, player2);
          
          activeGames.set(gameId, gameState);
          
          // Notify both players
          const p1Socket = io.sockets.sockets.get(player1.socketId);
          const p2Socket = io.sockets.sockets.get(player2.socketId);
          
          if (p1Socket && p2Socket) {
            p1Socket.join(gameId);
            p2Socket.join(gameId);
            
            // Send game start data
            p1Socket.emit('gameStart', {
              yourIndex: 0,
              you: gameState.gameData[0],
              enemy: gameState.gameData[1],
              yourTurn: gameState.currentTurn === 0,
              enemyKryptomon: player2.selectedKryptomon[0]
            });
            
            p2Socket.emit('gameStart', {
              yourIndex: 1,
              you: gameState.gameData[1],
              enemy: gameState.gameData[0],
              yourTurn: gameState.currentTurn === 1,
              enemyKryptomon: player1.selectedKryptomon[0]
            });
            
            console.log(`Game started: ${gameId}`);
          }
        } else {
          socket.emit('waitingForOpponent');
        }
        
      } else {
        // Game move
        const gameId = findGameBySocket(socket.id);
        if (!gameId) {
          socket.emit('errorMessage', 'Game not found');
          return;
        }
        
        const gameState = activeGames.get(gameId);
        if (!gameState || !gameState.gameActive) {
          socket.emit('errorMessage', 'Game not active');
          return;
        }
        
        const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) {
          socket.emit('errorMessage', 'Player not found in game');
          return;
        }
        
        if (gameState.currentTurn !== playerIndex) {
          socket.emit('errorMessage', 'Not your turn');
          return;
        }
        
        // Process the move
        const winner = processMove(gameState, playerIndex, data.move, data.activeKryptomon);
        
        if (winner !== null) {
          // Game over
          const winnerSocket = io.sockets.sockets.get(gameState.players[winner].socketId);
          const loserSocket = io.sockets.sockets.get(gameState.players[1 - winner].socketId);
          
          if (winnerSocket) winnerSocket.emit('gameOver', { winner: 'player' });
          if (loserSocket) loserSocket.emit('gameOver', { winner: 'enemy' });
          
          activeGames.delete(gameId);
          console.log(`Game ended: ${gameId}, Winner: Player ${winner}`);
        } else {
          // Continue game
          const p1Socket = io.sockets.sockets.get(gameState.players[0].socketId);
          const p2Socket = io.sockets.sockets.get(gameState.players[1].socketId);
          
          if (p1Socket) {
            p1Socket.emit('moveConfirmed', {
              you: gameState.gameData[0],
              enemy: gameState.gameData[1],
              yourTurn: gameState.currentTurn === 0
            });
          }
          
          if (p2Socket) {
            p2Socket.emit('moveConfirmed', {
              you: gameState.gameData[1],
              enemy: gameState.gameData[0],
              yourTurn: gameState.currentTurn === 1
            });
          }
        }
      }
    } catch (error) {
      console.error('Error processing move:', error);
      socket.emit('errorMessage', 'Error processing move');
    }
  });

  socket.on('chatMessage', (data) => {
    const gameId = findGameBySocket(socket.id);
    if (gameId) {
      const gameState = activeGames.get(gameId);
      const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
      
      socket.to(gameId).emit('chatMessage', {
        message: data.message,
        fromIndex: playerIndex
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    // Remove from waiting list
    waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    
    // Handle active games
    const gameId = findGameBySocket(socket.id);
    if (gameId) {
      const gameState = activeGames.get(gameId);
      if (gameState) {
        const otherPlayer = gameState.players.find(p => p.socketId !== socket.id);
        if (otherPlayer) {
          const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
          if (otherSocket) {
            otherSocket.emit('gameOver', { winner: 'player', reason: 'opponent_disconnected' });
          }
        }
        activeGames.delete(gameId);
      }
    }
  });
});

function findGameBySocket(socketId) {
  for (const [gameId, gameState] of activeGames) {
    if (gameState.players.some(p => p.socketId === socketId)) {
      return gameId;
    }
  }
  return null;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length,
    timestamp: new Date().toISOString()
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Kryptomon Battle Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Cleanup inactive games periodically
setInterval(() => {
  const now = Date.now();
  for (const [gameId, gameState] of activeGames) {
    // Remove games older than 30 minutes
    if (now - gameState.lastActivity > 30 * 60 * 1000) {
      activeGames.delete(gameId);
      console.log(`Cleaned up inactive game: ${gameId}`);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes
