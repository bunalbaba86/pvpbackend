// Server.js - Render için optimize edilmiş
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ✅ RENDER İÇİN CORS
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  credentials: false,
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ STATIC DOSYALAR
app.use('/public', express.static(path.join(__dirname, 'public')));

// ✅ HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length
  });
});

// ✅ SOCKET.IO RENDER AYARLARI
const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 120000,
  pingInterval: 45000,
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  connectTimeout: 90000,
  upgradeTimeout: 60000,
  cookie: false
});

const waitingPlayers = [];
const activeGames = new Map();

io.on('connection', (socket) => {
  console.log('🔗 New connection:', socket.id);

  socket.on('joinGame', (data) => {
    console.log('🎮 Join game request:', data);
    
    const playerData = {
      id: socket.id,
      username: data.username || 'Anonymous',
      telegramUserId: data.telegramUserId || null,
      team: generateRandomTeam(),
      currentKryptomon: 0,
      defendCooldown: 0
    };

    waitingPlayers.push(playerData);
    console.log('👥 Players waiting:', waitingPlayers.length);

    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      startGame(player1, player2);
    } else {
      socket.emit('waitingForOpponent', {
        message: 'Searching for opponent...',
        playersWaiting: waitingPlayers.length
      });
    }
  });

  socket.on('battleMove', (data) => {
    console.log('⚔️ Battle move:', data);
    // Basit response
    socket.emit('moveResult', {
      gameRoom: { /* mock data */ },
      moveResult: { success: true }
    });
  });

  socket.on('disconnect', () => {
    console.log('👋 Player disconnected:', socket.id);
    const index = waitingPlayers.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      waitingPlayers.splice(index, 1);
    }
  });
});

function generateRandomTeam() {
  return [
    { sprite: Math.floor(Math.random() * 20) + 1, hp: 100, maxHp: 100, mana: 0, maxMana: 100, isAlive: true, ultimateUsed: false },
    { sprite: Math.floor(Math.random() * 20) + 1, hp: 100, maxHp: 100, mana: 0, maxMana: 100, isAlive: true, ultimateUsed: false },
    { sprite: Math.floor(Math.random() * 20) + 1, hp: 100, maxHp: 100, mana: 0, maxMana: 100, isAlive: true, ultimateUsed: false }
  ];
}

function startGame(player1, player2) {
  const gameRoom = {
    id: Date.now().toString(),
    players: [player1, player2],
    currentTurn: 0
  };
  
  activeGames.set(gameRoom.id, gameRoom);
  
  const socket1 = io.sockets.sockets.get(player1.id);
  const socket2 = io.sockets.sockets.get(player2.id);
  
  if (socket1) {
    socket1.join(gameRoom.id);
    socket1.emit('gameStarted', {
      gameRoom: gameRoom,
      yourIndex: 0
    });
  }
  
  if (socket2) {
    socket2.join(gameRoom.id);
    socket2.emit('gameStarted', {
      gameRoom: gameRoom,
      yourIndex: 1
    });
  }
  
  console.log('🎮 Game started:', gameRoom.id);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Render server running on port ${PORT}`);
});
