const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS configuration for mobile and cross-origin requests
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:8080",
    "https://your-frontend-domain.com",
    "https://kryptomon-battle.onrender.com",
    "https://pvpbackend.onrender.com"
  ],
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

// Game state management
const gameRooms = new Map();
const waitingPlayers = [];
const playerSessions = new Map();

// Kryptomon data with mobile-optimized stats
const kryptomonData = {
  1: { name: "Flame Dragon", hp: 120, mana: 100, attack: 25, defense: 15, speed: 20, type: "Fire" },
  2: { name: "Water Serpent", hp: 110, mana: 110, attack: 22, defense: 18, speed: 25, type: "Water" },
  3: { name: "Earth Titan", hp: 140, mana: 90, attack: 30, defense: 25, speed: 15, type: "Earth" },
  4: { name: "Air Phoenix", hp: 100, mana: 120, attack: 28, defense: 12, speed: 30, type: "Air" },
  5: { name: "Lightning Beast", hp: 105, mana: 115, attack: 32, defense: 14, speed: 28, type: "Electric" },
  6: { name: "Ice Wolf", hp: 115, mana: 105, attack: 26, defense: 20, speed: 22, type: "Ice" },
  7: { name: "Shadow Panther", hp: 95, mana: 125, attack: 35, defense: 10, speed: 35, type: "Dark" },
  8: { name: "Light Angel", hp: 125, mana: 100, attack: 24, defense: 22, speed: 18, type: "Light" },
  9: { name: "Poison Viper", hp: 100, mana: 110, attack: 29, defense: 16, speed: 26, type: "Poison" },
  10: { name: "Metal Golem", hp: 150, mana: 80, attack: 28, defense: 30, speed: 12, type: "Metal" },
  11: { name: "Crystal Unicorn", hp: 110, mana: 120, attack: 26, defense: 18, speed: 24, type: "Crystal" },
  12: { name: "Lava Demon", hp: 130, mana: 95, attack: 33, defense: 20, speed: 17, type: "Fire" },
  13: { name: "Storm Eagle", hp: 90, mana: 130, attack: 30, defense: 12, speed: 32, type: "Air" },
  14: { name: "Ocean Leviathan", hp: 135, mana: 100, attack: 27, defense: 23, speed: 19, type: "Water" },
  15: { name: "Forest Guardian", hp: 125, mana: 105, attack: 25, defense: 25, speed: 20, type: "Nature" },
  16: { name: "Void Wraith", hp: 85, mana: 140, attack: 38, defense: 8, speed: 40, type: "Dark" },
  17: { name: "Solar Phoenix", hp: 115, mana: 115, attack: 31, defense: 16, speed: 27, type: "Light" },
  18: { name: "Frost Giant", hp: 145, mana: 85, attack: 32, defense: 28, speed: 14, type: "Ice" },
  19: { name: "Thunder Dragon", hp: 120, mana: 110, attack: 34, defense: 17, speed: 25, type: "Electric" },
  20: { name: "Mystic Sphinx", hp: 105, mana: 125, attack: 29, defense: 19, speed: 29, type: "Mystic" }
};

// Battle moves with mobile-optimized effects
const battleMoves = {
  attack: { manaCost: 10, baseDamage: 20, description: "Basic attack" },
  defend: { manaCost: 5, damageReduction: 0.5, healAmount: 15, description: "Defend and heal" },
  skill: { manaCost: 20, baseDamage: 35, description: "Special skill attack" },
  ultimate: { manaCost: 40, baseDamage: 60, description: "Ultimate devastating attack" },
  manaRestore: { manaGain: 25, description: "Restore mana" }
};

// Create a new Kryptomon instance
function createKryptomon(id, isRandomTeam = false) {
  const data = kryptomonData[id] || kryptomonData[1];
  return {
    id: id,
    name: data.name,
    maxHp: data.hp,
    hp: data.hp,
    maxMana: data.mana,
    mana: data.mana,
    attack: data.attack,
    defense: data.defense,
    speed: data.speed,
    type: data.type,
    isAlive: true,
    ultimateUsed: false
  };
}

// Generate random team for guest players
function generateRandomTeam() {
  const team = [];
  const usedIds = new Set();
  
  for (let i = 0; i < 3; i++) {
    let randomId;
    do {
      randomId = Math.floor(Math.random() * 20) + 1;
    } while (usedIds.has(randomId));
    
    usedIds.add(randomId);
    team.push(createKryptomon(randomId, true));
  }
  
  return team;
}

