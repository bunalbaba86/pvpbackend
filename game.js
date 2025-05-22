// Check if user is logged in, if not redirect to login page
if (!isLoggedIn()) {
  window.location.href = 'login.html';
}

// Get current user data
const currentUser = getCurrentUser();

// Socket.io connection
let socket;
let useLocalMode = false;
let localGameInstance = null;

// Try to connect to the backend server first
try {
  // Use the custom domain for backend connection
  socket = io("https://backend.yourgame.com", {
    withCredentials: true,
    timeout: 5000, // 5 second timeout
  });
  
  // Handle connection errors
  socket.on('connect_error', function(err) {
    console.log('Connection error:', err);
    switchToLocalMode();
  });
  
  socket.on('connect_timeout', function() {
    console.log('Connection timeout');
    switchToLocalMode();
  });
  
  // Switch to local mode if connection not established within 5 seconds
  setTimeout(function() {
    if (!socket.connected) {
      console.log('Timeout: Connection not established in 5 seconds');
      switchToLocalMode();
    }
  }, 5000);
} catch (e) {
  console.log('Error setting up Socket.io connection:', e);
  switchToLocalMode();
}

// Function to switch to local mode
function switchToLocalMode() {
  if (useLocalMode) return; // Already in local mode
  
  useLocalMode = true;
  console.log('Switching to local mode...');
  
  // Load local game simulation
  const script = document.createElement('script');
  script.src = 'local_game.js';
  script.onload = function() {
    if (currentUser) {
      const username = currentUser.username || 'Player';
      localGameInstance = window.createLocalGame(username);
      
      // Set up local game event handlers
      setupLocalGameEvents(localGameInstance);
      
      console.log('Local game simulation started');
    }
  };
  document.body.appendChild(script);
}

// Set up local game event listeners
function setupLocalGameEvents(game) {
  game.on('waitingForOpponent', function(data) {
    handleWaitingForOpponent();
  });
  
  game.on('gameStart', function(data) {
    handleGameStart(data);
  });
  
  game.on('moveConfirmed', function(data) {
    handleMoveConfirmed(data);
  });
  
  game.on('enemyMove', function(data) {
    handleEnemyMove(data);
  });
  
  game.on('gameOver', function(data) {
    handleGameOver(data);
  });
  
  game.on('chatMessage', function(data) {
    handleChatMessage(data);
  });
}

// Function to emit events either to socket.io or local game
function emitEvent(event, data) {
  if (useLocalMode && localGameInstance) {
    if (event === 'move') {
      localGameInstance.move(data);
    } else if (event === 'joinGame') {
      // Already started in local mode
    } else if (event === 'chatMessage') {
      localGameInstance.chatMessage(data.message);
    }
  } else if (socket && socket.connected) {
    socket.emit(event, data);
  }
}

// Game elements
const youHealthBar = document.getElementById('you-health');
const youManaBar = document.getElementById('you-mana');
const youHealthLabel = document.getElementById('you-health-label');
const youManaLabel = document.getElementById('you-mana-label');
const playerAvatar = document.getElementById('player-avatar');
const yourUsername = document.getElementById('your-username');

const enemyHealthBar = document.getElementById('enemy-health');
const enemyManaBar = document.getElementById('enemy-mana');
const enemyHealthLabel = document.getElementById('enemy-health-label');
const enemyManaLabel = document.getElementById('enemy-mana-label');
const enemyAvatar = document.getElementById('enemy-avatar');
const enemyUsername = document.getElementById('enemy-username');

const statusDiv = document.getElementById('status');
const victoryMessage = document.getElementById('victory-message');

const backToMenuBtn = document.getElementById('back-to-menu-btn');
const playAgainBtn = document.getElementById('play-again-btn');

const attackBtn = document.getElementById('attack-btn');
const defendBtn = document.getElementById('defend-btn');
const skillBtn = document.getElementById('skill-btn');
const manaBtn = document.getElementById('mana-btn');
const hydraBtn = document.getElementById('hydra-btn');

// Chat elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const charCount = document.getElementById('char-count');

// Set player username
yourUsername.textContent = currentUser.username;

let yourIndex = null;
let yourData = null;
let enemyData = null;
let yourTurn = false;
let gameActive = false;
let initialHealth = 200;
let enemyName = "Enemy";

// Update health and mana bars
function updateBars() {
  if(!yourData || !enemyData) return;

  // Health bar update
  const yourHealthPercent = (yourData.health / initialHealth) * 100;
  const enemyHealthPercent = (enemyData.health / initialHealth) * 100;
  
  youHealthBar.style.width = yourHealthPercent + '%';
  enemyHealthBar.style.width = enemyHealthPercent + '%';

  youManaBar.style.width = (yourData.mana / 100 * 100) + '%';
  enemyManaBar.style.width = (enemyData.mana / 100 * 100) + '%';

  youHealthLabel.textContent = `Health: ${yourData.health}`;
  enemyHealthLabel.textContent = `Health: ${enemyData.health}`;

  youManaLabel.textContent = `Mana: ${yourData.mana}`;
  enemyManaLabel.textContent = `Mana: ${enemyData.mana}`;
  
  // HYDRA effect update
  if (yourData.hydraActive > 0) {
    document.querySelector('#you .character').classList.add('hydra-active');
  } else {
    document.querySelector('#you .character').classList.remove('hydra-active');
  }
  
  if (enemyData.hydraActive > 0) {
    document.querySelector('#enemy .character').classList.add('hydra-active');
  } else {
    document.querySelector('#enemy .character').classList.remove('hydra-active');
  }
}

