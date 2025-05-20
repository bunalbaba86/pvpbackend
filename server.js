const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Render için gerekli olabilir

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Gerekirse buraya frontend URL'ni yaz
    methods: ["GET", "POST"]
  }
});

let waitingPlayer = null;

io.on('connection', (socket) => {
  console.log('Bağlandı:', socket.id);

  if (waitingPlayer) {
    const roomId = `room-${waitingPlayer.id}-${socket.id}`;
    socket.join(roomId);
    waitingPlayer.join(roomId);

    io.to(roomId).emit('startGame', { roomId, players: [waitingPlayer.id, socket.id] });
    console.log('Oda oluşturuldu:', roomId);
    waitingPlayer = null;
  } else {
    waitingPlayer = socket;
    socket.emit('waiting', 'Rakip bekleniyor...');
  }

  socket.on('playerMove', ({ roomId, move }) => {
    socket.to(roomId).emit('opponentMove', move);
  });

  socket.on('disconnect', () => {
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