// Create a new game room
function createGameRoom(player1, player2) {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const gameRoom = {
    id: roomId,
    players: [
      {
        id: player1.id,
        username: player1.username,
        team: player1.team || generateRandomTeam(),
        currentKryptomon: 0,
        isGuest: player1.isGuest || false,
        connected: true
      },
      {
        id: player2.id,
        username: player2.username,
        team: player2.team || generateRandomTeam(),
        currentKryptomon: 0,
        isGuest: player2.isGuest || false,
        connected: true
      }
    ],
    currentTurn: 0,
    turnStartTime: Date.now(),
    turnDuration: 30000, // 30 seconds per turn
    gameState: 'active',
    winner: null,
    gameStartTime: Date.now()
  };
  
  gameRooms.set(roomId, gameRoom);
  
  // Set player room references
  playerSessions.set(player1.id, { ...playerSessions.get(player1.id), roomId });
  playerSessions.set(player2.id, { ...playerSessions.get(player2.id), roomId });
  
  return gameRoom;
}

// Get current Kryptomon for a player
function getCurrentKryptomon(player) {
  return player.team[player.currentKryptomon];
}

// Switch to next alive Kryptomon
function switchToNextKryptomon(player) {
  for (let i = 0; i < player.team.length; i++) {
    if (player.team[i].isAlive) {
      player.currentKryptomon = i;
      return true;
    }
  }
  return false; // No alive Kryptomon found
}

// Check if player has any alive Kryptomon
function hasAliveKryptomon(player) {
  return player.team.some(k => k.isAlive);
}

// Calculate damage with type effectiveness and mobile-optimized formula
function calculateDamage(attacker, defender, moveType) {
  const move = battleMoves[moveType];
  let damage = move.baseDamage;
  
  // Add attacker's attack stat
  damage += attacker.attack * 0.5;
  
  // Apply defender's defense
  damage = Math.max(1, damage - (defender.defense * 0.3));
  
  // Add some randomness (±20%)
  damage = Math.floor(damage * (0.8 + Math.random() * 0.4));
  
  // Critical hit chance (15%)
  const isCritical = Math.random() < 0.15;
  if (isCritical) {
    damage = Math.floor(damage * 1.5);
  }
  
  return { damage, isCritical };
}

