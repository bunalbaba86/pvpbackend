const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve game.html from root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Telegram Bot entegrasyonu
const TelegramBot = require('node-telegram-bot-api');
const BOT_TOKEN = '8038231934:AAEx0gp2jt61vHlPvt-KiQGwNpI-frnqRAg';

// Bot'u başlat
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Telegram Bot started!');

// Bot komutları
bot.onText(/\/start(.*)/, (msg, match) => {
  const chatId = msg.chat.id;
  const username = msg.from.first_name || msg.from.username || 'Player';
  
  const welcomeMessage = `🐾 Welcome to Kryptomon Battle Arena, ${username}!

⚔️ Epic multiplayer NFT battles await!
🎯 Defeat 3 enemy Kryptomon to win
🏆 Real-time PvP action

Ready to enter the arena?`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ 
          text: '⚔️ Play Kryptomon Battle', 
          web_app: { url: 'https://kryptomonbattlearena.vercel.app' } 
        }],
        [
          { text: '📊 Battle Stats', callback_data: 'stats' },
          { text: '🎮 How to Play', callback_data: 'help' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeMessage, keyboard);
});

// Callback query handler
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'stats') {
    bot.sendMessage(chatId, '📊 **Battle Stats**\n\n🏆 Coming Soon!\n⚔️ Track your victories\n🎯 Climb the leaderboard', { parse_mode: 'Markdown' });
  } else if (data === 'help') {
    bot.sendMessage(chatId, `🎮 **How to Play**

⚔️ **Attack** - Deal damage (+2 MP)
🛡️ **Defend** - Heal yourself (Free, cooldown)
✨ **Skill** - Strong attack (-2 MP)  
💥 **Ultimate** - Devastating attack (-6 MP)

🎯 Defeat all 3 enemy Kryptomon to win!`, { parse_mode: 'Markdown' });
  }
  
  bot.answerCallbackQuery(query.id);
});
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

// Telegram Bot entegrasyonu
const TelegramBot = require('node-telegram-bot-api');
const BOT_TOKEN = '8038231934:AAEx0gp2jt61vHlPvt-KiQGwNpI-frnqRAg';

// Bot'u başlat
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Telegram Bot started!');

// Ana sayfa route'u - Telegram Web App için
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Bot komutları
bot.onText(/\/start(.*)/, (msg, match) => {
  const chatId = msg.chat.id;
  const username = msg.from.first_name || msg.from.username || 'Player';
  const startParam = match[1].trim();
  
  let welcomeMessage = `🐾 Welcome to Kryptomon Battle Arena, ${username}!

⚔️ Epic multiplayer NFT battles await!
🎯 Defeat 3 enemy Kryptomon to win
🏆 Real-time PvP action
🔥 Telegram-native gaming experience

Ready to enter the arena?`;

  // Eğer referral link ile geliyorsa
  if (startParam && startParam.startsWith('_invite_')) {
    welcomeMessage += `\n\n🎁 You were invited by a friend! Welcome to the battle!`;
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ 
          text: '⚔️ Play Kryptomon Battle', 
          web_app: { url: 'https://pvpbackend.onrender.com' } 
        }],
        [
          { text: '📊 Battle Stats', callback_data: 'stats' },
          { text: '🎮 How to Play', callback_data: 'help' }
        ],
        [
          { text: '👥 Invite Friends', callback_data: 'invite' },
          { text: '🏆 Leaderboard', callback_data: 'leaderboard' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeMessage, keyboard);
});

// Help komutu
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `🎮 **Kryptomon Battle Arena - How to Play**

**🎯 Objective:** Defeat all 3 enemy Kryptomon!

**⚔️ Battle Moves:**
• **Attack** - Deal damage (+2 MP)
• **Defend** - Heal yourself (Free, 2 turns effect)
• **Skill** - Strong attack (-2 MP)  
• **Ultimate** - Devastating attack (-6 MP)

**💡 Strategy Tips:**
• Start with 0 MP, gain MP by attacking
• Defend has cooldown after 2-turn effect
• Ultimate can only be used once per Kryptomon
• Switch between your 3 Kryptomon strategically

**🏆 Win Condition:** Last team standing wins!

Good luck, trainer! 🐾`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Play komutu
bot.onText(/\/play/, (msg) => {
  const chatId = msg.chat.id;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ 
          text: '⚔️ Enter Battle Arena', 
          web_app: { url: 'https://pvpbackend.onrender.com' } 
        }]
      ]
    }
  };

  bot.sendMessage(chatId, '🎮 Ready to battle? Click below to enter the arena!', keyboard);
});

