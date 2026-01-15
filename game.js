const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on", PORT));
const TICK_RATE = 60;
const DT = 1000 / TICK_RATE;

const GRAVITY = 0.9;
const MAX_FALL = 20;

const STAGE = {
  left: 0,
  right: 2000,
  floor: 500,
};

const TECH_WINDOW = 18;
const WALL_SPLAT_TIME = 30;
const MAX_JUGGLE = 5;
class Entity {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;

    this.airborne = false;
    this.onWall = false;
    this.hitstun = 0;
    this.state = "idle";
  }
}
class Player extends Entity {
  constructor(id) {
    super(id, 200, STAGE.floor);
    this.hp = 1000;

    this.combo = 0;
    this.juggle = 0;

    this.canTech = false;
    this.techTimer = 0;

    this.wallSplat = 0;

    this.weapon = "longsword";

    this.input = {};
    this.inputBuffer = [];

    this.locked = false;
  }
}
class Boss extends Entity {
  constructor() {
    super("BOSS", 1200, STAGE.floor);
    this.hp = 8000;
    this.stagger = 0;
    this.phase = 1;

    this.limbs = {
      head: 1000,
      armL: 1500,
      armR: 1500,
      legs: 2000,
    };

    this.techDisabled = false;
    this.finalStagger = false;
  }
}
function bufferInput(player, input) {
  player.inputBuffer.push({
    input,
    frames: 12,
  });
}
function applyPhysics(p) {
  if (p.hitstun > 0) return;

  if (!p.airborne) {
    p.vx *= 0.8;
  } else {
    p.vy += GRAVITY;
    if (p.vy > MAX_FALL) p.vy = MAX_FALL;
  }

  p.x += p.vx;
  p.y += p.vy;

  if (p.y >= STAGE.floor) {
    p.y = STAGE.floor;
    p.vy = 0;
    p.airborne = false;
    p.juggle = 0;
  }

  if (p.x <= STAGE.left || p.x >= STAGE.right) {
    p.onWall = true;
  } else {
    p.onWall = false;
  }
}
class Hitbox {
  constructor(owner, x, y, w, h, data) {
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.data = data;
  }

  hits(target) {
    return !(
      this.x + this.w < target.x ||
      this.x > target.x + 40 ||
      this.y + this.h < target.y - 80 ||
      this.y > target.y
    );
  }
}
function applyHit(attacker, defender, hit) {
  if (defender.hitstun > 0) return;

  defender.hp -= hit.data.damage;
  defender.hitstun = hit.data.hitstun;
  defender.combo++;
  defender.juggle++;

  defender.vx = hit.data.kx * attacker.facing;
  defender.vy = hit.data.ky;
  defender.airborne = true;

  if (defender.onWall) {
    defender.wallSplat = WALL_SPLAT_TIME;
    defender.vx = 0;
  }

  if (defender.juggle >= MAX_JUGGLE) {
    defender.vy = 0;
    defender.hitstun = 40;
  }
}
function attemptTech(p) {
  if (!p.canTech) return;

  p.hitstun = 0;
  p.vx = -p.facing * 6;
  p.vy = -8;
  p.airborne = true;
  p.canTech = false;
}
function wallTech(p) {
  if (p.wallSplat > 0) {
    p.wallSplat = 0;
    p.vx = -p.facing * 10;
    p.vy = -12;
    p.airborne = true;
  }
}
const Weapons = {
  longsword: {
    light(p) {
      return new Hitbox(p, p.x + p.facing * 40, p.y - 40, 50, 20, {
        damage: 40,
        hitstun: 14,
        kx: 6,
        ky: -4,
      });
    },
    heavy(p) {
      return new Hitbox(p, p.x + p.facing * 50, p.y - 60, 70, 30, {
        damage: 90,
        hitstun: 30,
        kx: 10,
        ky: -10,
      });
    },
    launcher(p) {
      return new Hitbox(p, p.x + p.facing * 45, p.y - 70, 60, 40, {
        damage: 70,
        hitstun: 28,
        kx: 2,
        ky: -18,
      });
    },
  },
};
function handleCombos(p) {
  if (p.combo === 1) p.state = "light";
  if (p.combo === 2) p.state = "heavy";
  if (p.combo === 3) p.state = "launcher";
}
function bossHit(boss, dmg) {
  boss.hp -= dmg;
  boss.stagger += dmg * 0.2;

  if (boss.stagger >= 1000 && !boss.finalStagger) {
    boss.finalStagger = true;
    boss.techDisabled = true;
  }
}
function cinematicFinisher(player, boss) {
  if (!boss.finalStagger) return;
  boss.hp = 0;
  player.locked = true;

  io.emit("cinematic", {
    type: "FINISHER",
    player: player.id,
  });
}
let players = {};
let boss = new Boss();

