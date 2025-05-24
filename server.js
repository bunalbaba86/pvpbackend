const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Express and Socket.io setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static files
app.use(express.static(path.join(__dirname, '.')));
app.use(express.json());

// Port configuration
const PORT = process.env.PORT || 8080;

// Game states
let waitingPlayer = null;
const games = new Map(); // roomId -> gameState
const playerToGame = new Map(); // playerId -> roomId

// NFT Contract Address
const NFT_CONTRACT_ADDRESS = "0xdfdb045e4300d04ec32058756ec2453409360c5b";

// Wallet address validation
function isValidWalletAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// NFT stats validation
function validateNFTStats(stats) {
  return stats && 
         typeof stats.health === 'number' && stats.health > 0 && stats.health <= 300 &&
         typeof stats.attack === 'number' && stats.attack > 0 && stats.attack <= 40 &&
         typeof stats.defense === 'number' && stats.defense >= 0 && stats.defense <= 20 &&
         typeof stats.speed === 'number' && stats.speed > 0 && stats.speed <= 30;
}

// Create a new game with NFT data
function createNewGame(player1Id, player2Id, player1WalletAddress, player2WalletAddress, player1NFT, player2NFT) {
  return {
    players: [player1Id, player2Id],
    playerWalletAddresses: [player1WalletAddress, player2WalletAddress],
    playerNFTData: [player1NFT, player2NFT],
    turnIndex: 0, // First player's turn
    playersData: [
      { 
        health: player1NFT.stats.health, 
        maxHealth: player1NFT.stats.health,
        mana: 100, 
        hydraActive: 0, 
        hydraUsed: false 
      },
      { 
        health: player2NFT.stats.health, 
        maxHealth: player2NFT.stats.health,
        mana: 100, 
        hydraActive: 0, 
        hydraUsed: false 
      }
    ],
    gameOver: false,
    winner: null
  };
}

// Calculate damage based on NFT stats
function calculateDamage(attackerStats, defenderStats, moveType) {
  let baseDamage = 0;
  
  switch (moveType) {
    case 'attack':
      baseDamage = attackerStats.attack;
      break;
    case 'skill':
      baseDamage = attackerStats.attack * 2;
      break;
    case 'hydra':
      baseDamage = attackerStats.attack + 10;
      break;
  }
  
  // Defense reduction
  const defenseReduction = Math.floor(defenderStats.defense / 2);
  const finalDamage = Math.max(1, baseDamage - defenseReduction);
  
  return finalDamage;
}

// Calculate heal amount based on NFT stats
function calculateHeal(nftStats) {
  return Math.floor(nftStats.defense * 2) + 5;
}

// Calculate mana cost based on NFT stats
function calculateManaCost(nftStats, moveType) {
  switch (moveType) {
    case 'attack':
      return Math.max(5, 15 - Math.floor(nftStats.speed / 10));
    case 'defend':
      return Math.max(3, 8 - Math.floor(nftStats.defense / 8));
    case 'skill':
      return Math.max(10, 25 - Math.floor(nftStats.attack / 8));
    case 'hydra':
      return Math.max(20, 35 - Math.floor(nftStats.attack / 5));
    default:
      return 0;
  }
}

// Check if move is valid with NFT stats
function canPerformMove(move, playerData, nftStats) {
  const manaCost = calculateManaCost(nftStats, move);
  
  switch (move) {
    case 'attack':
    case 'defend':
    case 'skill':
      return playerData.mana >= manaCost;
    case 'mana':
      return true;
    case 'hydra':
      return playerData.mana >= manaCost && !playerData.hydraUsed;
    default:
      return false;
  }
}

