const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Express ve WebSocket sunucusunu kur
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Statik dosyaları servis et
app.use(express.static(path.join(__dirname, 'public')));

// Ana oyun mantığı
const createPlayerData = () => ({ health: 100, mana: 50, hydraActive: 0, hydraUsed: false });

// Oyun durumunu tutan nesneler
let waitingPlayer = null;
const games = new Map(); // gameId -> gameState
const playerToGame = new Map(); // playerId -> gameId
const playerSockets = new Map(); // playerId -> socket

// Oyuncu bir hareketi yapabilir mi?
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

// Hareketi uygula ve açıklamasını döndür
function applyMove(move, playerData, enemyData) {
  switch (move) {
    case 'attack':
      playerData.mana -= 10;
      enemyData.health -= 15;
      return 'dealt 15 damage';
    case 'defend':
      playerData.mana -= 5;
      playerData.health += 10;
      if (playerData.health > 100) playerData.health = 100;
      return 'restored 10 health';
    case 'skill':
      playerData.mana -= 20;
      enemyData.health -= 30;
      return 'dealt 30 damage';
    case 'mana':
      playerData.mana += 15;
      if (playerData.mana > 50) playerData.mana = 50;
      return 'restored 15 mana';
    case 'hydra':
      playerData.mana -= 30;
      playerData.hydraUsed = true; // HYDRA sadece bir kez kullanılabilir
      playerData.hydraActive = 4; // 4 tur aktif
      enemyData.health -= 10; // İlk tur hasarı
      return 'cast HYDRA spell!';
    default:
      return 'did nothing';
  }
}

// Oyun bitti mi kontrol et
function checkGameOver(game) {
  if (game.playersData[0].health <= 0) {
    game.gameOver = true;
    return 1; // Player 1 wins
  }
  if (game.playersData[1].health <= 0) {
    game.gameOver = true;
    return 0; // Player 0 wins
  }
  return null; // Game continues
}

// Bir oyuncuya mesaj gönder
function sendToPlayer(socket, type, data = {}) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, data }));
  }
}

