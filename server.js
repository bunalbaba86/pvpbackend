const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// ✅ DENGELİ OYUN MEKANİKLERİ
const GAME_BALANCE = {
  BASE_HP: 120, // ✅ ARTIRILMIŞ HP
  BASE_ATTACK: 25, // ✅ AZALTILMIŞ ATTACK
  ATTACK_VARIANCE: 10, // ✅ 25-35 DAMAGE ARALIĞI
  CRITICAL_CHANCE: 15, // ✅ %15 KRİTİK ŞANSI
  CRITICAL_MULTIPLIER: 1.5, // ✅ 1.5X KRİTİK HASAR
  MANA_GAIN_ATTACK: 1, // ✅ ATTACK +1 MANA
  DEFENSE_HEAL: 20,
  SKILL_COST: 2,
  ULTIMATE_COST: 6,
  MAX_MANA: 100
};

// Static file serving
app.use(express.static(path.join(__dirname)));

// Game state
const gameQueue = [];
const activeGames = new Map();
const connectedPlayers = new Map();

// ✅ ENHANCED KRYPTOMON GENERATION
function generateKryptomon() {
  const spriteNum = Math.floor(Math.random() * 20) + 1;
  return {
    sprite: `kryptomon${spriteNum}.png`,
    name: `Kryptomon ${spriteNum}`,
    hp: GAME_BALANCE.BASE_HP,
    maxHp: GAME_BALANCE.BASE_HP,
    attack: GAME_BALANCE.BASE_ATTACK + Math.floor(Math.random() * 11), // 25-35
    defense: 15 + Math.floor(Math.random() * 6), // 15-20
    speed: 10 + Math.floor(Math.random() * 11) // 10-20
  };
}

// ✅ ENHANCED TEAM GENERATION
function generateTeam() {
  return [
    generateKryptomon(),
    generateKryptomon(),
    generateKryptomon()
  ];
}

// ✅ KRİTİK VURUŞ HESAPLAMA
function calculateDamage(attacker, defender, moveType = 'attack') {
  let baseDamage;
  
  switch (moveType) {
    case 'attack':
      baseDamage = GAME_BALANCE.BASE_ATTACK + Math.floor(Math.random() * GAME_BALANCE.ATTACK_VARIANCE);
      break;
    case 'skill':
      baseDamage = (GAME_BALANCE.BASE_ATTACK + Math.floor(Math.random() * GAME_BALANCE.ATTACK_VARIANCE)) * 1.5;
      break;
    case 'ultimate':
      baseDamage = (GAME_BALANCE.BASE_ATTACK + Math.floor(Math.random() * GAME_BALANCE.ATTACK_VARIANCE)) * 2.5;
      break;
    default:
      baseDamage = GAME_BALANCE.BASE_ATTACK;
  }
  
  // ✅ KRİTİK VURUŞ KONTROLÜ
  const isCritical = Math.random() * 100 < GAME_BALANCE.CRITICAL_CHANCE;
  if (isCritical) {
    baseDamage *= GAME_BALANCE.CRITICAL_MULTIPLIER;
  }
  
  // Defense calculation
  const defense = defender.defense || 15;
  const finalDamage = Math.max(1, Math.floor(baseDamage - defense * 0.5));
  
  return {
    damage: finalDamage,
    critical: isCritical
  };
}

// ✅ ENHANCED BATTLE MOVE PROCESSING
function processBattleMove(game, playerIndex, move) {
  const player = game.players[playerIndex];
  const opponent = game.players[1 - playerIndex];
  const activeKryptomon = player.team[player.activeKryptomon];
  const targetKryptomon = opponent.team[opponent.activeKryptomon];
  
  let result = {
    playerIndex,
    move,
    damage: 0,
    heal: 0,
    critical: false,
    playerMana: player.mana // ✅ PLAYER MANA TRACKING
  };

  switch (move) {
    case 'attack':
      const attackResult = calculateDamage(activeKryptomon, targetKryptomon, 'attack');
      result.damage = attackResult.damage;
      result.critical = attackResult.critical;
      targetKryptomon.hp = Math.max(0, targetKryptomon.hp - result.damage);
      
      // ✅ ATTACK MANA GENERATİON
      player.mana = Math.min(GAME_BALANCE.MAX_MANA, player.mana + GAME_BALANCE.MANA_GAIN_ATTACK);
      result.playerMana = player.mana;
      break;

    case 'defend':
      result.heal = GAME_BALANCE.DEFENSE_HEAL;
      activeKryptomon.hp = Math.min(activeKryptomon.maxHp, activeKryptomon.hp + result.heal);
      break;

    case 'skill':
      if (player.mana >= GAME_BALANCE.SKILL_COST) {
        const skillResult = calculateDamage(activeKryptomon, targetKryptomon, 'skill');
        result.damage = skillResult.damage;
        result.critical = skillResult.critical;
        targetKryptomon.hp = Math.max(0, targetKryptomon.hp - result.damage);
        player.mana -= GAME_BALANCE.SKILL_COST;
        result.playerMana = player.mana;
      }
      break;

    case 'ultimate':
      if (player.mana >= GAME_BALANCE.ULTIMATE_COST) {
        const ultimateResult = calculateDamage(activeKryptomon, targetKryptomon, 'ultimate');
        result.damage = ultimateResult.damage;
        result.critical = ultimateResult.critical;
        targetKryptomon.hp = Math.max(0, targetKryptomon.hp - result.damage);
        player.mana -= GAME_BALANCE.ULTIMATE_COST;
        result.playerMana = player.mana;
      }
      break;
  }

  // Check if current Kryptomon is defeated
  if (targetKryptomon.hp <= 0) {
    autoSwitchKryptomon(opponent);
  }

  result.gameState = game;
  return result;
}

