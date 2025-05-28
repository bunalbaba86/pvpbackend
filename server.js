const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// ✅ CORS ayarları
app.use(cors({
  origin: ["https://kryptomonbattlearena.netlify.app", "http://localhost:3000"],
  methods: ["GET", "POST"],
  credentials: true
}));

const io = socketIo(server, {
  cors: {
    origin: ["https://kryptomonbattlearena.netlify.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// ✅ OYUN DENGESİ AYARLARI
const GAME_BALANCE = {
  BASE_HP: 120,           // HP artırıldı
  ATTACK_DAMAGE_MIN: 20,  // Attack hasar azaltıldı  
  ATTACK_DAMAGE_MAX: 30,
  SKILL_DAMAGE_MIN: 35,
  SKILL_DAMAGE_MAX: 45,
  ULTIMATE_DAMAGE_MIN: 55,
  ULTIMATE_DAMAGE_MAX: 75,
  DEFEND_HEAL: 20,
  CRITICAL_CHANCE: 0.15,  // %15 kritik şansı
  CRITICAL_MULTIPLIER: 1.5,
  MANA_PER_ATTACK: 1,    // ✅ Attack +1 mana
  MANA_COST_SKILL: 2,
  MANA_COST_ULTIMATE: 6,
  MAX_MANA: 100
};

app.use(express.static('public'));

// Oyun durumu
const gameState = {
  waitingPlayers: [],
  activeGames: new Map(),
  playerSockets: new Map()
};

// Kryptomon isimleri
const kryptomonNames = [
  'Flameclaw', 'Aquafin', 'Thunderwing', 'Earthshard', 'Frostbite',
  'Shadowleap', 'Brightscale', 'Windcutter', 'Ironshell', 'Poisonstrike',
  'Crystalfang', 'Blazetail', 'Tidecrest', 'Stormcaller', 'Rockfist',
  'Iceguard', 'Darkmist', 'Lightbeam', 'Cyclonewing', 'Steelclaw'
];

// ✅ KRİTİK VURUŞ HESAPLAMA
function calculateCritical() {
  return Math.random() < GAME_BALANCE.CRITICAL_CHANCE;
}

// ✅ HASAR HESAPLAMA
function calculateDamage(moveType, isCritical = false) {
  let baseDamage = 0;
  
  switch(moveType) {
    case 'attack':
      baseDamage = Math.floor(Math.random() * (GAME_BALANCE.ATTACK_DAMAGE_MAX - GAME_BALANCE.ATTACK_DAMAGE_MIN + 1)) + GAME_BALANCE.ATTACK_DAMAGE_MIN;
      break;
    case 'skill':
      baseDamage = Math.floor(Math.random() * (GAME_BALANCE.SKILL_DAMAGE_MAX - GAME_BALANCE.SKILL_DAMAGE_MIN + 1)) + GAME_BALANCE.SKILL_DAMAGE_MIN;
      break;
    case 'ultimate':
      baseDamage = Math.floor(Math.random() * (GAME_BALANCE.ULTIMATE_DAMAGE_MAX - GAME_BALANCE.ULTIMATE_DAMAGE_MIN + 1)) + GAME_BALANCE.ULTIMATE_DAMAGE_MIN;
      break;
    case 'defend':
      return GAME_BALANCE.DEFEND_HEAL;
  }
  
  if (isCritical && moveType !== 'defend') {
    baseDamage = Math.floor(baseDamage * GAME_BALANCE.CRITICAL_MULTIPLIER);
  }
  
  return baseDamage;
}

// Rastgele Kryptomon oluştur
function createRandomKryptomon(index) {
  const spriteNum = Math.floor(Math.random() * 20) + 1;
  return {
    name: kryptomonNames[Math.floor(Math.random() * kryptomonNames.length)],
    sprite: `kryptomon${spriteNum}.png`,
    hp: GAME_BALANCE.BASE_HP,
    maxHp: GAME_BALANCE.BASE_HP,
    attack: Math.floor(Math.random() * 20) + 80,
    defense: Math.floor(Math.random() * 20) + 60,
    speed: Math.floor(Math.random() * 30) + 70
  };
}

// Oyuncu oluştur
function createPlayer(socket, playerData) {
  const team = [];
  for (let i = 0; i < 3; i++) {
    team.push(createRandomKryptomon(i));
  }
  
  return {
    id: socket.id,
    name: playerData.playerName || 'Anonymous',
    telegramUserId: playerData.telegramUserId,
    profilePhoto: playerData.profilePhoto,
    team: team,
    activeKryptomon: 0,
    mana: 0  // ✅ Oyuncu seviyesinde mana
  };
}

// Oyun oluştur
function createGame(player1Socket, player2Socket, player1Data, player2Data) {
  const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const player1 = createPlayer(player1Socket, player1Data);
  const player2 = createPlayer(player2Socket, player2Data);
  
  const game = {
    id: gameId,
    players: [player1, player2],
    currentPlayer: Math.floor(Math.random() * 2),
    turnCount: 0,
    gameStartTime: Date.now()
  };
  
  gameState.activeGames.set(gameId, game);
  gameState.playerSockets.set(player1Socket.id, { gameId, playerIndex: 0 });
  gameState.playerSockets.set(player2Socket.id, { gameId, playerIndex: 1 });
  
  return game;
}

// Oyun durumunu kontrol et
function checkGameEnd(game) {
  for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
    const player = game.players[playerIndex];
    const aliveKryptomon = player.team.filter(k => k.hp > 0);
    
    if (aliveKryptomon.length === 0) {
      return {
        isGameOver: true,
        winner: 1 - playerIndex,
        loser: playerIndex
      };
    }
  }
  
  return { isGameOver: false };
}

// Sıradaki canlı Kryptomons geçiş
function switchToNextAliveKryptomon(player) {
  for (let i = 0; i < player.team.length; i++) {
    if (player.team[i].hp > 0) {
      player.activeKryptomon = i;
      return true;
    }
  }
  return false;
}

// Socket bağlantıları
io.on('connection', (socket) => {
  console.log(`✅ Oyuncu bağlandı: ${socket.id}`);
  
  // Oyuncu sayısını gönder
  io.emit('playerCount', io.engine.clientsCount);
  
  // Oyun arama
  socket.on('findGame', (playerData) => {
    console.log(`🔍 Oyun aranıyor: ${socket.id}`, playerData);
    
    // Zaten oyunda mı kontrol et
    if (gameState.playerSockets.has(socket.id)) {
      socket.emit('error', { message: 'Zaten bir oyundasınız!' });
      return;
    }
    
    // Bekleyen oyuncular listesine ekle
    const waitingPlayer = {
      socket: socket,
      data: playerData,
      timestamp: Date.now()
    };
    
    gameState.waitingPlayers.push(waitingPlayer);
    
    // Eşleşme kontrolü
    if (gameState.waitingPlayers.length >= 2) {
      const player1 = gameState.waitingPlayers.shift();
      const player2 = gameState.waitingPlayers.shift();
      
      console.log(`🎮 Oyun eşleşmesi: ${player1.socket.id} vs ${player2.socket.id}`);
      
      const game = createGame(player1.socket, player2.socket, player1.data, player2.data);
      
      // Her iki oyuncuya da oyun bilgisini gönder
      player1.socket.emit('gameFound', {
        ...game,
        yourIndex: 0
      });
      
      player2.socket.emit('gameFound', {
        ...game,
        yourIndex: 1
      });
      
      // İlk tur bilgisini gönder
      player1.socket.emit('turnUpdate', { currentPlayer: game.currentPlayer });
      player2.socket.emit('turnUpdate', { currentPlayer: game.currentPlayer });
    }
  });
  
  // Arama iptal
  socket.on('cancelSearch', () => {
    gameState.waitingPlayers = gameState.waitingPlayers.filter(p => p.socket.id !== socket.id);
    console.log(`❌ Arama iptal edildi: ${socket.id}`);
  });
  
  // ✅ SAVAŞ HAMLESİ DÜZELTİLMİŞ
  socket.on('battleMove', (data) => {
    const playerInfo = gameState.playerSockets.get(socket.id);
    if (!playerInfo) {
      socket.emit('error', { message: 'Oyun bulunamadı!' });
      return;
    }
    
    const game = gameState.activeGames.get(playerInfo.gameId);
    if (!game) {
      socket.emit('error', { message: 'Oyun verisi bulunamadı!' });
      return;
    }
    
    // Sıra kontrolü
    if (game.currentPlayer !== playerInfo.playerIndex) {
      socket.emit('error', { message: 'Sizin sıranız değil!' });
      return;
    }
    
    const attacker = game.players[playerInfo.playerIndex];
    const defender = game.players[1 - playerInfo.playerIndex];
    const { moveType } = data;
    
    // Mana kontrolü
    if (moveType === 'skill' && attacker.mana < GAME_BALANCE.MANA_COST_SKILL) {
      socket.emit('error', { message: 'Yetersiz mana!' });
      return;
    }
    
    if (moveType === 'ultimate' && attacker.mana < GAME_BALANCE.MANA_COST_ULTIMATE) {
      socket.emit('error', { message: 'Yetersiz mana!' });
      return;
    }
    
    // ✅ Kritik vuruş hesapla
    const isCritical = calculateCritical();
    const damage = calculateDamage(moveType, isCritical);
    
    console.log(`⚔️ Hamle: ${moveType}, Hasar: ${damage}, Kritik: ${isCritical}`);
    
    let newHP;
    
    if (moveType === 'defend') {
      // Defend: kendi canını artır
      const activeKryptomon = attacker.team[attacker.activeKryptomon];
      newHP = Math.min(activeKryptomon.hp + damage, GAME_BALANCE.BASE_HP);
      activeKryptomon.hp = newHP;
    } else {
      // Saldırı: düşman canını azalt
      const targetKryptomon = defender.team[defender.activeKryptomon];
      newHP = Math.max(0, targetKryptomon.hp - damage);
      targetKryptomon.hp = newHP;
    }
    
    // ✅ Mana güncellemesi
    if (moveType === 'attack') {
      attacker.mana = Math.min(attacker.mana + GAME_BALANCE.MANA_PER_ATTACK, GAME_BALANCE.MAX_MANA);
    } else if (moveType === 'skill') {
      attacker.mana = Math.max(0, attacker.mana - GAME_BALANCE.MANA_COST_SKILL);
    } else if (moveType === 'ultimate') {
      attacker.mana = Math.max(0, attacker.mana - GAME_BALANCE.MANA_COST_ULTIMATE);
    }
    
    // Hamle bilgisini her iki oyuncuya gönder
    const moveData = {
      attacker: playerInfo.playerIndex,
      defender: 1 - playerInfo.playerIndex,
      moveType,
      damage,
      isCritical,
      newHP,
      attackerMana: attacker.mana,
      defenderMana: defender.mana
    };
    
    io.to(game.players[0].id).emit('battleMove', moveData);
    io.to(game.players[1].id).emit('battleMove', moveData);
    
    // Kryptomon öldü mü kontrol et
    if (moveType !== 'defend') {
      const targetKryptomon = defender.team[defender.activeKryptomon];
      if (targetKryptomon.hp <= 0) {
        console.log(`💀 Kryptomon öldü: ${targetKryptomon.name}`);
        
        // Otomatik olarak canlı Kryptomon'a geçiş yap
        if (!switchToNextAliveKryptomon(defender)) {
          // Oyun bitti
          const gameResult = checkGameEnd(game);
          if (gameResult.isGameOver) {
            console.log(`🏁 Oyun bitti! Kazanan: Player ${gameResult.winner}`);
            
            io.to(game.players[0].id).emit('gameOver', {
              winner: gameResult.winner,
              loser: gameResult.loser,
              totalTurns: game.turnCount
            });
            
            io.to(game.players[1].id).emit('gameOver', {
              winner: gameResult.winner,
              loser: gameResult.loser,
              totalTurns: game.turnCount
            });
            
            // Oyunu temizle
            gameState.activeGames.delete(playerInfo.gameId);
            gameState.playerSockets.delete(game.players[0].id);
            gameState.playerSockets.delete(game.players[1].id);
            return;
          }
        }
      }
    }
    
    // Sıra değiştir
    game.currentPlayer = 1 - game.currentPlayer;
    game.turnCount++;
    
    // Tur güncellemesi gönder
    io.to(game.players[0].id).emit('turnUpdate', { currentPlayer: game.currentPlayer });
    io.to(game.players[1].id).emit('turnUpdate', { currentPlayer: game.currentPlayer });
    
    console.log(`🔄 Sıra değişti: Player ${game.currentPlayer}`);
  });
  
  // ✅ KRYPTOMON DEĞİŞTİRME DÜZELTİLMİŞ
  socket.on('switchKryptomon', (data) => {
    const playerInfo = gameState.playerSockets.get(socket.id);
    if (!playerInfo) {
      socket.emit('error', { message: 'Oyun bulunamadı!' });
      return;
    }
    
    const game = gameState.activeGames.get(playerInfo.gameId);
    if (!game) {
      socket.emit('error', { message: 'Oyun verisi bulunamadı!' });
      return;
    }
    
    // Sıra kontrolü
    if (game.currentPlayer !== playerInfo.playerIndex) {
      socket.emit('error', { message: 'Sizin sıranız değil!' });
      return;
    }
    
    const player = game.players[playerInfo.playerIndex];
    const { newIndex } = data;
    
    // Geçerli index kontrolü
    if (newIndex < 0 || newIndex >= player.team.length) {
      socket.emit('error', { message: 'Geçersiz Kryptomon indexi!' });
      return;
    }
    
    // Aynı Kryptomon kontrolü
    if (newIndex === player.activeKryptomon) {
      socket.emit('error', { message: 'Bu Kryptomon zaten aktif!' });
      return;
    }
    
    // Ölen Kryptomon kontrolü
    if (player.team[newIndex].hp <= 0) {
      socket.emit('error', { message: 'Bu Kryptomon yenilmiş!' });
      return;
    }
    
    const oldIndex = player.activeKryptomon;
    player.activeKryptomon = newIndex;
    
    console.log(`🔄 Kryptomon değiştirildi: Player ${playerInfo.playerIndex}, ${oldIndex} -> ${newIndex}`);
    
    // ✅ Switch bilgisini gönder (sırayı bitirmez)
    const switchData = {
      playerIndex: playerInfo.playerIndex,
      newActiveIndex: newIndex,
      oldActiveIndex: oldIndex
    };
    
    io.to(game.players[0].id).emit('switchKryptomon', switchData);
    io.to(game.players[1].id).emit('switchKryptomon', switchData);
    
    // ✅ SIRAYı DEĞİŞTİRME! Switch sırayı bitirmez.
  });
  
  // Bağlantı koptu
  socket.on('disconnect', () => {
    console.log(`❌ Oyuncu ayrıldı: ${socket.id}`);
    
    // Bekleyen oyuncular listesinden çıkar
    gameState.waitingPlayers = gameState.waitingPlayers.filter(p => p.socket.id !== socket.id);
    
    // Aktif oyundan çıkar
    const playerInfo = gameState.playerSockets.get(socket.id);
    if (playerInfo) {
      const game = gameState.activeGames.get(playerInfo.gameId);
      if (game) {
        // Diğer oyuncuya bildir
        const otherPlayer = game.players[1 - playerInfo.playerIndex];
        if (otherPlayer) {
          io.to(otherPlayer.id).emit('gameOver', {
            winner: 1 - playerInfo.playerIndex,
            reason: 'Rakip oyunu terk etti'
          });
        }
        
        // Oyunu temizle
        gameState.activeGames.delete(playerInfo.gameId);
        gameState.playerSockets.delete(game.players[0]?.id);
        gameState.playerSockets.delete(game.players[1]?.id);
      }
    }
    
    // Oyuncu sayısını güncelle
    io.emit('playerCount', io.engine.clientsCount);
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu başlatıldı: Port ${PORT}`);
  console.log(`📊 Oyun Dengesi: HP=${GAME_BALANCE.BASE_HP}, Attack=${GAME_BALANCE.ATTACK_DAMAGE_MIN}-${GAME_BALANCE.ATTACK_DAMAGE_MAX}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Sunucu kapatılıyor...');
  server.close(() => {
    console.log('✅ Sunucu kapatıldı');
    process.exit(0);
  });
});
