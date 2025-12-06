
require('dotenv').config({ path: '.env' });
const express = require("express");
const app = express();
const http = require("http").createServer(app);

const io = require("socket.io")(http, {
  cors: {
    origin: "*", // Allow all origins for Unity and web clients
    methods: ["GET", "POST"],
    credentials: true // Optional, if you need credentials
  }
});

// Basic route to confirm server is running
app.get("/", (req, res) => {
  res.send("Socket.io server is running");
});

// const io = require("socket.io")(10001, {
//   cors: {
//     origin: "*" // ["http://localhost:5173"]
//   }
// });

// const rooms = new Map(); // Map to store room data: { members: [socket.id], controllerIds: Map(socket.id -> controllerId), nextControllerId: number }
// // Store nicknames associated with socket IDs
// const nicknames = new Map();
// const userRooms = new Map(); // Map to store socket.id -> current room

const rooms = new Map(); // Map to store room data: { members: [socket.id], networkControllerIds: Map(socket.id -> networkControllerId), nextNetworkControllerId: number }
const nicknames = new Map(); // Map to store socket.id -> nickname mappings
const userRooms = new Map(); // Map to store socket.id -> current room

io.on("connection", (socket) => {
  console.log('User connected to game server: ', socket.id);

  // Handle nickname setup
  socket.on('setNickname', (nickname) => {
    if (typeof nickname === 'string' && nickname.trim()) {
      nicknames.set(socket.id, nickname.trim());
      console.log(`Nickname set for ${socket.id}: ${nickname}`);
    } else {
      console.log(`Invalid nickname received from ${socket.id}`);
    }
  });

  socket.on('join-room', (room) => {
    console.log(`${socket.id}:${nicknames.get(socket.id)} wants to join room ${room}`);
    
    // Leave any previous room
    const currentRoom = userRooms.get(socket.id);
    if (currentRoom && rooms.has(currentRoom)) {
      const roomData = rooms.get(currentRoom);
      const index = roomData.members.indexOf(socket.id);
      if (index !== -1) {
        roomData.members.splice(index, 1);
        roomData.networkControllerIds.delete(socket.id);
        // Emit room-member-left to the previous room (excluding the leaving user)
        socket.to(currentRoom).emit('room-member-left', {
          socketId: socket.id,
          nickname: nicknames.get(socket.id) || 'Unknown'
        });
        // Emit update-room-members to all clients in the previous room
        const memberData = roomData.members.map((id) => ({
          socketId: id,
          nickname: nicknames.get(id) || 'Unknown',
          networkControllerId: roomData.networkControllerIds.get(id)
        }));
        io.to(currentRoom).emit('update-room-members', currentRoom, memberData);
        if (roomData.members.length === 0) {
          rooms.delete(currentRoom); // Clean up empty room
        }
        socket.leave(currentRoom);
        console.log(`${socket.id} left room ${currentRoom}`);
      }
    }

    // Initialize new room if it doesn't exist
    if (!rooms.has(room)) {
      rooms.set(room, {
        members: [],
        networkControllerIds: new Map(),
        nextNetworkControllerId: 0
      });
    }

    // Add socket to room membership
    socket.join(room);
    
    const roomData = rooms.get(room);
    // Add user to the room's member array and assign networkControllerId if not already present
    if (!roomData.members.includes(socket.id)) {
      roomData.members.push(socket.id);
      roomData.networkControllerIds.set(socket.id, roomData.nextNetworkControllerId);
      roomData.nextNetworkControllerId += 1; // Increment for the next user
    }

    // Update userRooms to track the user's current room
    userRooms.set(socket.id, room);

    // Get the user's networkControllerId
    const networkControllerId = roomData.networkControllerIds.get(socket.id);

    // Emit room-member-join to the room (excluding the joining user)
    socket.to(room).emit('room-member-join', {
      socketId: socket.id,
      nickname: nicknames.get(socket.id) || 'Unknown',
      networkControllerId: networkControllerId
    });

    // Send the room and networkControllerId back to the client
    io.to(socket.id).emit('join-room', room, networkControllerId);

    // Emit update-room-members to all clients in the room
    const memberData = roomData.members.map((id) => ({
      socketId: id,
      nickname: nicknames.get(id) || 'Unknown',
      networkControllerId: roomData.networkControllerIds.get(id)
    }));
    io.to(room).emit('update-room-members', room, memberData);

    console.log(`Rooms for ${socket.id}:`, socket.rooms);
    console.log(`Room ${room} members:`, roomData.members);
    console.log(`Room ${room} networkControllerIds:`, Object.fromEntries(roomData.networkControllerIds));
  });

  /*socket.on('join-room', (room) => {
    console.log(`${socket.id}:${nicknames.get(socket.id)} wants to join room ${room}`);
    
    // Leave any previous room
    const currentRoom = userRooms.get(socket.id);
    if (currentRoom && rooms.has(currentRoom)) {
      const roomData = rooms.get(currentRoom);
      const index = roomData.members.indexOf(socket.id);
      if (index !== -1) {
        roomData.members.splice(index, 1);
        // Emit update-room-members to all clients in the previous room
        const memberData = roomData.members.map((id) => ({
          socketId: id,
          nickname: nicknames.get(id) || 'Unknown'
        }));
        io.to(currentRoom).emit('update-room-members', currentRoom, memberData);
        if (roomData.members.length === 0) {
          rooms.delete(currentRoom); // Clean up empty room
        }
        socket.leave(currentRoom);
        console.log(`${socket.id} left room ${currentRoom}`);
      }
    }

    // Initialize new room if it doesn't exist
    if (!rooms.has(room)) {
      rooms.set(room, { members: [] });
    }

    // Add socket to room membership
    socket.join(room);
    
    const roomData = rooms.get(room);
    // Add user to the room's member array if not already present
    if (!roomData.members.includes(socket.id)) {
      roomData.members.push(socket.id);
    }

    // Update userRooms to track the user's current room
    userRooms.set(socket.id, room);

    // Send the room back to the client
    io.to(socket.id).emit('join-room', room);

    // Emit room-member-join to the room (excluding the joining user)
    socket.to(room).emit('room-member-join', {
      socketId: socket.id,
      nickname: nicknames.get(socket.id) || 'Unknown'
    });

    // Emit update-room-members to all clients in the room
    const memberData = roomData.members.map((id) => ({
      socketId: id,
      nickname: nicknames.get(id) || 'Unknown'
    }));
    io.to(room).emit('update-room-members', room, memberData);

    console.log(`Rooms for ${socket.id}:`, socket.rooms);
    console.log(`Room ${room} members:`, roomData.members);
  });*/

  // Handle incoming messages
  socket.on('message', (msg, room) => {
    if (typeof msg !== 'string' || msg.trim() === '') {
      console.log('Invalid message received:', msg);
      return;
    }
    console.log('Message received:', msg, ` (room:${room})`);
    // Broadcast message to all connected clients
    if (room === '') {
      console.log('broadcast msg to all');
      io.emit('message', socket.id, nicknames.get(socket.id), msg);
    } else {
      console.log('send msg to room members');
      io.to(room).emit('message', socket.id, nicknames.get(socket.id), msg);
      // io.to(socket.id).emit('message', socket.id, nicknames.get(socket.id), msg);
    }
  });

  // Handle incoming messages
  socket.on('broadcast-data', (param, room) => {
    if (typeof param !== 'string') {
      console.log('Invalid param received:', param);
      return;
    }
    console.log('broadcast-data received:', param, ` (room:${room})`);
    // Broadcast attack to all connected clients
    if (room === '') {
    } else {
      console.log('send broadcast-data to room members');
      io.to(room).emit('broadcast-data', socket.id, nicknames.get(socket.id), param);
    }
  });

  // // Handle incoming messages
  // socket.on('ready', (isReady, room) => {
  //   if (typeof isReady !== 'boolean') {
  //     console.log('Invalid ready received:', isReady);
  //     return;
  //   }
  //   console.log('Ready received:', isReady, ` (room:${room})`);
  //   // Broadcast ready to all connected clients
  //   if (room === '') {
  //   } else {
  //     console.log('send ready to room members');
  //     io.to(room).emit('ready', socket.id, nicknames.get(socket.id), isReady);
  //   }
  // });

  // // Handle incoming messages
  // socket.on('attack', (param, room) => {
  //   if (typeof param !== 'string') {
  //     console.log('Invalid param received:', param);
  //     return;
  //   }
  //   console.log('Attack received:', param, ` (room:${room})`);
  //   // Broadcast attack to all connected clients
  //   if (room === '') {
  //   } else {
  //     console.log('send attack to room members');
  //     io.to(room).emit('attack', socket.id, nicknames.get(socket.id), param);
  //   }
  // });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
    
    // Remove user from their current room
    const room = userRooms.get(socket.id);
    if (room && rooms.has(room)) {
      const roomData = rooms.get(room);
      const index = roomData.members.indexOf(socket.id);
      if (index !== -1) {
        roomData.members.splice(index, 1);
        roomData.networkControllerIds.delete(socket.id);
        // Emit room-member-left to the room
        io.to(room).emit('room-member-left', {
          socketId: socket.id,
          nickname: nicknames.get(socket.id) || 'Unknown'
        });
        // Emit update-room-members to all clients in the room
        const memberData = roomData.members.map((id) => ({
          socketId: id,
          nickname: nicknames.get(id) || 'Unknown',
          networkControllerId: roomData.networkControllerIds.get(id)
        }));
        io.to(room).emit('update-room-members', room, memberData);
        if (roomData.members.length === 0) {
          rooms.delete(room); // Clean up empty room
        }
      }
    }

    // Clean up user data
    userRooms.delete(socket.id);
    nicknames.delete(socket.id);
  });
  
  /*
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
    
    // Remove user from their current room
    const room = userRooms.get(socket.id);
    if (room && rooms.has(room)) {
      const roomData = rooms.get(room);
      const index = roomData.members.indexOf(socket.id);
      if (index !== -1) {
        roomData.members.splice(index, 1);

        // Emit room-member-left to the room
        io.to(room).emit('room-member-left', {
          socketId: socket.id,
          nickname: nicknames.get(socket.id) || 'Unknown'
        });
        
        // Emit update-room-members to all clients in the room
        const memberData = roomData.members.map((id) => ({
          socketId: id,
          nickname: nicknames.get(id) || 'Unknown'
        }));
        io.to(room).emit('update-room-members', room, memberData);
        if (roomData.members.length === 0) {
          rooms.delete(room); // Clean up empty room
        }
      }
    }

    // Clean up user data
    userRooms.delete(socket.id);
    nicknames.delete(socket.id);
  });
  */

  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Use Render's assigned port or fallback to 3000 for local development
