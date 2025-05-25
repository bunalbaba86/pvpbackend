const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// CORS middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["*"],
  credentials: true
}));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('./'));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length
  });
});

// Main route with fallback logic
app.get('/', (req, res) => {
  const gamePath = path.join(__dirname, 'game.html');
  const publicGamePath = path.join(__dirname, 'public', 'game.html');
  
  if (fs.existsSync(gamePath)) {
    res.sendFile(gamePath);
  } 
  else if (fs.existsSync(publicGamePath)) {
    res.sendFile(publicGamePath);
  } 
  else {
    res.json({
      status: 'Kryptomon Battle Arena Backend',
      message: 'Socket.io server is running',
      endpoint: 'https://pvpbackend.onrender.com',
      activeGames: activeGames.size,
      waitingPlayers: waitingPlayers.length,
      timestamp: new Date().toISOString()
    });
  }
});

// Game state
let waitingPlayers = [];
let activeGames = new Map();

// Background selection
const backgrounds = ['background.png', 'background2.png', 'background3.png'];

function getRandomBackground() {
  return backgrounds[Math.floor(Math.random() * backgrounds.length)];
}

// Kryptomon image selection (1-20)
function getRandomKryptomonImage() {
  const imageNum = Math.floor(Math.random() * 20) + 1;
  return `kryptomon${imageNum}.png`;
}

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

// Safe function to get Kryptomon data
function getKryptomonData(kryptomonTeam, index = 0) {
  if (!kryptomonTeam || !Array.isArray(kryptomonTeam) || kryptomonTeam.length === 0) {
    return {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: getRandomKryptomonImage(),
      stats: calculateKryptomonStats('978')
    };
  }
  
  const kryptomon = kryptomonTeam[index];
  
  if (!kryptomon) {
    const fallback = kryptomonTeam[0];
    return fallback?.nft || fallback || {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: getRandomKryptomonImage(),
      stats: calculateKryptomonStats('978')
    };
  }
  
  if (kryptomon.nft) {
    return {
      ...kryptomon.nft,
      image: kryptomon.nft.image || getRandomKryptomonImage(),
      stats: calculateKryptomonStats(kryptomon.nft.tokenId)
    };
  } else if (kryptomon.tokenId) {
    return {
      ...kryptomon,
      image: kryptomon.image || getRandomKryptomonImage(),
      stats: calculateKryptomonStats(kryptomon.tokenId)
    };
  } else {
    return {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: getRandomKryptomonImage(),
      stats: calculateKryptomonStats('978')
    };
  }
}

function getKryptomonTeamData(kryptomonTeam) {
  if (!kryptomonTeam || !Array.isArray(kryptomonTeam)) {
    return [
      { tokenId: '978', name: 'Default Kryptomon 1', image: getRandomKryptomonImage(), stats: calculateKryptomonStats('978') },
      { tokenId: '979', name: 'Default Kryptomon 2', image: getRandomKryptomonImage(), stats: calculateKryptomonStats('979') },
      { tokenId: '980', name: 'Default Kryptomon 3', image: getRandomKryptomonImage(), stats: calculateKryptomonStats('980') }
    ];
  }
  
  return kryptomonTeam.map((kryptomon, index) => {
    const data = getKryptomonData(kryptomonTeam, index);
    return {
      ...data,
      image: data.image || getRandomKryptomonImage()
    };
  });
}

// Critical hit calculation
function calculateCriticalHit() {
  return Math.random() < 0.2;
}

// Game logic functions
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
        mana: 0,
        maxMana: 100,
        attack: p1Stats.attack,
        defense: p1Stats.defense,
        activeKryptomon: 0,
        kryptomonTeam: p1Team,
        ultimateUsed: false,
        defending: false,
        defenseCooldown: 0,
        defenseEffectTurns: 0,
        walletAddress: player1.walletAddress,
        playerName: player1.playerName,
        hasUsedSwitch: false
      },
      {
        health: p2Stats.health,
        maxHealth: p2Stats.health,
        mana: 0,
        maxMana: 100,
        attack: p2Stats.attack,
        defense: p2Stats.defense,
        activeKryptomon: 0,
        kryptomonTeam: p2Team,
        ultimateUsed: false,
        defending: false,
        defenseCooldown: 0,
        defenseEffectTurns: 0,
        walletAddress: player2.walletAddress,
        playerName: player2.playerName,
        hasUsedSwitch: false
      }
    ],
    currentTurn: 0,
    gameActive: true,
    turnCount: 1,
    lastActivity: Date.now(),
    turnTimer: 30,
    turnStartTime: Date.now(),
    background: getRandomBackground()
  };
}

