const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let waitingPlayers = [];
let activeGames = new Map();
let connectedPlayers = new Map();

// Kryptomon data
const kryptomonData = {
  1: { name: "Inferno", element: "Fire", type: "Attacker", hp: [70, 100], elementIcon: "🔥" },
  2: { name: "Aqua", element: "Water", type: "Balanced", hp: [90, 120], elementIcon: "💧" },
  3: { name: "Terra", element: "Ground", type: "Tank", hp: [120, 150], elementIcon: "🌍" },
  4: { name: "Zephyr", element: "Air", type: "Attacker", hp: [70, 100], elementIcon: "💨" },
  5: { name: "Volt", element: "Elektro", type: "Balanced", hp: [90, 120], elementIcon: "⚡" },
  6: { name: "Flora", element: "Grass", type: "Tank", hp: [120, 150], elementIcon: "🌿" },
  7: { name: "Frost", element: "Ice", type: "Balanced", hp: [90, 120], elementIcon: "❄️" },
  8: { name: "Phantom", element: "Ghost", type: "Attacker", hp: [70, 100], elementIcon: "👻" },
  9: { name: "Blaze", element: "Fire", type: "Tank", hp: [120, 150], elementIcon: "🔥" },
  10: { name: "Tsunami", element: "Water", type: "Attacker", hp: [70, 100], elementIcon: "💧" },
  11: { name: "Boulder", element: "Ground", type: "Balanced", hp: [90, 120], elementIcon: "🌍" },
  12: { name: "Gale", element: "Air", type: "Tank", hp: [120, 150], elementIcon: "💨" },
  13: { name: "Thunder", element: "Elektro", type: "Attacker", hp: [70, 100], elementIcon: "⚡" },
  14: { name: "Bloom", element: "Grass", type: "Balanced", hp: [90, 120], elementIcon: "🌿" },
  15: { name: "Glacial", element: "Ice", type: "Tank", hp: [120, 150], elementIcon: "❄️" },
  16: { name: "Specter", element: "Ghost", type: "Balanced", hp: [90, 120], elementIcon: "👻" },
  17: { name: "Ember", element: "Fire", type: "Balanced", hp: [90, 120], elementIcon: "🔥" },
  18: { name: "Hydro", element: "Water", type: "Tank", hp: [120, 150], elementIcon: "💧" },
  19: { name: "Quake", element: "Ground", type: "Attacker", hp: [70, 100], elementIcon: "🌍" },
  20: { name: "Wraith", element: "Ghost", type: "Tank", hp: [120, 150], elementIcon: "👻" }
};

// Element advantages
const elementAdvantages = {
  "Fire": ["Ice", "Grass"],
  "Water": ["Fire", "Ground"],
  "Ice": ["Grass", "Air"],
  "Grass": ["Water", "Ground"],
  "Ground": ["Elektro", "Fire"],
  "Elektro": ["Water", "Air"],
  "Ghost": ["Ghost"],
  "Air": ["Ground", "Grass"]
};

// Special abilities by element
const specialAbilities = {
  "Fire": { name: "Hydra", icon: "hydra.png", cost: 4, effect: "DoT damage over 3 turns" },
  "Water": { name: "Water Blessing", icon: "waterblessing.png", cost: 4, effect: "Reduces mana costs for 3 turns" },
  "Ice": { name: "Frozen Armor", icon: "frozen.png", cost: 4, effect: "Increases defense for 3 turns" },
  "Grass": { name: "Blessing of Nature", icon: "blessing.png", cost: 4, effect: "Heals HP over 3 turns" },
  "Ground": { name: "Sandstorm", icon: "sandstorm.png", cost: 4, effect: "Increases attack for 3 turns" },
  "Elektro": { name: "Static Electricity", icon: "static.png", cost: 4, effect: "Boosts spell damage for 3 turns" },
  "Ghost": { name: "Panic Attack", icon: "panicattack.png", cost: 4, effect: "Steals mana from opponent" },
  "Air": { name: "Wall of Wind", icon: "wallofwind.png", cost: 4, effect: "Blocks opponent switching for 2 turns" }
};

