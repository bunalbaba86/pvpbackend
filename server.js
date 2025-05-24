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

// Kryptomon stats calculation (frontend ile aynı)
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

// Safe function to get Kryptomon data (GELİŞTİRİLDİ)
function getKryptomonData(kryptomonTeam, index = 0) {
  console.log('Getting Kryptomon data:', { 
    teamLength: kryptomonTeam ? kryptomonTeam.length : 0, 
    index 
  });
  
  if (!kryptomonTeam || !Array.isArray(kryptomonTeam) || kryptomonTeam.length === 0) {
    console.log('No Kryptomon team found, creating default');
    return {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'https://robohash.org/kryptomon978?set=set4&size=300x300&bgset=bg1',
      stats: calculateKryptomonStats('978')
    };
  }
  
  const kryptomon = kryptomonTeam[index];
  console.log('Selected Kryptomon at index', index, ':', kryptomon);
  
  if (!kryptomon) {
    console.log('Kryptomon at index not found, using first available');
    const fallback = kryptomonTeam[0];
    return fallback?.nft || fallback || {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'https://robohash.org/kryptomon978?set=set4&size=300x300&bgset=bg1',
      stats: calculateKryptomonStats('978')
    };
  }
  
  // Handle different data structures
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
    console.log('Invalid Kryptomon structure, using default');
    return {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'https://robohash.org/kryptomon978?set=set4&size=300x300&bgset=bg1',
      stats: calculateKryptomonStats('978')
    };
  }
}

// Get full Kryptomon team data
function getKryptomonTeamData(kryptomonTeam) {
  if (!kryptomonTeam || !Array.isArray(kryptomonTeam)) {
    return [];
  }
  
  return kryptomonTeam.map((kryptomon, index) => {
    return getKryptomonData(kryptomonTeam, index);
  });
}

