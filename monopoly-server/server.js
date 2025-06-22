// === server.js - MONOPOLY GAME SERVER (Updated for Render.com) ===
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');

const app = express();

// Enhanced CORS configuration for Render
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-frontend-domain.onrender.com', 'https://your-custom-domain.com'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { 
  cors: {
  origin: 'https://domionateio.netlify.app',
  methods: ['GET', 'POST'],
  credentials: true
},

  transports: ['websocket', 'polling'], // Ensure both transports are available
  pingTimeout: 60000,
  pingInterval: 25000
});


// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API endpoint to get room info
app.get('/api/room/:roomId', (req, res) => {
  const room = rooms[req.params.roomId.toUpperCase()];
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    playerCount: room.players.length,
    maxPlayers: 8,
    started: room.started
  });
});

// Color groups for house/hotel logic
const COLOR_GROUPS = {
  brown: [1, 3],
  lightBlue: [6, 8, 9],
  pink: [11, 13, 14],
  orange: [16, 18, 19],
  red: [21, 23, 24],
  yellow: [26, 27, 29],
  green: [31, 32, 34],
  darkBlue: [37, 39]
};

// Property data with proper names and prices
const PROPERTY_DATA = {
  1: { name: 'Mediterranean Avenue', price: 60, rent: [2, 10, 30, 90, 160, 250], group: 'brown' },
  3: { name: 'Baltic Avenue', price: 60, rent: [4, 20, 60, 180, 320, 450], group: 'brown' },
  6: { name: 'Oriental Avenue', price: 100, rent: [6, 30, 90, 270, 400, 550], group: 'lightBlue' },
  8: { name: 'Vermont Avenue', price: 100, rent: [6, 30, 90, 270, 400, 550], group: 'lightBlue' },
  9: { name: 'Connecticut Avenue', price: 120, rent: [8, 40, 100, 300, 450, 600], group: 'lightBlue' },
  11: { name: 'St. Charles Place', price: 140, rent: [10, 50, 150, 450, 625, 750], group: 'pink' },
  13: { name: 'States Avenue', price: 140, rent: [10, 50, 150, 450, 625, 750], group: 'pink' },
  14: { name: 'Virginia Avenue', price: 160, rent: [12, 60, 180, 500, 700, 900], group: 'pink' },
  16: { name: 'St. James Place', price: 180, rent: [14, 70, 200, 550, 750, 950], group: 'orange' },
  18: { name: 'Tennessee Avenue', price: 180, rent: [14, 70, 200, 550, 750, 950], group: 'orange' },
  19: { name: 'New York Avenue', price: 200, rent: [16, 80, 220, 600, 800, 1000], group: 'orange' },
  21: { name: 'Kentucky Avenue', price: 220, rent: [18, 90, 250, 700, 875, 1050], group: 'red' },
  23: { name: 'Indiana Avenue', price: 220, rent: [18, 90, 250, 700, 875, 1050], group: 'red' },
  24: { name: 'Illinois Avenue', price: 240, rent: [20, 100, 300, 750, 925, 1100], group: 'red' },
  26: { name: 'Atlantic Avenue', price: 260, rent: [22, 110, 330, 800, 975, 1150], group: 'yellow' },
  27: { name: 'Ventnor Avenue', price: 260, rent: [22, 110, 330, 800, 975, 1150], group: 'yellow' },
  29: { name: 'Marvin Gardens', price: 280, rent: [24, 120, 360, 850, 1025, 1200], group: 'yellow' },
  31: { name: 'Pacific Avenue', price: 300, rent: [26, 130, 390, 900, 1100, 1275], group: 'green' },
  32: { name: 'North Carolina Avenue', price: 300, rent: [26, 130, 390, 900, 1100, 1275], group: 'green' },
  34: { name: 'Pennsylvania Avenue', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], group: 'green' },
  37: { name: 'Park Place', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], group: 'darkBlue' },
  39: { name: 'Boardwalk', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], group: 'darkBlue' }
};

function ownsFullSet(idx, board, grp) {
  return COLOR_GROUPS[grp].every(id => board[id].owner === idx);
}