// Callback query handler
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;
  const username = query.from.first_name || query.from.username || 'Player';
  
  if (data === 'stats') {
    const statsMessage = `📊 **${username}'s Battle Stats**

🏆 **Victories:** Coming Soon!
💀 **Defeats:** Coming Soon!  
⚔️ **Total Battles:** Coming Soon!
🎯 **Win Rate:** Coming Soon!
🏅 **Rank:** Coming Soon!

_Stats tracking will be available soon!_`;

    bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
    
  } else if (data === 'help') {
    const helpMessage = `🎮 **How to Play Kryptomon Battle**

**⚔️ Attack** - Deal 25 damage, gain 2 MP
**🛡️ Defend** - Heal 15 HP, free but has cooldown
**✨ Skill** - Deal 40 damage, costs 2 MP
**💥 Ultimate** - Deal 60 damage, costs 6 MP (once per Kryptomon)

**🎯 Goal:** Defeat all 3 enemy Kryptomon to win!

Each Kryptomon starts with 100 HP and 0 MP.`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    
  } else if (data === 'invite') {
    const inviteLink = `https://t.me/your_bot_username?start=invite_${userId}`;
    const inviteMessage = `👥 **Invite Friends to Battle!**

Share this link with your friends:
${inviteLink}

🎁 **Coming Soon:** Referral rewards!
⚔️ Challenge your friends to epic battles!`;

    bot.sendMessage(chatId, inviteMessage, { parse_mode: 'Markdown' });
    
  } else if (data === 'leaderboard') {
    const leaderMessage = `🏆 **Global Leaderboard**

👑 **Top Trainers:** Coming Soon!
⚔️ **Most Battles:** Coming Soon!
🔥 **Win Streaks:** Coming Soon!

_Battle more to climb the ranks!_`;

    bot.sendMessage(chatId, leaderMessage, { parse_mode: 'Markdown' });
  }
  
  bot.answerCallbackQuery(query.id);
});

// Error handling
bot.on('error', (error) => {
  console.error('❌ Telegram Bot Error:', error);
});

bot.on('polling_error', (error) => {
  console.error('❌ Telegram Polling Error:', error);
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
  mana: 0, // Start with 0 mana
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

// Battle moves with updated mana system
const moves = {
  attack: { 
    manaCost: 0, 
    manaGain: 2,
    baseDamage: 25, 
    critChance: 0.15,
    soundEffect: 'attack'
  },
  defend: { 
    manaCost: 0, 
    heal: 15,
    soundEffect: 'defend',
    turnsActive: 2,
    cooldownTurns: 4
  },
  skill: { 
    manaCost: 2, 
    baseDamage: 40, 
    critChance: 0.25,
    soundEffect: 'skill'
  },
  ultimate: { 
    manaCost: 6, 
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

  // Check mana for skills
  if (move.manaCost && currentKryptomon.mana < move.manaCost) {
    return { success: false };
  }

  // Check ultimate usage
  if (moveType === 'ultimate' && currentKryptomon.ultimateUsed) {
    return { success: false };
  }

  // Check defend cooldown
  if (moveType === 'defend') {
    if (player.defendCooldown > 0) {
      return { success: false };
    }
  }

  // Use mana
  if (move.manaCost) {
    currentKryptomon.mana = Math.max(0, currentKryptomon.mana - move.manaCost);
  }

  // Gain mana
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
      
      // Set defend effect and cooldown
      player.defendTurnsLeft = move.turnsActive;
      player.defendCooldown = move.cooldownTurns;
      
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

// Socket.io game logic
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('joinGame', (data) => {
    console.log(`Player ${data.username} joining game`, data);
    
    const player = {
      id: socket.id,
      username: data.username || `Player_${Math.floor(Math.random() * 1000)}`,
      telegramUserId: data.telegramUserId,
      team: generateTeam(data.selectedNFTs),
      currentKryptomon: 0,
      isGuest: data.isGuest || !data.selectedNFTs,
      selectedNFTs: data.selectedNFTs || [],
      defendTurnsLeft: 0,
      defendCooldown: 0
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
      socket.emit('error', { message: 'Invalid move - insufficient mana, cooldown, or already used' });
      return;
    }

    // Clear current timer
    if (currentGame.timer) {
      clearInterval(currentGame.timer);
      currentGame.timer = null;
    }

    // Update defend cooldowns
    currentGame.players.forEach(player => {
      if (player.defendTurnsLeft > 0) {
        player.defendTurnsLeft--;
      }
      if (player.defendCooldown > 0) {
        player.defendCooldown--;
      }
    });

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
  console.log(`🤖 Telegram Bot active!`);
  console.log(`📊 Stats available at: /stats`);
  console.log(`❤️ Health check at: /health`);
});
