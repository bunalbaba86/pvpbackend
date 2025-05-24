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

// Turn timers
let turnTimers = new Map();

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

// Turn timer management
function startTurnTimer(gameId) {
  // Clear existing timer
  if (turnTimers.has(gameId)) {
    clearTimeout(turnTimers.get(gameId));
  }
  
  // Start new timer (30 seconds)
  const timer = setTimeout(() => {
    const gameState = activeGames.get(gameId);
    if (gameState && gameState.gameActive) {
      console.log(`Turn timeout for game ${gameId}, current turn: ${gameState.currentTurn}`);
      
      // Auto-skip turn
      const winner = processMove(gameState, gameState.currentTurn, 'skip');
      
      if (winner !== null) {
        // Game over
        endGame(gameId, winner);
      } else {
        // Continue game
        continueGame(gameId, gameState);
      }
    }
    turnTimers.delete(gameId);
  }, 30000); // 30 seconds
  
  turnTimers.set(gameId, timer);
}

function stopTurnTimer(gameId) {
  if (turnTimers.has(gameId)) {
    clearTimeout(turnTimers.get(gameId));
    turnTimers.delete(gameId);
  }
}

function endGame(gameId, winner) {
  const gameState = activeGames.get(gameId);
  if (!gameState) return;
  
  const winnerSocket = io.sockets.sockets.get(gameState.players[winner].socketId);
  const loserSocket = io.sockets.sockets.get(gameState.players[1 - winner].socketId);
  
  if (winnerSocket) {
    winnerSocket.emit('gameOver', { 
      winner: 'player',
      message: 'Victory! You defeated your opponent!'
    });
  }
  if (loserSocket) {
    loserSocket.emit('gameOver', { 
      winner: 'enemy',
      message: 'Defeat! Your opponent was stronger this time.'
    });
  }
  
  stopTurnTimer(gameId);
  activeGames.delete(gameId);
  console.log(`Game ended: ${gameId}, Winner: Player ${winner}`);
}

function continueGame(gameId, gameState) {
  const p1Socket = io.sockets.sockets.get(gameState.players[0].socketId);
  const p2Socket = io.sockets.sockets.get(gameState.players[1].socketId);
  
  const currentActiveKryptomon0 = gameState.gameData[0].kryptomonTeam[gameState.gameData[0].activeKryptomon];
  const currentActiveKryptomon1 = gameState.gameData[1].kryptomonTeam[gameState.gameData[1].activeKryptomon];
  
  if (p1Socket) {
    p1Socket.emit('moveConfirmed', {
      you: gameState.gameData[0],
      enemy: gameState.gameData[1],
      yourTurn: gameState.currentTurn === 0,
      yourActiveKryptomon: currentActiveKryptomon0,
      enemyActiveKryptomon: currentActiveKryptomon1
    });
  }
  
  if (p2Socket) {
    p2Socket.emit('moveConfirmed', {
      you: gameState.gameData[1],
      enemy: gameState.gameData[0],
      yourTurn: gameState.currentTurn === 1,
      yourActiveKryptomon: currentActiveKryptomon1,
      enemyActiveKryptomon: currentActiveKryptomon0
    });
  }
  
  // Start timer for next turn
  startTurnTimer(gameId);
}

// Safe function to get Kryptomon data
function getKryptomonData(kryptomonTeam, index = 0) {
  if (!kryptomonTeam || !Array.isArray(kryptomonTeam) || kryptomonTeam.length === 0) {
    return {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'https://robohash.org/kryptomon978?set=set4&size=300x300&bgset=bg1',
      stats: calculateKryptomonStats('978')
    };
  }
  
  const kryptomon = kryptomonTeam[index];
  
  if (!kryptomon) {
    const fallback = kryptomonTeam[0];
    return fallback?.nft || fallback || {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'https://robohash.org/kryptomon978?set=set4&size=300x300&bgset=bg1',
      stats: calculateKryptomonStats('978')
    };
  }
  
  if (kryptomon.nft) {
    return {
      ...kryptomon.nft,
      stats: calculateKryptomonStats(kryptomon.nft.tokenId)
    };
  } else if (kryptomon.tokenId) {
    return {
      ...kryptomon,
      stats: calculateKryptomonStats(kryptomon.tokenId)
    };
  } else {
    return {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'https://robohash.org/kryptomon978?set=set4&size=300x300&bgset=bg1',
      stats: calculateKryptomonStats('978')
    };
  }
}

function getKryptomonTeamData(kryptomonTeam) {
  if (!kryptomonTeam || !Array.isArray(kryptomonTeam)) {
    return [];
  }
  
  return kryptomonTeam.map((kryptomon, index) => {
    return getKryptomonData(kryptomonTeam, index);
  });
}

function createGameState(player1, player2) {
  const p1ActiveKryptomon = getKryptomonData(player1.selectedKryptomon, 0);
  const p2ActiveKryptomon = getKryptomonData(player2.selectedKryptomon, 0);
  
  const p1Stats = p1ActiveKryptomon.stats || calculateKryptomonStats(p1ActiveKryptomon.tokenId);
  const p2Stats = p2ActiveKryptomon.stats || calculateKryptomonStats(p2ActiveKryptomon.tokenId);
  
  const p1Team = getKryptomonTeamData(player1.selectedKryptomon);
  const p2Team = getKryptomonTeamData(player2.selectedKryptomon);
  
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
        kryptomonTeam: p1Team,
        ultimateUsed: false,
        defending: false,
        walletAddress: player1.walletAddress
      },
      {
        health: p2Stats.health,
        maxHealth: p2Stats.health,
        mana: 50,
        maxMana: 100,
        attack: p2Stats.attack,
        defense: p2Stats.defense,
        activeKryptomon: 0,
        kryptomonTeam: p2Team,
        ultimateUsed: false,
        defending: false,
        walletAddress: player2.walletAddress
      }
    ],
    currentTurn: 0,
    gameActive: true,
    turnCount: 1,
    lastActivity: Date.now()
  };
}

