// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const game = require('./game'); // Your game.js logic (FSMs, physics, boss, etc.)

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Serve public folder ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

// --- Game State ---
let players = {}; // {socketId: {x,y,hp,combo,stunned,...}}
let boss = game.createBoss(); // Your boss object from game.js
let projectiles = [];

// --- Tick loop ---
const TICK_RATE = 60;
setInterval(() => {
  // 1. Update each player
  for (let id in players) {
    const p = players[id];
    game.updatePlayer(p); // Implement movement, attacks, combos, air juggle, wall tech
  }

  // 2. Update boss
  game.updateBoss(boss, Object.values(players)); // AI, attacks, phases, break gauge

  // 3. Update projectiles
  projectiles.forEach(prj => game.updateProjectile(prj));

  // 4. Resolve collisions & hitboxes
  game.resolveCollisions(players, boss, projectiles);

  // 5. Broadcast snapshot to all clients
  io.sockets.emit('state', {
    players: Object.values(players),
    boss: boss,
    projectiles: projectiles
  });
}, 1000 / TICK_RATE);

// --- Socket.IO connections ---
io.on('connection', socket => {
  console.log(`Player connected: ${socket.id}`);

  // Create initial player state
  players[socket.id] = game.createPlayer(socket.id);

  socket.on('input', input => {
    // Update player inputs for next tick
    const p = players[socket.id];
    if (p) p.input = {...input};
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
  });
});

// --- Start server ---
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
