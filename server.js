const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.static('.'));
app.use(express.json());

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Game balance configuration
const GAME_BALANCE = {
  BASE_HP: 120,
  BASE_MANA: 100,
  ATTACK_DAMAGE: { min: 25, max: 35 },
  SKILL_DAMAGE: { min: 35, max: 50 },
  ULTIMATE_DAMAGE: { min: 50, max: 70 },
  DEFEND_HEAL: 20,
  ATTACK_MANA_GAIN: 2, // Attack gives +2 MP
  SKILL_MANA_COST: 2,
  ULTIMATE_MANA_COST: 6,
  CRITICAL_CHANCE: 0.15,
  CRITICAL_MULTIPLIER: 1.5,
  TURN_TIME: 30
};

// Game state
const gameState = {
  waitingPlayers: [],
  activeGames: new Map(),
  playerSockets: new Map()
};

// Utility functions
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calculateDamage(baseDamage, isCritical = false) {
  const damage = randomBetween(baseDamage.min, baseDamage.max);
  return isCritical ? Math.floor(damage * GAME_BALANCE.CRITICAL_MULTIPLIER) : damage;
}

function isCriticalHit() {
  return Math.random() < GAME_BALANCE.CRITICAL_CHANCE;
}

function createKryptomon(spriteNumber) {
  return {
    name: `Kryptomon ${spriteNumber}`,
    sprite: spriteNumber,
    hp: GAME_BALANCE.BASE_HP,
    maxHp: GAME_BALANCE.BASE_HP
  };
}

function createPlayer(playerData) {
  const team = [];
  const usedSprites = new Set();
  
  // Generate 3 unique Kryptomon
  for (let i = 0; i < 3; i++) {
    let spriteNumber;
    do {
      spriteNumber = randomBetween(1, 20);
    } while (usedSprites.has(spriteNumber));
    
    usedSprites.add(spriteNumber);
    team.push(createKryptomon(spriteNumber));
  }
  
  return {
    ...playerData,
    team: team,
    activeKryptomon: 0,
    mana: 0, // Player-based mana
    hasSwitchedThisTurn: false
  };
}

function createGame(player1, player2) {
  return {
    id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    players: [
      createPlayer(player1),
      createPlayer(player2)
    ],
    currentTurn: 0,
    turnStartTime: Date.now(),
    turnTimeLeft: GAME_BALANCE.TURN_TIME,
    totalTurns: 0,
    gameStartTime: Date.now(),
    status: 'active'
  };
}

function getActiveKryptomon(player) {
  return player.team[player.activeKryptomon];
}

function isPlayerDefeated(player) {
  return player.team.every(kryptomon => kryptomon.hp <= 0);
}

function getNextAliveKryptomon(player) {
  return player.team.findIndex(kryptomon => kryptomon.hp > 0);
}

