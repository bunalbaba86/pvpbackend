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
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html from root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state variables (tanımlanması gerekiyor!)
const waitingPlayers = [];
const activeGames = new Map();
const connectionStats = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length
  });
});

// TEK Socket.io konfigürasyonu
const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 120000,        
  pingInterval: 45000,        
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  maxHttpBufferSize: 1e6,
  connectTimeout: 90000,      
  upgradeTimeout: 60000,      
  allowUpgrades: true,
  cookie: false,
  serveClient: false
});

// Telegram Bot integration
const TelegramBot = require('node-telegram-bot-api');
const BOT_TOKEN = '8038231934:AAEx0gp2jt61vHlPvt-KiQGwNpI-frnqRAg';

let bot;
try {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  console.log('🤖 Telegram Bot started successfully!');
} catch (error) {
  console.error('❌ Bot initialization failed:', error);
}

// Bot commands
if (bot) {
  bot.onText(/\/start(.*)/, (msg, match) => {
    try {
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
    } catch (error) {
      console.error('❌ Bot command error:', error);
    }
  });

  bot.on('callback_query', (query) => {
    try {
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
    } catch (error) {
      console.error('❌ Callback query error:', error);
    }
  });

  bot.on('error', (error) => {
    console.error('❌ Telegram Bot Error:', error);
  });

  bot.on('polling_error', (error) => {
    console.error('❌ Telegram Polling Error:', error);
  });
}

// Kryptomon creation
const getRandomKryptomonSprite = () => Math.floor(Math.random() * 20) + 1;

const createKryptomon = (id, nftData = null) => ({
  id,
  hp: 100,
  maxHp: 100,
  mana: 0,
  maxMana: 100,
  isAlive: true,
  ultimateUsed: false,
  sprite: nftData ? nftData.kryptomonId : getRandomKryptomonSprite(),
  tokenId: nftData ? nftData.tokenId : null,
  name: nftData ? nftData.name : `Kryptomon #${id}`
});

// Team generation
function generateTeam(selectedNFTs = null) {
  try {
    if (selectedNFTs && Array.isArray(selectedNFTs) && selectedNFTs.length === 3) {
      return selectedNFTs.map((nft, index) => createKryptomon(index + 1, nft));
    }
    
    return [
      createKryptomon(1),
      createKryptomon(2), 
      createKryptomon(3)
    ];
  } catch (error) {
    console.error('❌ Team generation error:', error);
    return [
      createKryptomon(1),
      createKryptomon(2), 
      createKryptomon(3)
    ];
  }
}

// Battle moves
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

