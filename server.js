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

// Serve static files
app.use(express.static('.'));

// Serve index.html from root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state variables
const waitingPlayers = [];
const activeGames = new Map();

// Enhanced Socket.io configuration
const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 120000,
  pingInterval: 45000,
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

// Element system
const ELEMENTS = {
  fire: { icon: '🔥', name: 'Fire', weakness: 'water', strength: 'ice' },
  water: { icon: '💧', name: 'Water', weakness: 'elektro', strength: 'fire' },
  ice: { icon: '❄️', name: 'Ice', weakness: 'fire', strength: 'grass' },
  grass: { icon: '🌿', name: 'Grass', weakness: 'ice', strength: 'ground' },
  ground: { icon: '🪨', name: 'Ground', weakness: 'grass', strength: 'elektro' },
  elektro: { icon: '⚡', name: 'Elektro', weakness: 'ground', strength: 'ghost' },
  ghost: { icon: '👻', name: 'Ghost', weakness: 'elektro', strength: 'air' },
  air: { icon: '💨', name: 'Air', weakness: 'ghost', strength: 'water' }
};

// Kryptomon element mapping
const KRYPTOMON_ELEMENTS = {
  1: 'fire', 2: 'air', 3: 'ghost', 4: 'grass', 5: 'air',
  6: 'elektro', 7: 'ice', 8: 'ground', 9: 'ground', 10: 'water',
  11: 'ghost', 12: 'water', 13: 'air', 14: 'ice', 15: 'fire',
  16: 'ice', 17: 'water', 18: 'fire', 19: 'grass', 20: 'air'
};

// Game balance
const GAME_BALANCE = {
  BASE_HP: 100,
  BASE_MANA: 100,
  ATTACK_DAMAGE: { min: 18, max: 25 },
  SKILL_DAMAGE: { min: 28, max: 38 },
  ULTIMATE_DAMAGE: { min: 40, max: 55 },
  DEFEND_HEAL: 15,
  ATTACK_MANA_GAIN: 2,
  SKILL_MANA_COST: 2,
  ULTIMATE_MANA_COST: 6,
  CRITICAL_CHANCE: 0.15,
  CRITICAL_MULTIPLIER: 1.5,
  ELEMENT_EFFECTIVENESS: 1.25
};

// Create random Kryptomon with element
function createRandomKryptomon(id) {
  const spriteNumber = Math.floor(Math.random() * 20) + 1;
  const element = KRYPTOMON_ELEMENTS[spriteNumber];
  
  return {
    id,
    name: `Kryptomon #${spriteNumber}`,
    sprite: `kryptomon${spriteNumber}.png`,
    element,
    hp: GAME_BALANCE.BASE_HP,
    maxHp: GAME_BALANCE.BASE_HP,
    isAlive: true
  };
}

// Generate team of 3 Kryptomons
function generateRandomTeam() {
  return [
    createRandomKryptomon(1),
    createRandomKryptomon(2),
    createRandomKryptomon(3)
  ];
}

// Calculate element effectiveness
function getElementMultiplier(attackerElement, defenderElement) {
  if (!attackerElement || !defenderElement) return 1;
  
  const attacker = ELEMENTS[attackerElement];
  const defender = ELEMENTS[defenderElement];
  
  if (!attacker || !defender) return 1;
  
  // Check if attacker is strong against defender
  if (attacker.strength === defenderElement) {
    return GAME_BALANCE.ELEMENT_EFFECTIVENESS; // 1.25x damage
  }
  
  // Check if attacker is weak against defender
  if (attacker.weakness === defenderElement) {
    return 1 / GAME_BALANCE.ELEMENT_EFFECTIVENESS; // 0.8x damage
  }
  
  return 1; // Normal damage
}