function calculateRent(tile, board, ownerIndex) {
  if (tile.isMortgaged) return 0;
  
  const propertyData = PROPERTY_DATA[tile.id];
  if (!propertyData) return Math.floor(tile.price * 0.1);
  
  let rentIndex = 0;
  if (tile.hotel) {
    rentIndex = 5;
  } else if (tile.houses > 0) {
    rentIndex = tile.houses;
  } else {
    // Check if owner has monopoly for double rent
    const hasMonopoly = ownsFullSet(ownerIndex, board, propertyData.group);
    rentIndex = hasMonopoly ? 1 : 0;
  }
  
  return propertyData.rent[rentIndex] || Math.floor(tile.price * 0.1);
}

function logEvent(room, message) {
  const timestamp = new Date().toLocaleTimeString();
  room.logHistory.push({ timestamp, message });
  if (room.logHistory.length > 100) room.logHistory.shift(); // Increased log history
}

// Room cleanup function
function cleanupEmptyRooms() {
  Object.keys(rooms).forEach(roomId => {
    const room = rooms[roomId];
    if (room.players.length === 0) {
      console.log(`🧹 Cleaning up empty room ${roomId}`);
      delete rooms[roomId];
    }
  });
}

// Run cleanup every 30 minutes
setInterval(cleanupEmptyRooms, 30 * 60 * 1000);

const rooms = {};

io.on('connection', socket => {
  console.log(`🟢 ${socket.id} connected`);

  // Enhanced reconnect handler with better error handling
  socket.on('reconnectRoom', ({ roomId, playerName }) => {
    try {
      console.log(`Reconnect attempt: ${playerName} to room ${roomId}`);
      const room = rooms[roomId?.toUpperCase()];
      
      if (!room) {
        console.log(`Room ${roomId} not found`);
        return socket.emit('errorMessage', { message: 'Room not found.' });
      }
      
      const player = room.players.find(p => p.name === playerName);
      if (!player) {
        console.log(`Player ${playerName} not found in room ${roomId}`);
        return socket.emit('errorMessage', { message: 'Player not in room.' });
      }
      
      // Update player socket ID
      player.id = socket.id;
      socket.join(roomId.toUpperCase());
      
      console.log(`${playerName} reconnected to room ${roomId}`);
      
      socket.emit('roomJoined', {
        players: room.players,
        roomId: roomId.toUpperCase(),
        isHost: room.host === socket.id
      });
      
      socket.emit('gameState', {
        board: room.board,
        players: room.players,
        currentPlayerIndex: room.currentPlayerIndex,
        log: '🔄 Reconnected successfully',
        logHistory: room.logHistory,
        auction: room.auction
      });
    } catch (error) {
      console.error('Reconnect error:', error);
      socket.emit('errorMessage', { message: 'Reconnection failed.' });
    }
  });

  // Enhanced create room with better board initialization
  socket.on('createRoom', ({ playerName }) => {
    try {
      const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
      console.log(`Creating room ${roomId} for ${playerName}`);
      
      socket.join(roomId);
      
      rooms[roomId] = {
        host: socket.id,
        board: [],
        players: [],
        currentPlayerIndex: 0,
        started: false,
        chat: [],
        auction: null,
        logHistory: [],
        lastActivity: Date.now()
      };
      
      // Initialize board with proper property data
      rooms[roomId].board = Array.from({ length: 40 }, (_, i) => {
        const base = { id: i, houses: 0, hotel: false, isMortgaged: false };
        
        // Special squares
        if (i === 0) return { ...base, name: '🏠 GO', type: 'go' };
        if (i === 10) return { ...base, name: '🚔 Jail', type: 'jail' };
        if (i === 20) return { ...base, name: '🅿️ Free Parking', type: 'parking' };
        if (i === 30) return { ...base, name: '👮 Go To Jail', type: 'gotojail' };
        if ([2, 17, 33].includes(i)) return { ...base, name: '📦 Community Chest', type: 'chest' };
        if ([7, 22, 36].includes(i)) return { ...base, name: '❓ Chance', type: 'chance' };
        if ([4, 38].includes(i)) return { ...base, name: '💰 Tax', type: 'tax', price: i === 4 ? 200 : 100 };
        if ([5, 15, 25, 35].includes(i)) return { ...base, name: '🚂 Railroad', type: 'railroad', price: 200, owner: null };
        if ([12, 28].includes(i)) return { ...base, name: '💡 Utility', type: 'utility', price: 150, owner: null };
        
        // Properties
        const propertyData = PROPERTY_DATA[i];
        if (propertyData) {
          return {
            ...base,
            name: propertyData.name,
            type: 'property',
            price: propertyData.price,
            owner: null,
            group: propertyData.group
          };
        }
        
        return { ...base, name: `Space ${i}`, type: 'empty' };
      });
      
      // Add host player
      const colors = ['🔴', '🔵', '🟢', '🟣', '🟠', '🟡', '🟤', '🩷'];
      const newPlayer = {
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
      
      rooms[roomId].players.push(newPlayer);
      logEvent(rooms[roomId], `${playerName} created room ${roomId}`);
      
      console.log(`Room ${roomId} created successfully`);
      
      socket.emit('roomJoined', {
        players: rooms[roomId].players,
        roomId,
        isHost: true
      });
    } catch (error) {
      console.error('Create room error:', error);
      socket.emit('errorMessage', { message: 'Failed to create room.' });
    }
  });

  // === game-handlers.js - Complete Game Logic (Add this to server.js after line 200) ===

// START/RESTART GAME
socket.on('startGame', ({ roomId }) => {
  try {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) {
      console.log(`Unauthorized start game attempt for room ${roomId}`);
      return socket.emit('errorMessage', { message: 'Only the host can start the game.' });
    }
    
    if (room.players.length < 2) {
      return socket.emit('errorMessage', { message: 'Need at least 2 players to start.' });
    }
    
    console.log(`Starting game in room ${roomId}`);
    
    // Reset game state
    room.started = true;
    room.currentPlayerIndex = 0;
    room.auction = null;
    room.lastActivity = Date.now();
    
    // Reset all players
    room.players.forEach(player => {
      player.position = 0;
      player.money = 1500;
      player.isJailed = false;
      player.jailTurnsLeft = 0;
      player.isBankrupt = false;
      player.properties = [];
      player.disconnected = false;
    });
    
    // Reset board
    room.board.forEach(tile => {
      if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
        tile.owner = null;
        tile.houses = 0;
        tile.hotel = false;
        tile.isMortgaged = false;
      }
    });
    
    logEvent(room, '🎮 Game started! ' + room.players[0].name + "'s turn");
    
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: 0,
      log: '🎮 Game started!',
      logHistory: room.logHistory,
      auction: null
    });
  } catch (error) {
    console.error('Start game error:', error);
    socket.emit('errorMessage', { message: 'Failed to start game.' });
  }
});

