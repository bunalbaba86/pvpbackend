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

// Kryptomon sprites (1-20)
const getRandomKryptomonSprite = () => Math.floor(Math.random() * 20) + 1;

// Create Kryptomon with NFT support
const createKryptomon = (id, nftData = null) => ({
  id,
  hp: 100,
  maxHp: 100,
  mana: 100,
  maxMana: 100,
  isAlive: true,
  ultimateUsed: false,
  sprite: nftData ? nftData.kryptomonId : getRandomKryptomonSprite(),
  tokenId: nftData ? nftData.tokenId : null,
  name: nftData ? nftData.name : `Kryptomon #${id}`
});

// Create team from NFTs or random
function generateTeam(selectedNFTs = null) {
  if (selectedNFTs && selectedNFTs.length === 3) {
    return selectedNFTs.map((nft, index) => createKryptomon(index + 1, nft));
  }
  
  return [
    createKryptomon(1),
    createKryptomon(2), 
    createKryptomon(3)
  ];
}

// Battle moves with enhanced damage calculations
const moves = {
  attack: { 
    manaCost: 10, 
    baseDamage: 25, 
    critChance: 0.15,
    soundEffect: 'attack'
  },
  defend: { 
    manaCost: 5, 
    heal: 15,
    soundEffect: 'defend'
  },
  skill: { 
    manaCost: 20, 
    baseDamage: 40, 
    critChance: 0.25,
    soundEffect: 'skill'
  },
  ultimate: { 
    manaCost: 40, 
    baseDamage: 60, 
    critChance: 0.35,
    soundEffect: 'ultimate'
  },
  manaRestore: { 
    manaGain: 25,
    soundEffect: null
  }
};

// Calculate damage with critical hit system
function calculateDamage(baseDamage, critChance = 0.15) {
  const variance = Math.floor(Math.random() * 11) - 5; // -5 to +5
  let damage = baseDamage + variance;
  
  const isCritical = Math.random() < critChance;
  if (isCritical) {
    damage = Math.floor(damage * 1.5); // 1.5x damage for critical
  }
  
  return {
    damage: Math.max(1, damage),
    isCritical
  };
}

// Process move with enhanced battle system
function processMove(game, playerIndex, moveType) {
  const player = game.players[playerIndex];
  const opponent = game.players[1 - playerIndex];
  const currentKryptomon = player.team[player.currentKryptomon];
  const enemyKryptomon = opponent.team[opponent.currentKryptomon];
  const move = moves[moveType];

  if (!move || !currentKryptomon.isAlive) {
    return { success: false };
  }

  // Check mana
  if (move.manaCost && currentKryptomon.mana < move.manaCost) {
    return { success: false };
  }

  // Use mana
  if (move.manaCost) {
    currentKryptomon.mana = Math.max(0, currentKryptomon.mana - move.manaCost);
  }

  const result = { 
    success: true, 
    moveType, 
    playerIndex,
    effects: [],
    soundEffect: move.soundEffect,
    damageInfo: null
  };

  switch (moveType) {
    case 'attack':
    case 'skill':
    case 'ultimate':
      const damageResult = calculateDamage(move.baseDamage, move.critChance);
      const actualDamage = damageResult.damage;
      
      enemyKryptomon.hp = Math.max(0, enemyKryptomon.hp - actualDamage);
      
      result.damageInfo = {
        damage: actualDamage,
        isCritical: damageResult.isCritical,
        target: 'enemy'
      };
      
      // Check if Kryptomon is defeated
      if (enemyKryptomon.hp <= 0) {
        enemyKryptomon.isAlive = false;
        result.effects.push('kryptomon_defeated');
        
        // Find next alive Kryptomon
        let nextAlive = -1;
        for (let i = 0; i < opponent.team.length; i++) {
          if (opponent.team[i].isAlive) {
            nextAlive = i;
            break;
          }
        }
        
        if (nextAlive !== -1) {
          opponent.currentKryptomon = nextAlive;
          result.effects.push('kryptomon_switch');
        } else {
          // All Kryptomon defeated
          game.winner = playerIndex;
          game.gameOver = true;
          result.effects.push('game_over');
        }
      }
      
      // Mark ultimate as used
      if (moveType === 'ultimate') {
        currentKryptomon.ultimateUsed = true;
      }
      break;

    case 'defend':
      const healAmount = move.heal;
      const oldHp = currentKryptomon.hp;
      currentKryptomon.hp = Math.min(currentKryptomon.maxHp, currentKryptomon.hp + healAmount);
      
      result.damageInfo = {
        damage: currentKryptomon.hp - oldHp,
        isCritical: false,
        target: 'self',
        isHeal: true
      };
      break;

    case 'manaRestore':
      const manaGain = move.manaGain;
      const oldMana = currentKryptomon.mana;
      currentKryptomon.mana = Math.min(currentKryptomon.maxMana, currentKryptomon.mana + manaGain);
      
      result.damageInfo = {
        damage: currentKryptomon.mana - oldMana,
        isCritical: false,
        target: 'self',
        isMana: true
      };
      break;
  }

  return result;
}