// Update button states
function updateButtonStatus() {
  const disabled = !yourTurn || !gameActive;
  
  attackBtn.disabled = disabled || (yourData && yourData.mana < 10);
  defendBtn.disabled = disabled || (yourData && yourData.mana < 5);
  skillBtn.disabled = disabled || (yourData && yourData.mana < 20);
  hydraBtn.disabled = disabled || (yourData && yourData.mana < 30) || (yourData && yourData.hydraUsed);
  manaBtn.disabled = disabled;
}

function setButtonsDisabled(disabled) {
  gameActive = !disabled;
  updateButtonStatus();
}

function setStatus(text) {
  statusDiv.textContent = text;
}

function endGame() {
  gameActive = false;
  setButtonsDisabled(true);
}

// Show damage/heal animations
function showDamageNumber(target, amount, type = 'damage') {
  const element = document.createElement('div');
  let className, prefix = '';
  
  if (type === 'damage') {
    className = 'damage-number';
    prefix = '-';
  } else if (type === 'heal') {
    className = 'heal-number';
    prefix = '+';
  } else if (type === 'mana') {
    className = 'mana-number';
    prefix = '+';
  }
  
  element.className = className;
  element.textContent = prefix + amount;
  
  // Position randomly near the character
  const targetRect = target.getBoundingClientRect();
  const randomX = Math.random() * 60 - 30;
  const randomY = Math.random() * 20 - 30;
  
  element.style.left = (targetRect.width / 2 + randomX) + 'px';
  element.style.top = (targetRect.height / 2 + randomY) + 'px';
  
  target.appendChild(element);
  
  // Add shake animation to the character if it's damage
  if (type === 'damage') {
    target.querySelector('.character').classList.add('shake-animation');
    setTimeout(() => {
      target.querySelector('.character').classList.remove('shake-animation');
    }, 500);
  }
  
  // Remove the element after animation completes
  setTimeout(() => {
    if (element.parentNode === target) {
      target.removeChild(element);
    }
  }, 800);
}