// Process battle move
function processBattleMove(gameRoom, playerIndex, moveType, targetKryptomonIndex = null) {
  const player = gameRoom.players[playerIndex];
  const opponent = gameRoom.players[1 - playerIndex];
  const currentKryptomon = getCurrentKryptomon(player);
  const opponentKryptomon = getCurrentKryptomon(opponent);
  
  if (!currentKryptomon || !currentKryptomon.isAlive) {
    return { success: false, error: "No active Kryptomon" };
  }
  
  const move = battleMoves[moveType];
  if (!move) {
    return { success: false, error: "Invalid move" };
  }
  
  // Check mana cost
  if (move.manaCost && currentKryptomon.mana < move.manaCost) {
    return { success: false, error: "Not enough mana" };
  }
  
  // Check ultimate usage
  if (moveType === 'ultimate' && currentKryptomon.ultimateUsed) {
    return { success: false, error: "Ultimate already used" };
  }
  
  const result = {
    success: true,
    playerIndex,
    moveType,
    effects: []
  };
  
  // Deduct mana cost
  if (move.manaCost) {
    currentKryptomon.mana = Math.max(0, currentKryptomon.mana - move.manaCost);
    result.effects.push({
      type: 'manaUse',
      target: 'self',
      amount: move.manaCost
    });
  }
  
  switch (moveType) {
    case 'attack':
    case 'skill':
    case 'ultimate':
      const { damage, isCritical } = calculateDamage(currentKryptomon, opponentKryptomon, moveType);
      opponentKryptomon.hp = Math.max(0, opponentKryptomon.hp - damage);
      
      result.effects.push({
        type: 'damage',
        target: 'opponent',
        amount: damage,
        isCritical
      });
      
      if (moveType === 'ultimate') {
        currentKryptomon.ultimateUsed = true;
      }
      
      // Check if opponent Kryptomon is defeated
      if (opponentKryptomon.hp <= 0) {
        opponentKryptomon.isAlive = false;
        result.effects.push({
          type: 'defeat',
          target: 'opponent'
        });
        
        // Try to switch to next Kryptomon
        if (!switchToNextKryptomon(opponent)) {
          // Game over - no more alive Kryptomon
          gameRoom.gameState = 'finished';
          gameRoom.winner = playerIndex;
          result.gameOver = true;
          result.winner = playerIndex;
        }
      }
      break;
      
    case 'defend':
      // Heal current Kryptomon
      const healAmount = move.healAmount;
      currentKryptomon.hp = Math.min(currentKryptomon.maxHp, currentKryptomon.hp + healAmount);
      
      result.effects.push({
        type: 'heal',
        target: 'self',
        amount: healAmount
      });
      
      // Set defense boost for next turn (handled in damage calculation)
      currentKryptomon.defending = true;
      break;
      
    case 'manaRestore':
      const manaGain = move.manaGain;
      currentKryptomon.mana = Math.min(currentKryptomon.maxMana, currentKryptomon.mana + manaGain);
      
      result.effects.push({
        type: 'manaGain',
        target: 'self',
        amount: manaGain
      });
      break;
      
    case 'switchKryptomon':
      if (targetKryptomonIndex !== null && 
          targetKryptomonIndex < player.team.length && 
          player.team[targetKryptomonIndex].isAlive &&
          targetKryptomonIndex !== player.currentKryptomon) {
        
        player.currentKryptomon = targetKryptomonIndex;
        result.effects.push({
          type: 'switch',
          target: 'self',
          newKryptomonIndex: targetKryptomonIndex
        });
      } else {
        return { success: false, error: "Invalid Kryptomon switch" };
      }
      break;
  }
  
  // Reset defending status for all Kryptomon at end of turn
  player.team.forEach(k => k.defending = false);
  opponent.team.forEach(k => k.defending = false);
  
  return result;
}

// Start turn timer
function startTurnTimer(gameRoom) {
  gameRoom.turnStartTime = Date.now();
  
  // Auto-skip turn after 30 seconds
  setTimeout(() => {
    if (gameRoom.gameState === 'active') {
      const currentTime = Date.now();
      if (currentTime - gameRoom.turnStartTime >= gameRoom.turnDuration) {
        // Force a mana restore move if no move was made
        const result = processBattleMove(gameRoom, gameRoom.currentTurn, 'manaRestore');
        
        // Switch turn
        gameRoom.currentTurn = 1 - gameRoom.currentTurn;
        
        // Emit turn result to both players
        const room = gameRoom.id;
        io.to(room).emit('turnResult', {
          result,
          gameRoom: getGameRoomState(gameRoom),
          autoSkip: true
        });
        
        startTurnTimer(gameRoom);
      }
    }
  }, gameRoom.turnDuration);
}

