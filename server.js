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
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let waitingPlayers = [];
let activeGames = new Map();

// Kryptomon stats calculation
function calculateKryptomonStats(tokenId) {
  const tokenNum = parseInt(tokenId) || 0;
  
  let health = 100 + (tokenNum * 3) % 50;
  let attack = 15 + (tokenNum * 5) % 20;
  let defense = 10 + (tokenNum * 7) % 15;
  let speed = 12 + (tokenNum * 11) % 18;
  
  return {
    health: Math.min(health, 150),
    attack: Math.min(attack, 35),
    defense: Math.min(defense, 25),
    speed: Math.min(speed, 30)
  };
}

// Safe function to get Kryptomon data
function getKryptomonData(kryptomonTeam, index = 0) {
  if (!kryptomonTeam || !Array.isArray(kryptomonTeam) || kryptomonTeam.length === 0) {
    return {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'kryptomon1.png',
      stats: calculateKryptomonStats('978')
    };
  }
  
  const kryptomon = kryptomonTeam[index];
  
  if (!kryptomon) {
    const fallback = kryptomonTeam[0];
    return fallback?.nft || fallback || {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'kryptomon1.png',
      stats: calculateKryptomonStats('978')
    };
  }
  
  if (kryptomon.nft) {
    return {
      ...kryptomon.nft,
      stats: calculateKryptomonStats(kryptomon.nft.tokenId)
    };
  } else if (kryptomon.tokenId) {
    return {
      ...kryptomon,
      stats: calculateKryptomonStats(kryptomon.tokenId)
    };
  } else {
    return {
      tokenId: '978',
      name: 'Default Kryptomon',
      image: 'kryptomon1.png',
      stats: calculateKryptomonStats('978')
    };
  }
}

function getKryptomonTeamData(kryptomonTeam) {
  if (!kryptomonTeam || !Array.isArray(kryptomonTeam)) {
    return [];
  }
  
  return kryptomonTeam.map((kryptomon, index) => {
    return getKryptomonData(kryptomonTeam, index);
  });
}

// Critical hit calculation
function calculateCriticalHit() {
  return Math.random() < 0.2; // 20% critical hit chance
}

// Game logic functions (GELİŞTİRİLDİ)
function createGameState(player1, player2) {
  const p1ActiveKryptomon = getKryptomonData(player1.selectedKryptomon, 0);
  const p2ActiveKryptomon = getKryptomonData(player2.selectedKryptomon, 0);
  
  const p1Stats = p1ActiveKryptomon.stats || calculateKryptomonStats(p1ActiveKryptomon.tokenId);
  const p2Stats = p2ActiveKryptomon.stats || calculateKryptomonStats(p2ActiveKryptomon.tokenId);
  
  const p1Team = getKryptomonTeamData(player1.selectedKryptomon);
  const p2Team = getKryptomonTeamData(player2.selectedKryptomon);
  
  return {
    players: [player1, player2],
    gameData: [
      {
        health: p1Stats.health,
        maxHealth: p1Stats.health,
        mana: 0,
        maxMana: 100,
        attack: p1Stats.attack,
        defense: p1Stats.defense,
        activeKryptomon: 0,
        kryptomonTeam: p1Team,
        ultimateUsed: false,
        defending: false,
        defenseCooldown: 0, // YENİ
        defenseEffectTurns: 0, // YENİ
        walletAddress: player1.walletAddress,
        playerName: player1.playerName,
        hasUsedSwitch: false // YENİ
      },
      {
        health: p2Stats.health,
        maxHealth: p2Stats.health,
        mana: 0,
        maxMana: 100,
        attack: p2Stats.attack,
        defense: p2Stats.defense,
        activeKryptomon: 0,
        kryptomonTeam: p2Team,
        ultimateUsed: false,
        defending: false,
        defenseCooldown: 0, // YENİ
        defenseEffectTurns: 0, // YENİ
        walletAddress: player2.walletAddress,
        playerName: player2.playerName,
        hasUsedSwitch: false // YENİ
      }
    ],
    currentTurn: 0,
    gameActive: true,
    turnCount: 1,
    lastActivity: Date.now()
  };
}