// Enhanced game timer
function startGameTimer(gameId) {
  const game = activeGames.get(gameId);
  if (!game) return;

  let timeLeft = 30;
  game.timer = setInterval(() => {
    timeLeft--;
    io.to(gameId).emit('timerUpdate', { timeLeft });
    
    if (timeLeft <= 0) {
      clearInterval(game.timer);
      // Auto skip turn
      game.currentTurn = 1 - game.currentTurn;
      io.to(gameId).emit('turnSkipped', { 
        reason: 'timeout',
        gameRoom: game 
      });
      startGameTimer(gameId); // Start timer for next turn
    }
  }, 1000);
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('joinGame', (data) => {
    console.log(`Player ${data.username} joining game`, data);
    
    const player = {
      id: socket.id,
      username: data.username || `Player_${Math.floor(Math.random() * 1000)}`,
      team: generateTeam(data.selectedNFTs),
      currentKryptomon: 0,
      isGuest: data.isGuest || !data.selectedNFTs,
      selectedNFTs: data.selectedNFTs || []
    };

    // Add to waiting list
    waitingPlayers.push(player);
    socket.emit('waitingForOpponent', { 
      player: player.username,
      isGuest: player.isGuest 
    });

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
        winner: null,
        timer: null,
        startTime: Date.now()
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

            // Start game timer
            startGameTimer(gameId);
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
      socket.emit('error', { message: 'Invalid move - insufficient mana or invalid action' });
      return;
    }

    // Clear current timer
    if (currentGame.timer) {
      clearInterval(currentGame.timer);
      currentGame.timer = null;
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
        gameRoom: currentGame,
        duration: Date.now() - currentGame.startTime
      });
      
      activeGames.delete(currentGame.id);
    } else {
      // Start timer for next turn
      setTimeout(() => {
        if (activeGames.has(currentGame.id)) {
          startGameTimer(currentGame.id);
        }
      }, 2000); // 2 second delay for animations
    }
  });

  socket.on('requestTeamSwitch', (data) => {
    // Allow manual team switching (if Kryptomon is alive)
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

    if (!currentGame || playerIndex === -1) return;

    const player = currentGame.players[playerIndex];
    const targetIndex = data.kryptomonIndex;

    if (targetIndex >= 0 && targetIndex < player.team.length && 
        player.team[targetIndex].isAlive && 
        targetIndex !== player.currentKryptomon) {
      
      player.currentKryptomon = targetIndex;
      
      io.to(currentGame.id).emit('teamSwitched', {
        playerIndex,
        newKryptomonIndex: targetIndex,
        gameRoom: currentGame
      });
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
        // Clear timer
        if (game.timer) {
          clearInterval(game.timer);
        }
        
        // End game
        socket.to(gameId).emit('gameEnd', {
          winner: 1 - playerIndex,
          reason: 'opponent_disconnected',
          gameRoom: game
        });
        activeGames.delete(gameId);
        break;
      }
    }
  });
});

// Health check with enhanced stats
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Game stats endpoint
app.get('/stats', (req, res) => {
  const gameStats = [];
  activeGames.forEach((game, gameId) => {
    gameStats.push({
      gameId,
      players: game.players.map(p => ({
        username: p.username,
        isGuest: p.isGuest,
        currentKryptomon: p.currentKryptomon,
        aliveKryptomon: p.team.filter(k => k.isAlive).length
      })),
      currentTurn: game.currentTurn,
      gameOver: game.gameOver,
      duration: Date.now() - game.startTime
    });
  });

  res.json({
    activeGames: gameStats,
    waitingPlayers: waitingPlayers.map(p => ({
      username: p.username,
      isGuest: p.isGuest
    }))
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🎮 Kryptomon Battle Arena ready!`);
  console.log(`📊 Stats available at: http://localhost:${PORT}/stats`);
  console.log(`❤️ Health check at: http://localhost:${PORT}/health`);
});
