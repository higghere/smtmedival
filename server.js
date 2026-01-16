const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ==================== CONSTANTS ====================
const TICK_RATE = 60;
const GRAVITY = 0.6;
const FLOOR_FRICTION = 0.85;
const AIR_FRICTION = 0.98;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;

const WEAPON_STATES = {
  IDLE: "idle",
  ATTACK: "attack",
  HEAVY: "heavy",
  CHARGED: "charged",
  GRAB: "grab",
  STAGGER: "stagger",
  AIRBORNE: "airborne",
  JUMP_ATTACK: "jump_attack",
  PARRY: "parry"
};

// ==================== PLAYER CLASS ====================
class Player {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.vx = 0;
    this.vy = 0;
    this.width = 48;
    this.height = 64;
    this.hp = 100;
    this.maxHp = 100;
    this.color = id.length % 2 === 0 ? "blue" : "red";
    this.facing = 1;
    this.onGround = false;
    this.onWall = false;
    this.wallTimer = 0;
    this.grappling = false;
    this.grappleTarget = null;
    this.grabbing = false;
    this.grabbed = false;
    this.comboCounter = 0;
    this.lastHitTime = null;
    this.airJuggle = 0;
    this.weapon = "longsword";
    this.weaponState = WEAPON_STATES.IDLE;
    this.weaponTimer = 0;
    this.inputs = {};
    this.gold = 0;
    this.xp = 0;
    this.hitstun = 0;
    this.stunned = false;
    this.weapons = ["longsword", "katana", "scythe", "fist_tanto"];
  }
}

// ==================== BOSS CLASS ====================
class Boss {
  constructor() {
    this.x = CANVAS_WIDTH / 2;
    this.y = CANVAS_HEIGHT - 150;
    this.hp = 500;
    this.maxHp = 500;
    this.speed = 2;
    this.staggered = false;
    this.staggerTimer = 0;
    this.breakGauge = 0;
    this.breakThreshold = 100;
    this.attackCooldown = 0;
    this.phase = 1;
    this.limbs = {
      leftArm: { hp: 100, maxHp: 100, broken: false, state: "idle" },
      rightArm: { hp: 100, maxHp: 100, broken: false, state: "idle" }
    };
  }
}

// ==================== GAME STATE ====================
const players = {};
let boss = new Boss();
let projectiles = [];
let particles = [];

// ==================== PHYSICS ====================
function applyPhysics(p, dt) {
  if (!p.onGround && !p.grappling) {
    p.vy += GRAVITY;
    p.vy *= AIR_FRICTION;
  } else {
    p.vx *= FLOOR_FRICTION;
  }

  p.x += p.vx * dt * TICK_RATE;
  p.y += p.vy * dt * TICK_RATE;

  // Floor collision
  if (p.y + p.height >= CANVAS_HEIGHT) {
    p.y = CANVAS_HEIGHT - p.height;
    p.vy = 0;
    p.onGround = true;
    p.airJuggle = 0;
  } else {
    p.onGround = false;
  }

  // Wall collision and wall splat
  if (p.x < 0) {
    if (p.vx < -5) wallSplat(p, 0);
    p.x = 0;
    p.vx = 0;
  } else if (p.x + p.width > CANVAS_WIDTH) {
    if (p.vx > 5) wallSplat(p, CANVAS_WIDTH);
    p.x = CANVAS_WIDTH - p.width;
    p.vx = 0;
  }
}

// ==================== WALL MECHANICS ====================
function wallSplat(player, wallX) {
  player.vx = 0;
  player.vy = 0;
  player.onWall = true;
  player.wallTimer = 0.5;
  player.hp -= 10;
  player.stunned = true;
  setTimeout(() => { player.stunned = false; }, 300);
}

function wallTech(player) {
  if (player.onWall && player.wallTimer <= 0) {
    player.vx = player.facing * 3;
    player.vy = -2;
    player.onWall = false;
    player.comboCounter = 0;
  }
}

// ==================== COMBO SCALING ====================
function applyComboScaling(defender) {
  const scale = 1 - defender.comboCounter * 0.05;
  return Math.max(scale, 0.5);
}

// ==================== HIT REGISTRATION ====================
function registerHit(attacker, defender, damage, knockbackX = 0, knockbackY = 0) {
  const scale = applyComboScaling(defender);
  const scaledDamage = damage * scale;

  defender.hp -= scaledDamage;
  defender.vx += knockbackX * attacker.facing;
  defender.vy += knockbackY;

  defender.weaponState = WEAPON_STATES.STAGGER;
  defender.weaponTimer = 0.3 + Math.abs(knockbackY) * 0.02;
  defender.stunned = true;

  defender.comboCounter++;
  defender.airJuggle += knockbackY !== 0 ? 1 : 0;
  defender.lastHitTime = Date.now();

  // Spawn particle
  particles.push({
    x: defender.x,
    y: defender.y - 20,
    vx: Math.random() * 4 - 2,
    vy: -Math.random() * 3,
    life: 0.5,
    color: "red"
  });

  setTimeout(() => { defender.stunned = false; }, 300);
}