// Damage calculation
function calculateDamage(baseDamage, critChance = 0.15) {
  try {
    const variance = Math.floor(Math.random() * 11) - 5;
    let damage = baseDamage + variance;
    
    const isCritical = Math.random() < critChance;
    if (isCritical) {
      damage = Math.floor(damage * 1.5);
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

// Enhanced move processing
function processMove(game, playerIndex, moveType) {
  try {
    // Validate inputs
    if (!game || !game.players || playerIndex < 0 || playerIndex >= game.players.length) {
      return { success: false, error: 'Invalid game state' };
    }

    const player = game.players[playerIndex];
    const opponent = game.players[1 - playerIndex];
    
    if (!player || !opponent) {
      return { success: false, error: 'Player not found' };
    }

    if (!player.team || !opponent.team) {
      return { success: false, error: 'Team data missing' };
    }

    const currentKryptomon = player.team[player.currentKryptomon];
    const enemyKryptomon = opponent.team[opponent.currentKryptomon];
    const move = moves[moveType];

    if (!move) {
      return { success: false, error: 'Invalid move' };
    }

    if (!currentKryptomon || !currentKryptomon.isAlive) {
      return { success: false, error: 'Kryptomon not available' };
    }

    if (!enemyKryptomon) {
      return { success: false, error: 'Enemy not found' };
    }

    // Check requirements
    if (move.manaCost && currentKryptomon.mana < move.manaCost) {
      return { success: false, error: 'Insufficient mana' };
    }

    if (moveType === 'ultimate' && currentKryptomon.ultimateUsed) {
      return { success: false, error: 'Ultimate already used' };
    }

    if (moveType === 'defend' && player.defendCooldown > 0) {
      return { success: false, error: 'Defend on cooldown' };
    }

    // Process the move
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
      effects: [],
      soundEffect: move.soundEffect,
      damageInfo: null
    };

    // Process move effects
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
        
        // Check if defeated
        if (enemyKryptomon.hp <= 0) {
          enemyKryptomon.isAlive = false;
          result.effects.push('kryptomon_defeated');
          
          // Find next alive
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
        
        player.defendTurnsLeft = move.turnsActive;
        player.defendCooldown = move.cooldownTurns;
        
        result.damageInfo = {
          damage: currentKryptomon.hp - oldHp,
          isCritical: false,
          target: 'self'
        };
        break;
    }

    return result;
    
  } catch (error) {
    console.error('❌ Move processing error:', error);
    return { success: false, error: 'Move processing failed' };
  }
}

// Connection tracking
function trackConnection(socket) {
  const connectionId = socket.id;
  connectionStats.set(connectionId, {
    connected: Date.now(),
    lastPing: Date.now(),
    country: socket.handshake.headers['cf-ipcountry'] || 'unknown',
    userAgent: socket.handshake.headers['user-agent'] || 'unknown'
  });

  socket.on('pong', () => {
    const stats = connectionStats.get(connectionId);
    if (stats) {
      stats.lastPing = Date.now();
    }
  });

  socket.on('disconnect', () => {
    connectionStats.delete(connectionId);
  });
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔗 New connection:', socket.id);
  trackConnection(socket);

  // Join game
  socket.on('joinGame', (data) => {
    try {
      console.log('🎮 Join game request:', socket.id, data);
      
      if (!data || typeof data !== 'object') {
        socket.emit('error', { message: 'Invalid join data' });
        return;
      }

      const playerData = {
        id: socket.id,
        username: data.username || 'Anonymous',
        telegramUserId: data.telegramUserId || null,
        isTelegramUser: data.isTelegramUser || false,
        team: generateTeam(data.selectedNFTs),
        currentKryptomon: 0,
        defendTurnsLeft: 0,
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
        // Create game
        const player1 = waitingPlayers.shift();
        const player2 = waitingPlayers.shift();
        
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const game = {
          id: gameId,
          players: [player1, player2],
          currentTurn: 0,
          gameOver: false,
          winner: null,
          turnTimer: 30,
          createdAt: new Date()
        };

        activeGames.set(gameId, game);
        
        // Join rooms
        io.sockets.sockets.get(player1.id)?.join(gameId);
        io.sockets.sockets.get(player2.id)?.join(gameId);

        console.log('🎯 Game created:', gameId);
        
        // Send game start
        io.to(player1.id).emit('gameStarted', {
          gameRoom: game,
          yourIndex: 0
        });

        io.to(player2.id).emit('gameStarted', {
          gameRoom: game,
          yourIndex: 1
        });

      } else {
        socket.emit('waitingForOpponent');
      }

    } catch (error) {
      console.error('❌ Join game error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Team switch
  socket.on('requestTeamSwitch', (data) => {
    try {
      if (!data || typeof data !== 'object' || typeof data.kryptomonIndex !== 'number') {
        socket.emit('error', { message: 'Invalid switch data' });
        return;
      }

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

      const player = currentGame.players[playerIndex];
      const targetIndex = data.kryptomonIndex;

      // Validate switch
      if (targetIndex < 0 || targetIndex >= player.team.length) {
        socket.emit('error', { message: 'Invalid Kryptomon selection' });
        return;
      }

      if (!player.team[targetIndex].isAlive) {
        socket.emit('error', { message: 'Cannot switch to defeated Kryptomon' });
        return;
      }

      if (targetIndex === player.currentKryptomon) {
        socket.emit('error', { message: 'Already using this Kryptomon' });
        return;
      }

      // Perform switch
      player.currentKryptomon = targetIndex;
      
      console.log(`✅ Team switched: Player ${playerIndex} to Kryptomon ${targetIndex}`);
      
      io.to(currentGame.id).emit('teamSwitched', {
        playerIndex,
        newKryptomonIndex: targetIndex,
        gameRoom: currentGame,
        success: true
      });

    } catch (error) {
      console.error('❌ Team switch error:', error);
      socket.emit('error', { message: 'Team switch failed' });
    }
  });

  // Battle move
  socket.on('battleMove', (data) => {
    try {
      if (!data || !data.move) {
        socket.emit('error', { message: 'Invalid move data' });
        return;
      }

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

      if (!currentGame) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (currentGame.gameOver) {
        socket.emit('error', { message: 'Game is over' });
        return;
      }

      if (currentGame.currentTurn !== playerIndex) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }

      // Process move
      const moveResult = processMove(currentGame, playerIndex, data.move);
      
      if (!moveResult.success) {
        socket.emit('error', { message: moveResult.error || 'Move failed' });
        return;
      }

      // Switch turns
      currentGame.currentTurn = 1 - currentGame.currentTurn;
      
      // Handle cooldowns
      const currentPlayer = currentGame.players[playerIndex];
      if (currentPlayer.defendCooldown > 0) {
        currentPlayer.defendCooldown--;
      }
      if (currentPlayer.defendTurnsLeft > 0) {
        currentPlayer.defendTurnsLeft--;
      }

      // Send result
      io.to(currentGame.id).emit('moveResult', {
        moveResult,
        gameRoom: currentGame
      });

      // Handle game over
      if (currentGame.gameOver) {
        setTimeout(() => {
          io.to(currentGame.id).emit('gameOver', {
            winner: currentGame.winner,
            gameRoom: currentGame
          });
          
          activeGames.delete(currentGame.id);
        }, 2000);
      }

    } catch (error) {
      console.error('❌ Battle move error:', error);
      socket.emit('error', { message: 'Move processing failed' });
    }
  });

  // Disconnect
  socket.on('disconnect', (reason) => {
    console.log('💔 Player disconnected:', socket.id, reason);
    
    try {
      // Remove from waiting
      const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
      if (waitingIndex !== -1) {
        waitingPlayers.splice(waitingIndex, 1);
      }

      // Handle active games
      for (const [gameId, game] of activeGames.entries()) {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const opponentIndex = 1 - playerIndex;
          const opponentId = game.players[opponentIndex].id;
          
          if (io.sockets.sockets.get(opponentId)) {
            io.to(opponentId).emit('opponentDisconnected', {
              message: 'Opponent disconnected',
              waitingForReconnect: true
            });
          }

          // Cleanup after timeout
          setTimeout(() => {
            if (activeGames.has(gameId)) {
              activeGames.delete(gameId);
            }
          }, 120000);
          
          break;
        }
      }
    } catch (error) {
      console.error('❌ Disconnect error:', error);
    }
  });

  // Ping/Pong
  socket.on('ping', (timestamp) => {
    socket.emit('pong', timestamp);
  });
});

// Server monitoring
setInterval(() => {
  console.log(`📊 Server Status: ${activeGames.size} active games, ${waitingPlayers.length} waiting players`);
}, 60000);

// Server startup
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kryptomon Battle Arena server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = { app, server, io };
