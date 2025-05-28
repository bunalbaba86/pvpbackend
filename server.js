const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(express.json());

// Serve static files from public directory
app.use('/public', express.static(path.join(__dirname, 'public')));

// Serve index.html from root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state variables
const waitingPlayers = [];
const activeGames = new Map();
const playerStats = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length
  });
});

// Enhanced Socket.io configuration
const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 120000,
  pingInterval: 45000,
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

// ✅ KRYPTOMON CREATİON WİTH RANDOM STATS
function createRandomKryptomon(id) {
  const sprite = Math.floor(Math.random() * 20) + 1; // 1-20 arası
  const baseHp = 80 + Math.floor(Math.random() * 40); // 80-120 arası
  const baseMana = 100;
  
  return {
    id,
    sprite,
    hp: baseHp,
    maxHp: baseHp,
    mana: 0,
    maxMana: baseMana,
    isAlive: true,
    ultimateUsed: false,
    attack: 20 + Math.floor(Math.random() * 20), // 20-40 arası
    defense: 5 + Math.floor(Math.random() * 10), // 5-15 arası
    speed: 10 + Math.floor(Math.random() * 20), // 10-30 arası
    name: `Kryptomon #${sprite}`
  };
}

// ✅ TEAM GENERATION (3 KRYPTOMON)
function generateRandomTeam() {
  return [
    createRandomKryptomon(1),
    createRandomKryptomon(2),
    createRandomKryptomon(3)
  ];
}

// ✅ BATTLE MOVES WITH ANIMATIONS
const battleMoves = {
  attack: {
    manaCost: 0,
    manaGain: 2,
    baseDamage: 25,
    critChance: 0.15,
    animation: 'bite',
    soundEffect: 'bite.mp3'
  },
  defend: {
    manaCost: 0,
    heal: 15,
    cooldownTurns: 3,
    animation: 'defend',
    soundEffect: 'defence.mp3'
  },
  skill: {
    manaCost: 2,
    baseDamage: 40,
    critChance: 0.25,
    animation: 'skill',
    soundEffect: 'skill.mp3'
  },
  ultimate: {
    manaCost: 6,
    baseDamage: 65,
    critChance: 0.35,
    animation: 'ultimate',
    soundEffect: 'ultimate.mp3'
  }
};

// ✅ DAMAGE CALCULATION WITH CRITICAL
function calculateDamage(attacker, defender, baseDamage, critChance = 0.15) {
  try {
    // Base damage with attacker's attack stat
    let damage = baseDamage + Math.floor(attacker.attack * 0.5);
    
    // Apply defender's defense
    damage = Math.max(1, damage - Math.floor(defender.defense * 0.3));
    
    // Random variance ±20%
    const variance = Math.floor(damage * 0.2 * (Math.random() * 2 - 1));
    damage += variance;
    
    // Critical hit check
    const isCritical = Math.random() < critChance;
    if (isCritical) {
      damage = Math.floor(damage * 1.75); // 75% bonus
    }
    
    return {
      damage: Math.max(1, damage),
      isCritical
    };
  } catch (error) {
    console.error('❌ Damage calculation error:', error);
    return { damage: baseDamage, isCritical: false };
  }
}

// ✅ RANDOM BACKGROUND SELECTION
function getRandomBackground() {
  const backgrounds = ['background1.png', 'background2.png', 'background3.png'];
  return backgrounds[Math.floor(Math.random() * backgrounds.length)];
}

// ✅ ENHANCED MOVE PROCESSING
function processMove(game, playerIndex, moveType) {
  try {
    const player = game.players[playerIndex];
    const opponent = game.players[1 - playerIndex];
    const currentKryptomon = player.team[player.currentKryptomon];
    const enemyKryptomon = opponent.team[opponent.currentKryptomon];
    const move = battleMoves[moveType];

    if (!move || !currentKryptomon || !currentKryptomon.isAlive) {
      return { success: false, error: 'Invalid move or Kryptomon' };
    }

    // Check mana and cooldowns
    if (move.manaCost && currentKryptomon.mana < move.manaCost) {
      return { success: false, error: 'Insufficient mana' };
    }

    if (moveType === 'ultimate' && currentKryptomon.ultimateUsed) {
      return { success: false, error: 'Ultimate already used' };
    }

    if (moveType === 'defend' && player.defendCooldown > 0) {
      return { success: false, error: 'Defend on cooldown' };
    }

    // Process mana changes
    if (move.manaCost) {
      currentKryptomon.mana = Math.max(0, currentKryptomon.mana - move.manaCost);
    }
    if (move.manaGain) {
      currentKryptomon.mana = Math.min(currentKryptomon.maxMana, currentKryptomon.mana + move.manaGain);
    }

    const result = {
      success: true,
      moveType,
      playerIndex,
      animation: move.animation,
      soundEffect: move.soundEffect,
      damageInfo: null,
      effects: []
    };

    // Process move effects
    switch (moveType) {
      case 'attack':
      case 'skill':
      case 'ultimate':
        const damageResult = calculateDamage(currentKryptomon, enemyKryptomon, move.baseDamage, move.critChance);
        const actualDamage = damageResult.damage;
        
        enemyKryptomon.hp = Math.max(0, enemyKryptomon.hp - actualDamage);
        
        result.damageInfo = {
          damage: actualDamage,
          isCritical: damageResult.isCritical,
          target: 'enemy',
          attackerName: currentKryptomon.name,
          defenderName: enemyKryptomon.name
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
            // Game over
            game.winner = playerIndex;
            game.gameOver = true;
            result.effects.push('game_over');
          }
        }
        
        if (moveType === 'ultimate') {
          currentKryptomon.ultimateUsed = true;
        }
        break;

      case 'defend':
        const healAmount = move.heal;
        const oldHp = currentKryptomon.hp;
        currentKryptomon.hp = Math.min(currentKryptomon.maxHp, currentKryptomon.hp + healAmount);
        
        player.defendCooldown = move.cooldownTurns;
        
        result.damageInfo = {
          damage: currentKryptomon.hp - oldHp,
          isCritical: false,
          target: 'self',
          healAmount: currentKryptomon.hp - oldHp
        };
        break;
    }

    return result;
    
  } catch (error) {
    console.error('❌ Move processing error:', error);
    return { success: false, error: 'Move processing failed' };
  }
}