// ==================== WEAPON ATTACKS ====================
function longswordAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      registerHit(player, target, 15, 1.5, 0);
      break;
    case WEAPON_STATES.HEAVY:
      registerHit(player, target, 35, 4, -2);
      break;
    case WEAPON_STATES.GRAB:
      if (target.hp < 20) registerHit(player, target, 50, 5, -3);
      else registerHit(player, target, 25, 3, -1);
      break;
  }
}

function scytheAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      registerHit(player, target, 12, 1, 0);
      setTimeout(() => registerHit(player, target, 12, 2, 0), 100);
      setTimeout(() => registerHit(player, target, 18, 3, 2), 200);
      break;
    case WEAPON_STATES.HEAVY:
      registerHit(player, target, 20, 2, -1);
      break;
    case WEAPON_STATES.CHARGED:
      registerHit(player, target, 30, 3, -2);
      break;
  }
}

function katanaAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      registerHit(player, target, 18, 1.5, 0);
      break;
    case WEAPON_STATES.HEAVY:
      registerHit(player, target, 22, 2.5, -1);
      break;
    case WEAPON_STATES.CHARGED:
      registerHit(player, target, 28, 3, -1.5);
      break;
  }
}

function fistTantoAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      registerHit(player, target, 14, 1, 0);
      setTimeout(() => registerHit(player, target, 16, 1, 0.5), 100);
      break;
    case WEAPON_STATES.HEAVY:
      registerHit(player, target, 20, 2, -1);
      break;
    case WEAPON_STATES.CHARGED:
      registerHit(player, target, 35, 3, -2);
      break;
  }
}

// ==================== AIR JUGGLE ====================
function applyAirJuggle(player, target) {
  if (target.airJuggle > 0) {
    const launchMultiplier = 0.5 + 0.1 * target.airJuggle;
    target.vy -= 2 * launchMultiplier;
    target.vx += 1.5 * launchMultiplier * player.facing;
  }
}

// ==================== JUMP ATTACK ====================
function jumpAttack(player, defender) {
  if (player.onGround) return;

  switch (player.weapon) {
    case "longsword": registerHit(player, defender, 25, 2.5, -2); break;
    case "scythe": registerHit(player, defender, 20, 1.5, -3); break;
    case "katana": registerHit(player, defender, 25, 2, -2.5); break;
    case "fist_tanto": registerHit(player, defender, 20, 1.5, -2); break;
  }
}

// ==================== PARRY SYSTEM ====================
function attemptParry(attacker, defender) {
  if (!defender.inputs.parry) return false;

  const timeDiff = Math.abs(attacker.weaponTimer - (defender.weaponTimer || 0));
  if (timeDiff < 0.15 && attacker.weaponState !== WEAPON_STATES.IDLE) {
    defender.weaponState = WEAPON_STATES.PARRY;
    attacker.weaponState = WEAPON_STATES.STAGGER;
    attacker.vx = -attacker.facing * 2;
    attacker.vy = -1;
    attacker.stunned = true;
    setTimeout(() => { attacker.stunned = false; }, 500);
    return true;
  }
  return false;
}

// ==================== WEAPON PRIORITY ====================
function getWeaponPriority(weapon) {
  switch (weapon) {
    case "longsword": return 3;
    case "katana": return 2;
    case "scythe": return 1;
    case "fist_tanto": return 0;
    default: return 0;
  }
}

function weaponClash(attacker, defender) {
  const heavyAttacks = [WEAPON_STATES.HEAVY, WEAPON_STATES.CHARGED];

  if (heavyAttacks.includes(attacker.weaponState) && heavyAttacks.includes(defender.weaponState)) {
    const attackerPriority = getWeaponPriority(attacker.weapon);
    const defenderPriority = getWeaponPriority(defender.weapon);

    if (attackerPriority > defenderPriority) {
      defender.weaponState = WEAPON_STATES.STAGGER;
      attacker.weaponState = WEAPON_STATES.ATTACK;
    } else if (attackerPriority < defenderPriority) {
      attacker.weaponState = WEAPON_STATES.STAGGER;
      defender.weaponState = WEAPON_STATES.ATTACK;
    } else {
      attacker.vx *= -0.5;
      defender.vx *= -0.5;
      attacker.weaponState = WEAPON_STATES.STAGGER;
      defender.weaponState = WEAPON_STATES.STAGGER;
    }
  }
}