setInterval(() => {
  for (let id in players) {
    let p = players[id];

    if (p.hitstun > 0) p.hitstun--;
    if (p.wallSplat > 0) p.wallSplat--;

    applyPhysics(p);
  }

  io.emit("state", { players, boss });
}, DT);
io.on("connection", (socket) => {
  players[socket.id] = new Player(socket.id);

  socket.on("input", (data) => {
    bufferInput(players[socket.id], data);
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});
function resolveInputs(p) {
  if (p.locked || p.hitstun > 0) return;

  for (let i = p.inputBuffer.length - 1; i >= 0; i--) {
    const buf = p.inputBuffer[i];

    if (buf.frames <= 0) {
      p.inputBuffer.splice(i, 1);
      continue;
    }

    const input = buf.input;

    if (input.left) p.vx = -5, p.facing = -1;
    if (input.right) p.vx = 5, p.facing = 1;

    if (input.jump && !p.airborne) {
      p.vy = -15;
      p.airborne = true;
    }

    if (input.attackLight) performAttack(p, "light");
    if (input.attackHeavy) performAttack(p, "heavy");
    if (input.launcher) performAttack(p, "launcher");

    buf.frames--;
  }
}
function performAttack(p, type) {
  if (p.state !== "idle" && p.state !== "run") return;

  const weapon = Weapons[p.weapon];
  if (!weapon || !weapon[type]) return;

  p.state = type;
  p.attackTimer = 12;

  const hitbox = weapon[type](p);
  activeHitboxes.push(hitbox);
}
let activeHitboxes = [];

function processHitboxes() {
  for (let i = activeHitboxes.length - 1; i >= 0; i--) {
    const hb = activeHitboxes[i];

    for (let id in players) {
      const target = players[id];
      if (target.id === hb.owner.id) continue;

      if (hb.hits(target)) {
        applyHit(hb.owner, target, hb);
        activeHitboxes.splice(i, 1);
        break;
      }
    }
  }
}
function applyComboScaling(defender) {
  const scale = Math.max(0.4, 1 - defender.combo * 0.1);
  return scale;
}
const scale = applyComboScaling(defender);
defender.hp -= hit.data.damage * scale;
function juggleLimiter(p) {
  if (p.juggle > MAX_JUGGLE) {
    p.vx *= 0.5;
    p.vy = 0;
    p.hitstun = 45;
    p.state = "knockdown";
  }
}
function updateTechWindow(p) {
  if (p.airborne && p.hitstun > 0 && !p.canTech) {
    if (p.hitstun < TECH_WINDOW) {
      p.canTech = true;
    }
  }

  if (!p.airborne) {
    p.canTech = false;
  }
}
function updateWallState(p) {
  if (p.wallSplat > 0) {
    p.wallSplat--;

    if (p.canTech && p.input.tech) {
      wallTech(p);
    }
  }
}
function updateWallState(p) {
  if (p.wallSplat > 0) {
    p.wallSplat--;

    if (p.canTech && p.input.tech) {
      wallTech(p);
    }
  }
}
function updateBossPhase(boss) {
  if (boss.phase === 2) {
    boss.techDisabled = true;
  }

  if (boss.phase === 3) {
    boss.finalStagger = true;
    boss.techDisabled = true;
  }
}
function applyUntechable(defender) {
  defender.canTech = false;
  defender.hitstun += 20;
}
function lockAllPlayers() {
  for (let id in players) {
    players[id].locked = true;
  }
}
setInterval(() => {
  for (let id in players) {
    const p = players[id];

    resolveInputs(p);
    updateTechWindow(p);
    updateWallState(p);

    if (p.hitstun > 0) p.hitstun--;
    if (p.attackTimer > 0) p.attackTimer--;

    applyPhysics(p);
    juggleLimiter(p);
  }

  processHitboxes();
  updateBossPhase(boss);

  io.emit("state", { players, boss });
}, DT);
const SERVER_TICK_RATE = 60; 

const FIXED_DT = 1000 / TICK_RATE;
let serverTick = 0;

function fixedUpdate() {
  serverTick++;

  for (let id in players) {
    stepPlayer(players[id]);
  }

  stepBoss(boss);
  resolveCollisions();
  processHitboxes();

  saveSnapshot();
  io.emit("state", { players, boss, tick: serverTick });
}

setInterval(fixedUpdate, FIXED_DT);
const SNAPSHOT_BUFFER = 120;
let snapshots = [];

function saveSnapshot() {
  snapshots.push({
    tick: serverTick,
    players: JSON.parse(JSON.stringify(players)),
    boss: JSON.parse(JSON.stringify(boss))
  });

  if (snapshots.length > SNAPSHOT_BUFFER) {
    snapshots.shift();
  }
}
function rollbackTo(tick) {
  const snap = snapshots.find(s => s.tick === tick);
  if (!snap) return;

  players = JSON.parse(JSON.stringify(snap.players));
  boss = JSON.parse(JSON.stringify(snap.boss));
  serverTick = tick;
}
io.on("connection", socket => {
  socket.on("input", data => {
    const p = players[socket.id];
    if (!p) return;

    if (data.tick < serverTick) {
      rollbackTo(data.tick);
      p.inputBuffer.push(data.input);
      for (let t = data.tick; t < serverTick; t++) fixedUpdate();
    } else {
      p.inputBuffer.push(data.input);
    }
  });
});
const WeaponFSM = {
  katana: {
    idle: {
      light: "slash1",
      heavy: "uppercut"
    },
    slash1: {
      frames: 18,
      next: "slash2",
      dmg: 18
    },
    slash2: {
      frames: 20,
      next: "slash3",
      dmg: 18
    },
    slash3: {
      frames: 22,
      launch: true,
      dmg: 22
    },
    uppercut: {
      frames: 26,
      launcher: true,
      dmg: 24
    }
  }
};
function stepWeaponFSM(p) {
  const fsm = WeaponFSM[p.weapon];
  const state = fsm[p.attackState];
  if (!state) return;

  p.attackFrame++;

  if (p.attackFrame === 5) {
    spawnHitbox(p, state);
  }

  if (p.attackFrame >= state.frames) {
    p.attackState = state.next || "idle";
    p.attackFrame = 0;
  }
}
function routeAttack(p, input) {
  const dir =
    input.up ? "up" :
    input.down ? "down" :
    "neutral";

  if (dir === "up") p.attackState = "uppercut";
  else p.attackState = "slash1";

  p.attackFrame = 0;
}
function applyLauncher(def) {
  def.vy = -18;
  def.vx *= 0.4;
  def.airborne = true;
  def.juggle++;
}
function applyAirScaling(p) {
  if (p.juggle > 0) {
    p.vy += 0.8 + p.juggle * 0.15;
  } else {
    p.vy += 0.6;
  }
}
let hitstopFrames = 0;

function applyHitstop(frames) {
  hitstopFrames = Math.max(hitstopFrames, frames);
}
function resolveCollisions() {
  const list = Object.values(players);

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(a.x - b.x) < 40) {
        const push = (40 - Math.abs(a.x - b.x)) / 2;
        a.x -= push;
        b.x += push;
      }
    }
  }
}
function checkWall(p) {
  if (p.x < 20 || p.x > ARENA_WIDTH - 20) {
    if (p.vx > 10) {
      p.wallSplat = 30;
      p.vx = 0;
    } else {
      p.vx *= -0.6;
    }
  }
}
function tryAirTech(p, input) {
  if (p.canTech && input.tech) {
    p.vx = input.left ? -6 : input.right ? 6 : 0;
    p.vy = -8;
    p.juggle = 0;
    p.hitstun = 0;
  }
}
function stepBoss(b) {
  b.cooldown--;

  if (b.staggered) return;

  if (b.cooldown <= 0) {
    if (b.hp < 200) bossGrab(b);
    else if (Math.random() < 0.5) bossDash(b);
    else bossOrb(b);
  }
}
function bossTakeDamage(b, dmg) {
  if (!b.broken) {
    b.breakGauge -= dmg;
    if (b.breakGauge <= 0) {
      b.broken = true;
      b.staggered = true;
      lockAllPlayers();
    }
  }
  b.hp -= dmg;
}
function cinematicFinish() {
  lockAllPlayers();
  boss.hp = 0;
  boss.dead = true;
}
function stepPlayer(p) {
  resolveInputs(p);
  stepWeaponFSM(p);
  applyAirScaling(p);
  checkWall(p);

  p.x += p.vx;
  p.y += p.vy;

  if (p.y >= GROUND_Y) {
    p.y = GROUND_Y;
    p.airborne = false;
    p.juggle = 0;
  }
}
