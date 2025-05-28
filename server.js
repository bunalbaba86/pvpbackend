const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
app.use(cors({
  origin: ['https://replit.com', 'https://*.replit.dev', 'https://*.replit.app', '*'],
  methods: ['GET', 'POST'],
  credentials: true
}));

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Game balance configuration
const GAME_BALANCE = {
  BASE_HP: 120,
  BASE_MANA: 100,
  ATTACK_DAMAGE: { min: 25, max: 35 },
  SKILL_DAMAGE: { min: 35, max: 50 },
  ULTIMATE_DAMAGE: { min: 50, max: 70 },
  DEFEND_HEAL: 20,
  ATTACK_MANA_GAIN: 2, // Fixed: +2 MP for attack
  SKILL_MANA_COST: 2,
  ULTIMATE_MANA_COST: 6,
  CRITICAL_CHANCE: 0.15,
  CRITICAL_MULTIPLIER: 1.5
};

// Game state management
const gameState = {
  waitingPlayers: [],
  activeGames: new Map(),
  connectedPlayers: new Set()
};

// Utility functions
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createKryptomon() {
  const spriteNum = getRandomInt(1, 20);
  return {
    name: `Kryptomon #${spriteNum}`,
    sprite: `kryptomon${spriteNum}.png`,
    hp: GAME_BALANCE.BASE_HP,
    maxHp: GAME_BALANCE.BASE_HP,
    stats: {
      attack: getRandomInt(15, 25),
      defense: getRandomInt(10, 20),
      speed: getRandomInt(12, 22)
    }
  };
}

function createPlayer(playerData) {
  return {
    id: playerData.id,
    name: playerData.name,
    telegramUserId: playerData.telegramUserId,
    profilePhoto: playerData.profilePhoto,
    team: [createKryptomon(), createKryptomon(), createKryptomon()],
    activeKryptomon: 0,
    mana: 0 // Player-based mana system
  };
}

function calculateDamage(attacker, defender, moveType) {
  let baseDamage;
  
  switch (moveType) {
    case 'attack':
      baseDamage = getRandomInt(GAME_BALANCE.ATTACK_DAMAGE.min, GAME_BALANCE.ATTACK_DAMAGE.max);
      break;
    case 'skill':
      baseDamage = getRandomInt(GAME_BALANCE.SKILL_DAMAGE.min, GAME_BALANCE.SKILL_DAMAGE.max);
      break;
    case 'ultimate':
      baseDamage = getRandomInt(GAME_BALANCE.ULTIMATE_DAMAGE.min, GAME_BALANCE.ULTIMATE_DAMAGE.max);
      break;
    default:
      baseDamage = 0;
  }
  
  // Apply attack and defense stats
  const attackBonus = Math.floor(attacker.stats.attack * 0.5);
  const defenseReduction = Math.floor(defender.stats.defense * 0.3);
  
  let finalDamage = Math.max(1, baseDamage + attackBonus - defenseReduction);
  
  // Critical hit calculation
  const isCritical = Math.random() < GAME_BALANCE.CRITICAL_CHANCE;
  if (isCritical) {
    finalDamage = Math.floor(finalDamage * GAME_BALANCE.CRITICAL_MULTIPLIER);
  }
  
  return { damage: finalDamage, critical: isCritical };
}

