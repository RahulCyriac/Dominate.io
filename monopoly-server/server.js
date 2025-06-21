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

  socket.on('joinRoom', ({ roomId, playerName }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        board: Array.from({ length: 40 }, (_, i) => ({
          id: i,
          name: i % 5 === 0 ? `Special Tile ${i}` : `Property ${i}`,
          type: i % 5 === 0 ? 'special' : 'property',
          price: 100 + i * 10,
          owner: null,
        })),
        players: [],
        currentPlayerIndex: 0,
        started: false,
      };
    }

    const newPlayer = {
      id: socket.id,
      name: playerName,
      position: 0,
      money: 1500,
      color: ['red', 'blue', 'green', 'purple', 'orange', 'teal', 'yellow', 'pink'][rooms[roomId].players.length % 8],
      isJailed: false,
      jailTurnsLeft: 0
    };

    rooms[roomId].players.push(newPlayer);
    io.to(roomId).emit('playerJoined', { players: rooms[roomId].players });
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.started = true;
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
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

server.listen(3001, () => console.log('🚀 Server on http://localhost:3001'));