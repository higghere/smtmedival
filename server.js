const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // serve client.html + client.js

// ------------------ GAME STATE ------------------
const TICK_RATE = 60;
const GRAVITY = 0.6;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;

const players = {}; // keyed by socket.id
let boss = null;

// ------------------ PLAYER CLASS ------------------
class Player {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = 100;
    this.facing = 1;
    this.onGround = true;
    this.inputs = {};
    this.weapon = "longsword";
    this.weaponState = "idle";
    this.comboCounter = 0;
    this.airJuggle = 0;
  }
}

// ------------------ PHYSICS ------------------
function applyPhysics(p) {
  if (!p.onGround) {
    p.vy += GRAVITY;
  }

  p.x += p.vx;
  p.y += p.vy;

  // Floor
  if (p.y >= CANVAS_HEIGHT - 64) {
    p.y = CANVAS_HEIGHT - 64;
    p.vy = 0;
    p.onGround = true;
    p.airJuggle = 0;
  } else {
    p.onGround = false;
  }

  // Walls
  if (p.x < 0) { p.x = 0; p.vx = 0; }
  if (p.x > CANVAS_WIDTH - 48) { p.x = CANVAS_WIDTH - 48; p.vx = 0; }
}

// ------------------ GAME LOOP ------------------
function gameLoop() {
  Object.values(players).forEach(p => {
    // apply inputs
    const speed = 5;
    if (p.inputs.left) p.vx = -speed;
    else if (p.inputs.right) p.vx = speed;
    else p.vx = 0;

    if (p.inputs.jump && p.onGround) { p.vy = -12; p.onGround = false; }

    applyPhysics(p);
  });

  if (boss) updateBoss(boss);

  // broadcast state
  io.emit("stateUpdate", { players, boss });

  setTimeout(gameLoop, 1000 / TICK_RATE);
}

// ------------------ BOSS (simple) ------------------
function initBoss() {
  boss = {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 100,
    hp: 500,
    speed: 2,
    staggered: false
  };
}

function updateBoss(b) {
  if (b.staggered) return;
  // very simple AI: move toward first player
  const pList = Object.values(players);
  if (!pList.length) return;

  const target = pList[0];
  b.x += target.x > b.x ? b.speed : -b.speed;
}

// ------------------ SOCKET.IO ------------------
io.on("connection", socket => {
  console.log(`Player connected: ${socket.id}`);
  players[socket.id] = new Player(socket.id, 100, CANVAS_HEIGHT - 100);

  socket.on("input", data => {
    if (players[socket.id]) players[socket.id].inputs = data;
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

// ------------------ START ------------------
initBoss();
gameLoop();
server.listen(3000, () => console.log("Server running on port 3000"));