// Add chat message
function addChatMessage(message, sender) {
  const messageElement = document.createElement('div');
  
  if (sender === 'system') {
    messageElement.className = 'chat-message system';
    messageElement.textContent = message;
  } else if (sender === 'you') {
    messageElement.className = 'chat-message you';
    messageElement.textContent = `${currentUser.username}: ${message}`;
  } else if (sender === 'enemy') {
    messageElement.className = 'chat-message enemy';
    messageElement.textContent = `${enemyName}: ${message}`;
  }
  
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Event handler functions
function handleConnect() {
  console.log('Connected to server');
  
  // Join game queue
  emitEvent('joinGame', { username: currentUser.username });
  
  setStatus('Waiting for an opponent...');
}

function handleDisconnect() {
  console.log('Disconnected from server');
  setStatus('Disconnected from server. Please refresh.');
  setButtonsDisabled(true);
}

function handleWaitingForOpponent() {
  setStatus('Waiting for an opponent...');
  addChatMessage('Waiting for an opponent to join...', 'system');
}

function handleGameStart(data) {
  yourIndex = data.yourIndex;
  yourData = data.players[yourIndex];
  enemyData = data.players[1 - yourIndex];
  initialHealth = data.initialHealth;
  
  // Set player avatars - using the specifically named images as requested
  const playerImages = ['you.jpg', 'you1.jpg', 'you2.jpg'];
  const enemyImages = ['enemy.jpg', 'enemy1.jpg', 'enemy2.jpg'];
  
  const playerImageIndex = Math.floor(Math.random() * playerImages.length);
  const enemyImageIndex = Math.floor(Math.random() * enemyImages.length);
  
  playerAvatar.src = playerImages[playerImageIndex];
  enemyAvatar.src = enemyImages[enemyImageIndex];
  
  // Set enemy name
  enemyName = data.players[1 - yourIndex].username || data.enemyUsername || "Enemy";
  enemyUsername.textContent = enemyName;
  
  yourTurn = yourIndex === 0; // First player starts
  gameActive = true;
  
  updateBars();
  updateButtonStatus();
  
  if (yourTurn) {
    setStatus('Your turn');
  } else {
    setStatus('Enemy turn');
  }
  
  // System messages
  addChatMessage('Game started!', 'system');
  addChatMessage(`You are playing against ${enemyName}`, 'system');
  
  if (yourTurn) {
    addChatMessage('Your turn first', 'system');
  } else {
    addChatMessage('Enemy goes first', 'system');
  }
}

function handleMoveConfirmed(data) {
  const prevHealth = yourData.health;
  const prevMana = yourData.mana;
  const prevEnemyHealth = enemyData.health;
  
  yourData = data.players[yourIndex];
  enemyData = data.players[1 - yourIndex];
  
  // Calculate changes
  const healthChange = yourData.health - prevHealth;
  const manaChange = yourData.mana - prevMana;
  const enemyHealthChange = enemyData.health - prevEnemyHealth;
  
  // Show effects
  if (healthChange > 0) {
    showDamageNumber(document.getElementById('you'), healthChange, 'heal');
  } else if (healthChange < 0) {
    showDamageNumber(document.getElementById('you'), -healthChange, 'damage');
  }
  
  if (manaChange > 0) {
    showDamageNumber(document.getElementById('you'), manaChange, 'mana');
  }
  
  if (enemyHealthChange < 0) {
    showDamageNumber(document.getElementById('enemy'), -enemyHealthChange, 'damage');
  }
  
  updateBars();
  updateButtonStatus();
  
  yourTurn = false;
  setStatus('Enemy turn');
}

function handleEnemyMove(data) {
  const prevHealth = yourData.health;
  const prevEnemyHealth = enemyData.health;
  const prevEnemyMana = enemyData.mana;
  
  yourData = data.players[yourIndex];
  enemyData = data.players[1 - yourIndex];
  
  // Calculate changes
  const healthChange = yourData.health - prevHealth;
  const enemyHealthChange = enemyData.health - prevEnemyHealth;
  const enemyManaChange = enemyData.mana - prevEnemyMana;
  
  // Show effects
  if (healthChange < 0) {
    showDamageNumber(document.getElementById('you'), -healthChange, 'damage');
  }
  
  if (enemyHealthChange > 0) {
    showDamageNumber(document.getElementById('enemy'), enemyHealthChange, 'heal');
  }
  
  if (enemyManaChange > 0) {
    showDamageNumber(document.getElementById('enemy'), enemyManaChange, 'mana');
  }
  
  // Add chat message for enemy move
  let moveMessage = `used ${data.move}`;
  addChatMessage(moveMessage, 'enemy');
  
  updateBars();
  yourTurn = true;
  updateButtonStatus();
  
  setStatus('Your turn');
}

function handleGameOver(data) {
  gameActive = false;
  
  if (data.winner === yourIndex) {
    victoryMessage.textContent = 'Victory!';
    victoryMessage.style.color = '#2ecc71';
  } else {
    victoryMessage.textContent = 'Defeat!';
    victoryMessage.style.color = '#e74c3c';
  }
  
  victoryMessage.style.display = 'block';
  backToMenuBtn.style.display = 'block';
  playAgainBtn.style.display = 'block';
  
  setButtonsDisabled(true);
  
  addChatMessage(data.winner === yourIndex ? 'You won the game!' : 'You lost the game!', 'system');
}

function handleChatMessage(data) {
  if (data.fromIndex !== yourIndex) {
    addChatMessage(data.message, 'enemy');
  }
}

// Socket.io event listeners
if (socket) {
  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on('waitingForOpponent', handleWaitingForOpponent);
  socket.on('gameStart', handleGameStart);
  socket.on('moveConfirmed', handleMoveConfirmed);
  socket.on('enemyMove', handleEnemyMove);
  socket.on('gameOver', handleGameOver);
  socket.on('chatMessage', handleChatMessage);
}

// Set up game controls
attackBtn.addEventListener('click', () => {
  emitEvent('move', 'attack');
  setButtonsDisabled(true);
});

defendBtn.addEventListener('click', () => {
  emitEvent('move', 'defend');
  setButtonsDisabled(true);
});

skillBtn.addEventListener('click', () => {
  emitEvent('move', 'skill');
  setButtonsDisabled(true);
});

manaBtn.addEventListener('click', () => {
  emitEvent('move', 'mana');
  setButtonsDisabled(true);
});

hydraBtn.addEventListener('click', () => {
  emitEvent('move', 'hydra');
  setButtonsDisabled(true);
});

// Handle chat input
chatInput.addEventListener('input', () => {
  const length = chatInput.value.length;
  charCount.textContent = `${length}/20`;
  
  // Enable/disable send button
  chatSendBtn.disabled = length === 0;
});

chatSendBtn.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
});

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (message) {
    emitEvent('chatMessage', { message });
    addChatMessage(message, 'you');
    chatInput.value = '';
    charCount.textContent = '0/20';
    chatSendBtn.disabled = true;
  }
}

// Game end buttons
backToMenuBtn.addEventListener('click', () => {
  window.location.href = 'pve.html'; // Redirect to pve.html as requested
});

playAgainBtn.addEventListener('click', () => {
  window.location.reload(); // Reload the page to start a new game
});
