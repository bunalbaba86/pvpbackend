const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Express ve Socket.io sunucusunu kur
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Statik dosyaları servis et
app.use(express.static(path.join(__dirname, 'public')));

// Port ayarı
const PORT = process.env.PORT || 3000;

// Oyun durumları
let waitingPlayer = null;
const games = new Map(); // odaId -> oyunDurumu
const playerToGame = new Map(); // oyuncuId -> odaId

// Yeni oyun oluşturan yardımcı fonksiyon
function createNewGame(player1Id, player2Id) {
  return {
    players: [player1Id, player2Id],
    turnIndex: 0, // İlk oyuncu sırası
    playersData: [
      { health: 100, mana: 50 }, // İlk oyuncu
      { health: 100, mana: 50 }  // İkinci oyuncu
    ],
    gameOver: false,
    winner: null
  };
}

// Bir hareketi yapıp yapamayacağını kontrol et
function canPerformMove(move, playerData) {
  switch (move) {
    case 'attack': return playerData.mana >= 10;
    case 'defend': return playerData.mana >= 5;
    case 'skill': return playerData.mana >= 20;
    case 'mana': return true;
    default: return false;
  }
}

// Hareketi uygula
function applyMove(move, currentPlayerData, otherPlayerData) {
  switch (move) {
    case 'attack':
      currentPlayerData.mana -= 10;
      otherPlayerData.health -= 15;
      break;
    case 'defend':
      currentPlayerData.mana -= 5;
      currentPlayerData.health += 10;
      if (currentPlayerData.health > 100) currentPlayerData.health = 100;
      break;
    case 'skill':
      currentPlayerData.mana -= 20;
      otherPlayerData.health -= 30;
      break;
    case 'mana':
      currentPlayerData.mana += 15;
      if (currentPlayerData.mana > 50) currentPlayerData.mana = 50;
      break;
  }
}

// Oyunun bitip bitmediğini kontrol et
function checkGameOver(game) {
  if (game.playersData[0].health <= 0) {
    game.gameOver = true;
    return 1; // İkinci oyuncu kazandı
  }
  if (game.playersData[1].health <= 0) {
    game.gameOver = true;
    return 0; // Birinci oyuncu kazandı
  }
  return -1; // Oyun devam ediyor
}

// Socket.io bağlantılarını dinle
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Oyuncu bilgilerini sakla
  socket.playerIndex = null;
  socket.roomId = null;

  // Oyuncu hareketlerini dinle
  socket.on('playerMove', ({ move }) => {
    // Yeni oyuncu oyuna katılmak istiyor
    if (move === 'join') {
      // Eğer oyuncu zaten bir oyundaysa, eski oyundan çıkar
      if (socket.roomId) {
        const oldGameId = socket.roomId;
        const oldGame = games.get(oldGameId);
        
        if (oldGame) {
          // Diğer oyuncuya bildir
          const otherPlayerId = oldGame.players.find(id => id !== socket.id);
          if (otherPlayerId) {
            io.to(otherPlayerId).emit('gameOver', { winner: 'player' });
          }
          
          // Oyunu temizle
          games.delete(oldGameId);
          oldGame.players.forEach(id => playerToGame.delete(id));
        }
        
        socket.leave(oldGameId);
        socket.roomId = null;
        socket.playerIndex = null;
      }
      
      // Bekleyen oyuncu var mı?
      if (waitingPlayer === null) {
        waitingPlayer = socket.id;
        socket.emit('waitingForOpponent');
      } else {
        // İki oyuncu eşleşti, yeni oyun oluştur
        const roomId = `room_${Date.now()}`;
        const game = createNewGame(waitingPlayer, socket.id);
        games.set(roomId, game);
        
        // Oyuncuları odaya ekle
        const player1Socket = io.sockets.sockets.get(waitingPlayer);
        
        if (!player1Socket) {
          // Bekleyen oyuncu bağlantısı kopmuş
          waitingPlayer = socket.id;
          socket.emit('waitingForOpponent');
          return;
        }
        
        player1Socket.join(roomId);
        socket.join(roomId);
        
        // Oyuncu bilgilerini güncelle
        player1Socket.playerIndex = 0;
        player1Socket.roomId = roomId;
        socket.playerIndex = 1;
        socket.roomId = roomId;
        
        // Oyuncuları oyunla eşleştir
        playerToGame.set(waitingPlayer, roomId);
        playerToGame.set(socket.id, roomId);
        
        // Her iki oyuncuya da oyun başladı bildirimi gönder
        io.to(waitingPlayer).emit('gameStart', {
          yourIndex: 0,
          you: game.playersData[0],
          enemy: game.playersData[1]
        });
        
        io.to(socket.id).emit('gameStart', {
          yourIndex: 1,
          you: game.playersData[1],
          enemy: game.playersData[0]
        });
        
        // Bekleyen oyuncuyu temizle
        waitingPlayer = null;
      }
      
      return; // join işlemi tamamlandı
    }
    
    // Normal oyun hareketi
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
    
    if (!canPerformMove(move, currentPlayerData)) {
      socket.emit('errorMessage', 'Not enough mana or invalid move.');
      return;
    }
    
    // Hareketi uygula
    applyMove(move, currentPlayerData, otherPlayerData);
    
    // Sağlık negatif olamaz
    currentPlayerData.health = Math.max(0, currentPlayerData.health);
    otherPlayerData.health = Math.max(0, otherPlayerData.health);
    
    // Oyun sonu kontrolü
    const winnerIndex = checkGameOver(game);
    
    if (winnerIndex !== -1) {
      // Oyun bitti, kazananı bildir
      io.to(roomId).emit('gameOver', {
        winner: winnerIndex === playerIndex ? 'player' : 'enemy'
      });
      return;
    }
    
    // Sırayı değiştir
    game.turnIndex = otherPlayerIndex;
    
    // Hareketi yapan oyuncuya onay gönder
    socket.emit('moveConfirmed', {
      you: currentPlayerData,
      enemy: otherPlayerData,
      move: move
    });
    
    // Diğer oyuncuya hamle bilgisi gönder
    const otherPlayerId = game.players[otherPlayerIndex];
    io.to(otherPlayerId).emit('enemyMove', {
      you: otherPlayerData,
      enemy: currentPlayerData,
      move: move
    });
  });
  
  // Chat mesajlarını işle
  socket.on('chatMessage', ({ message }) => {
    if (!socket.roomId || socket.playerIndex === null) return;
    
    // Mesajı diğer oyuncuya ilet
    socket.to(socket.roomId).emit('chatMessage', {
      message,
      fromIndex: socket.playerIndex
    });
  });
  
  // Bağlantı koptuğunda
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Bekleyen oyuncu bu muydu?
    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }
    
    // Oyuncu bir odada mıydı?
    const roomId = socket.roomId;
    if (roomId && games.has(roomId)) {
      const game = games.get(roomId);
      
      // Diğer oyuncuya bildir
      const otherPlayerId = game.players.find(id => id !== socket.id);
      if (otherPlayerId) {
        io.to(otherPlayerId).emit('gameOver', { winner: 'player' });
      }
      
      // Oyunu temizle
      games.delete(roomId);
      game.players.forEach(id => playerToGame.delete(id));
    }
  });
});

// Sunucuyu başlat
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