function processMove(gameState, playerIndex, move, activeKryptomon) {
  console.log('Processing move:', { playerIndex, move, activeKryptomon });
  
  const player = gameState.gameData[playerIndex];
  const opponent = gameState.gameData[1 - playerIndex];
  
  gameState.lastActivity = Date.now();
  
  let moveResult = {
    damage: 0,
    isCritical: false,
    defenseActivated: false,
    manaGained: 0,
    target: playerIndex === 0 ? 'enemy' : 'player'
  };
  
  // Reset defending status at start of turn
  player.defending = false;
  
  // Handle defense cooldowns and effects
  if (player.defenseCooldown > 0) {
    player.defenseCooldown--;
  }
  if (player.defenseEffectTurns > 0) {
    player.defenseEffectTurns--;
  }
  if (opponent.defenseEffectTurns > 0) {
    opponent.defenseEffectTurns--;
  }
  
  // Reset switch usage per turn
  player.hasUsedSwitch = false;
  
  // Switch active Kryptomon if specified
  if (activeKryptomon !== undefined && 
      activeKryptomon >= 0 && activeKryptomon < 3 && 
      player.kryptomonTeam && player.kryptomonTeam.length > activeKryptomon &&
      activeKryptomon !== player.activeKryptomon &&
      !player.hasUsedSwitch) {
    
    player.activeKryptomon = activeKryptomon;
    player.hasUsedSwitch = true;
    const newKryptomonData = player.kryptomonTeam[activeKryptomon];
    
    if (newKryptomonData && newKryptomonData.tokenId) {
      const newStats = newKryptomonData.stats || calculateKryptomonStats(newKryptomonData.tokenId);
      player.health = newStats.health;
      player.maxHealth = newStats.health;
      player.attack = newStats.attack;
      player.defense = newStats.defense;
    }
  }
  
  switch (move) {
    case 'attack':
      // Attack: +3 mana, arttırılmış hasar (GELİŞTİRİLDİ)
      player.mana = Math.min(player.maxMana, player.mana + 3);
      moveResult.manaGained = 3;
      
      let attackDamage = Math.max(1, Math.floor(player.attack * 1.2) - (opponent.defenseEffectTurns > 0 ? opponent.defense * 2 : opponent.defense));
      
      const attackCritical = calculateCriticalHit();
      if (attackCritical) {
        attackDamage = Math.floor(attackDamage * 1.8);
        moveResult.isCritical = true;
      }
      
      // Defense mana bonus
      if (opponent.defenseEffectTurns > 0) {
        opponent.mana = Math.min(opponent.maxMana, opponent.mana + 3);
        moveResult.defenseActivated = true;
      }
      
      opponent.health = Math.max(0, opponent.health - attackDamage);
      moveResult.damage = attackDamage;
      break;
      
    case 'defend':
      // Defense: Cooldown kontrolü (GELİŞTİRİLDİ)
      if (player.defenseCooldown > 0) {
        console.log('Defense on cooldown!');
        return null; // Invalid move
      }
      
      player.defenseEffectTurns = 2; // 2 turn effect
      player.defenseCooldown = 4; // 4 turn cooldown
      player.health = Math.min(player.maxHealth, player.health + 5);
      break;
      
    case 'skill':
      if (player.mana >= 2) {
        player.mana -= 2;
        let skillDamage = Math.max(1, Math.floor(player.attack * 1.5) - (opponent.defenseEffectTurns > 0 ? opponent.defense * 2 : opponent.defense));
        
        const skillCritical = calculateCriticalHit();
        if (skillCritical) {
          skillDamage = Math.floor(skillDamage * 1.8);
          moveResult.isCritical = true;
        }
        
        // Defense mana bonus
        if (opponent.defenseEffectTurns > 0) {
          opponent.mana = Math.min(opponent.maxMana, opponent.mana + 3);
          moveResult.defenseActivated = true;
        }
        
        opponent.health = Math.max(0, opponent.health - skillDamage);
        moveResult.damage = skillDamage;
      }
      break;
      
    case 'ultimate':
      if (player.mana >= 6) {
        player.mana -= 6;
        let ultimateDamage = Math.max(1, Math.floor(player.attack * 2.5) - (opponent.defenseEffectTurns > 0 ? opponent.defense * 2 : opponent.defense));
        
        const ultimateCritical = calculateCriticalHit();
        if (ultimateCritical) {
          ultimateDamage = Math.floor(ultimateDamage * 1.8);
          moveResult.isCritical = true;
        }
        
        // Defense mana bonus (ultimate gives +4)
        if (opponent.defenseEffectTurns > 0) {
          opponent.mana = Math.min(opponent.maxMana, opponent.mana + 4);
          moveResult.defenseActivated = true;
        }
        
        opponent.health = Math.max(0, opponent.health - ultimateDamage);
        moveResult.damage = ultimateDamage;
      }
      break;
      
    case 'surrender':
      gameState.gameActive = false;
      return 1 - playerIndex; // Opponent wins
      
    case 'skip':
      // Just skip turn
      break;
      
    default:
      console.log('Unknown move:', move);
      break;
  }
  
  // Check for game over
  if (opponent.health <= 0) {
    gameState.gameActive = false;
    return playerIndex; // Winner
  }
  
  // Switch turns
  gameState.currentTurn = 1 - gameState.currentTurn;
  gameState.turnCount++;
  
  // Store move result for clients
  gameState.lastMoveResult = moveResult;
  
  return null; // No winner yet
}

