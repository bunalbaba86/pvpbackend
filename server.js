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

// ✅ ENHANCED ELEMENT SYSTEM WITH SPECIAL ABILITIES
const ELEMENTS = {
  fire: { 
    icon: '🔥', 
    name: 'Fire', 
    weakness: 'water', 
    strength: 'ice',
    special: {
      name: 'Hydra',
      icon: 'hydra.png',
      cost: 4,
      cooldown: 0,
      effect: 'hydra_dot',
      description: 'Deals extra damage for 4 turns'
    }
  },
  water: { 
    icon: '💧', 
    name: 'Water', 
    weakness: 'elektro', 
    strength: 'fire',
    special: {
      name: 'Water Blessing',
      icon: 'waterblessing.png',
      cost: 4,
      cooldown: 8,
      effect: 'mana_reduction',
      description: 'Reduces spell costs by 2 for 4 turns'
    }
  },
  ice: { 
    icon: '❄️', 
    name: 'Ice', 
    weakness: 'fire', 
    strength: 'grass',
    special: {
      name: 'Frozen Armor',
      icon: 'frozen.png',
      cost: 2,
      cooldown: 6,
      effect: 'defense_boost',
      description: 'Increases defense by 250% for 4 turns'
    }
  },
  grass: { 
    icon: '🌿', 
    name: 'Grass', 
    weakness: 'ice', 
    strength: 'ground',
    special: {
      name: 'Blessing of Nature',
      icon: 'blessing.png',
      cost: 4,
      cooldown: 6,
      effect: 'healing',
      description: 'Restores health over time'
    }
  },
  ground: { 
    icon: '🪨', 
    name: 'Ground', 
    weakness: 'grass', 
    strength: 'elektro',
    special: {
      name: 'Sandstorm',
      icon: 'sandstorm.png',
      cost: 2,
      cooldown: 8,
      effect: 'attack_boost',
      description: 'Increases attack damage by 150% for 4 turns'
    }
  },
  elektro: { 
    icon: '⚡', 
    name: 'Elektro', 
    weakness: 'ground', 
    strength: 'ghost',
    special: {
      name: 'Static Electricity',
      icon: 'static.png',
      cost: 4,
      cooldown: 8,
      effect: 'spell_boost',
      description: 'Doubles skill and ultimate damage for 4 turns'
    }
  },
  ghost: { 
    icon: '👻', 
    name: 'Ghost', 
    weakness: 'elektro', 
    strength: 'air',
    special: {
      name: 'Panic Attack',
      icon: 'panicattack.png',
      cost: 4,
      cooldown: 4,
      effect: 'mana_steal',
      description: 'Steals enemy mana and adds to own'
    }
  },
  air: { 
    icon: '💨', 
    name: 'Air', 
    weakness: 'ghost', 
    strength: 'water',
    special: {
      name: 'Wall of Wind',
      icon: 'wallofwind.png',
      cost: 4,
      cooldown: 8,
      effect: 'switch_block',
      description: 'Prevents enemy from switching for 4 turns'
    }
  }
};

// ✅ UPDATED KRYPTOMON WITH TYPES
const KRYPTOMON_DATA = {
  1: { element: 'fire', type: 'attacker' },
  2: { element: 'air', type: 'balanced' },
  3: { element: 'ghost', type: 'tank' },
  4: { element: 'grass', type: 'tank' },
  5: { element: 'air', type: 'attacker' },
  6: { element: 'elektro', type: 'balanced' },
  7: { element: 'ice', type: 'tank' },
  8: { element: 'ground', type: 'attacker' },
  9: { element: 'ground', type: 'tank' },
  10: { element: 'water', type: 'balanced' },
  11: { element: 'ghost', type: 'attacker' },
  12: { element: 'water', type: 'tank' },
  13: { element: 'air', type: 'balanced' },
  14: { element: 'ice', type: 'attacker' },
  15: { element: 'fire', type: 'balanced' },
  16: { element: 'ice', type: 'tank' },
  17: { element: 'water', type: 'attacker' },
  18: { element: 'fire', type: 'tank' },
  19: { element: 'grass', type: 'balanced' },
  20: { element: 'air', type: 'attacker' }
};

// ✅ HP RANGES BY TYPE
const KRYPTOMON_TYPES = {
  tank: { hp: [120, 150], attack: [0.8, 1.0], defense: [1.2, 1.5] },
  balanced: { hp: [90, 120], attack: [1.0, 1.2], defense: [1.0, 1.2] },
  attacker: { hp: [70, 100], attack: [1.3, 1.6], defense: [0.8, 1.0] }
};