function processBattleMove(game, playerIndex, moveType) {
  const attacker = game.players[playerIndex];
  const defender = game.players[1 - playerIndex];
  const attackerKryptomon = getActiveKryptomon(attacker);
  const defenderKryptomon = getActiveKryptomon(defender);
  
  let damage = 0;
  let isCritical = false;
  let moveResult = null;
  
  console.log(`🎯 ${attacker.name} uses ${moveType}`);
  
  switch (moveType) {
    case 'attack':
      isCritical = isCriticalHit();
      damage = calculateDamage(GAME_BALANCE.ATTACK_DAMAGE, isCritical);
      defenderKryptomon.hp = Math.max(0, defenderKryptomon.hp - damage);
      attacker.mana = Math.min(GAME_BALANCE.BASE_MANA, attacker.mana + GAME_BALANCE.ATTACK_MANA_GAIN);
      
      moveResult = {
        type: 'attack',
        attacker: playerIndex,
        target: 1 - playerIndex,
        damage: damage,
        isCritical: isCritical,
        targetHp: defenderKryptomon.hp,
        manaGain: GAME_BALANCE.ATTACK_MANA_GAIN
      };
      break;
      
    case 'defend':
      damage = GAME_BALANCE.DEFEND_HEAL;
      attackerKryptomon.hp = Math.min(attackerKryptomon.maxHp, attackerKryptomon.hp + damage);
      
      moveResult = {
        type: 'defend',
        attacker: playerIndex,
        target: playerIndex,
        damage: damage,
        isCritical: false,
        targetHp: attackerKryptomon.hp,
        isHeal: true
      };
      break;
      
    case 'skill':
      if (attacker.mana >= GAME_BALANCE.SKILL_MANA_COST) {
        isCritical = isCriticalHit();
        damage = calculateDamage(GAME_BALANCE.SKILL_DAMAGE, isCritical);
        defenderKryptomon.hp = Math.max(0, defenderKryptomon.hp - damage);
        attacker.mana -= GAME_BALANCE.SKILL_MANA_COST;
        
        moveResult = {
          type: 'skill',
          attacker: playerIndex,
          target: 1 - playerIndex,
          damage: damage,
          isCritical: isCritical,
          targetHp: defenderKryptomon.hp,
          manaCost: GAME_BALANCE.SKILL_MANA_COST
        };
      }
      break;
      
    case 'ultimate':
      if (attacker.mana >= GAME_BALANCE.ULTIMATE_MANA_COST) {
        isCritical = isCriticalHit();
        damage = calculateDamage(GAME_BALANCE.ULTIMATE_DAMAGE, isCritical);
        defenderKryptomon.hp = Math.max(0, defenderKryptomon.hp - damage);
        attacker.mana -= GAME_BALANCE.ULTIMATE_MANA_COST;
        
        moveResult = {
          type: 'ultimate',
          attacker: playerIndex,
          target: 1 - playerIndex,
          damage: damage,
          isCritical: isCritical,
          targetHp: defenderKryptomon.hp,
          manaCost: GAME_BALANCE.ULTIMATE_MANA_COST
        };
      }
      break;
  }
  
  // Check if defender's Kryptomon is defeated
  if (defenderKryptomon.hp <= 0) {
    console.log(`💀 ${defenderKryptomon.name} is defeated!`);
    
    // Find next alive Kryptomon
    const nextAliveIndex = getNextAliveKryptomon(defender);
    if (nextAliveIndex !== -1) {
      defender.activeKryptomon = nextAliveIndex;
      console.log(`🔄 ${defender.name} switches to ${defender.team[nextAliveIndex].name}`);
    }
  }
  
  return moveResult;
}

function switchKryptomon(game, playerIndex, newActiveIndex) {
  const player = game.players[playerIndex];
  
  // Validation checks
  if (newActiveIndex === player.activeKryptomon) {
    return { success: false, error: 'Already active Kryptomon' };
  }
  
  if (player.team[newActiveIndex].hp <= 0) {
    return { success: false, error: 'Kryptomon is defeated' };
  }
  
  if (player.hasSwitchedThisTurn) {
    return { success: false, error: 'Already switched this turn' };
  }
  
  // Perform switch
  player.activeKryptomon = newActiveIndex;
  player.hasSwitchedThisTurn = true;
  
  console.log(`🔄 ${player.name} switches to ${player.team[newActiveIndex].name}`);
  
  return { 
    success: true, 
    message: `Switched to ${player.team[newActiveIndex].name}` 
  };
}

function nextTurn(game) {
  // Reset turn-based flags
  game.players.forEach(player => {
    player.hasSwitchedThisTurn = false;
  });
  
  game.currentTurn = 1 - game.currentTurn;
  game.turnStartTime = Date.now();
  game.turnTimeLeft = GAME_BALANCE.TURN_TIME;
  game.totalTurns++;
  
  console.log(`⏭️ Turn ${game.totalTurns}: ${game.players[game.currentTurn].name}'s turn`);
}

