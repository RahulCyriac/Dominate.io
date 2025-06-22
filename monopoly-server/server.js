// === server.js - PART 1 ===
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

// Color groups for house/hotel logic
const COLOR_GROUPS = {
  brown:    [1,3],
  lightBlue:[6,8,9],
  pink:     [11,13,14],
  orange:   [16,18,19],
  red:      [21,23,24],
  yellow:   [26,27,29],
  green:    [31,32,34],
  darkBlue: [37,39]
};

function ownsFullSet(idx, board, grp) {
  return COLOR_GROUPS[grp].every(id => board[id].owner === idx);
}

function logEvent(room, message) {
  const timestamp = new Date().toLocaleTimeString();
  room.logHistory.push({ timestamp, message });
  if (room.logHistory.length > 50) room.logHistory.shift();
}

const rooms = {};

io.on('connection', socket => {
  console.log(`🟢 ${socket.id} connected`);

  // --- RECONNECT HANDLER ---
  socket.on('reconnectRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMessage', { message: 'Room not found.' });
    const player = room.players.find(p => p.name === playerName);
    if (!player) return socket.emit('errorMessage', { message: 'Player not in room.' });
    player.id = socket.id;
    socket.join(roomId);
    socket.emit('roomJoined', {
      players: room.players,
      roomId,
      isHost: room.host === socket.id
    });
    socket.emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
      log: '🔄 Reconnected',
      logHistory: room.logHistory
    });
  });

  // --- CREATE ROOM ---
  socket.on('createRoom', ({ playerName }) => {
    const roomId = Math.random().toString(36).substr(2, 6);
    socket.join(roomId);
    rooms[roomId] = {
      host: socket.id,
      board: [],
      players: [],
      currentPlayerIndex: 0,
      started: false,
      chat: [],
      auction: null,
      logHistory: []
    };
    // Initialize board
    rooms[roomId].board = Array.from({ length: 40 }, (_, i) => {
      const base = { id: i, houses: 0, hotel: false, isMortgaged: false };
      if (i === 10) return { ...base, name: '🚔 Go To Jail', type: 'jail' };
      return {
        ...base,
        name: i % 5 === 0 ? `Special ${i}` : `Property ${i}`,
        type: i % 5 === 0 ? 'special' : 'property',
        price: 100 + i * 10,
        owner: null
      };
    });
    // Add host player
    const colors = ['red','blue','green','purple','orange','teal','yellow','pink'];
    const newP = {
      id: socket.id,
      name: playerName,
      position: 0,
      money: 1500,
      isJailed: false,
      jailTurnsLeft: 0,
      isBankrupt: false,
      color: colors[0],
      properties: []
    };
    rooms[roomId].players.push(newP);
    logEvent(rooms[roomId], `${playerName} created room ${roomId}`);
    socket.emit('roomJoined', {
      players: rooms[roomId].players,
      roomId,
      isHost: true
    });
  });

  // --- JOIN ROOM ---
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room || room.started) return socket.emit('errorMessage', { message: 'Invalid room.' });
    socket.join(roomId);
    const colors = ['red','blue','green','purple','orange','teal','yellow','pink'];
    const newP = {
      id: socket.id,
      name: playerName,
      position: 0,
      money: 1500,
      isJailed: false,
      jailTurnsLeft: 0,
      isBankrupt: false,
      color: colors[room.players.length % colors.length],
      properties: []
    };
    room.players.push(newP);
    logEvent(room, `${playerName} joined`);
    io.to(roomId).emit('playerJoined', { players: room.players });
    socket.emit('roomJoined', {
      players: room.players,
      roomId,
      isHost: false
    });
  });

  // --- START/RESTART GAME ---
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;
    
    // Reset game state (allows restarting)
    room.started = true;
    room.currentPlayerIndex = 0;
    room.auction = null;
    
    // Reset all players
    room.players.forEach(player => {
      player.position = 0;
      player.money = 1500;
      player.isJailed = false;
      player.jailTurnsLeft = 0;
      player.isBankrupt = false;
      player.properties = [];
    });
    
    // Reset board
    room.board.forEach(tile => {
      if (tile.type === 'property') {
        tile.owner = null;
        tile.houses = 0;
        tile.hotel = false;
        tile.isMortgaged = false;
      }
    });
    
    logEvent(room, 'Game started/restarted');
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: 0,
      log: '🎮 Game started!',
      logHistory: room.logHistory
    });
  });

  // --- ROLL DICE & GAME LOGIC ---
  socket.on('rollDice', ({ roomId }) => {
    const room = rooms[roomId]; if (!room || !room.started) return;
    const pIdx = room.currentPlayerIndex;
    const player = room.players[pIdx];
    if (player.id !== socket.id || player.isBankrupt) return;

    let log = '';
    if (player.isJailed) {
      player.jailTurnsLeft--;
      log = `${player.name} is in jail (${player.jailTurnsLeft} left)`;
      if (player.jailTurnsLeft <= 0) {
        player.isJailed = false;
        log += ' → released';
      }
    } else {
      const roll = Math.floor(Math.random() * 6) + 1;
      player.position = (player.position + roll) % 40;
      const tile = room.board[player.position];
      log = `${player.name} rolled ${roll} → ${tile.name}`;

      if (tile.type === 'jail') {
        player.isJailed = true;
        player.jailTurnsLeft = 3;
        log += ' → sent to jail';
      } else if (tile.type === 'property') {
        if (tile.owner === null) {
          room.auction = { propertyId: tile.id, highestBid: 0, highestBidder: null };
          logEvent(room, log + ' → Auction started');
          io.to(roomId).emit('startAuction', { property: tile });
          return;
        } else if (tile.owner !== pIdx) {
          let rent = Math.floor(tile.price * 0.2);
          if (tile.hotel) rent *= 5;
          else if (tile.houses > 0) rent *= (tile.houses + 1);
          if (!tile.isMortgaged) {
            player.money -= rent;
            room.players[tile.owner].money += rent;
            log += ` → ₹${rent} rent to ${room.players[tile.owner].name}`;
          } else {
            log += ' → mortgaged, no rent';
          }
        }
      }
    }

    if (player.money < 0) log += ' ⚠️ debt';
    logEvent(room, log);
    room.currentPlayerIndex = (pIdx + 1) % room.players.length;
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
      log,
      logHistory: room.logHistory
    });
  });

  // --- AUCTION HANDLERS ---
  socket.on('placeBid', ({ roomId, bid }) => {
    const room = rooms[roomId]; if (!room || !room.auction) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isBankrupt || bid <= room.auction.highestBid || bid > player.money) return;
    room.auction.highestBid = bid;
    room.auction.highestBidder = socket.id;
    logEvent(room, `${player.name} bid ₹${bid}`);
    io.to(roomId).emit('updateAuction', room.auction);
  });
  
  socket.on('endAuction', ({ roomId }) => {
    const room = rooms[roomId]; if (!room || !room.auction) return;
    const { propertyId, highestBid, highestBidder } = room.auction;
    const tile = room.board[propertyId];
    if (highestBidder) {
      const winner = room.players.find(p => p.id === highestBidder);
      winner.money -= highestBid;
      winner.properties.push(propertyId);
      tile.owner = room.players.indexOf(winner);
      logEvent(room, `${winner.name} won auction for ${tile.name} at ₹${highestBid}`);
    } else {
      logEvent(room, `No bids for ${tile.name}`);
    }
    room.auction = null;
    io.to(roomId).emit('endAuction');
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
      log: `Auction ended for ${tile.name}`,
      logHistory: room.logHistory
    });
  });

  // --- BUILD HOUSES / HOTELS ---
  socket.on('build', ({ roomId, propertyId }) => {
    const room = rooms[roomId]; if (!room) return;
    const idx = room.players.findIndex(p => p.id === socket.id);
    const player = room.players[idx];
    const tile = room.board[propertyId];
    if (tile.owner !== idx || tile.type !== 'property') return;
    const group = Object.keys(COLOR_GROUPS).find(g => COLOR_GROUPS[g].includes(propertyId));
    if (!group || !ownsFullSet(idx, room.board, group)) return;
    const cost = 50;
    if (tile.houses < 4 && player.money >= cost) {
      player.money -= cost;
      tile.houses++;
      logEvent(room, `${player.name} built a house on ${tile.name}`);
    } else if (tile.houses === 4 && !tile.hotel && player.money >= cost) {
      player.money -= cost;
      tile.houses = 0;
      tile.hotel = true;
      logEvent(room, `${player.name} built a hotel on ${tile.name}`);
    }
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
      logHistory: room.logHistory
    });
  });

  // --- MORTGAGE / UNMORTGAGE ---
  socket.on('mortgageProperty', ({ roomId, propertyId }) => {
    const room = rooms[roomId];
    const player = room?.players.find(p => p.id === socket.id);
    const tile = room?.board[propertyId];
    if (tile && tile.owner === room.players.indexOf(player) && !tile.isMortgaged) {
      tile.isMortgaged = true;
      player.money += Math.floor(tile.price / 2);
      logEvent(room, `${player.name} mortgaged ${tile.name}`);
      io.to(roomId).emit('gameState', {
        board: room.board,
        players: room.players,
        currentPlayerIndex: room.currentPlayerIndex,
        logHistory: room.logHistory
      });
    }
  });
  
  socket.on('unmortgageProperty', ({ roomId, propertyId }) => {
    const room = rooms[roomId];
    const player = room?.players.find(p => p.id === socket.id);
    const tile = room?.board[propertyId];
    const cost = Math.ceil((tile.price / 2) * 1.1);
    if (tile && tile.owner === room.players.indexOf(player) && tile.isMortgaged && player.money >= cost) {
      tile.isMortgaged = false;
      player.money -= cost;
      logEvent(room, `${player.name} unmortgaged ${tile.name}`);
      io.to(roomId).emit('gameState', {
        board: room.board,
        players: room.players,
        currentPlayerIndex: room.currentPlayerIndex,
        logHistory: room.logHistory
      });
    }
  });

  // --- TRADE WITH PROPERTIES ---
  socket.on('tradeOffer', ({ roomId, from, to, offerAmount, requestAmount, offerProps, requestProps }) => {
    io.to(to).emit('incomingTrade', { from, offerAmount, requestAmount, offerProps, requestProps });
  });
  
  socket.on('respondToTrade', ({ roomId, accepted, from, offerAmount, requestAmount, offerProps, requestProps }) => {
    const room = rooms[roomId];
    const sender = room?.players.find(p => p.id === from);
    const receiver = room?.players.find(p => p.id === socket.id);
    if (!sender || !receiver) return;
    const valid =
      offerProps.every(pid => sender.properties.includes(pid)) &&
      requestProps.every(pid => receiver.properties.includes(pid)) &&
      sender.money >= offerAmount && receiver.money >= requestAmount;
    if (accepted && valid) {
      sender.money -= offerAmount; receiver.money += offerAmount;
      receiver.money -= requestAmount; sender.money += requestAmount;
      offerProps.forEach(pid => {
        sender.properties = sender.properties.filter(x => x !== pid);
        receiver.properties.push(pid);
        room.board[pid].owner = room.players.indexOf(receiver);
      });
      requestProps.forEach(pid => {
        receiver.properties = receiver.properties.filter(x => x !== pid);
        sender.properties.push(pid);
        room.board[pid].owner = room.players.indexOf(sender);
      });
      logEvent(room, `${receiver.name} accepted trade with ${sender.name}`);
    } else {
      logEvent(room, `${receiver.name} rejected trade with ${sender.name}`);
    }
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
      logHistory: room.logHistory
    });
  });

  // --- CHAT ---
  socket.on('chatMessage', ({ roomId, message, sender }) => {
    const room = rooms[roomId];
    logEvent(room, `${sender}: ${message}`);
    io.to(roomId).emit('chatMessage', { message, sender });
  });

  // --- JAIL & BANKRUPTCY ---
  socket.on('payToLeaveJail', ({ roomId }) => {
    const room = rooms[roomId]; const player = room?.players.find(p => p.id === socket.id);
    if (player && player.money >= 50 && player.isJailed) {
      player.money -= 50; player.isJailed = false; player.jailTurnsLeft = 0;
      logEvent(room, `${player.name} paid ₹50 to leave jail`);
      io.to(roomId).emit('gameState', {
        board: room.board,
        players: room.players,
        currentPlayerIndex: room.currentPlayerIndex,
        logHistory: room.logHistory
      });
    }
  });
  
  socket.on('declareBankruptcy', ({ roomId }) => {
    const room = rooms[roomId]; const player = room?.players.find(p => p.id === socket.id);
    if (player) {
      player.isBankrupt = true; player.money = 0;
      player.properties.forEach(pid => { 
        room.board[pid].owner = null; 
        room.board[pid].isMortgaged = false;
        room.board[pid].houses = 0;
        room.board[pid].hotel = false;
      });
      player.properties = [];
      logEvent(room, `${player.name} went bankrupt`);
      const remaining = room.players.filter(p => !p.isBankrupt);
      if (remaining.length === 1) {
        io.to(roomId).emit('gameOver', { winner: remaining[0].name });
      }
      io.to(roomId).emit('gameState', {
        board: room.board,
        players: room.players,
        currentPlayerIndex: room.currentPlayerIndex,
        logHistory: room.logHistory
      });
    }
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    for (const rid in rooms) {
      const room = rooms[rid];
      const wasHost = room.host === socket.id;
      
      room.players = room.players.filter(p => p.id !== socket.id);
      
      if (room.players.length === 0) {
        delete rooms[rid];
      } else {
        // Transfer host if needed
        if (wasHost && room.players.length > 0) {
          room.host = room.players[0].id;
          logEvent(room, `${room.players[0].name} is now the host`);
        }
        io.to(rid).emit('playerJoined', { 
          players: room.players,
          newHost: wasHost ? room.players[0].id : null
        });
      }
    }
    console.log(`🔴 ${socket.id} disconnected`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Listening on ${PORT}`));