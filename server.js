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

// In-memory user database
const users = new Map();

// Game states
let waitingPlayer = null;
const games = new Map(); // roomId -> gameState
const playerToGame = new Map(); // playerId -> roomId

// Basic user authentication
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  
  // Simple validation
  if (!username || !password) {
    return res.json({ success: false, message: 'Username and password are required' });
  }
  
  // Check if username already exists
  if (users.has(username)) {
    return res.json({ success: false, message: 'Username already exists' });
  }
  
  // Store user (in production, you would hash the password)
  users.set(username, { username, password });
  
  res.json({ success: true, message: 'Registration successful' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Simple validation
  if (!username || !password) {
    return res.json({ success: false, message: 'Username and password are required' });
  }
  
  // Check if user exists and password matches
  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.json({ success: false, message: 'Invalid username or password' });
  }
  
  // Return user info (without password)
  res.json({ 
    success: true, 
    message: 'Login successful',
    user: { username: user.username }
  });
});

// Create a new game
function createNewGame(player1Id, player2Id, player1Username, player2Username) {
  // Random initial health (200-250)
  const initialHealth = Math.floor(Math.random() * 51) + 200;
  
  return {
    players: [player1Id, player2Id],
    playerUsernames: [player1Username, player2Username],
    turnIndex: 0, // First player's turn
    playersData: [
      { health: initialHealth, mana: 100, hydraActive: 0, hydraUsed: false }, // First player
      { health: initialHealth, mana: 100, hydraActive: 0, hydraUsed: false }  // Second player
    ],
    gameOver: false,
    winner: null,
    initialHealth: initialHealth
  };
}

// Check if move is valid
function canPerformMove(move, playerData) {
  switch (move) {
    case 'attack': return playerData.mana >= 10;
    case 'defend': return playerData.mana >= 5;
    case 'skill': return playerData.mana >= 20;
    case 'mana': return true;
    case 'hydra': return playerData.mana >= 30 && !playerData.hydraUsed;
    default: return false;
  }
}

// Apply move effects
function applyMove(move, currentPlayerData, otherPlayerData) {
  switch (move) {
    case 'attack':
      currentPlayerData.mana -= 10;
      otherPlayerData.health -= 15;
      break;
    case 'defend':
      currentPlayerData.mana -= 5;
      currentPlayerData.health += 10;
      break;
    case 'skill':
      currentPlayerData.mana -= 20;
      otherPlayerData.health -= 30;
      break;
    case 'mana':
      currentPlayerData.mana += 15;
      if (currentPlayerData.mana > 100) currentPlayerData.mana = 100;
      break;
    case 'hydra':
      currentPlayerData.mana -= 30;
      otherPlayerData.health -= 10; // Initial effect
      currentPlayerData.hydraActive = 3; // Active for 3 more turns
      currentPlayerData.hydraUsed = true; // Can only be used once per game
      break;
  }
  
  // Apply HYDRA effect if active
  if (currentPlayerData.hydraActive > 0) {
    otherPlayerData.health -= 8; // 8 damage per turn
    currentPlayerData.hydraActive -= 1;
  }
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
  socket.username = null;

  // Listen for player moves
  socket.on('playerMove', (data) => {
    // Join game
    if (data.move === 'join') {
      // Store username from client data
      socket.username = data.username || "Player";
      console.log(`Player ${socket.id} joined with username: ${socket.username}`);
      
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
        
        const waitingPlayerUsername = waitingPlayerSocket.username || "Player 1";
        const currentPlayerUsername = socket.username || "Player 2";
        
        const game = createNewGame(waitingPlayer, socket.id, waitingPlayerUsername, currentPlayerUsername);
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
        
        // Random profile pics
        const playerAvatars = [
          'you.jpg',
          'you1.jpg',
          'you2.jpg'
        ];
        const enemyAvatars = [
          'enemy.jpg',
          'enemy2.jpg',
          'enemy3.jpg'
        ];
        
        const playerAvatarIndex = Math.floor(Math.random() * playerAvatars.length);
        const enemyAvatarIndex = Math.floor(Math.random() * enemyAvatars.length);
        
        // Send game start info to both players
        io.to(waitingPlayer).emit('gameStart', {
          yourIndex: 0,
          you: game.playersData[0],
          enemy: game.playersData[1],
          initialHealth: game.initialHealth,
          playerAvatar: playerAvatars[playerAvatarIndex],
          enemyAvatar: enemyAvatars[enemyAvatarIndex],
          enemyUsername: currentPlayerUsername
        });
        
        io.to(socket.id).emit('gameStart', {
          yourIndex: 1,
          you: game.playersData[1],
          enemy: game.playersData[0],
          initialHealth: game.initialHealth,
          playerAvatar: enemyAvatars[enemyAvatarIndex],
          enemyAvatar: playerAvatars[playerAvatarIndex],
          enemyUsername: waitingPlayerUsername
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
    
    if (!canPerformMove(data.move, currentPlayerData)) {
      socket.emit('errorMessage', 'Not enough mana or invalid move.');
      return;
    }
    
    // Apply the move
    applyMove(data.move, currentPlayerData, otherPlayerData);
    
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
      move: data.move
    });
    
    // Send move info to other player
    const otherPlayerId = game.players[otherPlayerIndex];
    io.to(otherPlayerId).emit('enemyMove', {
      you: otherPlayerData,
      enemy: currentPlayerData,
      move: data.move
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

// Serve index.html at root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route handler for pve.html (needed for the back to menu button)
app.get('/pve.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
