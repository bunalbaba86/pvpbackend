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

// Background selection - background4.png eklendi
const backgrounds = ['background.png', 'background2.png', 'background3.png', 'background4.png'];

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
    shieldEffect: false,
    ultimateEffect: false,
    kryptomonSwitched: false,
    newActiveKryptomon: null
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
    moveResult.kryptomonSwitched = true;
    moveResult.newActiveKryptomon = player.kryptomonTeam[activeKryptomon];
    
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
        moveResult.ultimateEffect = true;
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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 New connection:', socket.id);

  // Handle player joining matchmaking
  socket.on('findMatch', (playerData) => {
    console.log('🎯 Player looking for match:', {
      id: socket.id,
      name: playerData.playerName,
      wallet: playerData.walletAddress?.substring(0, 8) + '...'
    });

    const player = {
      socketId: socket.id,
      walletAddress: playerData.walletAddress,
      playerName: playerData.playerName,
      selectedKryptomon: playerData.selectedKryptomon,
      isGuestMode: playerData.isGuestMode || false
    };

    // Remove any existing waiting players with same socket ID
    waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);

    // Check if there's already a waiting player
    if (waitingPlayers.length > 0) {
      const opponent = waitingPlayers.shift();
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('🆚 Match found! Creating game:', gameId);
      
      // Create game state
      const gameState = createGameState(opponent, player);
      activeGames.set(gameId, gameState);
      
      // Notify both players about the match
      const opponentSocket = io.sockets.sockets.get(opponent.socketId);
      if (opponentSocket) {
        opponentSocket.join(gameId);
        opponentSocket.emit('matchFound', {
          gameId,
          yourIndex: 0,
          opponentName: player.playerName,
          opponentWallet: player.walletAddress,
          background: gameState.background
        });
      }
      
      socket.join(gameId);
      socket.emit('matchFound', {
        gameId,
        yourIndex: 1,
        opponentName: opponent.playerName,
        opponentWallet: opponent.walletAddress,
        background: gameState.background
      });

      // Start game countdown
      let countdown = 3;
      const countdownInterval = setInterval(() => {
        io.to(gameId).emit('gameCountdown', countdown);
        countdown--;
        
        if (countdown < 0) {
          clearInterval(countdownInterval);
          
          // Send complete game start data to both players
          const opponentSocket = io.sockets.sockets.get(opponent.socketId);
          if (opponentSocket) {
            opponentSocket.emit('gameStart', {
              gameId,
              yourIndex: 0,
              opponentName: player.playerName,
              opponentWallet: player.walletAddress,
              gameState: gameState,
              background: gameState.background
            });
          }
          
          socket.emit('gameStart', {
            gameId,
            yourIndex: 1,
            opponentName: opponent.playerName,
            opponentWallet: opponent.walletAddress,
            gameState: gameState,
            background: gameState.background
          });
          
          console.log('🎮 Game started:', gameId);
        }
      }, 1000);

    } else {
      // Add to waiting list
      waitingPlayers.push(player);
      socket.emit('waitingForOpponent', {
        message: 'Searching for opponent...',
        queuePosition: waitingPlayers.length
      });
      console.log('⏳ Player added to waiting list. Queue size:', waitingPlayers.length);
    }
  });

  // Handle player moves
  socket.on('playerMove', (moveData) => {
    console.log('🎯 Player move received:', moveData);

    // Find the game this player is in
    let gameId = null;
    let playerIndex = -1;
    
    for (const [id, game] of activeGames) {
      const p1Index = game.players.findIndex(p => p.socketId === socket.id);
      if (p1Index !== -1) {
        gameId = id;
        playerIndex = p1Index;
        break;
      }
    }

    if (!gameId || playerIndex === -1) {
      console.log('❌ Game not found for player move');
      return;
    }

    const gameState = activeGames.get(gameId);
    if (!gameState || !gameState.gameActive) {
      console.log('❌ Game not active');
      return;
    }

    // Check if it's the player's turn
    if (gameState.currentTurn !== playerIndex) {
      console.log('❌ Not player\'s turn');
      return;
    }

    // Process the move
    const winner = processMove(
      gameState, 
      playerIndex, 
      moveData.move, 
      moveData.activeKryptomon
    );

    // Update the game state
    activeGames.set(gameId, gameState);

    // Broadcast game update
    io.to(gameId).emit('gameUpdate', {
      gameState: gameState,
      lastMoveResult: gameState.lastMoveResult,
      currentTurn: gameState.currentTurn,
      turnCount: gameState.turnCount
    });

    // Check for game end
    if (winner !== null || !gameState.gameActive) {
      console.log('🏆 Game finished:', gameId, 'Winner:', winner);
      
      io.to(gameId).emit('gameEnd', {
        winner: winner,
        gameState: gameState,
        winnerName: winner !== null ? gameState.players[winner].playerName : 'Draw'
      });

      // Clean up
      activeGames.delete(gameId);
    }
  });

  // Handle emoji
  socket.on('sendEmoji', (data) => {
    // Find the game this player is in
    let gameId = null;
    
    for (const [id, game] of activeGames) {
      const playerFound = game.players.some(p => p.socketId === socket.id);
      if (playerFound) {
        gameId = id;
        break;
      }
    }

    if (gameId) {
      // Broadcast emoji to the opponent only
      socket.to(gameId).emit('opponentEmoji', {
        emoji: data.emoji,
        timestamp: Date.now()
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('🔌 Player disconnected:', socket.id);

    // Remove from waiting players
    waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);

    // Handle active games
    for (const [gameId, gameState] of activeGames) {
      const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex !== -1) {
        console.log('🚪 Player left active game:', gameId);
        
        // Notify opponent
        socket.to(gameId).emit('opponentDisconnected', {
          message: 'Opponent disconnected',
          winner: 1 - playerIndex
        });

        // Clean up game
        activeGames.delete(gameId);
        break;
      }
    }
  });

  // Handle turn timeout
  socket.on('turnTimeout', (data) => {
    // Find the game this player is in
    let gameId = null;
    let playerIndex = -1;
    
    for (const [id, game] of activeGames) {
      const p1Index = game.players.findIndex(p => p.socketId === socket.id);
      if (p1Index !== -1) {
        gameId = id;
        playerIndex = p1Index;
        break;
      }
    }

    if (!gameId || playerIndex === -1) {
      return;
    }

    const gameState = activeGames.get(gameId);
    if (!gameState || !gameState.gameActive) {
      return;
    }

    // Check if it's still the player's turn
    if (gameState.currentTurn !== playerIndex) {
      return;
    }

    console.log('⏰ Turn timeout for player:', playerIndex);

    // Process timeout as a skip move
    const winner = processMove(gameState, playerIndex, 'timeout');

    // Update the game state
    activeGames.set(gameId, gameState);

    // Broadcast game update
    io.to(gameId).emit('gameUpdate', {
      gameState: gameState,
      lastMoveResult: gameState.lastMoveResult,
      currentTurn: gameState.currentTurn,
      turnCount: gameState.turnCount,
      turnSkipped: true
    });

    // Check for game end
    if (winner !== null || !gameState.gameActive) {
      io.to(gameId).emit('gameEnd', {
        winner: winner,
        gameState: gameState,
        winnerName: winner !== null ? gameState.players[winner].playerName : 'Draw'
      });

      activeGames.delete(gameId);
    }
  });

  // Handle surrender
  socket.on('surrender', () => {
    // Find the game this player is in
    let gameId = null;
    let playerIndex = -1;
    
    for (const [id, game] of activeGames) {
      const p1Index = game.players.findIndex(p => p.socketId === socket.id);
      if (p1Index !== -1) {
        gameId = id;
        playerIndex = p1Index;
        break;
      }
    }

    if (!gameId || playerIndex === -1) {
      return;
    }

    const gameState = activeGames.get(gameId);
    if (!gameState || !gameState.gameActive) {
      return;
    }

    console.log('🏳️ Player surrendered:', playerIndex);

    // Process surrender
    const winner = processMove(gameState, playerIndex, 'surrender');

    // Update the game state
    activeGames.set(gameId, gameState);

    // Broadcast game end
    io.to(gameId).emit('gameEnd', {
      winner: winner,
      gameState: gameState,
      winnerName: winner !== null ? gameState.players[winner].playerName : 'Draw',
      surrendered: true,
      surrenderer: playerIndex
    });

    // Clean up
    activeGames.delete(gameId);
  });
});

// Clean up inactive games and waiting players
setInterval(() => {
  const now = Date.now();
  const GAME_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  const WAITING_TIMEOUT = 2 * 60 * 1000; // 2 minutes

  // Clean up inactive games
  for (const [gameId, gameState] of activeGames) {
    if (now - gameState.lastActivity > GAME_TIMEOUT) {
      console.log('🧹 Cleaning up inactive game:', gameId);
      io.to(gameId).emit('gameTimeout', { message: 'Game timed out due to inactivity' });
      activeGames.delete(gameId);
    }
  }

  // Clean up old waiting players (socket might be disconnected)
  waitingPlayers = waitingPlayers.filter(player => {
    const socket = io.sockets.sockets.get(player.socketId);
    return socket && socket.connected;
  });

  // Log current status
  if (activeGames.size > 0 || waitingPlayers.length > 0) {
    console.log(`📊 Status: ${activeGames.size} active games, ${waitingPlayers.length} waiting players`);
  }
}, 30000); // Check every 30 seconds

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Kryptomon Battle Arena Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`⚡ Socket.io ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server shut down complete');
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server shut down complete');
  });
});