// Apply move effects with NFT stats
function applyMove(move, currentPlayerData, otherPlayerData, currentNFTStats, otherNFTStats) {
  const manaCost = calculateManaCost(currentNFTStats, move);
  let damageDealt = 0;
  let healAmount = 0;
  
  switch (move) {
    case 'attack':
      currentPlayerData.mana -= manaCost;
      damageDealt = calculateDamage(currentNFTStats, otherNFTStats, 'attack');
      otherPlayerData.health -= damageDealt;
      break;
    case 'defend':
      currentPlayerData.mana -= manaCost;
      healAmount = calculateHeal(currentNFTStats);
      currentPlayerData.health = Math.min(currentPlayerData.maxHealth, currentPlayerData.health + healAmount);
      break;
    case 'skill':
      currentPlayerData.mana -= manaCost;
      damageDealt = calculateDamage(currentNFTStats, otherNFTStats, 'skill');
      otherPlayerData.health -= damageDealt;
      break;
    case 'mana':
      const manaRestore = 15 + Math.floor(currentNFTStats.speed / 10);
      currentPlayerData.mana = Math.min(100, currentPlayerData.mana + manaRestore);
      break;
    case 'hydra':
      currentPlayerData.mana -= manaCost;
      damageDealt = calculateDamage(currentNFTStats, otherNFTStats, 'hydra');
      otherPlayerData.health -= damageDealt;
      currentPlayerData.hydraActive = 3;
      currentPlayerData.hydraUsed = true;
      break;
  }
  
  // Apply HYDRA effect if active
  if (currentPlayerData.hydraActive > 0) {
    const hydraDamage = Math.floor(currentNFTStats.attack / 2) + 5;
    otherPlayerData.health -= hydraDamage;
    currentPlayerData.hydraActive -= 1;
    damageDealt += hydraDamage;
  }
  
  return { damageDealt, healAmount };
}