// WebSocket bağlantı yönetimi
wss.on('connection', (socket) => {
  console.log('Player connected');
  
  // Her oyuncuya benzersiz bir ID ata
  const playerId = Math.random().toString(36).substring(2, 15);
  console.log(`Player connected with ID: ${playerId}`);
  
  // Bu soketi kaydet
  playerSockets.set(playerId, socket);
  
  // Gelen mesajları işle
  socket.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'joinGame':
          handleJoinGame(playerId);
          break;
        case 'playerMove':
          if (data.data && data.data.move) {
            handlePlayerMove(playerId, data.data.move);
          }
          break;
        case 'chatMessage':
          if (data.data && data.data.message) {
            handleChatMessage(playerId, data.data.message);
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Bağlantı koptuğunda
  socket.on('close', () => {
    console.log(`Player disconnected: ${playerId}`);
    handlePlayerDisconnect(playerId);
  });
});

// Oyuna katılma mantığı
function handleJoinGame(playerId) {
  const socket = playerSockets.get(playerId);
  
  // Bu oyuncu zaten bir oyunda mı?
  const existingGameId = playerToGame.get(playerId);
  if (existingGameId) {
    const game = games.get(existingGameId);
    if (game) {
      // Oyun verisini tekrar gönder
      const playerIndex = game.players.indexOf(playerId);
      if (playerIndex !== -1) {
        sendToPlayer(socket, 'gameStart', {
          you: game.playersData[playerIndex],
          enemy: game.playersData[1 - playerIndex],
          yourTurn: game.turnIndex === playerIndex
        });
        return;
      }
    }
  }
  
  // Bekleyen oyuncu var mı?
  if (waitingPlayer && playerSockets.get(waitingPlayer).readyState === WebSocket.OPEN) {
    // İki oyuncu eşleşti, oyun oluştur
    const gameId = `game_${playerId}_${waitingPlayer}`;
    
    const game = {
      players: [waitingPlayer, playerId],
      turnIndex: 0, // İlk oyuncu başlar
      playersData: [createPlayerData(), createPlayerData()],
      gameActive: true,
      gameOver: false,
      winner: null
    };
    
    games.set(gameId, game);
    
    // Oyuncuları bu oyunla eşleştir
    playerToGame.set(waitingPlayer, gameId);
    playerToGame.set(playerId, gameId);
    
    // Her iki oyuncuya da başlangıç bilgisini gönder
    sendToPlayer(playerSockets.get(waitingPlayer), 'gameStart', {
      you: game.playersData[0],
      enemy: game.playersData[1],
      yourTurn: true
    });
    
    sendToPlayer(socket, 'gameStart', {
      you: game.playersData[1],
      enemy: game.playersData[0],
      yourTurn: false
    });
    
    // Bekleyen oyuncuyu temizle
    waitingPlayer = null;
  } else {
    // Bu oyuncu bekleyecek
    waitingPlayer = playerId;
    sendToPlayer(socket, 'waitingForOpponent');
  }
}

// Oyuncu hareketi yönetimi
function handlePlayerMove(playerId, move) {
  const gameId = playerToGame.get(playerId);
  if (!gameId) {
    sendToPlayer(playerSockets.get(playerId), 'errorMessage', { message: 'You are not in a game' });
    return;
  }
  
  const game = games.get(gameId);
  if (!game || game.gameOver) {
    sendToPlayer(playerSockets.get(playerId), 'errorMessage', { message: 'Game is not active' });
    return;
  }
  
  // Oyuncunun sırası mı?
  const playerIndex = game.players.indexOf(playerId);
  if (playerIndex === -1 || game.turnIndex !== playerIndex) {
    sendToPlayer(playerSockets.get(playerId), 'errorMessage', { message: 'Not your turn' });
    return;
  }
  
  // Oyuncu ve rakip verilerini al
  const playerData = game.playersData[playerIndex];
  const enemyIndex = 1 - playerIndex;
  const enemyData = game.playersData[enemyIndex];
  
  // Bu hareketi yapabilir mi?
  if (!canPerformMove(move, playerData)) {
    sendToPlayer(playerSockets.get(playerId), 'errorMessage', { message: 'Cannot perform this move' });
    return;
  }
  
  // Hareketi uygula
  const description = applyMove(move, playerData, enemyData);
  
  // Sağlık sıfırın altına düşemez
  playerData.health = Math.max(0, playerData.health);
  enemyData.health = Math.max(0, enemyData.health);
  
  // Hydra etkilerini kontrol et
  for (let i = 0; i < 2; i++) {
    const currentPlayerData = game.playersData[i];
    if (currentPlayerData.hydraActive > 0) {
      const targetIndex = 1 - i;
      // Hydra her tur 8 hasar veriyor
      game.playersData[targetIndex].health -= 8;
      game.playersData[targetIndex].health = Math.max(0, game.playersData[targetIndex].health);
      
      // Kalan süreyi azalt
      currentPlayerData.hydraActive -= 1;
      
      // Her iki oyuncuyu da bilgilendir
      const effectData = {
        effect: 'hydra',
        damage: 8,
        turnsRemaining: currentPlayerData.hydraActive
      };
      
      sendToPlayer(playerSockets.get(game.players[0]), 'effectTriggered', effectData);
      sendToPlayer(playerSockets.get(game.players[1]), 'effectTriggered', effectData);
    }
  }
  
  // Oyun bitti mi?
  const winner = checkGameOver(game);
  if (winner !== null) {
    // Oyun bitti, sonucu bildir
    sendToPlayer(playerSockets.get(game.players[0]), 'gameOver', {
      winner: winner === 0 ? 'player' : 'enemy'
    });
    
    sendToPlayer(playerSockets.get(game.players[1]), 'gameOver', {
      winner: winner === 1 ? 'player' : 'enemy'
    });
    
    return;
  }
  
  // Sırayı değiştir
  game.turnIndex = enemyIndex;
  
  // Hareketi onaylandı
  sendToPlayer(playerSockets.get(playerId), 'moveConfirmed', {
    you: playerData,
    enemy: enemyData,
    move: move,
    description: description
  });
  
  // Rakibe bildir
  sendToPlayer(playerSockets.get(game.players[enemyIndex]), 'enemyMove', {
    you: enemyData,
    enemy: playerData,
    move: move,
    description: description
  });
}

// Chat mesajı yönetimi
function handleChatMessage(playerId, message) {
  const gameId = playerToGame.get(playerId);
  if (!gameId) return;
  
  const game = games.get(gameId);
  if (!game) return;
  
  const playerIndex = game.players.indexOf(playerId);
  if (playerIndex === -1) return;
  
  // Mesajı rakibe gönder
  const opponentId = game.players[1 - playerIndex];
  sendToPlayer(playerSockets.get(opponentId), 'chatMessage', {
    message: message,
    fromIndex: playerIndex
  });
}

// Oyuncu bağlantı kopması
function handlePlayerDisconnect(playerId) {
  // Bekleyen oyuncu ise temizle
  if (waitingPlayer === playerId) {
    waitingPlayer = null;
  }
  
  // Oyunda ise, oyunu sonlandır
  const gameId = playerToGame.get(playerId);
  if (gameId) {
    const game = games.get(gameId);
    if (game) {
      const playerIndex = game.players.indexOf(playerId);
      if (playerIndex !== -1) {
        const opponentId = game.players[1 - playerIndex];
        
        // Rakip kazandı (oyuncu çekildiği için)
        sendToPlayer(playerSockets.get(opponentId), 'gameOver', {
          winner: 'player'
        });
        
        // Temizlik
        playerToGame.delete(opponentId);
        games.delete(gameId);
      }
    }
  }
  
  // Oyuncu verilerini temizle
  playerToGame.delete(playerId);
  playerSockets.delete(playerId);
}

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