// Get simplified game room state for clients
function getGameRoomState(gameRoom) {
  return {
    id: gameRoom.id,
    players: gameRoom.players.map(p => ({
      id: p.id,
      username: p.username,
      team: p.team,
      currentKryptomon: p.currentKryptomon,
      isGuest: p.isGuest
    })),
    currentTurn: gameRoom.currentTurn,
    gameState: gameRoom.gameState,
    winner: gameRoom.winner,
    turnTimeLeft: Math.max(0, gameRoom.turnDuration - (Date.now() - gameRoom.turnStartTime))
  };
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Update connection status
  socket.emit('connectionStatus', { status: 'connected' });
  
  // Handle player joining game
  socket.on('joinGame', (data) => {
    const { username, isGuest, selectedNFTs } = data;
    
    console.log(`Player ${username} (${socket.id}) joining game`);
    
    // Create player session
    const playerSession = {
      id: socket.id,
      username: username || `Guest_${Math.floor(Math.random() * 1000)}`,
      isGuest: isGuest || false,
      team: null,
      roomId: null,
      connected: true
    };
    
    // Generate team based on NFTs or random for guests
    if (selectedNFTs && selectedNFTs.length >= 3) {
      playerSession.team = selectedNFTs.slice(0, 3).map(nft => 
        createKryptomon(nft.kryptomonId || Math.floor(Math.random() * 20) + 1)
      );
    } else {
      playerSession.team = generateRandomTeam();
    }
    
    playerSessions.set(socket.id, playerSession);
    socket.join('lobby');
    
    // Add to waiting queue
    waitingPlayers.push(playerSession);
    
    // Emit waiting status
    socket.emit('waitingForOpponent', {
      username: playerSession.username,
      teamPreview: playerSession.team.map(k => ({ id: k.id, name: k.name }))
    });
    
    // Try to match players
    if (waitingPlayers.length >= 2) {
      const player1 = waitingPlayers.shift();
      const player2 = waitingPlayers.shift();
      
      // Create game room
      const gameRoom = createGameRoom(player1, player2);
      
      // Move players to game room
      const player1Socket = io.sockets.sockets.get(player1.id);
      const player2Socket = io.sockets.sockets.get(player2.id);
      
      if (player1Socket && player2Socket) {
        player1Socket.leave('lobby');
        player2Socket.leave('lobby');
        player1Socket.join(gameRoom.id);
        player2Socket.join(gameRoom.id);
        
        // Start countdown
        let countdown = 3;
        const countdownInterval = setInterval(() => {
          io.to(gameRoom.id).emit('gameStartCountdown', { countdown });
          countdown--;
          
          if (countdown < 0) {
            clearInterval(countdownInterval);
            
            // Start the game
            io.to(gameRoom.id).emit('gameStart', {
              gameRoom: getGameRoomState(gameRoom),
              yourIndex: 0 // Will be corrected by client
            });
            
            // Send individual player data
            player1Socket.emit('gameStart', {
              gameRoom: getGameRoomState(gameRoom),
              yourIndex: 0
            });
            
            player2Socket.emit('gameStart', {
              gameRoom: getGameRoomState(gameRoom),
              yourIndex: 1
            });
            
            startTurnTimer(gameRoom);
            
            console.log(`Game started: ${gameRoom.id}`);
          }
        }, 1000);
      }
    }
  });
  
  // Handle battle moves
  socket.on('battleMove', (data) => {
    const playerSession = playerSessions.get(socket.id);
    if (!playerSession || !playerSession.roomId) {
      socket.emit('error', { message: 'Not in a game' });
      return;
    }
    
    const gameRoom = gameRooms.get(playerSession.roomId);
    if (!gameRoom || gameRoom.gameState !== 'active') {
      socket.emit('error', { message: 'Game not active' });
      return;
    }
    
    // Find player index
    const playerIndex = gameRoom.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }
    
    // Check if it's player's turn
    if (gameRoom.currentTurn !== playerIndex) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    
    // Process the move
    const result = processBattleMove(gameRoom, playerIndex, data.moveType, data.targetKryptomonIndex);
    
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    
    // Switch turn (unless game is over)
    if (!result.gameOver) {
      gameRoom.currentTurn = 1 - gameRoom.currentTurn;
      startTurnTimer(gameRoom);
    }
    
    // Emit result to both players
    io.to(gameRoom.id).emit('turnResult', {
      result,
      gameRoom: getGameRoomState(gameRoom)
    });
    
    // If game is over, clean up
    if (result.gameOver) {
      setTimeout(() => {
        gameRooms.delete(gameRoom.id);
        console.log(`Game finished: ${gameRoom.id}, Winner: Player ${result.winner + 1}`);
      }, 10000); // Clean up after 10 seconds
    }
  });
  
  // Handle Kryptomon switching
  socket.on('switchKryptomon', (data) => {
    socket.emit('battleMove', {
      moveType: 'switchKryptomon',
      targetKryptomonIndex: data.kryptomonIndex
    });
  });
  
  // Handle chat messages
  socket.on('chatMessage', (data) => {
    const playerSession = playerSessions.get(socket.id);
    if (!playerSession || !playerSession.roomId) return;
    
    const gameRoom = gameRooms.get(playerSession.roomId);
    if (!gameRoom) return;
    
    // Broadcast message to room
    socket.to(gameRoom.id).emit('chatMessage', {
      username: playerSession.username,
      message: data.message,
      timestamp: Date.now()
    });
  });
  
  // Handle emoji reactions
  socket.on('emojiReaction', (data) => {
    const playerSession = playerSessions.get(socket.id);
    if (!playerSession || !playerSession.roomId) return;
    
    const gameRoom = gameRooms.get(playerSession.roomId);
    if (!gameRoom) return;
    
    // Broadcast emoji to opponent
    socket.to(gameRoom.id).emit('emojiReaction', {
      username: playerSession.username,
      emoji: data.emoji,
      timestamp: Date.now()
    });
  });
  
  // Handle surrender
  socket.on('surrender', () => {
    const playerSession = playerSessions.get(socket.id);
    if (!playerSession || !playerSession.roomId) return;
    
    const gameRoom = gameRooms.get(playerSession.roomId);
    if (!gameRoom || gameRoom.gameState !== 'active') return;
    
    const playerIndex = gameRoom.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    // End game with opponent as winner
    gameRoom.gameState = 'finished';
    gameRoom.winner = 1 - playerIndex;
    
    io.to(gameRoom.id).emit('gameEnd', {
      winner: gameRoom.winner,
      reason: 'surrender',
      gameRoom: getGameRoomState(gameRoom)
    });
    
    // Clean up
    setTimeout(() => {
      gameRooms.delete(gameRoom.id);
    }, 5000);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    const playerSession = playerSessions.get(socket.id);
    if (!playerSession) return;
    
    // Remove from waiting queue
    const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    // Handle game disconnection
    if (playerSession.roomId) {
      const gameRoom = gameRooms.get(playerSession.roomId);
      if (gameRoom && gameRoom.gameState === 'active') {
        const playerIndex = gameRoom.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
          // Notify opponent of disconnection
          socket.to(gameRoom.id).emit('opponentDisconnected', {
            disconnectedPlayer: playerIndex
          });
          
          // End game after 30 seconds if player doesn't reconnect
          setTimeout(() => {
            const currentGameRoom = gameRooms.get(playerSession.roomId);
            if (currentGameRoom && currentGameRoom.gameState === 'active') {
              currentGameRoom.gameState = 'finished';
              currentGameRoom.winner = 1 - playerIndex;
              
              io.to(gameRoom.id).emit('gameEnd', {
                winner: currentGameRoom.winner,
                reason: 'disconnection',
                gameRoom: getGameRoomState(currentGameRoom)
              });
              
              gameRooms.delete(gameRoom.id);
            }
          }, 30000);
        }
      }
    }
    
    playerSessions.delete(socket.id);
  });
  
  // Handle reconnection attempts
  socket.on('reconnect', (data) => {
    const { username, roomId } = data;
    
    if (roomId && gameRooms.has(roomId)) {
      const gameRoom = gameRooms.get(roomId);
      const playerIndex = gameRoom.players.findIndex(p => p.username === username);
      
      if (playerIndex !== -1) {
        // Update player session
        gameRoom.players[playerIndex].id = socket.id;
        gameRoom.players[playerIndex].connected = true;
        
        playerSessions.set(socket.id, {
          id: socket.id,
          username: username,
          roomId: roomId,
          connected: true
        });
        
        socket.join(roomId);
        
        // Send current game state
        socket.emit('gameReconnected', {
          gameRoom: getGameRoomState(gameRoom),
          yourIndex: playerIndex
        });
        
        // Notify opponent of reconnection
        socket.to(roomId).emit('opponentReconnected', {
          reconnectedPlayer: playerIndex
        });
        
        console.log(`Player ${username} reconnected to game ${roomId}`);
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeGames: gameRooms.size,
    waitingPlayers: waitingPlayers.length,
    connectedPlayers: playerSessions.size
  });
});

// Game statistics endpoint
app.get('/stats', (req, res) => {
  res.json({
    activeGames: gameRooms.size,
    waitingPlayers: waitingPlayers.length,
    connectedPlayers: playerSessions.size,
    totalKryptomonTypes: Object.keys(kryptomonData).length
  });
});

// Cleanup inactive games every 5 minutes
setInterval(() => {
  const now = Date.now();
  const inactiveThreshold = 10 * 60 * 1000; // 10 minutes
  
  for (const [roomId, gameRoom] of gameRooms.entries()) {
    if (now - gameRoom.gameStartTime > inactiveThreshold) {
      gameRooms.delete(roomId);
      console.log(`Cleaned up inactive game: ${roomId}`);
    }
  }
}, 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kryptomon Battle Arena server running on port ${PORT}`);
  console.log(`📱 Mobile-optimized backend ready!`);
  console.log(`🎮 Supported Kryptomon types: ${Object.keys(kryptomonData).length}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