// ✅ ENHANCED GAME BALANCE
const GAME_BALANCE = {
  BASE_MANA: 100,
  ATTACK_DAMAGE: { min: 18, max: 25 },
  SKILL_DAMAGE: { min: 35, max: 45 }, // ✅ Increased
  ULTIMATE_DAMAGE: { min: 55, max: 75 }, // ✅ Increased
  DEFEND_HEAL: 15,
  ATTACK_MANA_GAIN: 2,
  SKILL_MANA_COST: 2,
  ULTIMATE_MANA_COST: 6,
  CRITICAL_CHANCE: 0.15,
  CRITICAL_MULTIPLIER: 1.5,
  ELEMENT_EFFECTIVENESS: 1.25,
  // ✅ Special ability values
  HYDRA_DOT_DAMAGE: 8,
  NATURE_HEALING: 25,
  MANA_STEAL_AMOUNT: 15,
  ATTACK_BOOST_MULTIPLIER: 1.5,
  DEFENSE_BOOST_MULTIPLIER: 2.5,
  SPELL_BOOST_MULTIPLIER: 2.0
};

// ✅ STATUS EFFECTS SYSTEM
const STATUS_EFFECTS = {
  hydra_dot: { name: 'Hydra', icon: '🔥', type: 'negative', duration: 4 },
  mana_reduction: { name: 'Water Blessing', icon: '💧', type: 'positive', duration: 4 },
  defense_boost: { name: 'Frozen Armor', icon: '❄️', type: 'positive', duration: 4 },
  healing: { name: 'Nature Blessing', icon: '🌿', type: 'positive', duration: 4 },
  attack_boost: { name: 'Sandstorm', icon: '🪨', type: 'positive', duration: 4 },
  spell_boost: { name: 'Static', icon: '⚡', type: 'positive', duration: 4 },
  switch_block: { name: 'Wind Wall', icon: '💨', type: 'negative', duration: 4 }
};