function processMove(gameState, playerIndex, move, activeKryptomon, noTurnChange = false) {
  console.log('🎮 Processing move:', { playerIndex, move, activeKryptomon, noTurnChange });
  
  const player = gameState.gameData[playerIndex];
  const opponent = gameState.gameData[1 - playerIndex];
  
  gameState.lastActivity = Date.now();
  gameState.turnStartTime = Date.now();
  gameState.turnTimer = 30;
  
  let moveResult = {
    damage: 0,
    isCritical: false,
    defenseActivated: false,
    manaGained: 0,
    target: playerIndex === 0 ? 'enemy' : 'player',
    switchUsed: false,
    attackerIndex: playerIndex,
    targetIndex: 1 - playerIndex,
    moveType: move,
    shieldEffect: false
  };
  
  // Start of turn cleanup
  if (!noTurnChange) {
    player.defending = false;
    
    if (player.defenseCooldown > 0) {
      player.defenseCooldown--;
    }
    if (player.defenseEffectTurns > 0) {
      player.defenseEffectTurns--;
    }
    if (opponent.defenseEffectTurns > 0) {
      opponent.defenseEffectTurns--;
    }
    
    player.hasUsedSwitch = false;
  }
  
  // Handle Kryptomon switching
  if (move === 'switch' && activeKryptomon !== undefined && 
      activeKryptomon >= 0 && activeKryptomon < 3 && 
      player.kryptomonTeam && player.kryptomonTeam.length > activeKryptomon &&
      activeKryptomon !== player.activeKryptomon &&
      !player.hasUsedSwitch) {
    
    player.activeKryptomon = activeKryptomon;
    player.hasUsedSwitch = true;
    moveResult.switchUsed = true;
    
    const newKryptomonData = player.kryptomonTeam[activeKryptomon];
    
    if (newKryptomonData && newKryptomonData.tokenId) {
      const newStats = newKryptomonData.stats || calculateKryptomonStats(newKryptomonData.tokenId);
      player.health = newStats.health;
      player.maxHealth = newStats.health;
      player.attack = newStats.attack;
      player.defense = newStats.defense;
    }
    
    if (!noTurnChange) {
      gameState.currentTurn = 1 - gameState.currentTurn;
      gameState.turnCount++;
    }
    
    gameState.lastMoveResult = moveResult;
    return null;
  }
  
  switch (move) {
    case 'attack':
      player.mana = Math.min(player.maxMana, player.mana + 2);
      moveResult.manaGained = 2;
      
      let attackDamage = Math.max(1, Math.floor(player.attack * 1.4) - (opponent.defenseEffectTurns > 0 ? opponent.defense * 2 : opponent.defense));
      
      const attackCritical = calculateCriticalHit();
      if (attackCritical) {
        attackDamage = Math.floor(attackDamage * 1.8);
        moveResult.isCritical = true;
      }
      
      if (opponent.defenseEffectTurns > 0) {
        opponent.mana = Math.min(opponent.maxMana, opponent.mana + 3);
        moveResult.defenseActivated = true;
        moveResult.shieldEffect = true;
      }
      
      opponent.health = Math.max(0, opponent.health - attackDamage);
      moveResult.damage = attackDamage;
      break;
      
    case 'defend':
      if (player.defenseCooldown > 0) {
        console.log('❌ Defense on cooldown!');
        return null;
      }
      
      player.defenseEffectTurns = 2;
      player.defenseCooldown = 4;
      player.health = Math.min(player.maxHealth, player.health + 5);
      moveResult.shieldEffect = true;
      break;
      
    case 'skill':
      if (player.mana >= 2) {
        player.mana -= 2;
        let skillDamage = Math.max(1, Math.floor(player.attack * 1.5) - (opponent.defenseEffectTurns > 0 ? opponent.defense * 2 : opponent.defense));
        
        const skillCritical = calculateCriticalHit();
        if (skillCritical) {
          skillDamage = Math.floor(skillDamage * 1.8);
          moveResult.isCritical = true;
        }
        
        if (opponent.defenseEffectTurns > 0) {
          opponent.mana = Math.min(opponent.maxMana, opponent.mana + 3);
          moveResult.defenseActivated = true;
          moveResult.shieldEffect = true;
        }
        
        opponent.health = Math.max(0, opponent.health - skillDamage);
        moveResult.damage = skillDamage;
      } else {
        console.log('❌ Not enough mana for skill!');
        return null;
      }
      break;
      
    case 'ultimate':
      if (player.mana >= 6) {
        player.mana -= 6;
        let ultimateDamage = Math.max(1, Math.floor(player.attack * 2.5) - (opponent.defenseEffectTurns > 0 ? opponent.defense * 2 : opponent.defense));
        
        const ultimateCritical = calculateCriticalHit();
        if (ultimateCritical) {
          ultimateDamage = Math.floor(ultimateDamage * 1.8);
          moveResult.isCritical = true;
        }
        
        if (opponent.defenseEffectTurns > 0) {
          opponent.mana = Math.min(opponent.maxMana, opponent.mana + 4);
          moveResult.defenseActivated = true;
          moveResult.shieldEffect = true;
        }
        
        opponent.health = Math.max(0, opponent.health - ultimateDamage);
        moveResult.damage = ultimateDamage;
      } else {
        console.log('❌ Not enough mana for ultimate!');
        return null;
      }
      break;
      
    case 'surrender':
      gameState.gameActive = false;
      return 1 - playerIndex;
      
    case 'skip':
    case 'timeout':
      console.log('⏱️ Turn skipped/timeout for player', playerIndex);
      break;
      
    default:
      console.log('❓ Unknown move:', move);
      break;
  }
  
  // Check for game over
  if (opponent.health <= 0) {
    gameState.gameActive = false;
    return playerIndex;
  }
  
  // Switch turns
  if (!noTurnChange && move !== 'switch') {
    gameState.currentTurn = 1 - gameState.currentTurn;
    gameState.turnCount++;
    gameState.turnStartTime = Date.now();
    gameState.turnTimer = 30;
  }
  
  gameState.lastMoveResult = moveResult;
  return null;
}