function checkGameEnd(game) {
  const player1Defeated = isPlayerDefeated(game.players[0]);
  const player2Defeated = isPlayerDefeated(game.players[1]);
  
  if (player1Defeated || player2Defeated) {
    game.status = 'ended';
    game.winner = player1Defeated ? 1 : 0;
    game.endTime = Date.now();
    
    console.log(`🏆 Game ended! Winner: ${game.players[game.winner].name}`);
    return true;
  }
  
  return false;
}

function broadcastGameUpdate(game) {
  const gameUpdate = {
    players: game.players.map(player => ({
      name: player.name,
      avatar: player.avatar,
      team: player.team.map(kryptomon => ({
        name: kryptomon.name,
        sprite: kryptomon.sprite,
        hp: kryptomon.hp,
        maxHp: kryptomon.maxHp
      })),
      activeKryptomon: player.activeKryptomon,
      mana: player.mana
    })),
    currentTurn: game.currentTurn,
    turnTimeLeft: game.turnTimeLeft,
    totalTurns: game.totalTurns,
    lastMove: game.lastMove
  };
  
  game.players.forEach((player, index) => {
    const socket = gameState.playerSockets.get(player.socketId);
    if (socket) {
      socket.emit('gameUpdate', {
        ...gameUpdate,
        yourIndex: index
      });
    }
  });
  
  // Clear last move after broadcasting
  delete game.lastMove;
}

