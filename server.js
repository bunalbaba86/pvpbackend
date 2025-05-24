const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Express and Socket.io setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
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

// NFT statlarını hesaplama fonksiyonu (frontend ile aynı algoritma)
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
  let rarity = "Common";
  
  if (rarityValue >= 95) {
    health += 50; attack += 12; defense += 8;
    rarity = "Legendary";
  } else if (rarityValue >= 80) {
    health += 30; attack += 8; defense += 5;
    rarity = "Epic";
  } else if (rarityValue >= 50) {
    health += 20; attack += 5; defense += 3;
    rarity = "Rare";
  }

  return {
    health: Math.min(health, 300),
    attack: Math.min(attack, 50),
    defense: Math.min(defense, 25),
    speed: Math.min(speed, 35),
    rarity: rarity
  };
}

// Wallet address validation
function isValidWalletAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// NFT validation
function isValidNFT(nft) {
  return nft && 
         nft.tokenId && 
         typeof nft.tokenId === 'string' && 
         nft.name && 
         nft.image;
}

// NFT sahipliği doğrulama endpoint'i
app.get('/verify-nft/:address/:tokenId', async (req, res) => {
  try {
    const { address, tokenId } = req.params;
    
    if (!address || !tokenId || !isValidWalletAddress(address)) {
      return res.json({ valid: false, message: 'Invalid parameters' });
    }
    
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
    
    const metadata = {
      name: `Warrior #${tokenId}`,
      description: `NFT Warrior #${tokenId} from the collection`,
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
  // NFT validasyonu
  if (!isValidNFT(player1NFT) || !isValidNFT(player2NFT)) {
    throw new Error('Invalid NFT data');
  }

  // NFT statlarını hesapla
  const player1Stats = calculateNFTStats(player1NFT.tokenId);
  const player2Stats = calculateNFTStats(player2NFT.tokenId);
  
  console.log(`Creating game: ${player1NFT.name} vs ${player2NFT.name}`);
  console.log(`Stats: P1(${player1Stats.health}HP, ${player1Stats.attack}ATK) vs P2(${player2Stats.health}HP, ${player2Stats.attack}ATK)`);
  
  return {
    players: [player1Id, player2Id],
    playerWalletAddresses: [player1WalletAddress, player2WalletAddress],
    playerNFTs: [player1NFT, player2NFT],
    turnIndex: 0, // İlk oyuncu başlar
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
    winner: null,
    createdAt: Date.now()
  };
}

// Hareket validation (NFT statlarını göz önünde bulundurarak)
function canPerformMove(move, playerData) {
  if (!playerData) return false;
  
  switch (move) {
    case 'attack': return playerData.mana >= 10;
    case 'defend': return playerData.mana >= 5;
    case 'skill': return playerData.mana >= 20;
    case 'mana': return true;
    case 'hydra': return playerData.mana >= 30 && !playerData.hydraUsed;
    default: return false;
  }
}

// Hareket uygulama (NFT statları ile dengeli hasar hesaplama)
function applyMove(move, currentPlayerData, otherPlayerData) {
  const attackPower = currentPlayerData.nftStats?.attack || 15;
  const defensePower = otherPlayerData.nftStats?.defense || 5;
  const speed = currentPlayerData.nftStats?.speed || 10;
  
  console.log(`Applying move: ${move}, Attack: ${attackPower}, Defense: ${defensePower}`);
  
  switch (move) {
    case 'attack':
      currentPlayerData.mana -= 10;
      // Hasar hesaplama: saldırı gücü - savunmanın 1/3'ü
      const attackDamage = Math.max(5, attackPower - Math.floor(defensePower / 3));
      otherPlayerData.health -= attackDamage;
      console.log(`Attack damage: ${attackDamage}`);
      break;
      
    case 'defend':
      currentPlayerData.mana -= 5;
      // İyileşme: 10 + savunmanın 1/4'ü
      const healAmount = 10 + Math.floor((currentPlayerData.nftStats?.defense || 5) / 4);
      currentPlayerData.health = Math.min(
        currentPlayerData.health + healAmount, 
        currentPlayerData.maxHealth
      );
      console.log(`Heal amount: ${healAmount}`);
      break;
      
    case 'skill':
      currentPlayerData.mana -= 20;
      // Büyük hasar: saldırı gücü * 2 - savunmanın yarısı
      const skillDamage = Math.max(10, (attackPower * 2) - Math.floor(defensePower / 2));
      otherPlayerData.health -= skillDamage;
      console.log(`Skill damage: ${skillDamage}`);
      break;
      
    case 'mana':
      // Mana yenileme: 15 + hızın 1/5'i
      const manaBonus = 15 + Math.floor(speed / 5);
      currentPlayerData.mana = Math.min(currentPlayerData.mana + manaBonus, 100);
      console.log(`Mana restored: ${manaBonus}`);
      break;
      
    case 'hydra':
      currentPlayerData.mana -= 30;
      // Hydra başlangıç hasarı
      const hydraDamage = Math.max(8, attackPower - Math.floor(defensePower / 4));
      otherPlayerData.health -= hydraDamage;
      currentPlayerData.hydraActive = 3; // 3 tur boyunca aktif
      currentPlayerData.hydraUsed = true;
      console.log(`Hydra initial damage: ${hydraDamage}`);
      break;
  }
  
  // HYDRA devam eden hasar
  if (currentPlayerData.hydraActive > 0) {
    const hydraTickDamage = Math.max(5, Math.floor(attackPower / 2));
    otherPlayerData.health -= hydraTickDamage;
    currentPlayerData.hydraActive -= 1;
    console.log(`Hydra tick damage: ${hydraTickDamage}, remaining: ${currentPlayerData.hydraActive}`);
  }
  
  // Sağlık sınırları
  currentPlayerData.health = Math.max(0, currentPlayerData.health);
  otherPlayerData.health = Math.max(0, otherPlayerData.health);
  currentPlayerData.mana = Math.max(0, Math.min(100, currentPlayerData.mana));
}

// Oyun bitişi kontrolü
function checkGameOver(game) {
  if (game.playersData[0].health <= 0) {
    game.gameOver = true;
    game.winner = 1; // İkinci oyuncu kazandı
    return 1;
  }
  if (game.playersData[1].health <= 0) {
    game.gameOver = true;
    game.winner = 0; // İlk oyuncu kazandı
    return 0;
  }
  return -1; // Oyun devam ediyor
}

// Oyun temizleme fonksiyonu
function cleanupGame(roomId) {
  if (games.has(roomId)) {
    const game = games.get(roomId);
    game.players.forEach(playerId => {
      playerToGame.delete(playerId);
    });
    games.delete(roomId);
    console.log(`Game ${roomId} cleaned up`);
  }
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
    try {
      if (data.move === 'join') {
        // Oyuna katılma
        socket.walletAddress = data.walletAddress;
        socket.selectedNFT = data.selectedNFT;
        
        console.log(`Player ${socket.id} joining with wallet: ${socket.walletAddress}`);
        console.log(`Selected NFT:`, socket.selectedNFT?.name || 'Unknown');
        
        // Validasyon
        if (!isValidWalletAddress(socket.walletAddress)) {
          socket.emit('errorMessage', 'Invalid wallet address');
          return;
        }
        
        if (!isValidNFT(socket.selectedNFT)) {
          socket.emit('errorMessage', 'Invalid NFT data');
          return;
        }
        
        // Eski oyun temizliği
        if (socket.roomId) {
          const oldGameId = socket.roomId;
          const oldGame = games.get(oldGameId);
          
          if (oldGame) {
            const otherPlayerId = oldGame.players.find(id => id !== socket.id);
            if (otherPlayerId) {
              io.to(otherPlayerId).emit('gameOver', { 
                winner: 'player',
                reason: 'Opponent disconnected'
              });
            }
            cleanupGame(oldGameId);
          }
          
          socket.leave(oldGameId);
          socket.roomId = null;
          socket.playerIndex = null;
        }
        
        // Bekleyen oyuncu kontrolü
        if (waitingPlayer === null) {
          waitingPlayer = socket.id;
          socket.emit('waitingForOpponent');
          console.log(`Player ${socket.id} is now waiting for opponent`);
        } else {
          const waitingPlayerSocket = io.sockets.sockets.get(waitingPlayer);
          
          if (!waitingPlayerSocket) {
            console.log('Waiting player disconnected, setting new waiting player');
            waitingPlayer = socket.id;
            socket.emit('waitingForOpponent');
            return;
          }
          
          // İki oyuncu eşleşti, oyun oluştur
          try {
            const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
            
            console.log(`Game created: ${roomId}`);
            
            // Oyun başlama mesajları
            io.to(waitingPlayer).emit('gameStart', {
              yourIndex: 0,
              you: game.playersData[0],
              enemy: game.playersData[1],
              yourNFT: waitingPlayerSocket.selectedNFT,
              enemyNFT: socket.selectedNFT,
              enemyWalletAddress: socket.walletAddress,
              yourTurn: true // İlk oyuncu başlar
            });
            
            io.to(socket.id).emit('gameStart', {
              yourIndex: 1,
              you: game.playersData[1],
              enemy: game.playersData[0],
              yourNFT: socket.selectedNFT,
              enemyNFT: waitingPlayerSocket.selectedNFT,
              enemyWalletAddress: waitingPlayerSocket.walletAddress,
              yourTurn: false // İkinci oyuncu bekler
            });
            
            waitingPlayer = null;
            
          } catch (error) {
            console.error('Error creating game:', error);
            socket.emit('errorMessage', 'Failed to create game');
            waitingPlayerSocket.emit('errorMessage', 'Failed to create game');
          }
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
      
      console.log(`Player ${playerIndex} performs ${data.move}`);
      
      // Hareketi uygula
      applyMove(data.move, currentPlayerData, otherPlayerData);
      
      // Oyun bitişi kontrolü
      const winnerIndex = checkGameOver(game);
      
      if (winnerIndex !== -1) {
        // Oyun bitti
        console.log(`Game ${roomId} ended, winner: ${winnerIndex}`);
        io.to(roomId).emit('gameOver', {
          winner: winnerIndex === playerIndex ? 'player' : 'enemy',
          winnerNFT: game.playerNFTs[winnerIndex].name,
          reason: 'Combat victory'
        });
        
        // Oyunu temizle
        setTimeout(() => cleanupGame(roomId), 5000);
        return;
      }
      
      // Sıra değiştir
      game.turnIndex = otherPlayerIndex;
      
      // Hareket onayı (mevcut oyuncuya)
      socket.emit('moveConfirmed', {
        you: currentPlayerData,
        enemy: otherPlayerData,
        move: data.move,
        yourTurn: false
      });
      
      // Karşı oyuncuya hareket bilgisi
      const otherPlayerId = game.players[otherPlayerIndex];
      io.to(otherPlayerId).emit('enemyMove', {
        you: otherPlayerData,
        enemy: currentPlayerData,
        move: data.move,
        yourTurn: true
      });
      
    } catch (error) {
      console.error('Error in playerMove:', error);
      socket.emit('errorMessage', 'An error occurred processing your move.');
    }
  });
  
  // Chat mesajları
  socket.on('chatMessage', (data) => {
    try {
      if (!socket.roomId || socket.playerIndex === null) return;
      
      const trimmedMessage = data.message.substring(0, 20);
      
      socket.to(socket.roomId).emit('chatMessage', {
        message: trimmedMessage,
        fromIndex: socket.playerIndex
      });
    } catch (error) {
      console.error('Error in chatMessage:', error);
    }
  });
  
  // Bağlantı kopması
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Bekleyen oyuncu kontrolü
    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
      console.log('Waiting player disconnected');
    }
    
    // Oyun temizliği
    const roomId = socket.roomId;
    if (roomId && games.has(roomId)) {
      const game = games.get(roomId);
      
      const otherPlayerId = game.players.find(id => id !== socket.id);
      if (otherPlayerId) {
        io.to(otherPlayerId).emit('gameOver', { 
          winner: 'player',
          reason: 'Opponent disconnected'
        });
      }
      
      cleanupGame(roomId);
    }
  });
});

// Periyodik oyun temizliği (10 dakikadan eski oyunları temizle)
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 dakika
  
  for (const [roomId, game] of games.entries()) {
    if (now - game.createdAt > maxAge) {
      console.log(`Cleaning up old game: ${roomId}`);
      cleanupGame(roomId);
    }
  }
}, 5 * 60 * 1000); // Her 5 dakikada bir kontrol et

// Serve index.html at root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route handler for game.html
app.get('/game.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    games: games.size,
    waitingPlayer: waitingPlayer ? 'yes' : 'no',
    uptime: process.uptime()
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 NFT PvP Server running on port ${PORT}`);
  console.log(`📝 Supporting NFT contract: ${NFT_CONTRACT_ADDRESS}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