// Helper function to find game by socket ID
function findGameBySocket(socketId) {
  for (let [gameId, gameState] of activeGames) {
    if (gameState.players.some(p => p.socketId === socketId)) {
      return gameId;
    }
  }
  return null;
}

// Turn timer system
setInterval(() => {
  for (let [gameId, gameState] of activeGames) {
    if (!gameState.gameActive) continue;
    
    const now = Date.now();
    const timeElapsed = (now - gameState.turnStartTime) / 1000;
    const timeRemaining = Math.max(0, 30 - timeElapsed);
    
    if (timeRemaining <= 0) {
      // Time's up! Skip turn
      console.log(`⏱️ Turn timeout for game ${gameId}, player ${gameState.currentTurn}`);
      
      const winner = processMove(gameState, gameState.currentTurn, 'timeout');
      
      if (winner !== null) {
        io.to(gameId).emit('gameEnd', {
          winner: winner,
          reason: 'timeout',
          winnerName: gameState.players[winner].playerName
        });
        activeGames.delete(gameId);
      } else {
        io.to(gameId).emit('gameUpdate', {
          gameData: gameState.gameData,
          currentTurn: gameState.currentTurn,
          lastMoveResult: gameState.lastMoveResult,
          turnCount: gameState.turnCount,
          turnTimer: 30
        });
      }
    } else {
      // Send timer update
      io.to(gameId).emit('turnTimer', {
        timeRemaining: Math.ceil(timeRemaining)
      });
    }
  }
}, 1000); // Check every second

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🎮 Player connected:', socket.id);

  socket.on('playerMove', (data) => {
    try {
      console.log('📨 Received player move:', {
        move: data.move,
        walletAddress: data.walletAddress,
        playerName: data.playerName,
        isGuestMode: data.isGuestMode,
        kryptomonCount: data.selectedKryptomon ? data.selectedKryptomon.length : 0,
        activeKryptomon: data.activeKryptomon,
        noTurnChange: data.noTurnChange
      });
      
      if (data.move === 'join') {
        const playerData = {
          socketId: socket.id,
          walletAddress: data.walletAddress || 'guest_' + socket.id,
          selectedKryptomon: data.selectedKryptomon || [
            { tokenId: '978', name: 'Default Kryptomon 1', image: getRandomKryptomonImage() },
            { tokenId: '979', name: 'Default Kryptomon 2', image: getRandomKryptomonImage() },
            { tokenId: '980', name: 'Default Kryptomon 3', image: getRandomKryptomonImage() }
          ],
          playerName: data.playerName || 'Anonymous',
          isGuestMode: data.isGuestMode || false
        };

        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
        waitingPlayers.push(playerData);
        
        console.log(`🎯 Player ${socket.id} (${playerData.playerName}) joined queue. Guest: ${playerData.isGuestMode}. Queue length: ${waitingPlayers.length}`);

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
            
            // Send game found notification first
            io.to(gameId).emit('gameFound', {
              player1Name: player1.playerName,
              player2Name: player2.playerName,
              background: gameState.background
            });
            
            // Start 10-second countdown
            setTimeout(() => {
              // Send game start data to player 1
              p1Socket.emit('gameStart', {
                yourIndex: 0,
                you: gameState.gameData[0],
                enemy: gameState.gameData[1],
                yourTurn: gameState.currentTurn === 0,
                enemyNFT: p2ActiveKryptomon,
                yourNFT: p1ActiveKryptomon,
                enemyKryptomonTeam: gameState.gameData[1].kryptomonTeam,
                yourKryptomonTeam: gameState.gameData[0].kryptomonTeam,
                enemyPlayerName: player2.playerName,
                yourActiveKryptomon: p1ActiveKryptomon,
                enemyActiveKryptomon: p2ActiveKryptomon,
                background: gameState.background,
                turnCount: gameState.turnCount,
                turnTimer: gameState.turnTimer
              });
              
              // Send game start data to player 2
              p2Socket.emit('gameStart', {
                yourIndex: 1,
                you: gameState.gameData[1],
                enemy: gameState.gameData[0],
                yourTurn: gameState.currentTurn === 1,
                enemyNFT: p1ActiveKryptomon,
                yourNFT: p2ActiveKryptomon,
                enemyKryptomonTeam: gameState.gameData[0].kryptomonTeam,
                yourKryptomonTeam: gameState.gameData[1].kryptomonTeam,
                enemyPlayerName: player1.playerName,
                yourActiveKryptomon: p2ActiveKryptomon,
                enemyActiveKryptomon: p1ActiveKryptomon,
                background: gameState.background,
                turnCount: gameState.turnCount,
                turnTimer: gameState.turnTimer
              });
              
              console.log(`⚔️ Game started between ${player1.playerName} and ${player2.playerName}`);
            }, 10000); // 10 second delay
            
          }
        } else {
          socket.emit('waitingForOpponent');
          console.log(`⏳ Player ${playerData.playerName} waiting for opponent...`);
        }
        return;
      }
      
      // Handle other game moves
      const gameId = findGameBySocket(socket.id);
      if (!gameId) {
        console.log('❌ Game not found for socket:', socket.id);
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      const gameState = activeGames.get(gameId);
      if (!gameState || !gameState.gameActive) {
        console.log('❌ Game not active or not found');
        socket.emit('error', { message: 'Game not active' });
        return;
      }
      
      const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex === -1) {
        console.log('❌ Player not found in game');
        socket.emit('error', { message: 'Player not found in game' });
        return;
      }
      
      // Handle emoji messages
      if (data.move === 'emoji') {
        console.log(`😊 Emoji sent: ${data.emoji} from player ${playerIndex}`);
        io.to(gameId).emit('emojiReceived', {
          emoji: data.emoji,
          sender: playerIndex
        });
        return;
      }
      
      // Check if it's player's turn (except for surrender)
      if (gameState.currentTurn !== playerIndex && data.move !== 'surrender') {
        console.log(`❌ Not player ${playerIndex}'s turn (current: ${gameState.currentTurn})`);
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      // Process the move
      const winner = processMove(gameState, playerIndex, data.move, data.activeKryptomon, data.noTurnChange);
      
      if (winner !== null) {
        // Game ended
        console.log(`🏁 Game ended! Winner: ${winner}`);
        io.to(gameId).emit('gameEnd', {
          winner: winner,
          reason: data.move === 'surrender' ? 'surrender' : 'health',
          winnerName: gameState.players[winner].playerName
        });
        activeGames.delete(gameId);
      } else {
        // Game continues, send update
        io.to(gameId).emit('gameUpdate', {
          gameData: gameState.gameData,
          currentTurn: gameState.currentTurn,
          lastMoveResult: gameState.lastMoveResult,
          turnCount: gameState.turnCount,
          turnTimer: gameState.turnTimer
        });
        
        console.log(`🔄 Game updated - Turn: ${gameState.currentTurn}, Move: ${data.move}`);
      }
      
    } catch (error) {
      console.error('❌ Error processing player move:', error);
      socket.emit('error', { message: 'An error occurred processing your move: ' + error.message });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('👋 Player disconnected:', socket.id, 'Reason:', reason);
    
    // Remove from waiting players
    const removedFromQueue = waitingPlayers.filter(p => p.socketId === socket.id).length;
    waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    
    if (removedFromQueue > 0) {
      console.log(`🚫 Removed ${removedFromQueue} player(s) from queue`);
    }
    
    // Handle active games
    const gameId = findGameBySocket(socket.id);
    if (gameId) {
      const gameState = activeGames.get(gameId);
      if (gameState) {
        const remainingPlayer = gameState.players.find(p => p.socketId !== socket.id);
        if (remainingPlayer) {
          const remainingSocket = io.sockets.sockets.get(remainingPlayer.socketId);
          if (remainingSocket) {
            remainingSocket.emit('opponentDisconnected');
            console.log(`📡 Notified remaining player ${remainingPlayer.playerName} of disconnect`);
          }
        }
        activeGames.delete(gameId);
        console.log(`🗑️ Deleted game ${gameId}`);
      }
    }
  });

  socket.on('error', (error) => {
    console.error('🔥 Socket error for', socket.id, ':', error);
  });
});

// Clean up inactive games
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000;
  let cleanedGames = 0;
  
  for (let [gameId, gameState] of activeGames) {
    if (now - gameState.lastActivity > timeout) {
      console.log('🧹 Cleaning up inactive game:', gameId);
      activeGames.delete(gameId);
      cleanedGames++;
    }
  }
  
  if (cleanedGames > 0) {
    console.log(`🗑️ Cleaned up ${cleanedGames} inactive games`);
  }
}, 60 * 1000);

// Keep alive ping for Render
setInterval(() => {
  const stats = {
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length,
    timestamp: new Date().toISOString()
  };
  console.log('💓 Keep alive ping -', JSON.stringify(stats));
}, 14 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  io.emit('serverShutdown', { message: 'Server is restarting, please refresh the page.' });
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  io.emit('serverShutdown', { message: 'Server is shutting down, please refresh the page.' });
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Kryptomon Battle Arena server started!`);
  console.log(`🌐 Server URL: https://pvpbackend.onrender.com`);
  console.log(`🔌 Port: ${PORT}`);
  console.log(`⚡ Socket.io ready for connections`);
  console.log(`📊 Initial state - Games: 0, Queue: 0`);
});

module.exports = { app, server, io };