function processMove(game, playerIndex, move) {
  const player = game.players[playerIndex];
  const opponent = game.players[1 - playerIndex];
  const activeKryptomon = player.team[player.activeKryptomon];
  const enemyKryptomon = opponent.team[opponent.activeKryptomon];
  
  let moveResult = {
    attacker: playerIndex,
    move: move,
    damage: 0,
    heal: 0,
    critical: false
  };
  
  switch (move) {
    case 'attack':
      const attackResult = calculateDamage(activeKryptomon, enemyKryptomon, 'attack');
      enemyKryptomon.hp = Math.max(0, enemyKryptomon.hp - attackResult.damage);
      player.mana = Math.min(GAME_BALANCE.BASE_MANA, player.mana + GAME_BALANCE.ATTACK_MANA_GAIN);
      
      moveResult.damage = attackResult.damage;
      moveResult.critical = attackResult.critical;
      break;
      
    case 'defend':
      const healAmount = GAME_BALANCE.DEFEND_HEAL;
      activeKryptomon.hp = Math.min(activeKryptomon.maxHp, activeKryptomon.hp + healAmount);
      moveResult.heal = healAmount;
      break;
      
    case 'skill':
      if (player.mana >= GAME_BALANCE.SKILL_MANA_COST) {
        const skillResult = calculateDamage(activeKryptomon, enemyKryptomon, 'skill');
        enemyKryptomon.hp = Math.max(0, enemyKryptomon.hp - skillResult.damage);
        player.mana -= GAME_BALANCE.SKILL_MANA_COST;
        
        moveResult.damage = skillResult.damage;
        moveResult.critical = skillResult.critical;
      }
      break;
      
    case 'ultimate':
      if (player.mana >= GAME_BALANCE.ULTIMATE_MANA_COST) {
        const ultimateResult = calculateDamage(activeKryptomon, enemyKryptomon, 'ultimate');
        enemyKryptomon.hp = Math.max(0, enemyKryptomon.hp - ultimateResult.damage);
        player.mana -= GAME_BALANCE.ULTIMATE_MANA_COST;
        
        moveResult.damage = ultimateResult.damage;
        moveResult.critical = ultimateResult.critical;
      }
      break;
  }
  
  return moveResult;
}

function checkGameEnd(game) {
  for (let i = 0; i < 2; i++) {
    const player = game.players[i];
    const aliveKryptomon = player.team.filter(k => k.hp > 0);
    
    if (aliveKryptomon.length === 0) {
      return { ended: true, winner: 1 - i };
    }
  }
  
  return { ended: false, winner: null };
}

