// Check if user is logged in, if not redirect to login page
if (!requireLogin()) {
  window.location.href = 'login.html';
}

// Get current user data
const currentUser = getCurrentUser();

// Socket.io connection
const socket = io("https://pvpbackend.onrender.com");

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

// Initialize game
function initGame() {
  // Connect to server
  socket.on('connect', () => {
    console.log('Connected to server');
    
    // Join game queue
    socket.emit('playerMove', { 
      move: 'join',
      username: currentUser.username
    });
  });
  
  // Waiting for opponent
  socket.on('waitingForOpponent', () => {
    setStatus('Waiting for an opponent...');
    addChatMessage('Waiting for an opponent to join...', 'system');
  });
  
  // Game start
  socket.on('gameStart', (data) => {
    yourIndex = data.yourIndex;
    yourData = data.you;
    enemyData = data.enemy;
    initialHealth = data.initialHealth;
    enemyName = data.enemyUsername || "Enemy";
    
    // Update UI with opponent name
    enemyUsername.textContent = enemyName;
    
    // Set avatars
    if (data.playerAvatar) {
      playerAvatar.src = data.playerAvatar;
    }
    if (data.enemyAvatar) {
      enemyAvatar.src = data.enemyAvatar;
    }
    
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
  });
  
  // Move confirmed
  socket.on('moveConfirmed', (data) => {
    yourData = data.you;
    enemyData = data.enemy;
    yourTurn = false;
    
    // Show animations based on move type
    if (data.move === 'attack' || data.move === 'skill' || data.move === 'hydra') {
      let damage = 0;
      if (data.move === 'attack') damage = 15;
      else if (data.move === 'skill') damage = 30;
      else if (data.move === 'hydra') damage = 10;
      
      showDamageNumber(document.getElementById('enemy'), damage, 'damage');
    } else if (data.move === 'defend') {
      showDamageNumber(document.getElementById('you'), 10, 'heal');
    } else if (data.move === 'mana') {
      showDamageNumber(document.getElementById('you'), 15, 'mana');
    }
    
    updateBars();
    updateButtonStatus();
    setStatus('Enemy turn');
    
    // Add chat message
    addChatMessage(`You used ${data.move}`, 'system');
  });
  
  // Enemy move
  socket.on('enemyMove', (data) => {
    yourData = data.you;
    enemyData = data.enemy;
    yourTurn = true;
    
    // Show animations based on enemy move
    if (data.move === 'attack' || data.move === 'skill' || data.move === 'hydra') {
      let damage = 0;
      if (data.move === 'attack') damage = 15;
      else if (data.move === 'skill') damage = 30;
      else if (data.move === 'hydra') damage = 10;
      
      showDamageNumber(document.getElementById('you'), damage, 'damage');
    } else if (data.move === 'defend') {
      showDamageNumber(document.getElementById('enemy'), 10, 'heal');
    } else if (data.move === 'mana') {
      showDamageNumber(document.getElementById('enemy'), 15, 'mana');
    }
    
    updateBars();
    updateButtonStatus();
    setStatus('Your turn');
    
    // Add chat message
    addChatMessage(`Enemy used ${data.move}`, 'system');
  });
  
  // Game over
  socket.on('gameOver', (data) => {
    endGame();
    
    if (data.winner === 'player') {
      victoryMessage.textContent = 'Victory!';
      victoryMessage.style.color = '#2ecc71';
      addChatMessage('You won!', 'system');
    } else {
      victoryMessage.textContent = 'Defeat!';
      victoryMessage.style.color = '#e74c3c';
      addChatMessage('You lost!', 'system');
    }
    
    victoryMessage.style.display = 'block';
    backToMenuBtn.style.display = 'block';
    playAgainBtn.style.display = 'block';
  });
  
  // Error message
  socket.on('errorMessage', (data) => {
    console.error('Server error:', data);
    addChatMessage(`Error: ${data}`, 'system');
  });
  
  // Chat message received
  socket.on('chatMessage', (data) => {
    addChatMessage(data.message, 'enemy');
  });
  
  // Set up game controls
  attackBtn.addEventListener('click', () => {
    socket.emit('playerMove', { move: 'attack' });
  });
  
  defendBtn.addEventListener('click', () => {
    socket.emit('playerMove', { move: 'defend' });
  });
  
  skillBtn.addEventListener('click', () => {
    socket.emit('playerMove', { move: 'skill' });
  });
  
  manaBtn.addEventListener('click', () => {
    socket.emit('playerMove', { move: 'mana' });
  });
  
  hydraBtn.addEventListener('click', () => {
    socket.emit('playerMove', { move: 'hydra' });
  });
  
  // Handle chat input
  chatInput.addEventListener('input', () => {
    const currentLength = chatInput.value.length;
    charCount.textContent = `${currentLength}/20`;
    
    // Enable/disable send button
    chatSendBtn.disabled = currentLength === 0;
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
      socket.emit('chatMessage', { message });
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
}

// Initialize the game when the document is loaded
document.addEventListener('DOMContentLoaded', initGame);