// ✅ AUTO SWITCH TO NEXT ALIVE KRYPTOMON
function autoSwitchKryptomon(player) {
  for (let i = 0; i < player.team.length; i++) {
    if (player.team[i].hp > 0 && i !== player.activeKryptomon) {
      player.activeKryptomon = i;
      return true;
    }
  }
  return false; // No alive Kryptomon found
}

// ✅ CHECK WIN CONDITION
function checkWinCondition(game) {
  for (let i = 0; i < 2; i++) {
    const player = game.players[i];
    const aliveKryptomon = player.team.filter(k => k.hp > 0);
    if (aliveKryptomon.length === 0) {
      return {
        gameEnded: true,
        winner: 1 - i,
        loser: i
      };
    }
  }
  return { gameEnded: false };
}

// ✅ ENHANCED GAME CREATION
function createGame(player1, player2) {
  const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const game = {
    id: gameId,
    players: [
      {
        id: player1.id,
        name: player1.name,
        avatar: player1.avatar,
        team: generateTeam(),
        activeKryptomon: 0,
        mana: 0 // ✅ PLAYER-BASED MANA
      },
      {
        id: player2.id,
        name: player2.name,
        avatar: player2.avatar,
        team: generateTeam(),
        activeKryptomon: 0,
        mana: 0 // ✅ PLAYER-BASED MANA
      }
    ],
    currentTurn: Math.floor(Math.random() * 2),
    turnCount: 0,
    createdAt: Date.now()
  };

  activeGames.set(gameId, game);
  return game;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`✅ Player connected: ${socket.id}`);
  
  connectedPlayers.set(socket.id, {
    id: socket.id,
    inQueue: false,
    inGame: false
  });

  // ✅ BROADCAST PLAYER COUNT
  io.emit('playersOnline', { count: connectedPlayers.size });

  // ✅ JOIN QUEUE
  socket.on('joinQueue', (playerData) => {
    console.log(`🎮 Player ${socket.id} joined queue:`, playerData);
    
    const player = connectedPlayers.get(socket.id);
    if (player) {
      player.name = playerData.name;
      player.avatar = playerData.avatar;
      player.telegramUserId = playerData.telegramUserId;
      player.inQueue = true;
    }

    gameQueue.push(socket.id);
    
    socket.emit('waiting', {
      playersOnline: connectedPlayers.size,
      playersInQueue: gameQueue.length
    });

    // ✅ MATCH PLAYERS
    if (gameQueue.length >= 2) {
      const player1Id = gameQueue.shift();
      const player2Id = gameQueue.shift();
      
      const player1Socket = io.sockets.sockets.get(player1Id);
      const player2Socket = io.sockets.sockets.get(player2Id);
      
      if (player1Socket && player2Socket) {
        const player1 = connectedPlayers.get(player1Id);
        const player2 = connectedPlayers.get(player2Id);
        
        const game = createGame(player1, player2);
        
        player1.inQueue = false;
        player1.inGame = true;
        player1.gameId = game.id;
        
        player2.inQueue = false;
        player2.inGame = true;
        player2.gameId = game.id;

        // ✅ START GAME FOR BOTH PLAYERS
        player1Socket.emit('gameStart', {
          ...game,
          yourIndex: 0
        });
        
        player2Socket.emit('gameStart', {
          ...game,
          yourIndex: 1
        });

        // ✅ START FIRST TURN
        setTimeout(() => {
          player1Socket.emit('turnStart', { yourTurn: game.currentTurn === 0 });
          player2Socket.emit('turnStart', { yourTurn: game.currentTurn === 1 });
        }, 1000);
      }
    }
  });

  // ✅ LEAVE QUEUE
  socket.on('leaveQueue', () => {
    const index = gameQueue.indexOf(socket.id);
    if (index > -1) {
      gameQueue.splice(index, 1);
    }
    
    const player = connectedPlayers.get(socket.id);
    if (player) {
      player.inQueue = false;
    }
  });

  // ✅ ENHANCED BATTLE MOVE
  socket.on('battleMove', (data) => {
    console.log(`⚔️ Battle move from ${socket.id}:`, data);
    
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.inGame) return;

    const game = activeGames.get(player.gameId);
    if (!game) return;

    // ✅ VALIDATE TURN
    if (game.currentTurn !== data.playerIndex) {
      socket.emit('error', { message: 'Not your turn!' });
      return;
    }

    // ✅ PROCESS BATTLE MOVE
    const result = processBattleMove(game, data.playerIndex, data.move);
    
    // ✅ BROADCAST MOVE TO BOTH PLAYERS
    const player1Socket = io.sockets.sockets.get(game.players[0].id);
    const player2Socket = io.sockets.sockets.get(game.players[1].id);
    
    if (player1Socket) player1Socket.emit('battleMove', result);
    if (player2Socket) player2Socket.emit('battleMove', result);

    // ✅ CHECK WIN CONDITION
    const winCheck = checkWinCondition(game);
    if (winCheck.gameEnded) {
      const gameEndData = {
        winner: winCheck.winner,
        loser: winCheck.loser,
        totalTurns: game.turnCount
      };
      
      if (player1Socket) player1Socket.emit('gameEnd', gameEndData);
      if (player2Socket) player2Socket.emit('gameEnd', gameEndData);
      
      // ✅ CLEANUP GAME
      activeGames.delete(game.id);
      connectedPlayers.get(game.players[0].id).inGame = false;
      connectedPlayers.get(game.players[1].id).inGame = false;
      
      return;
    }

    // ✅ NEXT TURN
    game.currentTurn = 1 - game.currentTurn;
    game.turnCount++;
    
    setTimeout(() => {
      if (player1Socket) player1Socket.emit('turnStart', { yourTurn: game.currentTurn === 0 });
      if (player2Socket) player2Socket.emit('turnStart', { yourTurn: game.currentTurn === 1 });
    }, 1500);
  });

  // ✅ ENHANCED KRYPTOMON SWITCHING (NO TURN END)
  socket.on('switchKryptomon', (data) => {
    console.log(`🔄 Kryptomon switch from ${socket.id}:`, data);
    
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.inGame) return;

    const game = activeGames.get(player.gameId);
    if (!game) return;

    const gamePlayer = game.players[data.playerIndex];
    
    // ✅ VALIDATE SWITCH
    if (data.newActiveIndex < 0 || data.newActiveIndex >= gamePlayer.team.length) return;
    if (gamePlayer.team[data.newActiveIndex].hp <= 0) return;
    if (gamePlayer.activeKryptomon === data.newActiveIndex) return;

    // ✅ PERFORM SWITCH
    gamePlayer.activeKryptomon = data.newActiveIndex;
    
    // ✅ BROADCAST SWITCH TO BOTH PLAYERS
    const player1Socket = io.sockets.sockets.get(game.players[0].id);
    const player2Socket = io.sockets.sockets.get(game.players[1].id);
    
    const switchData = {
      playerIndex: data.playerIndex,
      newActiveIndex: data.newActiveIndex,
      gameState: game
    };
    
    if (player1Socket) player1Socket.emit('kryptomonSwitched', switchData);
    if (player2Socket) player2Socket.emit('kryptomonSwitched', switchData);
  });

  // ✅ DISCONNECT HANDLING
  socket.on('disconnect', (reason) => {
    console.log(`❌ Player disconnected: ${socket.id} (${reason})`);
    
    // ✅ REMOVE FROM QUEUE
    const queueIndex = gameQueue.indexOf(socket.id);
    if (queueIndex > -1) {
      gameQueue.splice(queueIndex, 1);
    }
    
    // ✅ HANDLE GAME DISCONNECT
    const player = connectedPlayers.get(socket.id);
    if (player && player.inGame && player.gameId) {
      const game = activeGames.get(player.gameId);
      if (game) {
        // Find opponent
        const opponentId = game.players.find(p => p.id !== socket.id)?.id;
        if (opponentId) {
          const opponentSocket = io.sockets.sockets.get(opponentId);
          if (opponentSocket) {
            opponentSocket.emit('gameEnd', {
              winner: game.players.findIndex(p => p.id === opponentId),
              reason: 'opponent_disconnected',
              totalTurns: game.turnCount
            });
          }
          
          // ✅ CLEANUP OPPONENT
          const opponentPlayer = connectedPlayers.get(opponentId);
          if (opponentPlayer) {
            opponentPlayer.inGame = false;
            delete opponentPlayer.gameId;
          }
        }
        
        activeGames.delete(player.gameId);
      }
    }
    
    connectedPlayers.delete(socket.id);
    
    // ✅ BROADCAST UPDATED PLAYER COUNT
    io.emit('playersOnline', { count: connectedPlayers.size });
  });
});

// ✅ ROOT ROUTE
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ START SERVER
server.listen(PORT, () => {
  console.log(`🚀 Kryptomon Battle Arena Server running on port ${PORT}`);
  console.log(`📱 Game URL: http://localhost:${PORT}`);
});

// ✅ ENHANCED ERROR HANDLING
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