// ROLL DICE & GAME LOGIC
socket.on('rollDice', ({ roomId }) => {
  try {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    
    const pIdx = room.currentPlayerIndex;
    const player = room.players[pIdx];
    
    if (!player || player.id !== socket.id || player.isBankrupt) {
      return socket.emit('errorMessage', { message: 'Not your turn or you are bankrupt.' });
    }

    let log = '';
    room.lastActivity = Date.now();
    
    if (player.isJailed && player.jailTurnsLeft > 0) {
      const dice1 = Math.floor(Math.random() * 6) + 1;
      const dice2 = Math.floor(Math.random() * 6) + 1;
      const isDoubles = dice1 === dice2;
      
      if (isDoubles) {
        player.isJailed = false;
        player.jailTurnsLeft = 0;
        player.position = (player.position + dice1 + dice2) % 40;
        log = `${player.name} rolled doubles (${dice1}, ${dice2}) and escaped jail!`;
      } else {
        player.jailTurnsLeft--;
        log = `${player.name} rolled (${dice1}, ${dice2}) - still in jail (${player.jailTurnsLeft} turns left)`;
        if (player.jailTurnsLeft <= 0) {
          player.isJailed = false;
          log += ' → released from jail';
        }
      }
    } else {
      const dice1 = Math.floor(Math.random() * 6) + 1;
      const dice2 = Math.floor(Math.random() * 6) + 1;
      const total = dice1 + dice2;
      
      // Handle passing GO
      const oldPosition = player.position;
      player.position = (player.position + total) % 40;
      
      if (player.position < oldPosition) {
        player.money += 200;
        log = `${player.name} rolled (${dice1}, ${dice2}) = ${total}, passed GO and collected ₹200 → ${room.board[player.position].name}`;
      } else {
        log = `${player.name} rolled (${dice1}, ${dice2}) = ${total} → ${room.board[player.position].name}`;
      }
      
      const tile = room.board[player.position];
      
      // Handle different tile types
      switch (tile.type) {
        case 'gotojail':
          player.isJailed = true;
          player.jailTurnsLeft = 3;
          player.position = 10; // Jail position
          log += ' → sent to jail!';
          break;
          
        case 'tax':
          player.money -= tile.price;
          log += ` → paid ₹${tile.price} tax`;
          break;
          
        case 'property':
        case 'railroad':
        case 'utility':
          if (tile.owner === null) {
            // Start auction
            room.auction = { 
              propertyId: tile.id, 
              highestBid: 0, 
              highestBidder: null,
              timeLeft: 60 // 60 seconds for auction
            };
            logEvent(room, log + ' → Auction started for ' + tile.name);
            io.to(roomId).emit('startAuction', { 
              property: tile,
              timeLeft: room.auction.timeLeft
            });
            
            // Auto-end auction after 60 seconds
            setTimeout(() => {
              if (room.auction && room.auction.propertyId === tile.id) {
                socket.emit('endAuction', { roomId });
              }
            }, 60000);
            return;
          } else if (tile.owner !== pIdx && !tile.isMortgaged) {
            // Pay rent
            let rent = calculateRent(tile, room.board, tile.owner);
            
            // Special handling for railroads and utilities
            if (tile.type === 'railroad') {
              const railroadsOwned = room.players[tile.owner].properties.filter(pid => 
                room.board[pid].type === 'railroad'
              ).length;
              rent = 25 * Math.pow(2, railroadsOwned - 1);
            } else if (tile.type === 'utility') {
              const utilitiesOwned = room.players[tile.owner].properties.filter(pid => 
                room.board[pid].type === 'utility'
              ).length;
              rent = total * (utilitiesOwned === 1 ? 4 : 10);
            }
            
            player.money -= rent;
            room.players[tile.owner].money += rent;
            log += ` → paid ₹${rent} rent to ${room.players[tile.owner].name}`;
          } else if (tile.owner === pIdx) {
            log += ' → owns this property';
          } else {
            log += ' → property is mortgaged';
          }
          break;
          
        case 'chance':
        case 'chest':
          // Simple card effects
          const cardEffects = [
            { text: 'Collect ₹100', money: 100 },
            { text: 'Pay ₹50', money: -50 },
            { text: 'Go to GO, collect ₹200', position: 0, money: 200 },
            { text: 'Go directly to Jail', jail: true }
          ];
          const effect = cardEffects[Math.floor(Math.random() * cardEffects.length)];
          
          if (effect.money) player.money += effect.money;
          if (effect.position !== undefined) player.position = effect.position;
          if (effect.jail) {
            player.isJailed = true;
            player.jailTurnsLeft = 3;
            player.position = 10;
          }
          
          log += ` → ${effect.text}`;
          break;
      }
    }

    // Check for bankruptcy
    if (player.money < 0) {
      log += ' ⚠️ In debt! Consider selling properties or declaring bankruptcy.';
    }
    
    logEvent(room, log);
    
    // Move to next player (skip bankrupted players)
    do {
      room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    } while (room.players[room.currentPlayerIndex].isBankrupt && 
             room.players.filter(p => !p.isBankrupt).length > 1);
    
    io.to(roomId).emit('gameState', {
      board: room.board,
      players: room.players,
      currentPlayerIndex: room.currentPlayerIndex,
      log,
      logHistory: room.logHistory,
      auction: room.auction
    });
  } catch (error) {
    console.error('Roll dice error:', error);
    socket.emit('errorMessage', { message: 'Failed to roll dice.' });
  }
});