function processMove(gameState, playerIndex, move, activeKryptomon) {
  const player = gameState.gameData[playerIndex];
  const opponent = gameState.gameData[1 - playerIndex];
  
  gameState.lastActivity = Date.now();
  player.defending = false;
  
  // Switch active Kryptomon if specified
  if (activeKryptomon !== undefined && 
      activeKryptomon >= 0 && 
      activeKryptomon < 3 && 
      player.kryptomonTeam && 
      player.kryptomonTeam.length > activeKryptomon) {
    
    player.activeKryptomon = activeKryptomon;
    const newKryptomonData = player.kryptomonTeam[activeKryptomon];
    
    if (newKryptomonData && newKryptomonData.tokenId) {
      const newStats = newKryptomonData.stats || calculateKryptomonStats(newKryptomonData.tokenId);
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
      
    case 'ultimate':
      if (player.mana >= 30 && !player.ultimateUsed) {
        player.mana -= 30;
        player.ultimateUsed = true;
        let damage = Math.max(1, player.attack * 2 - opponent.defense);
        opponent.health = Math.max(0, opponent.health - damage);
      }
      break;
      
    case 'surrender':
      return 1 - playerIndex; // Opponent wins
      
    case 'skip':
      // Skip turn, only regenerate mana
      break;
      
    default:
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
        const playerData = {
          socketId: socket.id,
          walletAddress: data.walletAddress || 'unknown',
          selectedKryptomon: data.selectedKryptomon || []
        };

        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
        waitingPlayers.push(playerData);

        if (waitingPlayers.length >= 2) {
          const player1 = waitingPlayers.shift();
          const player2 = waitingPlayers.shift();
          
          const gameId = `${player1.socketId}-${player2.socketId}`;
          const gameState = createGameState(player1, player2);
          
          activeGames.set(gameId, gameState);
          
          const p1Socket = io.sockets.sockets.get(player1.socketId);
          const p2Socket = io.sockets.sockets.get(player2.socketId);
          
          if (p1Socket && p2Socket) {
            p1Socket.join(gameId);
            p2Socket.join(gameId);
            
            const p1ActiveKryptomon = gameState.gameData[0].kryptomonTeam[0];
            const p2ActiveKryptomon = gameState.gameData[1].kryptomonTeam[0];
            
            p1Socket.emit('gameStart', {
              yourIndex: 0,
              you: gameState.gameData[0],
              enemy: gameState.gameData[1],
              yourTurn: gameState.currentTurn === 0,
              enemyNFT: p2ActiveKryptomon,
              yourNFT: p1ActiveKryptomon,
              enemyKryptomonTeam: gameState.gameData[1].kryptomonTeam,
              yourKryptomonTeam: gameState.gameData[0].kryptomonTeam
            });
            
            p2Socket.emit('gameStart', {
              yourIndex: 1,
              you: gameState.gameData[1],
              enemy: gameState.gameData[0],
              yourTurn: gameState.currentTurn === 1,
              enemyNFT: p1ActiveKryptomon,
              yourNFT: p2ActiveKryptomon,
              enemyKryptomonTeam: gameState.gameData[0].kryptomonTeam,
              yourKryptomonTeam: gameState.gameData[1].kryptomonTeam
            });
            
            // Start turn timer
            startTurnTimer(gameId);
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
        
        if (gameState.currentTurn !== playerIndex && data.move !== 'surrender') {
          socket.emit('errorMessage', 'Not your turn');
          return;
        }
        
        // Stop current turn timer
        stopTurnTimer(gameId);
        
        // Process the move
        const winner = processMove(gameState, playerIndex, data.move, data.activeKryptomon);
        
        if (winner !== null) {
          endGame(gameId, winner);
        } else {
          continueGame(gameId, gameState);
        }
      }
    } catch (error) {
      console.error('Error processing move:', error);
      socket.emit('errorMessage', 'Error processing move: ' + error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    
    const gameId = findGameBySocket(socket.id);
    if (gameId) {
      const gameState = activeGames.get(gameId);
      if (gameState) {
        const otherPlayer = gameState.players.find(p => p.socketId !== socket.id);
        if (otherPlayer) {
          const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
          if (otherSocket) {
            otherSocket.emit('gameOver', { 
              winner: 'player', 
              reason: 'opponent_disconnected',
              message: 'Your opponent disconnected. You win by default!'
            });
          }
        }
        stopTurnTimer(gameId);
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
    activeTurnTimers: turnTimers.size,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
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
  let cleanedCount = 0;
  
  for (const [gameId, gameState] of activeGames) {
    if (now - gameState.lastActivity > 30 * 60 * 1000) {
      stopTurnTimer(gameId);
      activeGames.delete(gameId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} inactive games`);
  }
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  // Clear all timers
  for (const timer of turnTimers.values()) {
    clearTimeout(timer);
  }
  turnTimers.clear();
  server.close(() => {
    console.log('Process terminated');
  });
});