// Calculate damage with elements and critical
function calculateDamage(attackerKryptomon, defenderKryptomon, baseDamage, critChance = 0.15) {
  let damage = baseDamage;
  
  // Random variance
  const variance = Math.floor(Math.random() * (damage * 0.2)) - (damage * 0.1);
  damage += variance;
  
  // Element effectiveness
  const elementMultiplier = getElementMultiplier(attackerKryptomon.element, defenderKryptomon.element);
  damage = Math.floor(damage * elementMultiplier);
  
  // Critical hit
  const isCritical = Math.random() < critChance;
  if (isCritical) {
    damage = Math.floor(damage * GAME_BALANCE.CRITICAL_MULTIPLIER);
  }
  
  return {
    damage: Math.max(1, damage),
    isCritical,
    elementMultiplier,
    isSuper: elementMultiplier > 1,
    isWeak: elementMultiplier < 1
  };
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔗 New connection:', socket.id);

  // Join queue
  socket.on('joinQueue', (data) => {
    try {
      console.log('🎮 Join queue request:', socket.id, data);
      
      const playerData = {
        id: socket.id,
        name: data.playerName || 'Anonymous',
        telegramUserId: data.telegramUserId || null,
        profilePhoto: data.profilePhoto || null,
        team: generateRandomTeam(),
        activeKryptomon: 0,
        mana: 0 // Player-based mana
      };

      // Remove from waiting if already there
      const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
      if (waitingIndex !== -1) {
        waitingPlayers.splice(waitingIndex, 1);
      }

      waitingPlayers.push(playerData);
      
      // Send waiting status
      socket.emit('waiting', {
        playersOnline: waitingPlayers.length
      });
      
      console.log('👥 Players waiting:', waitingPlayers.length);

      if (waitingPlayers.length >= 2) {
        const player1 = waitingPlayers.shift();
        const player2 = waitingPlayers.shift();
        
        // Create game
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Randomly decide who goes first
        const firstPlayer = Math.random() < 0.5 ? 0 : 1;
        
        const game = {
          id: gameId,
          players: [player1, player2],
          currentTurn: firstPlayer,
          gameOver: false,
          winner: null,
          turnCount: 0,
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
          io.to(gameId).emit('gameStart', {
            ...game,
            yourIndex: 0 // Will be overridden by client
          });
          
          console.log('✅ Game started:', gameId, 'First player:', firstPlayer);
        }
      }
    } catch (error) {
      console.error('❌ Join queue error:', error);
      socket.emit('error', { message: 'Failed to join queue' });
    }
  });

  // Leave queue
  socket.on('leaveQueue', () => {
    const index = waitingPlayers.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      waitingPlayers.splice(index, 1);
      console.log('👋 Player left queue:', socket.id);
    }
  });

  // Make move
  socket.on('makeMove', (data) => {
    try {
      console.log('⚔️ Move received:', socket.id, data);
      
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
      
      if (!playerGame || playerGame.gameOver) {
        socket.emit('error', { message: 'Game not found or ended' });
        return;
      }
      
      if (playerGame.currentTurn !== playerIndex) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      const player = playerGame.players[playerIndex];
      const opponent = playerGame.players[1 - playerIndex];
      const playerKryptomon = player.team[player.activeKryptomon];
      const opponentKryptomon = opponent.team[opponent.activeKryptomon];
      
      // Check mana requirements
      if (data.action === 'skill' && player.mana < GAME_BALANCE.SKILL_MANA_COST) {
        socket.emit('error', { message: 'Not enough mana' });
        return;
      }
      
      if (data.action === 'ultimate' && player.mana < GAME_BALANCE.ULTIMATE_MANA_COST) {
        socket.emit('error', { message: 'Not enough mana' });
        return;
      }
      
      let moveResult = {
        attacker: playerIndex,
        move: data.action,
        damage: 0,
        heal: 0,
        critical: false,
        elementEffect: null
      };
      
      // Process move
      switch (data.action) {
        case 'attack':
          const attackResult = calculateDamage(
            playerKryptomon, 
            opponentKryptomon, 
            Math.floor(Math.random() * (GAME_BALANCE.ATTACK_DAMAGE.max - GAME_BALANCE.ATTACK_DAMAGE.min + 1)) + GAME_BALANCE.ATTACK_DAMAGE.min,
            GAME_BALANCE.CRITICAL_CHANCE
          );
          
          opponentKryptomon.hp = Math.max(0, opponentKryptomon.hp - attackResult.damage);
          player.mana = Math.min(GAME_BALANCE.BASE_MANA, player.mana + GAME_BALANCE.ATTACK_MANA_GAIN);
          
          moveResult.damage = attackResult.damage;
          moveResult.critical = attackResult.isCritical;
          moveResult.elementEffect = attackResult.isSuper ? 'super' : (attackResult.isWeak ? 'weak' : null);
          break;
          
        case 'defend':
          const healAmount = GAME_BALANCE.DEFEND_HEAL;
          playerKryptomon.hp = Math.min(playerKryptomon.maxHp, playerKryptomon.hp + healAmount);
          moveResult.heal = healAmount;
          break;
          
        case 'skill':
          const skillResult = calculateDamage(
            playerKryptomon, 
            opponentKryptomon, 
            Math.floor(Math.random() * (GAME_BALANCE.SKILL_DAMAGE.max - GAME_BALANCE.SKILL_DAMAGE.min + 1)) + GAME_BALANCE.SKILL_DAMAGE.min,
            GAME_BALANCE.CRITICAL_CHANCE + 0.05
          );
          
          opponentKryptomon.hp = Math.max(0, opponentKryptomon.hp - skillResult.damage);
          player.mana -= GAME_BALANCE.SKILL_MANA_COST;
          
          moveResult.damage = skillResult.damage;
          moveResult.critical = skillResult.isCritical;
          moveResult.elementEffect = skillResult.isSuper ? 'super' : (skillResult.isWeak ? 'weak' : null);
          break;
          
        case 'ultimate':
          const ultimateResult = calculateDamage(
            playerKryptomon, 
            opponentKryptomon, 
            Math.floor(Math.random() * (GAME_BALANCE.ULTIMATE_DAMAGE.max - GAME_BALANCE.ULTIMATE_DAMAGE.min + 1)) + GAME_BALANCE.ULTIMATE_DAMAGE.min,
            GAME_BALANCE.CRITICAL_CHANCE + 0.1
          );
          
          opponentKryptomon.hp = Math.max(0, opponentKryptomon.hp - ultimateResult.damage);
          player.mana -= GAME_BALANCE.ULTIMATE_MANA_COST;
          
          moveResult.damage = ultimateResult.damage;
          moveResult.critical = ultimateResult.isCritical;
          moveResult.elementEffect = ultimateResult.isSuper ? 'super' : (ultimateResult.isWeak ? 'weak' : null);
          break;
      }
      
      // Check if Kryptomon is defeated
      if (opponentKryptomon.hp <= 0) {
        opponentKryptomon.isAlive = false;
        
        // Find next alive Kryptomon
        let nextAlive = -1;
        for (let i = 0; i < opponent.team.length; i++) {
          if (opponent.team[i].hp > 0) {
            nextAlive = i;
            break;
          }
        }
        
        if (nextAlive !== -1) {
          opponent.activeKryptomon = nextAlive;
        } else {
          // Game over
          playerGame.gameOver = true;
          playerGame.winner = playerIndex;
          
          io.to(playerGame.id).emit('gameEnd', {
            winner: playerIndex,
            totalTurns: playerGame.turnCount
          });
          
          activeGames.delete(playerGame.id);
          return;
        }
      }
      
      // Switch turn
      playerGame.currentTurn = 1 - playerGame.currentTurn;
      playerGame.turnCount++;
      
      // Send game update
      io.to(playerGame.id).emit('gameUpdate', {
        ...playerGame,
        lastMove: moveResult
      });
      
    } catch (error) {
      console.error('❌ Make move error:', error);
      socket.emit('error', { message: 'Move failed' });
    }
  });

  // Switch Kryptomon
  socket.on('switchKryptomon', (data) => {
    try {
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
      
      if (!playerGame || playerGame.gameOver) {
        socket.emit('error', { message: 'Game not found or ended' });
        return;
      }
      
      const player = playerGame.players[playerIndex];
      const newKryptomon = player.team[data.index];
      
      if (!newKryptomon || newKryptomon.hp <= 0) {
        socket.emit('error', { message: 'Invalid Kryptomon' });
        return;
      }
      
      if (player.activeKryptomon === data.index) {
        socket.emit('error', { message: 'Kryptomon already active' });
        return;
      }
      
      // Switch Kryptomon
      player.activeKryptomon = data.index;
      
      // Send update
      io.to(playerGame.id).emit('gameUpdate', playerGame);
      
    } catch (error) {
      console.error('❌ Switch Kryptomon error:', error);
      socket.emit('error', { message: 'Switch failed' });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ Player disconnected:', socket.id);
    
    // Remove from waiting players
    const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    // Handle active game disconnect
    for (let [gameId, game] of activeGames) {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        // End game and notify opponent
        game.gameOver = true;
        game.winner = 1 - playerIndex; // Opponent wins
        
        io.to(gameId).emit('gameEnd', {
          winner: 1 - playerIndex,
          reason: 'opponent_disconnected'
        });
        
        activeGames.delete(gameId);
        break;
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

// Cleanup inactive games every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (let [gameId, game] of activeGames) {
    if (now - game.createdAt.getTime() > 30 * 60 * 1000) { // 30 minutes
      activeGames.delete(gameId);
      console.log('🧹 Cleaned up inactive game:', gameId);
    }
  }
}, 30 * 60 * 1000);
