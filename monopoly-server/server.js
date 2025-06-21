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
const chanceCards = [
  { text: "🏦 Bank gives you ₹200", action: (player) => { player.money += 200; } },
  { text: "💸 Pay ₹100 to the bank", action: (player) => { player.money -= 100; } },
  { text: "🚶 Move forward 3 tiles", action: (player) => { player.position = (player.position + 3) % 40; } },
  { text: "↩️ Move backward 2 tiles", action: (player) => { player.position = (player.position + 38) % 40; } },
  { text: "🚔 Go to Jail (tile 10)", action: (player) => { player.position = 10; player.isJailed = true; player.jailTurnsLeft = 1; } },
];

io.on('connection', (socket) => {
  console.log(`🟢 New player connected: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, playerName }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id,
        players: [],
        board: [],
        started: false
      };
    }

    const player = {
      id: socket.id,
      name: playerName,
      color: ['red', 'blue', 'green', 'orange', 'purple', 'pink', 'black', 'brown'][rooms[roomId].players.length],
      position: 0,
      money: 1500,
      isJailed: false,
      jailTurnsLeft: 0
    };

    rooms[roomId].players.push(player);
    socket.join(roomId);
    io.to(roomId).emit('playerJoined', { players: rooms[roomId].players });
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;

    room.started = true;
    room.board = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      name: i % 5 === 0 ? `Special Tile ${i}` : `Property ${i}`,
      type: i % 5 === 0 ? 'special' : 'property',
      price: 100 + i * 10,
      owner: null,
    }));
    room.currentPlayerIndex = 0;

    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: 0,
      log: `🎮 Game started! ${room.players[0].name}'s turn`
    });
  });

  socket.on('rollDice', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    const player = room.players[room.currentPlayerIndex];

    let log = `🎲 ${player.name} rolled a ${roll}`;
    if (player.isJailed) {
      player.jailTurnsLeft -= 1;
      if (player.jailTurnsLeft <= 0) {
        player.isJailed = false;
        log += `. They are now free!`;
      } else {
        log += ` but is still in jail for ${player.jailTurnsLeft} turn(s).`;
        nextTurn(roomId, log);
        return;
      }
    }

    player.position = (player.position + roll) % 40;
    const tile = room.board[player.position];

    if (tile.type === 'property' && tile.owner !== null && tile.owner !== room.currentPlayerIndex) {
      const rent = Math.floor(tile.price * 0.3);
      const owner = room.players[tile.owner];
      if (player.money >= rent) {
        player.money -= rent;
        owner.money += rent;
        log += ` and landed on ${tile.name}, paid ₹${rent} to ${owner.name}`;
      } else {
        log += ` and landed on ${tile.name}, but can't afford rent!`;
      }
    } else if (tile.type === 'property' && tile.owner === null && player.money >= tile.price) {
      tile.owner = room.currentPlayerIndex;
      player.money -= tile.price;
      log += ` and bought ${tile.name} for ₹${tile.price}`;
    } else if (player.position % 3 === 0) {
      const card = chanceCards[Math.floor(Math.random() * chanceCards.length)];
      card.action(player);
      log += `. 🎴 Chance Card: ${card.text}`;
    } else {
      log += ` and landed on ${tile.name}`;
    }

    nextTurn(roomId, log);
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
    console.log(`🔴 Player disconnected: ${socket.id}`);
  });

  function nextTurn(roomId, log) {
    const room = rooms[roomId];
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
      log
    });
  }
});

server.listen(3001, () => {
  console.log('🚀 Server running on http://localhost:3001');
});