// Check if game is over
function checkGameOver(game) {
  if (game.playersData[0].health <= 0) {
    game.gameOver = true;
    return 1; // Second player won
  }
  if (game.playersData[1].health <= 0) {
    game.gameOver = true;
    return 0; // First player won
  }
  return -1; // Game continues
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Store player information
  socket.playerIndex = null;
  socket.roomId = null;
  socket.walletAddress = null;
  socket.nftData = null;

  // Listen for player moves
  socket.on('playerMove', (data) => {
    // Join game
    if (data.move === 'join') {
      // Validate wallet address
      if (!data.walletAddress || !isValidWalletAddress(data.walletAddress)) {
        socket.emit('errorMessage', 'Invalid wallet address.');
        return;
      }
      
      // Validate NFT data
      if (!data.nftData || !validateNFTStats(data.nftData.stats)) {
        socket.emit('errorMessage', 'Invalid NFT data.');
        return;
      }
      
      // Store player data
      socket.walletAddress = data.walletAddress;
      socket.nftData = data.nftData;
      
      console.log(`Player ${socket.id} joined with wallet: ${socket.walletAddress} and NFT: ${socket.nftData.name}`);
      
      // If player is already in a game, remove from old game
      if (socket.roomId) {
        const oldGameId = socket.roomId;
        const oldGame = games.get(oldGameId);
        
        if (oldGame) {
          // Notify other player
          const otherPlayerId = oldGame.players.find(id => id !== socket.id);
          if (otherPlayerId) {
            io.to(otherPlayerId).emit('gameOver', { winner: 'player' });
          }
          
          // Clean up game
          games.delete(oldGameId);
          oldGame.players.forEach(id => playerToGame.delete(id));
        }
        
        socket.leave(oldGameId);
        socket.roomId = null;
        socket.playerIndex = null;
      }
      
      // Check for waiting player
      if (waitingPlayer === null) {
        waitingPlayer = socket.id;
        socket.emit('waitingForOpponent');
      } else {
        // Two players matched, create new game
        const roomId = `room_${Date.now()}`;
        const waitingPlayerSocket = io.sockets.sockets.get(waitingPlayer);
        
        if (!waitingPlayerSocket) {
          // Waiting player disconnected
          waitingPlayer = socket.id;
          socket.emit('waitingForOpponent');
          return;
        }
        
        const game = createNewGame(
          waitingPlayer, 
          socket.id, 
          waitingPlayerSocket.walletAddress, 
          socket.walletAddress,
          waitingPlayerSocket.nftData,
          socket.nftData
        );
        games.set(roomId, game);
        
        // Add players to room
        waitingPlayerSocket.join(roomId);
        socket.join(roomId);
        
        // Update player info
        waitingPlayerSocket.playerIndex = 0;
        waitingPlayerSocket.roomId = roomId;
        socket.playerIndex = 1;
        socket.roomId = roomId;
        
        // Map players to game
        playerToGame.set(waitingPlayer, roomId);
        playerToGame.set(socket.id, roomId);
        
        // Send game start info to both players
        io.to(waitingPlayer).emit('gameStart', {
          yourIndex: 0,
          you: game.playersData[0],
          enemy: game.playersData[1],
          enemyWalletAddress: socket.walletAddress,
          enemyNFTData: socket.nftData
        });
        
        io.to(socket.id).emit('gameStart', {
          yourIndex: 1,
          you: game.playersData[1],
          enemy: game.playersData[0],
          enemyWalletAddress: waitingPlayerSocket.walletAddress,
          enemyNFTData: waitingPlayerSocket.nftData
        });
        
        // Clear waiting player
        waitingPlayer = null;
      }
      
      return; // join handling complete
    }
    
    // Regular game move
    const roomId = socket.roomId;
    const playerIndex = socket.playerIndex;
    
    if (!roomId || playerIndex === null) {
      socket.emit('errorMessage', 'You are not in a game room.');
      return;
    }
    
    const game = games.get(roomId);
    if (!game || game.gameOver) {
      socket.emit('errorMessage', 'Game is not active.');
      return;
    }
    
    if (playerIndex !== game.turnIndex) {
      socket.emit('errorMessage', 'Not your turn.');
      return;
    }
    
    const currentPlayerData = game.playersData[playerIndex];
    const otherPlayerIndex = 1 - playerIndex;
    const otherPlayerData = game.playersData[otherPlayerIndex];
    const currentNFTStats = game.playerNFTData[playerIndex].stats;
    const otherNFTStats = game.playerNFTData[otherPlayerIndex].stats;
    
    // Use provided NFT stats or default to stored ones
    const moveNFTStats = data.nftStats || currentNFTStats;
    
    if (!canPerformMove(data.move, currentPlayerData, moveNFTStats)) {
      socket.emit('errorMessage', 'Not enough mana or invalid move.');
      return;
    }
    
    // Apply the move
    const moveResult = applyMove(data.move, currentPlayerData, otherPlayerData, moveNFTStats, otherNFTStats);
    
    // Ensure health is not negative
    currentPlayerData.health = Math.max(0, currentPlayerData.health);
    otherPlayerData.health = Math.max(0, otherPlayerData.health);
    
    // Check for game over
    const winnerIndex = checkGameOver(game);
    
    if (winnerIndex !== -1) {
      // Game over, notify players
      io.to(roomId).emit('gameOver', {
        winner: winnerIndex === playerIndex ? 'player' : 'enemy'
      });
      return;
    }
    
    // Switch turns
    game.turnIndex = otherPlayerIndex;
    
    // Confirm move to current player
    socket.emit('moveConfirmed', {
      you: currentPlayerData,
      enemy: otherPlayerData,
      move: data.move,
      damageDealt: moveResult.damageDealt,
      healAmount: moveResult.healAmount
    });
    
    // Send move info to other player
    const otherPlayerId = game.players[otherPlayerIndex];
    io.to(otherPlayerId).emit('enemyMove', {
      you: otherPlayerData,
      enemy: currentPlayerData,
      move: data.move,
      damageDealt: moveResult.damageDealt,
      healAmount: moveResult.healAmount
    });
  });
  
  // Handle chat messages
  socket.on('chatMessage', (data) => {
    if (!socket.roomId || socket.playerIndex === null) return;
    
    // Trim message to max 20 chars
    const trimmedMessage = data.message.substring(0, 20);
    
    // Send message to other player
    socket.to(socket.roomId).emit('chatMessage', {
      message: trimmedMessage,
      fromIndex: socket.playerIndex
    });
  });
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Was this the waiting player?
    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }
    
    // Was player in a game?
    const roomId = socket.roomId;
    if (roomId && games.has(roomId)) {
      const game = games.get(roomId);
      
      // Notify other player
      const otherPlayerId = game.players.find(id => id !== socket.id);
      if (otherPlayerId) {
        io.to(otherPlayerId).emit('gameOver', { winner: 'player' });
      }
      
      // Clean up game
      games.delete(roomId);
      game.players.forEach(id => playerToGame.delete(id));
    }
  });
});

// API endpoint to validate NFT ownership (optional)
app.post('/api/validate-nft', async (req, res) => {
  try {
    const { walletAddress, tokenId } = req.body;
    
    if (!isValidWalletAddress(walletAddress)) {
      return res.json({ valid: false, message: 'Invalid wallet address' });
    }
    
    // Here you could add actual NFT ownership validation
    // For now, we'll just return true
    res.json({ valid: true, message: 'NFT ownership validated' });
  } catch (error) {
    console.error('NFT validation error:', error);
    res.json({ valid: false, message: 'Validation failed' });
  }
});

// Serve index.html at root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`NFT PvP Game Server running on port ${PORT}`);
  console.log(`Supporting NFT Contract: ${NFT_CONTRACT_ADDRESS}`);
});