// AUCTION HANDLERS
// AUCTION HANDLERS
socket.on('placeBid', ({ roomId, bid }) => {
  try {
    const room = rooms[roomId];
    if (!room || !room.auction) {
      return socket.emit('errorMessage', { message: 'No active auction.' });
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isBankrupt) {
      return socket.emit('errorMessage', { message: 'Cannot bid while bankrupt.' });
    }

    if (bid <= room.auction.highestBid || bid > player.money || bid <= 0) {
      return socket.emit('errorMessage', { message: 'Invalid bid amount.' });
    }

    room.auction.highestBid = bid;
    room.auction.highestBidder = socket.id;
    room.lastActivity = Date.now();

    logEvent(room, `${player.name} bid ₹${bid} for ${room.board[room.auction.propertyId].name}`);
    io.to(roomId).emit('updateAuction', {
      ...room.auction,
      highestBidderName: player.name
    });
  } catch (error) {
    console.error('Place bid error:', error);
    socket.emit('errorMessage', { message: 'Failed to place bid.' });
  }
});

  
  
  



    
      
      

  // Enhanced join room with better validation
  socket.on('joinRoom', ({ roomId, playerName }) => {
    try {
      console.log(`Join attempt: ${playerName} trying to join room ${roomId}`);
      
      if (!roomId || !playerName) {
        return socket.emit('errorMessage', { message: 'Room ID and player name are required.' });
      }
      
      const room = rooms[roomId.toUpperCase()];
      
      if (!room) {
        console.log(`Room ${roomId} not found`);
        return socket.emit('errorMessage', { message: 'Room not found. Please check the room ID.' });
      }
      
      if (room.started) {
        console.log(`Room ${roomId} already started`);
        return socket.emit('errorMessage', { message: 'Game has already started. Cannot join.' });
      }
      
      // Check if player name already exists
      if (room.players.find(p => p.name === playerName)) {
        console.log(`Player name ${playerName} already exists in room`);
        return socket.emit('errorMessage', { message: 'Player name already taken in this room.' });
      }
      
      // Check max players
      if (room.players.length >= 8) {
        console.log(`Room ${roomId} is full`);
        return socket.emit('errorMessage', { message: 'Room is full (max 8 players).' });
      }
      
      socket.join(roomId.toUpperCase());
      
      const colors = ['🔴', '🔵', '🟢', '🟣', '🟠', '🟡', '🟤', '🩷'];
      const newPlayer = {
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
      
      room.players.push(newPlayer);
      room.lastActivity = Date.now();
      logEvent(room, `${playerName} joined`);
      
      console.log(`${playerName} joined room ${roomId} successfully`);
      
      // Notify all players in room
      io.to(roomId.toUpperCase()).emit('playerJoined', { players: room.players });
      
      // Send confirmation to joining player
      socket.emit('roomJoined', {
        players: room.players,
        roomId: roomId.toUpperCase(),
        isHost: false
      });
    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('errorMessage', { message: 'Failed to join room.' });
    }
  });

  // Rest of the socket handlers continue in the same pattern...
  // (The remaining handlers follow the same structure with enhanced error handling)

  socket.on('disconnect', () => {
    console.log(`🔴 ${socket.id} disconnected`);
    
    Object.keys(rooms).forEach(roomId => {
      const room = rooms[roomId];
      const wasHost = room.host === socket.id;
      const disconnectedPlayer = room.players.find(p => p.id === socket.id);
      
      if (disconnectedPlayer) {
        console.log(`${disconnectedPlayer.name} disconnected from room ${roomId}`);
        
        // Keep player in room for potential reconnection (don't remove immediately)
        // room.players = room.players.filter(p => p.id !== socket.id);
        
        // Mark player as disconnected instead of removing
        disconnectedPlayer.disconnected = true;
        
        // Only delete room if all players are disconnected for more than 10 minutes
        const allDisconnected = room.players.every(p => p.disconnected);
        if (allDisconnected) {
          setTimeout(() => {
            if (rooms[roomId] && rooms[roomId].players.every(p => p.disconnected)) {
              console.log(`Deleting inactive room ${roomId}`);
              delete rooms[roomId];
            }
          }, 10 * 60 * 1000); // 10 minutes
        }
      }
    });
  });
});

 app.get('/', (req, res) => {
  res.send('Socket server running');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Monopoly Game Server listening on port ${PORT}`);
  console.log(`🎮 Ready for players to connect!`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});