function switchToNextAliveKryptomon(player) {
  for (let i = 0; i < player.team.length; i++) {
    if (player.team[i].hp > 0) {
      player.activeKryptomon = i;
      return true;
    }
  }
  return false;
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log(`🔗 Player connected: ${socket.id}`);
  gameState.connectedPlayers.add(socket.id);
  
  // Emit current player count
  io.emit('waiting', { playersOnline: gameState.connectedPlayers.size });
  
  socket.on('joinQueue', (playerData) => {
    console.log(`📝 Player ${socket.id} joined queue:`, playerData);
    
    // Remove from any existing game
    gameState.waitingPlayers = gameState.waitingPlayers.filter(p => p.id !== socket.id);
    
    // Add to waiting queue
    gameState.waitingPlayers.push({
      id: socket.id,
      name: playerData.playerName || 'Anonymous',
      telegramUserId: playerData.telegramUserId,
      profilePhoto: playerData.profilePhoto
    });
    
    socket.emit('waiting', { 
      playersOnline: gameState.connectedPlayers.size,
      queuePosition: gameState.waitingPlayers.length
    });
    
    // Try to match players
    if (gameState.waitingPlayers.length >= 2) {
      const player1Data = gameState.waitingPlayers.shift();
      const player2Data = gameState.waitingPlayers.shift();
      
      const player1Socket = io.sockets.sockets.get(player1Data.id);
      const player2Socket = io.sockets.sockets.get(player2Data.id);
      
      if (player1Socket && player2Socket) {
        startGame(player1Data, player2Data, player1Socket, player2Socket);
      }
    }
  });
  
  socket.on('leaveQueue', () => {
    console.log(`❌ Player ${socket.id} left queue`);
    gameState.waitingPlayers = gameState.waitingPlayers.filter(p => p.id !== socket.id);
  });
  
  socket.on('battleMove', (moveData) => {
    console.log(`⚔️ Battle move from ${socket.id}:`, moveData);
    
    const game = gameState.activeGames.get(socket.id);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || game.currentTurn !== playerIndex) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    
    // Process the move
    const moveResult = processMove(game, playerIndex, moveData.move);
    game.lastMove = moveResult;
    game.turnCount++;
    
    // Check if enemy Kryptomon is defeated and switch to next alive one
    const opponent = game.players[1 - playerIndex];
    const enemyKryptomon = opponent.team[opponent.activeKryptomon];
    
    if (enemyKryptomon.hp <= 0) {
      switchToNextAliveKryptomon(opponent);
    }
    
    // Check for game end
    const gameEndResult = checkGameEnd(game);
    if (gameEndResult.ended) {
      const player1Socket = io.sockets.sockets.get(game.players[0].id);
      const player2Socket = io.sockets.sockets.get(game.players[1].id);
      
      const endData = {
        winner: gameEndResult.winner,
        totalTurns: game.turnCount,
        players: game.players
      };
      
      player1Socket?.emit('gameEnd', { ...endData, yourIndex: 0 });
      player2Socket?.emit('gameEnd', { ...endData, yourIndex: 1 });
      
      // Clean up game
      gameState.activeGames.delete(game.players[0].id);
      gameState.activeGames.delete(game.players[1].id);
      
      return;
    }
    
    // Switch turn
    game.currentTurn = 1 - game.currentTurn;
    
    // Send update to both players
    const player1Socket = io.sockets.sockets.get(game.players[0].id);
    const player2Socket = io.sockets.sockets.get(game.players[1].id);
    
    player1Socket?.emit('gameUpdate', { ...game, yourIndex: 0 });
    player2Socket?.emit('gameUpdate', { ...game, yourIndex: 1 });
  });
  
  socket.on('switchKryptomon', (switchData) => {
    console.log(`🔄 Switch Kryptomon from ${socket.id}:`, switchData);
    
    const game = gameState.activeGames.get(socket.id);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }
    
    const player = game.players[playerIndex];
    const targetKryptomon = player.team[switchData.index];
    
    // Validate switch
    if (!targetKryptomon || targetKryptomon.hp <= 0) {
      socket.emit('error', { message: 'Cannot switch to defeated Kryptomon' });
      return;
    }
    
    if (switchData.index === player.activeKryptomon) {
      socket.emit('error', { message: 'Already active Kryptomon' });
      return;
    }
    
    // Perform switch
    player.activeKryptomon = switchData.index;
    
    // Send update to both players (switching doesn't end turn)
    const player1Socket = io.sockets.sockets.get(game.players[0].id);
    const player2Socket = io.sockets.sockets.get(game.players[1].id);
    
    player1Socket?.emit('gameUpdate', { ...game, yourIndex: 0 });
    player2Socket?.emit('gameUpdate', { ...game, yourIndex: 1 });
  });
  
  socket.on('disconnect', () => {
    console.log(`❌ Player disconnected: ${socket.id}`);
    
    gameState.connectedPlayers.delete(socket.id);
    gameState.waitingPlayers = gameState.waitingPlayers.filter(p => p.id !== socket.id);
    
    // Handle active game disconnection
    const game = gameState.activeGames.get(socket.id);
    if (game) {
      const otherPlayerId = game.players.find(p => p.id !== socket.id)?.id;
      if (otherPlayerId) {
        const otherSocket = io.sockets.sockets.get(otherPlayerId);
        otherSocket?.emit('gameEnd', { 
          winner: game.players.findIndex(p => p.id === otherPlayerId), 
          reason: 'opponent_disconnected',
          totalTurns: game.turnCount 
        });
        
        gameState.activeGames.delete(otherPlayerId);
      }
      gameState.activeGames.delete(socket.id);
    }
    
    // Emit updated player count
    io.emit('waiting', { playersOnline: gameState.connectedPlayers.size });
  });
});

function startGame(player1Data, player2Data, player1Socket, player2Socket) {
  console.log(`🎮 Starting game between ${player1Data.name} and ${player2Data.name}`);
  
  const player1 = createPlayer(player1Data);
  const player2 = createPlayer(player2Data);
  
  const game = {
    players: [player1, player2],
    currentTurn: Math.floor(Math.random() * 2), // Random starting player
    turnCount: 0,
    lastMove: null
  };
  
  // Store game for both players
  gameState.activeGames.set(player1.id, game);
  gameState.activeGames.set(player2.id, game);
  
  // Send game start to both players
  player1Socket.emit('gameStart', { ...game, yourIndex: 0 });
  player2Socket.emit('gameStart', { ...game, yourIndex: 1 });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connectedPlayers: gameState.connectedPlayers.size,
    waitingPlayers: gameState.waitingPlayers.length,
    activeGames: gameState.activeGames.size,
    timestamp: new Date().toISOString()
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kryptomon Battle Arena server running on port ${PORT}`);
  console.log(`📊 Game Balance Configuration:`, GAME_BALANCE);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
