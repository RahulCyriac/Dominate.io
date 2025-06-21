// server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`🟢 ${socket.id} connected`);

  socket.on('createRoom', ({ playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    socket.join(roomId);
    rooms[roomId] = {
      host: socket.id,
      board: [],
      players: [],
      currentPlayerIndex: 0,
      started: false,
      chat: [],
    };

    const newPlayer = {
      id: socket.id,
      name: playerName,
      position: 0,
      money: 1500,
      isJailed: false,
      jailTurnsLeft: 0
    };

    rooms[roomId].players.push(newPlayer);
    socket.emit('roomJoined', { players: rooms[roomId].players, roomId, isHost: true });
  });

  socket.on('joinRoom', ({ playerName, roomId }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;

    socket.join(roomId);

    const newPlayer = {
      id: socket.id,
      name: playerName,
      position: 0,
      money: 1500,
      isJailed: false,
      jailTurnsLeft: 0
    };

    room.players.push(newPlayer);
    io.to(roomId).emit('playerJoined', { players: room.players });
    socket.emit('roomJoined', { players: room.players, roomId, isHost: false });
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.started || room.host !== socket.id) return;

    room.started = true;
    room.board = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      name: i % 5 === 0 ? `Special Tile ${i}` : `Property ${i}`,
      type: i % 5 === 0 ? 'special' : 'property',
      price: 100 + i * 10,
      owner: null
    }));

    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: 0,
      log: '🎮 Game started!'
    });
  });

  socket.on('rollDice', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    const player = room.players[room.currentPlayerIndex];
    player.position = (player.position + roll) % 40;
    const tile = room.board[player.position];

    let log = `${player.name} rolled a ${roll} and landed on ${tile.name}`;

    if (tile.type === 'property' && tile.owner === null && player.money >= tile.price) {
      tile.owner = room.currentPlayerIndex;
      player.money -= tile.price;
      log += `. They bought it for ₹${tile.price}`;
    }

    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;

    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
      log
    });
  });

  socket.on('chatMessage', ({ roomId, name, message }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.chat.push({ name, message });
    io.to(roomId).emit('chatMessage', { name, message });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);

      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('playerJoined', { players: room.players });
      }
    }

    console.log(`🔴 ${socket.id} disconnected`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