// Socket.io connection handling (GÜNCELLENENE)
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('playerMove', (data) => {
    try {
      console.log('Received player move:', {
        move: data.move,
        walletAddress: data.walletAddress,
        playerName: data.playerName,
        isGuestMode: data.isGuestMode,
        kryptomonCount: data.selectedKryptomon ? data.selectedKryptomon.length : 0,
        activeKryptomon: data.activeKryptomon
      });
      
      if (data.move === 'join') {
        const playerData = {
          socketId: socket.id,
          walletAddress: data.walletAddress || 'unknown',
          selectedKryptomon: data.selectedKryptomon || [],
          playerName: data.playerName || 'Anonymous',
          isGuestMode: data.isGuestMode || false
        };

        waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
        waitingPlayers.push(playerData);
        
        console.log(`Player ${socket.id} (${playerData.playerName}) joined queue. Guest: ${playerData.isGuestMode}. Queue length: ${waitingPlayers.length}`);

        if (waitingPlayers.length >= 2) {
          const player1 = waitingPlayers.shift();
          const player2 = waitingPlayers.shift();
          
          const gameId = `${player1.socketId}-${player2.socketId}`;
          const gameState = createGameState(player1, player2);
          
          activeGames.set(gameId, gameState);
          
          const p1Socket = io.sockets.sockets.get(player1.socketId);
          const p2Socket = io.sockets.sockets.get(player2.socketId);
          
          if (p1Socket && p2Socket) {
            p1Socket.join(gameId);
            p2Socket.join(gameId);
            
            const p1ActiveKryptomon = gameState.gameData[0].kryptomonTeam[0];
            const p2ActiveKryptomon = gameState.gameData[1].kryptomonTeam[0];
            
            // Send game start data with player names
            p1Socket.emit('gameStart', {
              yourIndex: 0,
              you: gameState.gameData[0],
              enemy: gameState.gameData[1],
              yourTurn: gameState.currentTurn === 0,
              enemyNFT: p2ActiveKryptomon,
              yourNFT: p1ActiveKryptomon,
              enemyKryptomonTeam: gameState.gameData[1].kryptomonTeam,
              yourKryptomonTeam: gameState.gameData[0].kryptomonTeam,
              enemyPlayerName: player2.playerName
            });
            
            p2Socket.emit('gameStart', {
              yourIndex: 1,
              you: gameState.gameData[1],
              enemy: gameState.gameData[0],
              yourTurn: gameState.currentTurn === 1,
              enemyNFT: p1ActiveKryptomon,
              yourNFT: p2ActiveKryptomon,
              enemyKryptomonTeam: gameState.gameData[0].kryptomonTeam,
              yourKryptomonTeam: gameState.gameData[1].kryptomonTeam,
              enemyPlayerName: player1.playerName
            });
            
            console.log(`Game started: ${gameId} - ${player1.playerName} vs ${player2.playerName}`);
          }
        } else {
          socket.emit('waitingForOpponent');
        }
        
      } else {
        // Game move
        const gameId = findGameBySocket(socket.id);
        if (!gameId) {
          socket.emit('errorMessage', 'Game not found');
          return;
        }
        
        const gameState = activeGames.get(gameId);
        if (!gameState || !gameState.gameActive) {
          socket.emit('errorMessage', 'Game not active');
          return;
        }
        
        const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) {
          socket.emit('errorMessage', 'Player not found in game');
          return;
        }
        
        // Allow kryptomon switching anytime on your turn, but other moves only on your turn
        if (gameState.currentTurn !== playerIndex && data.move !== 'switch' && data.activeKryptomon === undefined) {
          socket.emit('errorMessage', 'Not your turn');
          return;
        }
        
        // Check switch usage limit
        if (data.move === 'switch' && gameState.gameData[playerIndex].hasUsedSwitch) {
          socket.emit('errorMessage', 'Already switched this turn');
          return;
        }
        
        const winner = processMove(gameState, playerIndex, data.move, data.activeKryptomon);
        
        if (winner !== null) {
          const winnerSocket = io.sockets.sockets.get(gameState.players[winner].socketId);
          const loserSocket = io.sockets.sockets.get(gameState.players[1 - winner].socketId);
          
          if (winnerSocket) {
            winnerSocket.emit('gameOver', { 
              winner: 'player',
              message: 'Victory! You defeated your opponent!'
            });
          }
          
          if (loserSocket) {
            loserSocket.emit('gameOver', { 
              winner: 'opponent',
              message: 'Defeat! Your opponent was victorious!'
            });
          }
          
          activeGames.delete(gameId);
          console.log(`Game ended: ${gameId}, Winner: Player ${winner + 1}`);
          
        } else {
          // Continue game
          const p1Socket = io.sockets.sockets.get(gameState.players[0].socketId);
          const p2Socket = io.sockets.sockets.get(gameState.players[1].socketId);
          
          if (p1Socket && p2Socket) {
            const p1ActiveKryptomon = gameState.gameData[0].kryptomonTeam[gameState.gameData[0].activeKryptomon];
            const p2ActiveKryptomon = gameState.gameData[1].kryptomonTeam[gameState.gameData[1].activeKryptomon];
            
            p1Socket.emit('moveConfirmed', {
              you: gameState.gameData[0],
              enemy: gameState.gameData[1],
              yourTurn: gameState.currentTurn === 0,
              moveResult: gameState.lastMoveResult,
              yourActiveKryptomon: p1ActiveKryptomon,
              enemyActiveKryptomon: p2ActiveKryptomon
            });
            
            p2Socket.emit('moveConfirmed', {
              you: gameState.gameData[1],
              enemy: gameState.gameData[0],
              yourTurn: gameState.currentTurn === 1,
              moveResult: gameState.lastMoveResult,
              yourActiveKryptomon: p2ActiveKryptomon,
              enemyActiveKryptomon: p1ActiveKryptomon
            });
          }
        }
      }
      
    } catch (error) {
      console.error('Error processing player move:', error);
      socket.emit('errorMessage', 'Server error occurred');
    }
  });

  socket.on('sendEmoji', (data) => {
    try {
      const gameId = findGameBySocket(socket.id);
      if (gameId) {
        const gameState = activeGames.get(gameId);
        if (gameState) {
          const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
          const opponentSocket = io.sockets.sockets.get(gameState.players[1 - playerIndex].socketId);
          
          if (opponentSocket) {
            opponentSocket.emit('emojiReceived', { emoji: data.emoji });
          }
        }
      }
    } catch (error) {
      console.error('Error sending emoji:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    // Remove from waiting players
    waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    
    // Handle active game disconnection
    const gameId = findGameBySocket(socket.id);
    if (gameId) {
      const gameState = activeGames.get(gameId);
      if (gameState) {
        const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
        const opponentSocket = io.sockets.sockets.get(gameState.players[1 - playerIndex].socketId);
        
        if (opponentSocket) {
          opponentSocket.emit('gameOver', { 
            winner: 'player',
            message: 'Victory! Your opponent disconnected!'
          });
        }
        
        activeGames.delete(gameId);
        console.log(`Game ended due to disconnection: ${gameId}`);
      }
    }
  });
});

function findGameBySocket(socketId) {
  for (const [gameId, gameState] of activeGames) {
    if (gameState.players.some(p => p.socketId === socketId)) {
      return gameId;
    }
  }
  return null;
}

// Cleanup inactive games periodically
setInterval(() => {
  const now = Date.now();
  const inactiveGames = [];
  
  for (const [gameId, gameState] of activeGames) {
    if (now - gameState.lastActivity > 5 * 60 * 1000) { // 5 minutes
      inactiveGames.push(gameId);
    }
  }
  
  inactiveGames.forEach(gameId => {
    console.log(`Cleaning up inactive game: ${gameId}`);
    activeGames.delete(gameId);
  });
}, 60000); // Check every minute

server.listen(PORT, () => {
  console.log(`🚀 Kryptomon Battle Arena server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
});