function generateRandomTeam() {
  const team = [];
  const usedIds = new Set();
  
  for (let i = 0; i < 3; i++) {
    let kryptomonId;
    do {
      kryptomonId = Math.floor(Math.random() * 20) + 1;
    } while (usedIds.has(kryptomonId));
    
    usedIds.add(kryptomonId);
    const kryptomon = kryptomonData[kryptomonId];
    const maxHp = Math.floor(Math.random() * (kryptomon.hp[1] - kryptomon.hp[0] + 1)) + kryptomon.hp[0];
    
    team.push({
      id: kryptomonId,
      name: kryptomon.name,
      element: kryptomon.element,
      type: kryptomon.type,
      elementIcon: kryptomon.elementIcon,
      maxHp: maxHp,
      currentHp: maxHp,
      isActive: i === 0,
      statusEffects: []
    });
  }
  
  return team;
}

function createGameSession(player1, player2) {
  const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Determine who goes first randomly
  const firstPlayer = Math.random() < 0.5 ? player1.id : player2.id;
  
  const gameState = {
    id: gameId,
    players: {
      [player1.id]: {
        ...player1,
        team: generateRandomTeam(),
        mana: 0,
        isReady: false,
        statusEffects: []
      },
      [player2.id]: {
        ...player2,
        team: generateRandomTeam(),
        mana: 0,
        isReady: false,
        statusEffects: []
      }
    },
    currentTurn: firstPlayer,
    turnTimer: 30,
    gameStarted: false,
    winner: null,
    turnCount: 0,
    startTime: Date.now()
  };
  
  activeGames.set(gameId, gameState);
  return gameState;
}

function calculateDamage(attacker, defender, moveType) {
  let baseDamage;
  
  switch (moveType) {
    case 'attack':
      baseDamage = Math.floor(Math.random() * 20) + 15; // 15-34 damage
      break;
    case 'skill':
      baseDamage = Math.floor(Math.random() * 25) + 20; // 20-44 damage
      break;
    case 'ultimate':
      baseDamage = Math.floor(Math.random() * 35) + 30; // 30-64 damage
      break;
    case 'special':
      baseDamage = Math.floor(Math.random() * 30) + 25; // 25-54 damage
      break;
    default:
      baseDamage = 10;
  }
  
  // Element advantage/disadvantage
  let multiplier = 1;
  if (elementAdvantages[attacker.element] && elementAdvantages[attacker.element].includes(defender.element)) {
    multiplier = 1.5; // 50% more damage
  } else if (elementAdvantages[defender.element] && elementAdvantages[defender.element].includes(attacker.element)) {
    multiplier = 0.7; // 30% less damage
  }
  
  // Apply status effects
  const attackBoostEffect = attacker.statusEffects && attacker.statusEffects.find(effect => effect.type === 'attackBoost');
  if (attackBoostEffect) {
    multiplier *= 1.3;
  }
  
  const spellBoostEffect = attacker.statusEffects && attacker.statusEffects.find(effect => effect.type === 'spellBoost');
  if (spellBoostEffect && (moveType === 'skill' || moveType === 'ultimate' || moveType === 'special')) {
    multiplier *= 1.25;
  }
  
  const defenseBoostEffect = defender.statusEffects && defender.statusEffects.find(effect => effect.type === 'defenseBoost');
  if (defenseBoostEffect) {
    multiplier *= 0.8;
  }
  
  const finalDamage = Math.max(1, Math.floor(baseDamage * multiplier));
  return {
    damage: finalDamage,
    isCritical: multiplier > 1.2,
    isWeak: multiplier < 1
  };
}