// Game logic functions (GELİŞTİRİLDİ)
function createGameState(player1, player2) {
  console.log('Creating game state for players:', {
    p1: player1.walletAddress,
    p2: player2.walletAddress,
    p1KryptomonCount: player1.selectedKryptomon ? player1.selectedKryptomon.length : 0,
    p2KryptomonCount: player2.selectedKryptomon ? player2.selectedKryptomon.length : 0
  });
  
  const p1ActiveKryptomon = getKryptomonData(player1.selectedKryptomon, 0);
  const p2ActiveKryptomon = getKryptomonData(player2.selectedKryptomon, 0);
  
  const p1Stats = p1ActiveKryptomon.stats || calculateKryptomonStats(p1ActiveKryptomon.tokenId);
  const p2Stats = p2ActiveKryptomon.stats || calculateKryptomonStats(p2ActiveKryptomon.tokenId);
  
  // Get full team data
  const p1Team = getKryptomonTeamData(player1.selectedKryptomon);
  const p2Team = getKryptomonTeamData(player2.selectedKryptomon);
  
  console.log('Calculated stats and teams:', { 
    p1Stats, 
    p2Stats, 
    p1TeamSize: p1Team.length, 
    p2TeamSize: p2Team.length 
  });
  
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
  console.log('Processing move:', { playerIndex, move, activeKryptomon });
  
  const player = gameState.gameData[playerIndex];
  const opponent = gameState.gameData[1 - playerIndex];
  
  // Update last activity
  gameState.lastActivity = Date.now();
  
  // Reset defending status
  player.defending = false;
  
  // Switch active Kryptomon if specified and valid
  if (activeKryptomon !== undefined && 
      activeKryptomon >= 0 && 
      activeKryptomon < 3 && 
      player.kryptomonTeam && 
      player.kryptomonTeam.length > activeKryptomon) {
    
    console.log('Switching to Kryptomon index:', activeKryptomon);
    player.activeKryptomon = activeKryptomon;
    
    const newKryptomonData = player.kryptomonTeam[activeKryptomon];
    
    if (newKryptomonData && newKryptomonData.tokenId) {
      const newStats = newKryptomonData.stats || calculateKryptomonStats(newKryptomonData.tokenId);
      player.health = newStats.health;
      player.maxHealth = newStats.health;
      player.attack = newStats.attack;
      player.defense = newStats.defense;
      console.log('Switched to new Kryptomon:', { 
        activeKryptomon, 
        newStats, 
        name: newKryptomonData.name 
      });
    }
  }
  
  switch (move) {
    case 'attack':
      if (player.mana >= 10) {
        player.mana -= 10;
        let damage = Math.max(1, player.attack - (opponent.defending ? opponent.defense * 2 : opponent.defense));
        opponent.health = Math.max(0, opponent.health - damage);
        console.log('Attack damage:', damage, 'Opponent health:', opponent.health);
      } else {
        console.log('Not enough mana for attack');
      }
      break;
      
    case 'defend':
      if (player.mana >= 5) {
        player.mana -= 5;
        player.defending = true;
        player.health = Math.min(player.maxHealth, player.health + 5);
        console.log('Player defending and healing, new health:', player.health);
      } else {
        console.log('Not enough mana for defend');
      }
      break;
      
    case 'skill':
      if (player.mana >= 20) {
        player.mana -= 20;
        let damage = Math.max(1, Math.floor(player.attack * 1.5) - opponent.defense);
        opponent.health = Math.max(0, opponent.health - damage);
        console.log('Skill damage:', damage, 'Opponent health:', opponent.health);
      } else {
        console.log('Not enough mana for skill');
      }
      break;
      
    case 'mana':
      player.mana = Math.min(player.maxMana, player.mana + 25);
      console.log('Mana restored, new mana:', player.mana);
      break;
      
    case 'hydra':
    case 'ultimate':
      if (player.mana >= 30 && !player.ultimateUsed) {
        player.mana -= 30;
        player.ultimateUsed = true;
        let damage = Math.max(1, player.attack * 2 - opponent.defense);
        opponent.health = Math.max(0, opponent.health - damage);
        console.log('Ultimate attack damage:', damage, 'Opponent health:', opponent.health);
      } else {
        console.log('Cannot use ultimate - mana:', player.mana, 'already used:', player.ultimateUsed);
      }
      break;
      
    default:
      console.log('Unknown move:', move);
      break;
  }
  
  // Add mana regeneration each turn
  player.mana = Math.min(player.maxMana, player.mana + 5);
  
  // Check for game over
  if (opponent.health <= 0) {
    gameState.gameActive = false;
    console.log('Game over, winner:', playerIndex);
    return playerIndex; // Winner
  }
  
  // Switch turns
  gameState.currentTurn = 1 - gameState.currentTurn;
  gameState.turnCount++;
  
  return null; // No winner yet
}