// Socket event handlers
io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);
  
  socket.emit('waiting', { 
    playersCount: gameState.waitingPlayers.length 
  });

  socket.on('joinQueue', (playerData) => {
    console.log(`🎮 ${playerData.playerName} joined queue`);
    
    const player = {
      socketId: socket.id,
      name: playerData.playerName,
      telegramUserId: playerData.telegramUserId,
      avatar: playerData.avatar,
      joinTime: Date.now()
    };
    
    gameState.playerSockets.set(socket.id, socket);
    gameState.waitingPlayers.push(player);
    
    // Broadcast updated player count
    io.emit('waiting', { 
      playersCount: gameState.waitingPlayers.length 
    });
    
    // Try to match players
    if (gameState.waitingPlayers.length >= 2) {
      const player1 = gameState.waitingPlayers.shift();
      const player2 = gameState.waitingPlayers.shift();
      
      const game = createGame(player1, player2);
      gameState.activeGames.set(game.id, game);
      
      console.log(`🎯 Starting game: ${player1.name} vs ${player2.name}`);
      
      // Notify players
      game.players.forEach((player, index) => {
        const playerSocket = gameState.playerSockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('gameStart', {
            players: game.players.map(p => ({
              name: p.name,
              avatar: p.avatar,
              team: p.team.map(k => ({
                name: k.name,
                sprite: k.sprite,
                hp: k.hp,
                maxHp: k.maxHp
              })),
              activeKryptomon: p.activeKryptomon,
              mana: p.mana
            })),
            yourIndex: index,
            currentTurn: game.currentTurn,
            turnTimeLeft: game.turnTimeLeft
          });
        }
      });
      
      // Broadcast updated waiting count
      io.emit('waiting', { 
        playersCount: gameState.waitingPlayers.length 
      });
    }
  });

  socket.on('leaveQueue', () => {
    gameState.waitingPlayers = gameState.waitingPlayers.filter(p => p.socketId !== socket.id);
    console.log(`🚪 Player left queue: ${socket.id}`);
    
    io.emit('waiting', { 
      playersCount: gameState.waitingPlayers.length 
    });
  });

  socket.on('battleMove', (data) => {
    const { type, playerIndex } = data;
    
    // Find the game this player is in
    let currentGame = null;
    for (const game of gameState.activeGames.values()) {
      if (game.players.some(p => p.socketId === socket.id)) {
        currentGame = game;
        break;
      }
    }
    
    if (!currentGame || currentGame.status !== 'active') {
      socket.emit('error', { message: 'Game not found or not active' });
      return;
    }
    
    if (currentGame.currentTurn !== playerIndex) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    
    // Process the move
    const moveResult = processBattleMove(currentGame, playerIndex, type);
    if (moveResult) {
      currentGame.lastMove = moveResult;
      
      // Check if game ended
      if (checkGameEnd(currentGame)) {
        // Broadcast final game state
        broadcastGameUpdate(currentGame);
        
        // Send game end event
        currentGame.players.forEach((player, index) => {
          const playerSocket = gameState.playerSockets.get(player.socketId);
          if (playerSocket) {
            playerSocket.emit('gameEnd', {
              winner: currentGame.winner,
              totalTurns: currentGame.totalTurns,
              duration: currentGame.endTime - currentGame.gameStartTime
            });
          }
        });
        
        // Clean up
        gameState.activeGames.delete(currentGame.id);
        currentGame.players.forEach(player => {
          gameState.playerSockets.delete(player.socketId);
        });
      } else {
        // Continue game
        nextTurn(currentGame);
        broadcastGameUpdate(currentGame);
      }
    } else {
      socket.emit('error', { message: 'Invalid move' });
    }
  });

  socket.on('switchKryptomon', (data) => {
    const { newActiveIndex, playerIndex } = data;
    
    // Find the game this player is in
    let currentGame = null;
    for (const game of gameState.activeGames.values()) {
      if (game.players.some(p => p.socketId === socket.id)) {
        currentGame = game;
        break;
      }
    }
    
    if (!currentGame || currentGame.status !== 'active') {
      socket.emit('error', { message: 'Game not found or not active' });
      return;
    }
    
    if (currentGame.currentTurn !== playerIndex) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    
    // Perform switch
    const switchResult = switchKryptomon(currentGame, playerIndex, newActiveIndex);
    
    if (switchResult.success) {
      // Broadcast updated game state (but don't end turn)
      broadcastGameUpdate(currentGame);
    } else {
      socket.emit('error', { message: switchResult.error });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Player disconnected: ${socket.id}`);
    
    // Remove from waiting queue
    gameState.waitingPlayers = gameState.waitingPlayers.filter(p => p.socketId !== socket.id);
    
    // Handle active games
    for (const [gameId, game] of gameState.activeGames.entries()) {
      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        console.log(`🎮 Player disconnected from active game: ${game.players[playerIndex].name}`);
        
        // Notify opponent
        const opponentIndex = 1 - playerIndex;
        const opponentSocket = gameState.playerSockets.get(game.players[opponentIndex].socketId);
        if (opponentSocket) {
          opponentSocket.emit('gameEnd', {
            winner: opponentIndex,
            reason: 'opponent_disconnected',
            totalTurns: game.totalTurns
          });
        }
        
        // Clean up game
        gameState.activeGames.delete(gameId);
        break;
      }
    }
    
    gameState.playerSockets.delete(socket.id);
    
    // Broadcast updated waiting count
    io.emit('waiting', { 
      playersCount: gameState.waitingPlayers.length 
    });
  });
});

// Turn timer management
setInterval(() => {
  for (const game of gameState.activeGames.values()) {
    if (game.status === 'active') {
      const timeElapsed = Math.floor((Date.now() - game.turnStartTime) / 1000);
      game.turnTimeLeft = Math.max(0, GAME_BALANCE.TURN_TIME - timeElapsed);
      
      if (game.turnTimeLeft <= 0) {
        console.log(`⏰ Turn timeout for ${game.players[game.currentTurn].name}`);
        
        // Auto-skip turn
        nextTurn(game);
        broadcastGameUpdate(game);
      }
    }
  }
}, 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeGames: gameState.activeGames.size,
    waitingPlayers: gameState.waitingPlayers.length,
    connectedPlayers: gameState.playerSockets.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kryptomon Battle Arena server running on port ${PORT}`);
});