// ==================== COMBAT CHECK ====================
function checkCombat() {
  const pList = Object.values(players);
  
  for (let i = 0; i < pList.length; i++) {
    for (let j = i + 1; j < pList.length; j++) {
      const p1 = pList[i];
      const p2 = pList[j];
      const dist = Math.abs(p1.x - p2.x);

      // Check parry first
      if (attemptParry(p1, p2) || attemptParry(p2, p1)) continue;

      // Check weapon clash
      weaponClash(p1, p2);

      // P1 attacks P2
      if (dist < 60 && !p1.stunned && p1.weaponState !== WEAPON_STATES.IDLE) {
        if (p1.weaponState === WEAPON_STATES.JUMP_ATTACK) {
          jumpAttack(p1, p2);
        } else {
          switch (p1.weapon) {
            case "longsword": longswordAttack(p1, p2); break;
            case "scythe": scytheAttack(p1, p2); break;
            case "katana": katanaAttack(p1, p2); break;
            case "fist_tanto": fistTantoAttack(p1, p2); break;
          }
          if (!p2.onGround) applyAirJuggle(p1, p2);
        }
      }

      // P2 attacks P1
      if (dist < 60 && !p2.stunned && p2.weaponState !== WEAPON_STATES.IDLE) {
        if (p2.weaponState === WEAPON_STATES.JUMP_ATTACK) {
          jumpAttack(p2, p1);
        } else {
          switch (p2.weapon) {
            case "longsword": longswordAttack(p2, p1); break;
            case "scythe": scytheAttack(p2, p1); break;
            case "katana": katanaAttack(p2, p1); break;
            case "fist_tanto": fistTantoAttack(p2, p1); break;
          }
          if (!p1.onGround) applyAirJuggle(p2, p1);
        }
      }
    }
  }
}

// ==================== COMBO RESET ====================
function resetCombo(player) {
  if (player.onGround && player.comboCounter > 0) {
    if (!player.lastHitTime) player.lastHitTime = Date.now();
    else if (Date.now() - player.lastHitTime > 1000) {
      player.comboCounter = 0;
      player.lastHitTime = null;
    }
  }
}

// ==================== WEAPON STATE MACHINE ====================
function updateWeaponState(player, dt) {
  if (player.weaponTimer > 0) {
    player.weaponTimer -= dt;
    if (player.weaponTimer <= 0) {
      player.weaponState = WEAPON_STATES.IDLE;
    }
  }
}

// ==================== BOSS MECHANICS ====================
function bossTakeDamage(damage, limb = null) {
  if (limb && boss.limbs[limb]) {
    boss.limbs[limb].hp -= damage;
    if (boss.limbs[limb].hp <= 0 && !boss.limbs[limb].broken) {
      boss.limbs[limb].broken = true;
      boss.attackCooldown += 1.5;
    }
  }

  boss.hp -= damage;
  boss.breakGauge += damage * 0.5;

  if (boss.breakGauge >= boss.breakThreshold) {
    boss.staggered = true;
    boss.breakGauge = 0;
    boss.staggerTimer = 3.0;
  }
}

function bossArmorPhase() {
  if (boss.hp > 350) boss.phase = 1;
  else if (boss.hp <= 350 && boss.hp > 150) boss.phase = 2;
  else boss.phase = 3;
}

function updateBoss(dt) {
  if (boss.staggered) {
    boss.staggerTimer -= dt;
    if (boss.staggerTimer <= 0) {
      boss.staggered = false;
    }
    return;
  }

  bossArmorPhase();

  const pList = Object.values(players);
  if (pList.length === 0) return;

  // Find nearest player
  let nearest = pList[0];
  let minDist = Math.abs(boss.x - nearest.x);

  pList.forEach(p => {
    const dist = Math.abs(boss.x - p.x);
    if (dist < minDist) {
      minDist = dist;
      nearest = p;
    }
  });

  // Move toward player
  if (minDist > 80) {
    boss.x += nearest.x > boss.x ? boss.speed : -boss.speed;
  }

  // Attack
  boss.attackCooldown -= dt;
  if (minDist < 100 && boss.attackCooldown <= 0) {
    const attackType = Math.random();
    if (attackType < 0.33) {
      registerHit(boss, nearest, 35, 2, 0); // Normal slash
    } else if (attackType < 0.66) {
      registerHit(boss, nearest, 40, 4, -1); // Dash slash
    } else {
      registerHit(boss, nearest, 30, 1, 0); // Orb barrage
    }
    boss.attackCooldown = 2 + Math.random();
  }

  // Check if players hit boss
  pList.forEach(p => {
    const dist = Math.abs(p.x - boss.x);
    if (dist < 80 && p.weaponState !== WEAPON_STATES.IDLE && !p.stunned) {
      const damage = p.weaponState === WEAPON_STATES.HEAVY ? 20 : 10;
      bossTakeDamage(damage);
    }
  });

  // Respawn boss if dead
  if (boss.hp <= 0) {
    boss = new Boss();
  }
}