// ✅ TURN TIMER SYSTEM
function startTurnTimer(game) {
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
  }
  
  game.turnStartTime = Date.now();
  game.turnTimeLeft = 30; // 30 saniye
  
  // Send timer update every second
  const timerInterval = setInterval(() => {
    if (game.gameOver) {
      clearInterval(timerInterval);
      return;
    }
    
    const elapsed = Math.floor((Date.now() - game.turnStartTime) / 1000);
    game.turnTimeLeft = Math.max(0, 30 - elapsed);
    
    // Broadcast timer update
    io.to(game.id).emit('turnTimer', {
      timeLeft: game.turnTimeLeft,
      currentTurn: game.currentTurn
    });
    
    if (game.turnTimeLeft <= 0) {
      clearInterval(timerInterval);
      // Auto-skip turn
      skipTurn(game);
    }
  }, 1000);
  
  game.turnTimer = setTimeout(() => {
    clearInterval(timerInterval);
    if (!game.gameOver) {
      skipTurn(game);
    }
  }, 30000);
}

function skipTurn(game) {
  try {
    // Reduce cooldowns
    game.players.forEach(player => {
      if (player.defendCooldown > 0) {
        player.defendCooldown--;
      }
    });
    
    // Switch turn
    game.currentTurn = 1 - game.currentTurn;
    game.turnCount++;
    
    // Broadcast turn change
    io.to(game.id).emit('turnChanged', {
      gameRoom: game,
      message: 'Turn skipped due to timeout'
    });
    
    // Start next turn timer
    startTurnTimer(game);
    
  } catch (error) {
    console.error('❌ Skip turn error:', error);
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔗 New connection:', socket.id);

  // ✅ JOIN GAME WITH TELEGRAM INFO
  socket.on('joinGame', (data) => {
    try {
      console.log('🎮 Join game request:', socket.id, data);
      
      const playerData = {
        id: socket.id,
        username: data.username || 'Anonymous',
        telegramUserId: data.telegramUserId || null,
        profilePhoto: data.profilePhoto || null,
        isTelegramUser: data.isTelegramUser || false,
        team: generateRandomTeam(),
        currentKryptomon: 0,
        defendCooldown: 0
      };

      // Remove from waiting if already there
      const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
      if (waitingIndex !== -1) {
        waitingPlayers.splice(waitingIndex, 1);
      }

      waitingPlayers.push(playerData);
      console.log('👥 Players waiting:', waitingPlayers.length);

      if (waitingPlayers.length >= 2) {
        const player1 = waitingPlayers.shift();
        const player2 = waitingPlayers.shift();
        
        console.log('🎯 Creating game between:', player1.username, 'vs', player2.username);
        
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const game = {
          id: gameId,
          players: [player1, player2],
          currentTurn: 0,
          gameOver: false,
          winner: null,
          turnCount: 0,
          background: getRandomBackground(),
          createdAt: new Date()
        };

        activeGames.set(gameId, game);
        
        // Join socket rooms
        const socket1 = io.sockets.sockets.get(player1.id);
        const socket2 = io.sockets.sockets.get(player2.id);
        
        if (socket1 && socket2) {
          socket1.join(gameId);
          socket2.join(gameId);
          
          // Send game start
          socket1.emit('gameStarted', {
            gameRoom: game,
            yourIndex: 0
          });
          
          socket2.emit('gameStarted', {
            gameRoom: game,
            yourIndex: 1
          });
          
          // Start turn timer
          startTurnTimer(game);
          
          console.log('✅ Game started successfully:', gameId);
        }
      } else {
        socket.emit('waitingForOpponent', {
          message: 'Searching for opponent...',
          playersWaiting: waitingPlayers.length
        });
      }
    } catch (error) {
      console.error('❌ Join game error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // ✅ BATTLE MOVE WITH ENHANCED PROCESSING
  socket.on('battleMove', (data) => {
    try {
      console.log('⚔️ Battle move received:', socket.id, data);
      
      // Find player's game
      let playerGame = null;
      let playerIndex = -1;
      
      for (let [gameId, game] of activeGames) {
        const index = game.players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          playerGame = game;
          playerIndex = index;
          break;
        }
      }
      
      if (!playerGame) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      if (playerGame.gameOver) {
        socket.emit('error', { message: 'Game is over' });
        return;
      }
      
      if (playerGame.currentTurn !== playerIndex) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      // Process the move
      const moveResult = processMove(playerGame, playerIndex, data.move);
      
      if (!moveResult.success) {
        socket.emit('error', { message: moveResult.error });
        return;
      }
      
      // Clear turn timer
      if (playerGame.turnTimer) {
        clearTimeout(playerGame.turnTimer);
      }
      
      // Update cooldowns
      playerGame.players.forEach(player => {
        if (player.defendCooldown > 0) {
          player.defendCooldown--;
        }
      });
      
      // Switch turn if game not over
      if (!playerGame.gameOver) {
        playerGame.currentTurn = 1 - playerGame.currentTurn;
        playerGame.turnCount++;
      }
      
      // Broadcast move result
      io.to(playerGame.id).emit('moveResult', {
        gameRoom: playerGame,
        moveResult: moveResult
      });
      
      // Check for game over
      if (playerGame.gameOver) {
        const winner = playerGame.players[playerGame.winner];
        
        io.to(playerGame.id).emit('gameOver', {
          winner: playerGame.winner,
          winnerName: winner.username,
          gameStats: {
            turns: playerGame.turnCount,
            duration: Date.now() - playerGame.createdAt.getTime()
          }
        });
        
        // Cleanup
        activeGames.delete(playerGame.id);
        console.log('🏁 Game ended:', playerGame.id);
      } else {
        // Start next turn timer
        startTurnTimer(playerGame);
      }
      
    } catch (error) {
      console.error('❌ Battle move error:', error);
      socket.emit('error', { message: 'Move failed' });
    }
  });

  // ✅ SWITCH KRYPTOMON
  socket.on('switchKryptomon', (data) => {
    try {
      let playerGame = null;
      let playerIndex = -1;
      
      for (let [gameId, game] of activeGames) {
        const index = game.players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          playerGame = game;
          playerIndex = index;
          break;
        }
      }
      
      if (!playerGame || playerGame.gameOver) {
        socket.emit('error', { message: 'Cannot switch Kryptomon' });
        return;
      }
      
      if (playerGame.currentTurn !== playerIndex) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      const player = playerGame.players[playerIndex];
      const targetIndex = data.kryptomonIndex;
      
      if (targetIndex < 0 || targetIndex >= player.team.length) {
        socket.emit('error', { message: 'Invalid Kryptomon index' });
        return;
      }
      
      if (!player.team[targetIndex].isAlive) {
        socket.emit('error', { message: 'Kryptomon is defeated' });
        return;
      }
      
      if (player.currentKryptomon === targetIndex) {
        socket.emit('error', { message: 'Kryptomon already active' });
        return;
      }
      
      // Switch Kryptomon
      player.currentKryptomon = targetIndex;
      
      // This counts as a turn
      if (playerGame.turnTimer) {
        clearTimeout(playerGame.turnTimer);
      }
      
      playerGame.currentTurn = 1 - playerGame.currentTurn;
      playerGame.turnCount++;
      
      // Broadcast switch
      io.to(playerGame.id).emit('kryptomonSwitched', {
        gameRoom: playerGame,
        playerIndex: playerIndex,
        newKryptomonIndex: targetIndex
      });
      
      // Start next turn timer
      startTurnTimer(playerGame);
      
    } catch (error) {
      console.error('❌ Switch Kryptomon error:', error);
      socket.emit('error', { message: 'Switch failed' });
    }
  });

  // ✅ DISCONNECT HANDLING
  socket.on('disconnect', () => {
    console.log('👋 Player disconnected:', socket.id);
    
    // Remove from waiting list
    const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    // Handle active games
    for (let [gameId, game] of activeGames) {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        // End game due to disconnect
        game.gameOver = true;
        game.winner = 1 - playerIndex; // Other player wins
        
        // Notify remaining player
        const remainingPlayer = game.players[1 - playerIndex];
        const remainingSocket = io.sockets.sockets.get(remainingPlayer.id);
        
        if (remainingSocket) {
          remainingSocket.emit('gameOver', {
            winner: 1 - playerIndex,
            winnerName: remainingPlayer.username,
            reason: 'opponent_disconnected'
          });
        }
        
        // Cleanup
        if (game.turnTimer) {
          clearTimeout(game.turnTimer);
        }
        activeGames.delete(gameId);
        
        console.log('🔌 Game ended due to disconnect:', gameId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kryptomon Battle Server running on port ${PORT}`);
  console.log(`🎮 Features: Random teams, turn timer, animations, sounds, backgrounds`);
});