function processStatusEffects(player) {
  if (!player.statusEffects) {
    player.statusEffects = [];
  }
  
  player.statusEffects = player.statusEffects.filter(effect => {
    effect.duration -= 1;
    
    // Apply effect
    switch (effect.type) {
      case 'hydraDoT':
        const activeKryptomon = player.team.find(k => k.isActive);
        if (activeKryptomon) {
          activeKryptomon.currentHp = Math.max(0, activeKryptomon.currentHp - 10);
        }
        break;
      case 'natureHealing':
        const healingKryptomon = player.team.find(k => k.isActive);
        if (healingKryptomon) {
          healingKryptomon.currentHp = Math.min(healingKryptomon.maxHp, healingKryptomon.currentHp + 15);
        }
        break;
    }
    
    return effect.duration > 0;
  });
}

function updateTeamDisplay(gameState) {
  Object.keys(gameState.players).forEach(playerId => {
    const player = gameState.players[playerId];
    io.to(playerId).emit('teamUpdate', {
      yourTeam: player.team,
      enemyTeam: Object.values(gameState.players).find(p => p.id !== playerId).team
    });
  });
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Send current online players count
  io.emit('playersCount', io.engine.clientsCount);

  socket.on('joinQueue', (playerData) => {
    console.log(`Player ${playerData.name} joined queue`);
    
    // Store player data
    connectedPlayers.set(socket.id, {
      id: socket.id,
      name: playerData.name || `Player_${socket.id.substr(0, 6)}`,
      avatar: playerData.avatar || '',
      socket: socket
    });
    
    // Add to waiting queue
    waitingPlayers.push(socket.id);
    
    // Update players count
    io.emit('playersCount', io.engine.clientsCount);
    
    // Try to match players
    if (waitingPlayers.length >= 2) {
      const player1Id = waitingPlayers.shift();
      const player2Id = waitingPlayers.shift();
      
      const player1 = connectedPlayers.get(player1Id);
      const player2 = connectedPlayers.get(player2Id);
      
      if (player1 && player2) {
        console.log(`Matching ${player1.name} vs ${player2.name}`);
        
        // Create game session
        const gameState = createGameSession(player1, player2);
        
        // Join players to game room
        player1.socket.join(gameState.id);
        player2.socket.join(gameState.id);
        
        // Store game reference for players
        connectedPlayers.get(player1Id).gameId = gameState.id;
        connectedPlayers.get(player2Id).gameId = gameState.id;
        
        // Notify players about opponent found
        player1.socket.emit('opponentFound', {
          opponent: { name: player2.name, avatar: player2.avatar },
          gameId: gameState.id
        });
        
        player2.socket.emit('opponentFound', {
          opponent: { name: player1.name, avatar: player1.avatar },
          gameId: gameState.id
        });
        
        // Start countdown
        let countdown = 3;
        const countdownInterval = setInterval(() => {
          io.to(gameState.id).emit('gameCountdown', countdown);
          countdown--;
          
          if (countdown < 0) {
            clearInterval(countdownInterval);
            
            // Send turn decision data
            io.to(gameState.id).emit('turnDecision', {
              players: [
                { name: player1.name, avatar: player1.avatar, id: player1.id },
                { name: player2.name, avatar: player2.avatar, id: player2.id }
              ],
              firstPlayer: gameState.currentTurn
            });
            
            // Start game after turn decision
            setTimeout(() => {
              gameState.gameStarted = true;
              
              // Send initial game state
              Object.keys(gameState.players).forEach(playerId => {
                const player = gameState.players[playerId];
                const enemy = Object.values(gameState.players).find(p => p.id !== playerId);
                
                io.to(playerId).emit('gameStart', {
                  gameState: {
                    yourTeam: player.team,
                    enemyTeam: enemy.team,
                    yourMana: player.mana,
                    enemyMana: enemy.mana,
                    currentTurn: gameState.currentTurn,
                    isYourTurn: gameState.currentTurn === playerId,
                    turnTimer: gameState.turnTimer,
                    players: {
                      you: { name: player.name, avatar: player.avatar },
                      enemy: { name: enemy.name, avatar: enemy.avatar }
                    }
                  }
                });
              });
              
              // Start turn timer
              startTurnTimer(gameState);
              
            }, 2000);
          }
        }, 1000);
      }
    } else {
      socket.emit('waitingForOpponent');
    }
  });

  socket.on('leaveQueue', () => {
    const index = waitingPlayers.indexOf(socket.id);
    if (index > -1) {
      waitingPlayers.splice(index, 1);
      console.log(`Player ${socket.id} left queue`);
    }
  });

  socket.on('battleMove', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.gameId) return;
    
    const gameState = activeGames.get(player.gameId);
    if (!gameState || !gameState.gameStarted) return;
    
    // Check if it's player's turn
    if (gameState.currentTurn !== socket.id) {
      socket.emit('error', 'Not your turn!');
      return;
    }
    
    const currentPlayer = gameState.players[socket.id];
    const enemyPlayer = Object.values(gameState.players).find(p => p.id !== socket.id);
    
    const activeKryptomon = currentPlayer.team.find(k => k.isActive);
    const enemyActiveKryptomon = enemyPlayer.team.find(k => k.isActive);
    
    if (!activeKryptomon || !enemyActiveKryptomon) return;
    
    // Process the move
    let moveResult = { success: false };
    
    switch (data.move) {
      case 'attack':
        const attackResult = calculateDamage(activeKryptomon, enemyActiveKryptomon, 'attack');
        enemyActiveKryptomon.currentHp = Math.max(0, enemyActiveKryptomon.currentHp - attackResult.damage);
        currentPlayer.mana = Math.min(100, currentPlayer.mana + 2);
        
        moveResult = {
          success: true,
          move: 'attack',
          damage: attackResult.damage,
          isCritical: attackResult.isCritical,
          manaGained: 2
        };
        break;
        
      case 'defend':
        activeKryptomon.currentHp = Math.min(activeKryptomon.maxHp, activeKryptomon.currentHp + 15);
        
        moveResult = {
          success: true,
          move: 'defend',
          healing: 15
        };
        break;
        
      case 'skill':
        if (currentPlayer.mana >= 2) {
          const skillResult = calculateDamage(activeKryptomon, enemyActiveKryptomon, 'skill');
          enemyActiveKryptomon.currentHp = Math.max(0, enemyActiveKryptomon.currentHp - skillResult.damage);
          currentPlayer.mana -= 2;
          
          moveResult = {
            success: true,
            move: 'skill',
            damage: skillResult.damage,
            isCritical: skillResult.isCritical,
            manaUsed: 2
          };
        } else {
          socket.emit('error', 'Not enough mana!');
          return;
        }
        break;
        
      case 'ultimate':
        if (currentPlayer.mana >= 6) {
          const ultimateResult = calculateDamage(activeKryptomon, enemyActiveKryptomon, 'ultimate');
          enemyActiveKryptomon.currentHp = Math.max(0, enemyActiveKryptomon.currentHp - ultimateResult.damage);
          currentPlayer.mana -= 6;
          
          moveResult = {
            success: true,
            move: 'ultimate',
            damage: ultimateResult.damage,
            isCritical: ultimateResult.isCritical,
            manaUsed: 6
          };
        } else {
          socket.emit('error', 'Not enough mana!');
          return;
        }
        break;
        
      case 'special':
        if (currentPlayer.mana >= 4) {
          const specialAbility = specialAbilities[activeKryptomon.element];
          const specialResult = calculateDamage(activeKryptomon, enemyActiveKryptomon, 'special');
          
          // Apply special ability effects
          switch (activeKryptomon.element) {
            case 'Fire': // Hydra - DoT damage
              if (!enemyPlayer.statusEffects) enemyPlayer.statusEffects = [];
              enemyPlayer.statusEffects.push({
                type: 'hydraDoT',
                duration: 3,
                name: 'Hydra',
                description: 'Taking 10 damage per turn'
              });
              break;
              
            case 'Water': // Water Blessing - Reduce mana costs
              if (!currentPlayer.statusEffects) currentPlayer.statusEffects = [];
              currentPlayer.statusEffects.push({
                type: 'manaCostReduction',
                duration: 3,
                name: 'Water Blessing',
                description: 'Reduced mana costs'
              });
              break;
              
            case 'Ice': // Frozen Armor - Defense boost
              if (!currentPlayer.statusEffects) currentPlayer.statusEffects = [];
              currentPlayer.statusEffects.push({
                type: 'defenseBoost',
                duration: 3,
                name: 'Frozen Armor',
                description: 'Increased defense'
              });
              break;
              
            case 'Grass': // Blessing of Nature - Healing over time
              if (!currentPlayer.statusEffects) currentPlayer.statusEffects = [];
              currentPlayer.statusEffects.push({
                type: 'natureHealing',
                duration: 3,
                name: 'Blessing of Nature',
                description: 'Healing 15 HP per turn'
              });
              break;
              
            case 'Ground': // Sandstorm - Attack boost
              if (!currentPlayer.statusEffects) currentPlayer.statusEffects = [];
              currentPlayer.statusEffects.push({
                type: 'attackBoost',
                duration: 3,
                name: 'Sandstorm',
                description: 'Increased attack power'
              });
              break;
              
            case 'Elektro': // Static Electricity - Spell boost
              if (!currentPlayer.statusEffects) currentPlayer.statusEffects = [];
              currentPlayer.statusEffects.push({
                type: 'spellBoost',
                duration: 3,
                name: 'Static Electricity',
                description: 'Boosted spell damage'
              });
              break;
              
            case 'Ghost': // Panic Attack - Mana steal
              const stolenMana = Math.min(10, enemyPlayer.mana);
              enemyPlayer.mana -= stolenMana;
              currentPlayer.mana = Math.min(100, currentPlayer.mana + stolenMana - 4); // -4 for ability cost, +stolen
              break;
              
            case 'Air': // Wall of Wind - Block switching
              if (!enemyPlayer.statusEffects) enemyPlayer.statusEffects = [];
              enemyPlayer.statusEffects.push({
                type: 'switchBlocked',
                duration: 2,
                name: 'Wall of Wind',
                description: 'Cannot switch Kryptomon'
              });
              break;
          }
          
          enemyActiveKryptomon.currentHp = Math.max(0, enemyActiveKryptomon.currentHp - specialResult.damage);
          if (activeKryptomon.element !== 'Ghost') {
            currentPlayer.mana -= 4;
          }
          
          moveResult = {
            success: true,
            move: 'special',
            damage: specialResult.damage,
            isCritical: specialResult.isCritical,
            specialEffect: specialAbility.effect,
            manaUsed: activeKryptomon.element === 'Ghost' ? 4 - Math.min(10, enemyPlayer.mana) : 4
          };
        } else {
          socket.emit('error', 'Not enough mana!');
          return;
        }
        break;
    }
    
    // Broadcast move result
    io.to(gameState.id).emit('moveResult', {
      playerId: socket.id,
      playerName: currentPlayer.name,
      result: moveResult,
      gameState: {
        players: gameState.players,
        currentTurn: gameState.currentTurn
      }
    });
    
    // Check if enemy Kryptomon is defeated
    if (enemyActiveKryptomon.currentHp <= 0) {
      enemyActiveKryptomon.isActive = false;
      
      // Check if enemy has remaining Kryptomon
      const remainingEnemyKryptomon = enemyPlayer.team.filter(k => k.currentHp > 0);
      if (remainingEnemyKryptomon.length > 0) {
        // Enemy needs to switch
        io.to(enemyPlayer.id).emit('mustSwitch', {
          availableKryptomon: remainingEnemyKryptomon
        });
      } else {
        // Game over - current player wins
        gameState.winner = socket.id;
        io.to(gameState.id).emit('gameOver', {
          winner: currentPlayer.name,
          winnerAvatar: currentPlayer.avatar,
          gameStats: {
            duration: Math.floor((Date.now() - gameState.startTime) / 1000),
            turns: gameState.turnCount
          }
        });
        
        // Clean up
        activeGames.delete(gameState.id);
        return;
      }
    }
    
    // Process status effects for current player
    processStatusEffects(currentPlayer);
    
    // End turn
    endTurn(gameState);
  });

  socket.on('switchKryptomon', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.gameId) return;
    
    const gameState = activeGames.get(player.gameId);
    if (!gameState) return;
    
    const currentPlayer = gameState.players[socket.id];
    const targetKryptomon = currentPlayer.team[data.index];
    
    if (!targetKryptomon || targetKryptomon.currentHp <= 0 || targetKryptomon.isActive) {
      socket.emit('error', 'Cannot switch to that Kryptomon!');
      return;
    }
    
    // Check if switching is blocked
    const switchBlockedEffect = currentPlayer.statusEffects && currentPlayer.statusEffects.find(effect => effect.type === 'switchBlocked');
    if (switchBlockedEffect) {
      socket.emit('error', 'Switching is blocked by Wall of Wind!');
      return;
    }
    
    // Switch Kryptomon
    currentPlayer.team.forEach(k => k.isActive = false);
    targetKryptomon.isActive = true;
    
    // Update team display
    updateTeamDisplay(gameState);
    
    // Broadcast switch
    io.to(gameState.id).emit('kryptomonSwitched', {
      playerId: socket.id,
      playerName: currentPlayer.name,
      newKryptomon: targetKryptomon
    });
    
    // If this was a forced switch (after defeat), end turn
    if (data.forced) {
      endTurn(gameState);
    }
    // Note: Regular switches don't end the turn as per user request
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove from waiting queue
    const index = waitingPlayers.indexOf(socket.id);
    if (index > -1) {
      waitingPlayers.splice(index, 1);
    }
    
    // Handle game disconnect
    const player = connectedPlayers.get(socket.id);
    if (player && player.gameId) {
      const gameState = activeGames.get(player.gameId);
      if (gameState) {
        // Notify other player
        socket.to(player.gameId).emit('opponentDisconnected');
        
        // Clean up game
        activeGames.delete(player.gameId);
      }
    }
    
    // Remove player data
    connectedPlayers.delete(socket.id);
    
    // Update players count
    io.emit('playersCount', Math.max(0, io.engine.clientsCount - 1));
  });
});