// Socket.io connection handling (GELİŞTİRİLDİ)
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('playerMove', (data) => {
    try {
      console.log('Received player move:', {
        move: data.move,
        walletAddress: data.walletAddress,
        kryptomonCount: data.selectedKryptomon ? data.selectedKryptomon.length : 0,
        activeKryptomon: data.activeKryptomon
      });
      
      if (data.move === 'join') {
        // Player wants to join a game
        const playerData = {
          socketId: socket.id,
          walletAddress: data.walletAddress || 'unknown',
          selectedKryptomon: data.selectedKryptomon || []
        };

        console.log('Player joining with team:', playerData.selectedKryptomon.map(k => ({
          name: k.nft ? k.nft.name : k.name,
          tokenId: k.nft ? k.nft.tokenId : k.tokenId
        })));

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
            
            const p1ActiveKryptomon = gameState.gameData[0].kryptomonTeam[0];
            const p2ActiveKryptomon = gameState.gameData[1].kryptomonTeam[0];
            
            console.log('Sending game start data:', {
              p1Active: p1ActiveKryptomon ? p1ActiveKryptomon.name : 'Unknown',
              p2Active: p2ActiveKryptomon ? p2ActiveKryptomon.name : 'Unknown'
            });
            
            // Send game start data to Player 1
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
            
            // Send game start data to Player 2
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
            
            console.log(`Game started: ${gameId}`);
          }
        } else {
          socket.emit('waitingForOpponent');
        }
        
      } else {
        // Game move
        const gameId = findGameBySocket(socket.id);
        if (!gameId) {
          console.log('Game not found for socket:', socket.id);
          socket.emit('errorMessage', 'Game not found');
          return;
        }
        
        const gameState = activeGames.get(gameId);
        if (!gameState || !gameState.gameActive) {
          console.log('Game not active:', gameId);
          socket.emit('errorMessage', 'Game not active');
          return;
        }
        
        const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) {
          console.log('Player not found in game:', socket.id);
          socket.emit('errorMessage', 'Player not found in game');
          return;
        }
        
        if (gameState.currentTurn !== playerIndex) {
          console.log('Not player turn:', { currentTurn: gameState.currentTurn, playerIndex });
          socket.emit('errorMessage', 'Not your turn');
          return;
        }
        
        // Process the move
        const winner = processMove(gameState, playerIndex, data.move, data.activeKryptomon);
        
        if (winner !== null) {
          // Game over
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
          
          activeGames.delete(gameId);
          console.log(`Game ended: ${gameId}, Winner: Player ${winner}`);
        } else {
          // Continue game - send updated game state
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
        }
      }
    } catch (error) {
      console.error('Error processing move:', error);
      console.error('Error stack:', error.stack);
      console.error('Data received:', data);
      socket.emit('errorMessage', 'Error processing move: ' + error.message);
    }
  });

  socket.on('chatMessage', (data) => {
    try {
      const gameId = findGameBySocket(socket.id);
      if (gameId) {
        const gameState = activeGames.get(gameId);
        const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
        
        socket.to(gameId).emit('chatMessage', {
          message: data.message,
          fromIndex: playerIndex,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error processing chat message:', error);
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
            otherSocket.emit('gameOver', { 
              winner: 'player', 
              reason: 'opponent_disconnected',
              message: 'Your opponent disconnected. You win by default!'
            });
          }
        }
        activeGames.delete(gameId);
        console.log(`Game ${gameId} ended due to disconnection`);
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
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Debug endpoint (GELİŞTİRİLDİ)
app.get('/debug', (req, res) => {
  res.json({
    activeGames: Array.from(activeGames.keys()),
    waitingPlayers: waitingPlayers.map(p => ({
      socketId: p.socketId,
      walletAddress: p.walletAddress,
      kryptomonCount: p.selectedKryptomon ? p.selectedKryptomon.length : 0
    })),
    gamesDetail: Array.from(activeGames.entries()).map(([id, game]) => ({
      gameId: id,
      players: game.players.map(p => ({
        wallet: p.walletAddress,
        kryptomonCount: p.selectedKryptomon ? p.selectedKryptomon.length : 0
      })),
      currentTurn: game.currentTurn,
      gameActive: game.gameActive,
      turnCount: game.turnCount,
      playerStats: game.gameData.map(data => ({
        health: data.health,
        mana: data.mana,
        activeKryptomon: data.activeKryptomon,
        kryptomonTeamSize: data.kryptomonTeam ? data.kryptomonTeam.length : 0
      }))
    }))
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Kryptomon Battle Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Debug info: http://localhost:${PORT}/debug`);
});

// Cleanup inactive games periodically
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [gameId, gameState] of activeGames) {
    // Remove games older than 30 minutes
    if (now - gameState.lastActivity > 30 * 60 * 1000) {
      activeGames.delete(gameId);
      cleanedCount++;
      console.log(`Cleaned up inactive game: ${gameId}`);
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} inactive games. Active games: ${activeGames.size}`);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
