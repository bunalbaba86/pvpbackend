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
  res.sendFile(path.join(__dirname, 'game.html'));
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

// ... geri kalan game logic aynı kalacak