function endTurn(gameState) {
  // Process status effects for current player (duration decrease only on their turn)
  const currentPlayer = gameState.players[gameState.currentTurn];
  processStatusEffects(currentPlayer);
  
  // Switch to other player
  const playerIds = Object.keys(gameState.players);
  gameState.currentTurn = playerIds.find(id => id !== gameState.currentTurn);
  gameState.turnCount++;
  
  // Reset timer
  gameState.turnTimer = 30;
  
  // Clear any existing timer
  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
  }
  
  // Broadcast turn change
  io.to(gameState.id).emit('turnChange', {
    currentTurn: gameState.currentTurn,
    turnCount: gameState.turnCount,
    gameState: gameState.players
  });
  
  // Start new turn timer
  startTurnTimer(gameState);
}

function startTurnTimer(gameState) {
  if (!gameState || !gameState.gameStarted) return;
  
  const timer = setInterval(() => {
    gameState.turnTimer--;
    
    // Broadcast timer update
    io.to(gameState.id).emit('timerUpdate', gameState.turnTimer);
    
    if (gameState.turnTimer <= 0) {
      clearInterval(timer);
      
      // Auto-pass turn
      io.to(gameState.id).emit('turnTimeout', {
        playerId: gameState.currentTurn
      });
      
      endTurn(gameState);
    }
  }, 1000);
  
  // Store timer reference in game state for cleanup
  gameState.timerInterval = timer;
}

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Kryptomon Battle Arena server running on port ${PORT}`);
  console.log(`🌐 Game URL: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Server shutting down...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});
