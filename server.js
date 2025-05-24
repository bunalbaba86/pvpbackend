const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios'); // NFT API çağrıları için

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

// NFT Contract Address
const NFT_CONTRACT_ADDRESS = "0xdfdb045e4300d04ec32058756ec2453409360c5b";

// Game states
let waitingPlayer = null;
const games = new Map();
const playerToGame = new Map();

// NFT statlarını hesaplama fonksiyonu
function calculateNFTStats(tokenId, metadata = null) {
  let health = 150;
  let attack = 15;
  let defense = 5;
  let speed = 10;

  const tokenIdNum = parseInt(tokenId) || 0;
  
  // Token ID bazlı deterministic stat hesaplama
  const healthMod = (tokenIdNum * 7) % 50;
  const attackMod = (tokenIdNum * 11) % 25;
  const defenseMod = (tokenIdNum * 13) % 15;
  const speedMod = (tokenIdNum * 17) % 20;
  
  health += healthMod;
  attack += Math.floor(attackMod / 2);
  defense += Math.floor(defenseMod / 3);
  speed += Math.floor(speedMod / 2);

  // Rarity bonusu
  const rarityValue = tokenIdNum % 100;
  
  if (rarityValue >= 95) {
    health += 50;
    attack += 12;
    defense += 8;
  } else if (rarityValue >= 80) {
    health += 30;
    attack += 8;
    defense += 5;
  } else if (rarityValue >= 50) {
    health += 20;
    attack += 5;
    defense += 3;
  }

  return {
    health: Math.min(health, 300),
    attack: Math.min(attack, 50),
    defense: Math.min(defense, 25),
    speed: Math.min(speed, 35)
  };
}

// NFT sahipliği doğrulama endpoint'i
app.get('/verify-nft/:address/:tokenId', async (req, res) => {
  try {
    const { address, tokenId } = req.params;
    
    // Burada gerçek blockchain verification yapılabilir
    // Şimdilik basit doğrulama
    if (!address || !tokenId) {
      return res.json({ valid: false, message: 'Invalid parameters' });
    }
    
    // Demo amaçlı her NFT'yi geçerli say
    const stats = calculateNFTStats(tokenId);
    
    res.json({
      valid: true,
      tokenId: tokenId,
      contractAddress: NFT_CONTRACT_ADDRESS,
      stats: stats
    });
    
  } catch (error) {
    console.error('NFT verification error:', error);
    res.json({ valid: false, message: 'Verification failed' });
  }
});

