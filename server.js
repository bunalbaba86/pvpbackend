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

// Create Kryptomon with NFT support - Updated mana system
const createKryptomon = (id, nftData = null) => ({
  id,
  hp: 100,
  maxHp: 100,
  mana: 0,  // Start with 0 mana
  maxMana: 100,
  isAlive: true,
  ultimateUsed: false,
  sprite: nftData ? nftData.kryptomonId : getRandomKryptomonSprite(),
  tokenId: nftData ? nftData.tokenId : null,
  name: nftData ? nftData.name : `Kryptomon #${id}`,
  defendTurnsLeft: 0,
  defendCooldown: 0
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

// Updated battle moves
const moves = {
  attack: { 
    manaCost: 0,
    manaGain: 2,  // Attack now gives mana
    baseDamage: 25, 
    critChance: 0.15,
    soundEffect: 'attack'
  },
  defend: { 
    manaCost: 0,  // Defend is now free
    heal: 15,
    defendTurns: 2,  // 2 turns of effect
    cooldown: 4,     // 4 turn cooldown
    soundEffect: 'defend'
  },
  skill: { 
    manaCost: 2,  // Reduced from 20 to 2
    baseDamage: 40, 
    critChance: 0.25,
    soundEffect: 'skill'
  },
  ultimate: { 
    manaCost: 6,  // Reduced from 40 to 6
    baseDamage: 60, 
    critChance: 0.35,
    soundEffect: 'ultimate'
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

// Process move with new mana system
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

  // Check defend cooldown
  if (moveType === 'defend' && currentKryptomon.defendCooldown > 0) {
    return { success: false };
  }

  // Use mana
  if (move.manaCost) {
    currentKryptomon.mana = Math.max(0, currentKryptomon.mana - move.manaCost);
  }

  // Gain mana (for attack)
  if (move.manaGain) {
    currentKryptomon.mana = Math.min(currentKryptomon.maxMana, currentKryptomon.mana + move.manaGain);
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
      let actualDamage = damageResult.damage;
      
      // Apply defend reduction if enemy is defending
      if (enemyKryptomon.defendTurnsLeft > 0) {
        actualDamage = Math.floor(actualDamage * 0.5); // 50% damage reduction
      }
      
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
      
      // Show mana gain for attack
      if (moveType === 'attack' && move.manaGain) {
        result.manaGain = move.manaGain;
      }
      break;

    case 'defend':
      const healAmount = move.heal;
      const oldHp = currentKryptomon.hp;
      currentKryptomon.hp = Math.min(currentKryptomon.maxHp, currentKryptomon.hp + healAmount);
      
      // Set defend status
      currentKryptomon.defendTurnsLeft = move.defendTurns;
      currentKryptomon.defendCooldown = move.cooldown;
      
      result.damageInfo = {
        damage: currentKryptomon.hp - oldHp,
        isCritical: false,
        target: 'self',
        isHeal: true
      };
      break;
  }

  return result;
}

// Update turn cooldowns
function updateCooldowns(game) {
  game.players.forEach(player => {
    player.team.forEach(kryptomon => {
      if (kryptomon.defendCooldown > 0) {
        kryptomon.defendCooldown--;
      }
      if (kryptomon.defendTurnsLeft > 0) {
        kryptomon.defendTurnsLeft--;
      }
    });
  });
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
      updateCooldowns(game);
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
      socket.emit('error', { message: 'Invalid move - insufficient mana or on cooldown' });
      return;
    }

    // Clear current timer
    if (currentGame.timer) {
      clearInterval(currentGame.timer);
      currentGame.timer = null;
    }

    // Update cooldowns for all Kryptomon
    updateCooldowns(currentGame);

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🎮 Kryptomon Battle Arena ready!`);
});

// Telegram Bot entegrasyonu
const TelegramBot = require('node-telegram-bot-api');
const BOT_TOKEN = '8038231934:AAEx0gp2jt61vHlPvt-KiQGwNpI-frnqRAg';

// Bot'u başlat (webhook modunda değil, sadece komutlar için)
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Ana sayfa route'u - Telegram Web App için
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/game.html');
});

// Telegram webhook endpoint (opsiyonel)
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Bot komutları
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.first_name || msg.from.username || 'Player';
  
  const welcomeMessage = `🐾 Welcome to Kryptomon Battle Arena, ${username}!

⚔️ Epic multiplayer battles await you!
🎯 Defeat 3 enemy Kryptomon to win
🏆 Climb the leaderboards

Ready to battle?`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ 
          text: '🎮 Play Kryptomon Battle', 
          web_app: { url: 'https://kryptomonbattlearena.vercel.app' } 
        }],
        [
          { text: '📊 Stats', callback_data: 'stats' },
          { text: '❓ Help', callback_data: 'help' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeMessage, keyboard);
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'stats') {
    bot.sendMessage(chatId, '📊 Your Battle Stats:\n🏆 Coming Soon!\n⚔️ Track your victories\n🎯 Climb the leaderboard');
  } else if (data === 'help') {
    bot.sendMessage(chatId, `❓ How to Play:

⚔️ **Attack** - Deal damage (+2 MP)
🛡️ **Defend** - Heal yourself (Free) 
✨ **Skill** - Strong attack (-2 MP)
💥 **Ultimate** - Devastating attack (-6 MP)

🎯 Defeat all 3 enemy Kryptomon to win!
🏆 Each victory increases your rank!`);
  }
  
  bot.answerCallbackQuery(query.id);
});
