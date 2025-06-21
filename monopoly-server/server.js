const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`🟢 ${socket.id} connected`);

  socket.on('createRoom', ({ roomId, playerName }) => {
    socket.join(roomId);
    rooms[roomId] = createNewRoom();

    const newPlayer = createPlayer(socket.id, playerName, rooms[roomId].players.length);
    rooms[roomId].players.push(newPlayer);

    io.to(roomId).emit('playerJoined', { players: rooms[roomId].players });
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    if (!rooms[roomId] || rooms[roomId].started) return;
    socket.join(roomId);
    const newPlayer = createPlayer(socket.id, playerName, rooms[roomId].players.length);
    rooms[roomId].players.push(newPlayer);
    io.to(roomId).emit('playerJoined', { players: rooms[roomId].players });
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;
    room.started = true;
    emitGameState(roomId, '🎮 Game started!');
  });

  socket.on('rollDice', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    const player = room.players[room.currentPlayerIndex];
    const roll = Math.floor(Math.random() * 6) + 1;
    const doubles = updateDoubles(room, roll);

    if (player.isJailed) {
      handleJailTurn(room, socket, player, roll);
      return;
    }

    player.position = (player.position + roll) % 40;
    const tile = room.board[player.position];

    // Handle special and property tiles
    if (tile.type === 'property' && tile.owner == null) {
      io.to(player.id).emit('tileAction', { type: 'PURCHASE_OFFER', tile, playerMoney: player.money });
      return;
    }

    if (tile.type === 'property' && tile.owner !== room.currentPlayerIndex) {
      handleRent(room, player, tile);
      return;
    }

    switch (tile.name) {
      case 'Go':
        player.money += 200;
        emitGameState(roomId, `${player.name} passed GO and collected ₹200`);
        return;
      case 'Income Tax':
        const tax = 200;
        player.money -= tax;
        emitGameState(roomId, `${player.name} paid Income Tax of ₹${tax}`);
        return;
      case 'Go To Jail':
        sendToJail(room, player);
        emitGameState(roomId, `${player.name} is sent to Jail!`);
        return;
      case 'Chance':
      case 'Community Chest':
        io.to(player.id).emit('tileAction', { type: 'DRAW_CARD', deck: tile.name });
        return;
      default:
        break;
    }

    advanceTurn(roomId, `${player.name} rolled a ${roll} and landed on ${tile.name}`);
  });

  socket.on('buyProperty', ({ roomId }) => {
    const room = rooms[roomId];
    const idx = room.currentPlayerIndex;
    const player = room.players[idx];
    const tile = room.board[player.position];
    if (tile.owner == null && player.money >= tile.price) {
      player.money -= tile.price;
      tile.owner = idx;
      advanceTurn(roomId, `${player.name} bought ${tile.name} for ₹${tile.price}`);
    }
  });

  socket.on('declinePurchase', ({ roomId }) => {
    const room = rooms[roomId];
    startAuction(roomId, room.players[room.currentPlayerIndex].position);
  });

  socket.on('cardResolved', ({ roomId, log }) => {
    advanceTurn(roomId, log);
  });

  socket.on('disconnect', () => {
    cleanupPlayer(socket.id);
    console.log(`🔴 ${socket.id} disconnected`);
  });
});

// ===== Helper Functions =====
function createNewRoom() {
  return {
    board: Array.from({ length: 40 }, (_, i) => ({
      id: i,
      name: i % 5 === 0 ? specialName(i) : `Property ${i}`,
      type: i % 5 === 0 ? 'special' : 'property',
      price: 100 + i * 10,
      owner: null,
    })),
    players: [],
    currentPlayerIndex: 0,
    started: false,
    lastRollDoubles: 0,
  };
}

function createPlayer(id, name, idx) {
  const colors = ['red','blue','green','purple','orange','teal','yellow','pink'];
  return { id, name, position:0, money:1500, color: colors[idx % colors.length], isJailed:false, jailTurnsLeft:0 };
}

function specialName(i) {
  const names = ['Go','Income Tax','Chance','Community Chest','Go To Jail'];
  return names[Math.floor(i/10) % names.length];
}

function advanceTurn(roomId, log) {
  const room = rooms[roomId];
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  emitGameState(roomId, log);
}

function emitGameState(roomId, log) {
  const room = rooms[roomId];
  io.to(roomId).emit('gameState', { board: room.board, players: room.players, currentPlayerIndex: room.currentPlayerIndex, log });
}

function handleRent(room, player, tile) {
  const owner = room.players[tile.owner];
  const rent = Math.floor(tile.price * 0.1);
  player.money -= rent;
  owner.money += rent;
  advanceTurn(room.roomId, `${player.name} paid ₹${rent} rent to ${owner.name}`);
}

function sendToJail(room, player) {
  player.position = 10;
  player.isJailed = true;
  player.jailTurnsLeft = 3;
}

function handleJailTurn(room, socket, player, roll) {
  player.jailTurnsLeft -= 1;
  if (roll === player.lastRoll || player.jailTurnsLeft <= 0) {
    player.isJailed = false;
    player.jailTurnsLeft = 0;
    advanceTurn(room.roomId, `${player.name} got out of jail!`);
  } else {
    advanceTurn(room.roomId, `${player.name} remains in jail (${player.jailTurnsLeft} turns left)`);
  }
}

function updateDoubles(room, roll) {
  if (!room.lastRoll) room.lastRoll = roll;
  if (roll === room.lastRoll) room.lastRollDoubles += 1;
  else room.lastRollDoubles = 0;
  if (room.lastRollDoubles === 3) {
    sendToJail(room, room.players[room.currentPlayerIndex]);
    room.lastRollDoubles = 0;
    return true;
  }
  room.lastRoll = roll;
  return false;
}

function startAuction(roomId, position) {
  // Auction logic placeholder
  emitGameState(roomId, `Auction started for Property ${position}`);
}

function cleanupPlayer(socketId) {
  for (const id in rooms) {
    const room = rooms[id];
    room.players = room.players.filter(p => p.id !== socketId);
    if (room.players.length === 0) delete rooms[id];
    else io.to(id).emit('playerJoined', { players: room.players });
  }
}


// ====== server start ======
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));