// NFT metadata endpoint'i
app.get('/nft-metadata/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    // Demo metadata döndür
    const metadata = {
      name: `NFT #${tokenId}`,
      description: `This is NFT number ${tokenId} from the collection`,
      image: `https://picsum.photos/300/300?random=${tokenId}`,
      attributes: [
        { trait_type: "Power", value: (parseInt(tokenId) * 7) % 100 },
        { trait_type: "Speed", value: (parseInt(tokenId) * 11) % 100 },
        { trait_type: "Defense", value: (parseInt(tokenId) * 13) % 100 }
      ]
    };
    
    const stats = calculateNFTStats(tokenId, metadata);
    
    res.json({
      metadata: metadata,
      stats: stats
    });
    
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// Oyun oluşturma fonksiyonu (NFT destekli)
function createNewGame(player1Id, player2Id, player1WalletAddress, player2WalletAddress, player1NFT, player2NFT) {
  // NFT statlarını hesapla
  const player1Stats = calculateNFTStats(player1NFT.tokenId);
  const player2Stats = calculateNFTStats(player2NFT.tokenId);
  
  return {
    players: [player1Id, player2Id],
    playerWalletAddresses: [player1WalletAddress, player2WalletAddress],
    playerNFTs: [player1NFT, player2NFT],
    turnIndex: 0,
    playersData: [
      { 
        health: player1Stats.health, 
        maxHealth: player1Stats.health,
        mana: 100, 
        hydraActive: 0, 
        hydraUsed: false,
        nftStats: player1Stats
      },
      { 
        health: player2Stats.health,
        maxHealth: player2Stats.health, 
        mana: 100, 
        hydraActive: 0, 
        hydraUsed: false,
        nftStats: player2Stats
      }
    ],
    gameOver: false,
    winner: null
  };
}

// Hareket validation (NFT statlarını göz önünde bulundurarak)
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

// Hareket uygulama (NFT statları ile)
function applyMove(move, currentPlayerData, otherPlayerData) {
  const attackPower = currentPlayerData.nftStats?.attack || 15;
  const defensePower = otherPlayerData.nftStats?.defense || 5;
  
  switch (move) {
    case 'attack':
      currentPlayerData.mana -= 10;
      const attackDamage = Math.max(1, attackPower - Math.floor(defensePower / 3));
      otherPlayerData.health -= attackDamage;
      break;
    case 'defend':
      currentPlayerData.mana -= 5;
      const healAmount = 10 + Math.floor((currentPlayerData.nftStats?.defense || 5) / 4);
      currentPlayerData.health = Math.min(
        currentPlayerData.health + healAmount, 
        currentPlayerData.maxHealth
      );
      break;
    case 'skill':
      currentPlayerData.mana -= 20;
      const skillDamage = Math.max(1, (attackPower * 2) - Math.floor(defensePower / 2));
      otherPlayerData.health -= skillDamage;
      break;
    case 'mana':
      const manaBonus = 15 + Math.floor((currentPlayerData.nftStats?.speed || 10) / 5);
      currentPlayerData.mana = Math.min(currentPlayerData.mana + manaBonus, 100);
      break;
    case 'hydra':
      currentPlayerData.mana -= 30;
      const hydraDamage = Math.max(5, attackPower - Math.floor(defensePower / 4));
      otherPlayerData.health -= hydraDamage;
      currentPlayerData.hydraActive = 3;
      currentPlayerData.hydraUsed = true;
      break;
  }
  
  // HYDRA effect
  if (currentPlayerData.hydraActive > 0) {
    const hydraTickDamage = Math.max(3, Math.floor(attackPower / 2));
    otherPlayerData.health -= hydraTickDamage;
    currentPlayerData.hydraActive -= 1;
  }
}

// Oyun bitişi kontrolü
function checkGameOver(game) {
  if (game.playersData[0].health <= 0) {
    game.gameOver = true;
    return 1;
  }
  if (game.playersData[1].health <= 0) {
    game.gameOver = true;
    return 0;
  }
  return -1;
}

// Socket.io bağlantı yönetimi
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.playerIndex = null;
  socket.roomId = null;
  socket.walletAddress = null;
  socket.selectedNFT = null;

  // Oyuncu hareketi dinleyicisi
  socket.on('playerMove', (data) => {
    if (data.move === 'join') {
      socket.walletAddress = data.walletAddress;
      socket.selectedNFT = data.selectedNFT;
      
      console.log(`Player ${socket.id} joined with wallet: ${socket.walletAddress}`);
      console.log(`Selected NFT:`, socket.selectedNFT);
      
      // Eski oyun temizliği
      if (socket.roomId) {
        const oldGameId = socket.roomId;
        const oldGame = games.get(oldGameId);
        
        if (oldGame) {
          const otherPlayerId = oldGame.players.find(id => id !== socket.id);
          if (otherPlayerId) {
            io.to(otherPlayerId).emit('gameOver', { winner: 'player' });
          }
          
          games.delete(oldGameId);
          oldGame.players.forEach(id => playerToGame.delete(id));
        }
        
        socket.leave(oldGameId);
        socket.roomId = null;
        socket.playerIndex = null;
      }
      
      // Bekleyen oyuncu kontrolü
      if (waitingPlayer === null) {
        waitingPlayer = socket.id;
        socket.emit('waitingForOpponent');
      } else {
        const waitingPlayerSocket = io.sockets.sockets.get(waitingPlayer);
        
        if (!waitingPlayerSocket) {
          waitingPlayer = socket.id;
          socket.emit('waitingForOpponent');
          return;
        }
        
        // Oyun oluştur
        const roomId = `room_${Date.now()}`;
        const game = createNewGame(
          waitingPlayer, 
          socket.id,
          waitingPlayerSocket.walletAddress,
          socket.walletAddress,
          waitingPlayerSocket.selectedNFT,
          socket.selectedNFT
        );
        
        games.set(roomId, game);
        
        // Oyuncuları odaya ekle
        waitingPlayerSocket.join(roomId);
        socket.join(roomId);
        
        waitingPlayerSocket.playerIndex = 0;
        waitingPlayerSocket.roomId = roomId;
        socket.playerIndex = 1;
        socket.roomId = roomId;
        
        playerToGame.set(waitingPlayer, roomId);
        playerToGame.set(socket.id, roomId);
        
        // Oyun başlama mesajları
        io.to(waitingPlayer).emit('gameStart', {
          yourIndex: 0,
          you: game.playersData[0],
          enemy: game.playersData[1],
          yourNFT: waitingPlayerSocket.selectedNFT,
          enemyNFT: socket.selectedNFT,
          enemyWalletAddress: socket.walletAddress
        });
        
        io.to(socket.id).emit('gameStart', {
          yourIndex: 1,
          you: game.playersData[1],
          enemy: game.playersData[0],
          yourNFT: socket.selectedNFT,
          enemyNFT: waitingPlayerSocket.selectedNFT,
          enemyWalletAddress: waitingPlayerSocket.walletAddress
        });
        
        waitingPlayer = null;
      }
      
      return;
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
    
    if (!canPerformMove(data.move, currentPlayerData)) {
      socket.emit('errorMessage', 'Not enough mana or invalid move.');
      return;
    }
    
    // Hareketi uygula
    applyMove(data.move, currentPlayerData, otherPlayerData);
    
    // Sağlık kontrolü
    currentPlayerData.health = Math.max(0, currentPlayerData.health);
    otherPlayerData.health = Math.max(0, otherPlayerData.health);
    
    // Oyun bitişi kontrolü
    const winnerIndex = checkGameOver(game);
    
    if (winnerIndex !== -1) {
      io.to(roomId).emit('gameOver', {
        winner: winnerIndex === playerIndex ? 'player' : 'enemy'
      });
      return;
    }
    
    // Sıra değiştir
    game.turnIndex = otherPlayerIndex;
    
    // Hareket onayı
    socket.emit('moveConfirmed', {
      you: currentPlayerData,
      enemy: otherPlayerData,
      move: data.move
    });
    
    // Diğer oyuncuya bildir
    const otherPlayerId = game.players[otherPlayerIndex];
    io.to(otherPlayerId).emit('enemyMove', {
      you: otherPlayerData,
      enemy: currentPlayerData,
      move: data.move
    });
  });
  
  // Chat mesajları
  socket.on('chatMessage', (data) => {
    if (!socket.roomId || socket.playerIndex === null) return;
    
    const trimmedMessage = data.message.substring(0, 20);
    
    socket.to(socket.roomId).emit('chatMessage', {
      message: trimmedMessage,
      fromIndex: socket.playerIndex
    });
  });
  
  // Bağlantı koparsa
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }
    
    const roomId = socket.roomId;
    if (roomId && games.has(roomId)) {
      const game = games.get(roomId);
      
      const otherPlayerId = game.players.find(id => id !== socket.id);
      if (otherPlayerId) {
        io.to(otherPlayerId).emit('gameOver', { winner: 'player' });
      }
      
      games.delete(roomId);
      game.players.forEach(id => playerToGame.delete(id));
    }
  });
});

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Server başlat
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`NFT Contract: ${NFT_CONTRACT_ADDRESS}`);
});