const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
  console.log(`Game server running on port ${PORT}`);
});

/*

/////////////////////////////////////////////////////////////////////////////////////////////////////////
// TCP - Lobby
/////////////////////////////////////////////////////////////////////////////////////////////////////////
const lobby = require("socket.io")(10000, {
  cors: {
    origin: "*" // ["http://localhost:5173"]
  }
});

const queue = []; // Array to store players in matchmaking queue
const matches = new Map(); // Map to store active matches
const QUEUE_TIMEOUT = 30000; // 30 seconds timeout for queue

lobby.on('connection', (socket) => {
    console.log('A user connected to lobby:', socket.id);

    // Handle player joining the matchmaking queue
    socket.on('joinQueue', (playerData) => {
        const player = {
            id: socket.id,
            name: playerData.name || `Player_${socket.id.slice(0, 4)}`,
            skillLevel: playerData.skillLevel || 0,
            joinTime: Date.now() // Track when player joined
        };

        // Prevent duplicate queue entries
        if (!queue.some(p => p.id === player.id)) {
            queue.push(player);
            console.log(`${player.name} joined the queue`);
            socket.emit('queueStatus', { status: 'waiting', queueLength: queue.length });
            tryMatchmaking();
        }
    });

    // Handle player leaving the queue
    socket.on('leaveQueue', () => {
        const index = queue.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            const player = queue.splice(index, 1)[0];
            console.log(`${player.name} left the queue`);
            socket.emit('queueStatus', { status: 'left' });
            lobby.emit('queueUpdate', { queueLength: queue.length });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const index = queue.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            const player = queue.splice(index, 1)[0];
            console.log(`${player.name} disconnected from queue`);
            lobby.emit('queueUpdate', { queueLength: queue.length });
        }
        console.log('A user disconnected:', socket.id);
    });

    // Matchmaking logic
    function tryMatchmaking() {
        if (queue.length >= 2) {
            const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const matchId = `match_${Date.now()}_${randomNum}`;
            const players = queue.splice(0, 2); // Take first 2 players
            matches.set(matchId, players);

            players.forEach(player => {
                lobby.to(player.id).emit('matchFound', {
                    matchId,
                    opponents: players.filter(p => p.id !== player.id).map(p => p.name),
                    players: players.map(p => ({ id: p.id, name: p.name }))
                });
            });

            console.log(`Match created: ${matchId} with players ${players.map(p => p.name).join(', ')}`);
            lobby.emit('queueUpdate', { queueLength: queue.length });
        }
    }
});

// Periodic matchmaking check and timeout handling
setInterval(() => {
    const now = Date.now();
    // Check for timed-out players
    for (let i = queue.length - 1; i >= 0; i--) {
        const player = queue[i];
        if (now - player.joinTime > QUEUE_TIMEOUT) {
            queue.splice(i, 1);
            lobby.to(player.id).emit('queueStatus', { status: 'timeout', message: 'No match found in time' });
            console.log(`${player.name} timed out from queue`);
        }
    }
    // Try matchmaking if there are enough players
    if (queue.length >= 2) {
        tryMatchmaking();
    }
    // Update queue length for all clients
    lobby.emit('queueUpdate', { queueLength: queue.length });
}, 5000); // Check every 5 seconds


/////////////////////////////////////////////////////////////////////////////////////////////////////////
// TCP - Game Server
/////////////////////////////////////////////////////////////////////////////////////////////////////////
const io = require("socket.io")(10001, {
  cors: {
    origin: "*" // ["http://localhost:5173"]
  }
});

// Store nicknames associated with socket IDs
const nicknames = new Map();

// Store room membership: room name -> Set of socket IDs
const rooms = new Map();

io.on("connection", (socket) => {
  console.log('User connected to game server: ', socket.id);

  // Handle nickname setup
  socket.on('setNickname', (nickname) => {
    if (typeof nickname === 'string' && nickname.trim()) {
      nicknames.set(socket.id, nickname.trim());
      console.log(`Nickname set for ${socket.id}: ${nickname}`);
    } else {
      console.log(`Invalid nickname received from ${socket.id}`);
    }
  });

  socket.on('join-room', (room) => {
    console.log(`${socket.id}:${nicknames.get(socket.id)} wants to join room ${room}`);
    
    // Add socket to room membership
    // if (!rooms.has(room)) {
    //   rooms.set(room, new Set());
    // }

    socket.join(room);
    io.to(socket.id).emit('join-room', room);

    console.log(`Rooms for ${socket.id}:`, socket.rooms); // Log rooms
  });

  // Handle incoming messages
  socket.on('message', (msg, room) => {
    if (typeof msg !== 'string' || msg.trim() === '') {
      console.log('Invalid message received:', msg);
      return;
    }
    console.log('Message received:', msg, ` (room:${room})`);
    // Broadcast message to all connected clients
    if (room === '') {
      console.log('broadcast msg to all');
      io.emit('message', socket.id, nicknames.get(socket.id), msg);
    } else {
      console.log('send msg to room members');
      io.to(room).emit('message', socket.id, nicknames.get(socket.id), msg);
      // io.to(socket.id).emit('message', socket.id, nicknames.get(socket.id), msg);
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////
// TCP - Chat
/////////////////////////////////////////////////////////////////////////////////////////////////////////
const chatServer = require("socket.io")(10002, {
  cors: {
    origin: "*" // ["http://localhost:5173"]
  }
});

// Store nicknames associated with socket IDs
const chatDisplayNames = new Map();

chatServer.on("connection", (socket) => {
  console.log(socket.id);

  // Handle display name setup
  socket.on('setDisplayName', (displayName) => {
    if (typeof displayName === 'string' && displayName.trim()) {
      chatDisplayNames.set(socket.id, displayName.trim());
      console.log(`DisplayName set for ${socket.id}: ${displayName}`);
    } else {
      console.log(`Invalid DisplayName received from ${socket.id}`);
    }
  });

  // Handle incoming messages
  socket.on('message', (msg) => {
    if (typeof msg !== 'string' || msg.trim() === '') {
      console.log('Invalid message received:', msg);
      return;
    }
    // console.log('Message received:', msg);
    // Broadcast message to all connected clients
    chatServer.emit('message', socket.id, chatDisplayNames.get(socket.id), msg);
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

*/