// ==================== UPDATE PARTICLES ====================
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vy += GRAVITY * 0.5;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ==================== MAIN GAME LOOP ====================
let lastTime = Date.now();

function gameLoop() {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Update players
  Object.values(players).forEach(p => {
    if (p.stunned || p.grabbed) return;

    const speed = p.inputs.sprint ? 7 : 5;
    const jumpPower = 12;

    // Movement
    if (p.inputs.left) {
      p.vx = -speed;
      p.facing = -1;
    } else if (p.inputs.right) {
      p.vx = speed;
      p.facing = 1;
    }

    // Jump
    if (p.inputs.jump && p.onGround) {
      p.vy = -jumpPower;
      p.onGround = false;
    }

    // Weapon switching
    if (p.inputs.switchWeapon) {
      const currentIndex = p.weapons.indexOf(p.weapon);
      p.weapon = p.weapons[(currentIndex + 1) % p.weapons.length];
      p.inputs.switchWeapon = false;
    }

    // Attacks
    if (p.inputs.light && p.weaponState === WEAPON_STATES.IDLE) {
      if (!p.onGround) {
        p.weaponState = WEAPON_STATES.JUMP_ATTACK;
      } else {
        p.weaponState = WEAPON_STATES.ATTACK;
      }
      p.weaponTimer = 0.3;
      p.inputs.light = false;
    }

    if (p.inputs.heavy && p.weaponState === WEAPON_STATES.IDLE) {
      p.weaponState = WEAPON_STATES.HEAVY;
      p.weaponTimer = 0.5;
      p.inputs.heavy = false;
    }

    if (p.inputs.grab && p.weaponState === WEAPON_STATES.IDLE) {
      p.weaponState = WEAPON_STATES.GRAB;
      p.weaponTimer = 0.4;
      p.inputs.grab = false;
    }

    // Grapple
    if (p.inputs.grapple && !p.onGround) {
      p.grappling = true;
      p.grappleTarget = { x: p.inputs.mouseX || p.x, y: p.inputs.mouseY || p.y - 100 };
      const dx = p.grappleTarget.x - p.x;
      const dy = p.grappleTarget.y - p.y;
      p.vx += dx * 0.05;
      p.vy += dy * 0.05;
    } else {
      p.grappling = false;
    }

    applyPhysics(p, dt);
    updateWeaponState(p, dt);

    if (p.onWall) {
      p.wallTimer -= dt;
      if (p.wallTimer <= 0) wallTech(p);
    }

    resetCombo(p);

    // Respawn if dead
    if (p.hp <= 0) {
      p.hp = 100;
      p.x = p.spawnX;
      p.y = p.spawnY;
      p.vx = 0;
      p.vy = 0;
      p.comboCounter = 0;
      p.airJuggle = 0;
    }
  });

  checkCombat();
  updateBoss(dt);
  updateParticles(dt);

  // Broadcast state
  io.emit("state", {
    players: Object.values(players).map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      hp: p.hp,
      maxHp: p.maxHp,
      color: p.color,
      combo: p.comboCounter,
      stunned: p.stunned,
      facing: p.facing,
      weapon: p.weapon,
      weaponState: p.weaponState,
      onGround: p.onGround,
      grappling: p.grappling,
      grappleTarget: p.grappleTarget,
      airJuggle: p.airJuggle
    })),
    boss: {
      x: boss.x,
      y: boss.y,
      hp: boss.hp,
      maxHp: boss.maxHp,
      staggered: boss.staggered,
      phase: boss.phase,
      limbs: boss.limbs
    },
    particles: particles
  });

  setTimeout(gameLoop, 1000 / TICK_RATE);
}

// ==================== SOCKET.IO ====================
io.on("connection", socket => {
  console.log(`Player connected: ${socket.id}`);

  const x = Math.random() * (CANVAS_WIDTH - 200) + 100;
  players[socket.id] = new Player(socket.id, x, CANVAS_HEIGHT - 200);

  socket.on("input", data => {
    if (players[socket.id]) {
      players[socket.id].inputs = data;
    }
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
  });
});

// ==================== START ====================
const PORT = process.env.PORT || 3000;
gameLoop();

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