// ✅ GENERATE RANDOM KRYPTOMON WITH HP BY TYPE
function createRandomKryptomon(id) {
  const spriteNumber = Math.floor(Math.random() * 20) + 1;
  const data = KRYPTOMON_DATA[spriteNumber];
  const typeData = KRYPTOMON_TYPES[data.type];
  
  // Random HP based on type
  const hp = Math.floor(Math.random() * (typeData.hp[1] - typeData.hp[0] + 1)) + typeData.hp[0];
  
  return {
    id,
    name: `Kryptomon #${spriteNumber}`,
    sprite: `kryptomon${spriteNumber}.png`,
    element: data.element,
    type: data.type,
    hp: hp,
    maxHp: hp,
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

// ✅ ENHANCED DAMAGE CALCULATION WITH STATUS EFFECTS
function calculateDamage(attackerKryptomon, defenderKryptomon, baseDamage, critChance = 0.15, playerStatusEffects = [], defenderStatusEffects = []) {
  let damage = baseDamage;
  
  // Apply attack boost from status effects
  const hasAttackBoost = playerStatusEffects.some(effect => effect.type === 'attack_boost');
  if (hasAttackBoost) {
    damage = Math.floor(damage * GAME_BALANCE.ATTACK_BOOST_MULTIPLIER);
  }
  
  // Apply spell boost for skills/ultimates
  const hasSpellBoost = playerStatusEffects.some(effect => effect.type === 'spell_boost');
  if (hasSpellBoost && (baseDamage >= GAME_BALANCE.SKILL_DAMAGE.min)) {
    damage = Math.floor(damage * GAME_BALANCE.SPELL_BOOST_MULTIPLIER);
  }
  
  // Random variance
  const variance = Math.floor(Math.random() * (damage * 0.2)) - (damage * 0.1);
  damage += variance;
  
  // Element effectiveness
  const elementMultiplier = getElementMultiplier(attackerKryptomon.element, defenderKryptomon.element);
  damage = Math.floor(damage * elementMultiplier);
  
  // Apply defense boost from status effects
  const hasDefenseBoost = defenderStatusEffects.some(effect => effect.type === 'defense_boost');
  if (hasDefenseBoost) {
    damage = Math.floor(damage / GAME_BALANCE.DEFENSE_BOOST_MULTIPLIER);
  }
  
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

// ✅ STATUS EFFECT MANAGEMENT
function addStatusEffect(effects, effectType, duration = null) {
  const effectData = STATUS_EFFECTS[effectType];
  if (!effectData) return;
  
  // Remove existing effect of same type
  removeStatusEffect(effects, effectType);
  
  // Add new effect
  effects.push({
    type: effectType,
    name: effectData.name,
    icon: effectData.icon,
    effectType: effectData.type,
    duration: duration || effectData.duration,
    maxDuration: duration || effectData.duration
  });
}

function removeStatusEffect(effects, effectType) {
  const index = effects.findIndex(effect => effect.type === effectType);
  if (index !== -1) {
    effects.splice(index, 1);
  }
}

function updateStatusEffects(effects) {
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].duration--;
    if (effects[i].duration <= 0) {
      effects.splice(i, 1);
    }
  }
}

// ✅ PROCESS STATUS EFFECT ACTIONS
function processStatusEffects(player, opponent) {
  const playerKryptomon = player.team[player.activeKryptomon];
  const opponentKryptomon = opponent.team[opponent.activeKryptomon];
  
  let results = [];
  
  // Process player status effects
  for (let effect of player.statusEffects || []) {
    switch(effect.type) {
      case 'healing':
        const healAmount = GAME_BALANCE.NATURE_HEALING;
        playerKryptomon.hp = Math.min(playerKryptomon.maxHp, playerKryptomon.hp + healAmount);
        results.push({
          type: 'heal',
          target: 'player',
          amount: healAmount,
          effect: effect.name
        });
        break;
    }
  }
  
  // Process opponent status effects
  for (let effect of opponent.statusEffects || []) {
    switch(effect.type) {
      case 'hydra_dot':
        const dotDamage = GAME_BALANCE.HYDRA_DOT_DAMAGE;
        opponentKryptomon.hp = Math.max(0, opponentKryptomon.hp - dotDamage);
        results.push({
          type: 'damage',
          target: 'opponent',
          amount: dotDamage,
          effect: effect.name
        });
        break;
        
      case 'healing':
        const healAmount = GAME_BALANCE.NATURE_HEALING;
        opponentKryptomon.hp = Math.min(opponentKryptomon.maxHp, opponentKryptomon.hp + healAmount);
        results.push({
          type: 'heal',
          target: 'opponent',
          amount: healAmount,
          effect: effect.name
        });
        break;
    }
  }
  
  return results;
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
        mana: 0, // Player-based mana
        statusEffects: [], // ✅ Status effects
        cooldowns: {} // ✅ Special ability cooldowns
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

  // ✅ ENHANCED MAKE MOVE WITH SPECIAL ABILITIES
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
      
      // Initialize status effects if not exists
      if (!player.statusEffects) player.statusEffects = [];
      if (!opponent.statusEffects) opponent.statusEffects = [];
      if (!player.cooldowns) player.cooldowns = {};
      if (!opponent.cooldowns) opponent.cooldowns = {};
      
      // Check mana requirements (with mana reduction bonus)
      const hasManaReduction = player.statusEffects.some(effect => effect.type === 'mana_reduction');
      const manaReduction = hasManaReduction ? 2 : 0;
      
      if (data.action === 'skill' && player.mana < Math.max(0, GAME_BALANCE.SKILL_MANA_COST - manaReduction)) {
        socket.emit('error', { message: 'Not enough mana' });
        return;
      }
      
      if (data.action === 'ultimate' && player.mana < Math.max(0, GAME_BALANCE.ULTIMATE_MANA_COST - manaReduction)) {
        socket.emit('error', { message: 'Not enough mana' });
        return;
      }
      
      // ✅ Check special ability requirements
      if (data.action === 'special') {
        const currentElement = playerKryptomon.element;
        const special = ELEMENTS[currentElement].special;
        const cost = Math.max(0, special.cost - manaReduction);
        
        if (player.mana < cost) {
          socket.emit('error', { message: 'Not enough mana for special' });
          return;
        }
        
        if (player.cooldowns[currentElement] > 0) {
          socket.emit('error', { message: 'Special ability on cooldown' });
          return;
        }
      }
      
      let moveResult = {
        attacker: playerIndex,
        move: data.action,
        damage: 0,
        heal: 0,
        critical: false,
        elementEffect: null,
        specialEffect: null
      };
      
      // Process move
      switch (data.action) {
        case 'attack':
          const attackResult = calculateDamage(
            playerKryptomon, 
            opponentKryptomon, 
            Math.floor(Math.random() * (GAME_BALANCE.ATTACK_DAMAGE.max - GAME_BALANCE.ATTACK_DAMAGE.min + 1)) + GAME_BALANCE.ATTACK_DAMAGE.min,
            GAME_BALANCE.CRITICAL_CHANCE,
            player.statusEffects,
            opponent.statusEffects
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
          const skillCost = Math.max(0, GAME_BALANCE.SKILL_MANA_COST - manaReduction);
          const skillResult = calculateDamage(
            playerKryptomon, 
            opponentKryptomon, 
            Math.floor(Math.random() * (GAME_BALANCE.SKILL_DAMAGE.max - GAME_BALANCE.SKILL_DAMAGE.min + 1)) + GAME_BALANCE.SKILL_DAMAGE.min,
            GAME_BALANCE.CRITICAL_CHANCE + 0.05,
            player.statusEffects,
            opponent.statusEffects
          );
          
          opponentKryptomon.hp = Math.max(0, opponentKryptomon.hp - skillResult.damage);
          player.mana -= skillCost;
          
          moveResult.damage = skillResult.damage;
          moveResult.critical = skillResult.isCritical;
          moveResult.elementEffect = skillResult.isSuper ? 'super' : (skillResult.isWeak ? 'weak' : null);
          break;
          
        case 'ultimate':
          const ultimateCost = Math.max(0, GAME_BALANCE.ULTIMATE_MANA_COST - manaReduction);
          const ultimateResult = calculateDamage(
            playerKryptomon, 
            opponentKryptomon, 
            Math.floor(Math.random() * (GAME_BALANCE.ULTIMATE_DAMAGE.max - GAME_BALANCE.ULTIMATE_DAMAGE.min + 1)) + GAME_BALANCE.ULTIMATE_DAMAGE.min,
            GAME_BALANCE.CRITICAL_CHANCE + 0.1,
            player.statusEffects,
            opponent.statusEffects
          );
          
          opponentKryptomon.hp = Math.max(0, opponentKryptomon.hp - ultimateResult.damage);
          player.mana -= ultimateCost;
          
          moveResult.damage = ultimateResult.damage;
          moveResult.critical = ultimateResult.isCritical;
          moveResult.elementEffect = ultimateResult.isSuper ? 'super' : (ultimateResult.isWeak ? 'weak' : null);
          break;
          
        // ✅ NEW: Special Ability Handling
        case 'special':
          const currentElement = playerKryptomon.element;
          const special = ELEMENTS[currentElement].special;
          const specialCost = Math.max(0, special.cost - manaReduction);
          
          player.mana -= specialCost;
          if (special.cooldown > 0) {
            player.cooldowns[currentElement] = special.cooldown;
          }
          
          // Apply special effect
          switch(special.effect) {
            case 'hydra_dot':
              addStatusEffect(opponent.statusEffects, 'hydra_dot');
              moveResult.specialEffect = 'Hydra Applied!';
              break;
              
            case 'mana_reduction':
              addStatusEffect(player.statusEffects, 'mana_reduction');
              moveResult.specialEffect = 'Mana Blessed!';
              break;
              
            case 'defense_boost':
              addStatusEffect(player.statusEffects, 'defense_boost');
              moveResult.specialEffect = 'Armor Frozen!';
              break;
              
            case 'healing':
              addStatusEffect(player.statusEffects, 'healing');
              moveResult.specialEffect = 'Nature Blessed!';
              break;
              
            case 'attack_boost':
              addStatusEffect(player.statusEffects, 'attack_boost');
              moveResult.specialEffect = 'Sandstorm!';
              break;
              
            case 'spell_boost':
              addStatusEffect(player.statusEffects, 'spell_boost');
              moveResult.specialEffect = 'Static Charged!';
              break;
              
            case 'switch_block':
              addStatusEffect(opponent.statusEffects, 'switch_block');
              moveResult.specialEffect = 'Wind Wall!';
              break;
              
            case 'mana_steal':
              const stealAmount = Math.min(GAME_BALANCE.MANA_STEAL_AMOUNT, opponent.mana);
              opponent.mana -= stealAmount;
              player.mana = Math.min(GAME_BALANCE.BASE_MANA, player.mana + stealAmount);
              moveResult.specialEffect = `Mana Stolen: ${stealAmount}`;
              break;
          }
          break;
      }
      
      // ✅ Process status effects at end of turn
      const statusResults = processStatusEffects(player, opponent);
      
      // ✅ Update cooldowns
      for (let element in player.cooldowns) {
        if (player.cooldowns[element] > 0) {
          player.cooldowns[element]--;
        }
      }
      for (let element in opponent.cooldowns) {
        if (opponent.cooldowns[element] > 0) {
          opponent.cooldowns[element]--;
        }
      }
      
      // ✅ Update status effect durations
      updateStatusEffects(player.statusEffects);
      updateStatusEffects(opponent.statusEffects);
      
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
        lastMove: moveResult,
        statusResults: statusResults
      });
      
    } catch (error) {
      console.error('❌ Make move error:', error);
      socket.emit('error', { message: 'Move failed' });
    }
  });

  // ✅ ENHANCED SWITCH KRYPTOMON WITH SWITCH BLOCK CHECK
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
      
      // ✅ Check if player is blocked from switching
      if (player.statusEffects && player.statusEffects.some(effect => effect.type === 'switch_block')) {
        socket.emit('error', { message: 'Cannot switch - blocked by Wind Wall!' });
        return;
      }
      
      const newKryptomon = player.team[data.index];
      
      if (!newKryptomon || newKryptomon.hp <= 0) {
        socket.emit('error', { message: 'Invalid Kryptomon' });
        return;
      }
      
      if (player.activeKryptomon === data.index) {
        socket.emit('error', { message: 'Kryptomon already active' });
        return;
      }
      
      // Switch Kryptomon (doesn't end turn)
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
