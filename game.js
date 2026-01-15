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
