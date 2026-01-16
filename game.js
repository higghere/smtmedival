"use strict";

/* =========================================================
   GLOBAL CONSTANTS (SINGLE SOURCE OF TRUTH)
   ========================================================= */

const TICK_RATE = 60;
const DT = 1 / TICK_RATE;
const GRAVITY = 38;
const FLOOR_Y = 420;
const MAX_FALL_SPEED = 90;

const PLAYER_WIDTH = 32;
const PLAYER_HEIGHT = 48;

const AIR_TECH_WINDOW = 0.35;
const WALL_TECH_WINDOW = 0.4;
const COMBO_RESET_TIME = 0.9;

const JUGGLE_SCALING_START = 3;
const JUGGLE_SCALING_FACTOR = 0.85;
const JUGGLE_MIN_KNOCKBACK = 4;

const BOSS_BREAK_MAX = 100;

/* =========================================================
   BASIC UTILITIES
   ========================================================= */

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sign(v) {
  return v >= 0 ? 1 : -1;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/* =========================================================
   HITBOX / HURTBOX
   ========================================================= */

class Box {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
}

/* =========================================================
   GAME STATE CONTAINERS
   ========================================================= */

const players = {};
const bosses = {};
let frameIndex = 0;
/* =========================================================
   PLAYER CLASS
   ========================================================= */

class Player {
  constructor(id) {
    this.id = id;

    // Transform
    this.x = 120;
    this.y = FLOOR_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;

    // State
    this.state = "idle"; // idle, run, jump, attack, hitstun, dead
    this.onGround = true;
    this.health = 100;

    // Combo / juggle
    this.comboCount = 0;
    this.comboTimer = 0;
    this.juggleCount = 0;

    // Tech
    this.airTechAvailable = true;
    this.wallTechAvailable = true;
    this.airTechTimer = 0;
    this.wallTechTimer = 0;

    // Wall
    this.touchingWall = false;

    // Weapon
    this.weapon = "katana";
    this.attackState = null;
    this.attackTimer = 0;

    // Inputs (filled by server from client)
    this.inputs = {};

    // Grapple
    this.grapple = {
      active: false,
      anchorX: 0,
      anchorY: 0,
      length: 0,
      angle: 0,
      angularVelocity: 0
    };
  }
}

/* =========================================================
   PLAYER PHYSICS UPDATE
   ========================================================= */

function updatePlayerPhysics(p) {
  // Gravity
  p.vy += GRAVITY * DT;
  if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;

  // Integrate
  p.x += p.vx * DT;
  p.y += p.vy * DT;

  // Floor collision
  if (p.y >= FLOOR_Y) {
    p.y = FLOOR_Y;
    p.vy = 0;
    p.onGround = true;
    p.airTechAvailable = true;
    p.juggleCount = 0;
  } else {
    p.onGround = false;
  }

  // Timers
  if (p.comboTimer > 0) {
    p.comboTimer -= DT;
    if (p.comboTimer <= 0) {
      p.comboCount = 0;
      p.juggleCount = 0;
    }
  }

  if (!p.airTechAvailable) {
    p.airTechTimer -= DT;
    if (p.airTechTimer <= 0) {
      p.airTechAvailable = true;
    }
  }
}
/* =========================================================
   COMBO & JUGGLE SCALING
   ========================================================= */

function applyComboScaling(attacker, baseKnockback) {
  if (attacker.juggleCount < JUGGLE_SCALING_START) {
    return baseKnockback;
  }

  let scale =
    Math.pow(
      JUGGLE_SCALING_FACTOR,
      attacker.juggleCount - JUGGLE_SCALING_START + 1
    );

  let kb = baseKnockback * scale;
  return Math.max(kb, JUGGLE_MIN_KNOCKBACK);
}

/* =========================================================
   APPLY HIT
   ========================================================= */

function applyHit(attacker, defender, data) {
  if (defender.state === "dead") return;

  // Combo
  attacker.comboCount++;
  attacker.comboTimer = COMBO_RESET_TIME;
  attacker.juggleCount++;

  // Damage
  defender.health -= data.damage;
  if (defender.health <= 0) {
    defender.health = 0;
    defender.state = "dead";
  }

  // Knockback
  const kb = applyComboScaling(attacker, data.knockback);
  defender.vx = kb * sign(defender.x - attacker.x);
  defender.vy = -data.launchY;

  // Hitstun
  defender.state = "hitstun";
  defender.hitstunTimer = data.hitstun;

  // Tech windows
  defender.airTechAvailable = true;
  defender.airTechTimer = AIR_TECH_WINDOW;
}

/* =========================================================
   HITSTUN UPDATE
   ========================================================= */

function updateHitstun(p) {
  if (p.state !== "hitstun") return;

  p.hitstunTimer -= DT;
  if (p.hitstunTimer <= 0) {
    p.state = "idle";
  }
}
/* =========================================================
   AIR TECH
   ========================================================= */

function tryAirTech(p) {
  if (!p.airTechAvailable) return false;
  if (!p.inputs.tech) return false;
  if (p.onGround) return false;

  p.vx = 0;
  p.vy = -12;
  p.state = "idle";
  p.airTechAvailable = false;
  p.airTechTimer = AIR_TECH_WINDOW;
  return true;
}

/* =========================================================
   WALL SPLAT / TECH
   ========================================================= */

function checkWallCollision(p) {
  // Fake walls at edges
  if (p.x < 20 || p.x > 980) {
    p.touchingWall = true;
    return true;
  }
  p.touchingWall = false;
  return false;
}

function tryWallTech(p) {
  if (!p.wallTechAvailable) return false;
  if (!p.touchingWall) return false;
  if (!p.inputs.tech) return false;

  p.vx = -p.facing * 14;
  p.vy = -10;
  p.wallTechAvailable = false;
  p.wallTechTimer = WALL_TECH_WINDOW;
  p.state = "idle";
  return true;
}
/* =========================================================
   CHAIN GRAPPLE (SCYTHE)
   ========================================================= */

function startGrapple(p, anchorX, anchorY) {
  const dx = p.x - anchorX;
  const dy = p.y - anchorY;

  p.grapple.active = true;
  p.grapple.anchorX = anchorX;
  p.grapple.anchorY = anchorY;
  p.grapple.length = Math.sqrt(dx * dx + dy * dy);
  p.grapple.angle = Math.atan2(dy, dx);
  p.grapple.angularVelocity = 0;
}

function releaseGrapple(p) {
  if (!p.grapple.active) return;

  p.vx = Math.cos(p.grapple.angle) * 18;
  p.vy = Math.sin(p.grapple.angle) * 18;
  p.grapple.active = false;
}

function updateGrapple(p) {
  if (!p.grapple.active) return;

  const g = p.grapple;

  g.angularVelocity += (-GRAVITY / g.length) * Math.sin(g.angle) * DT;
  g.angle += g.angularVelocity * DT;

  p.x = g.anchorX + Math.cos(g.angle) * g.length;
  p.y = g.anchorY + Math.sin(g.angle) * g.length;
}
/* =========================================================
   BOSS CLASS
   ========================================================= */

class Boss {
  constructor() {
    this.x = 500;
    this.y = FLOOR_Y;
    this.health = 750;
    this.breakGauge = 0;
    this.phase = 1;
    this.state = "idle";
    this.untouchable = false;
    this.limbs = {
      leftArm: true,
      rightArm: true
    };
  }
}

/* =========================================================
   BOSS DAMAGE & BREAK
   ========================================================= */

function damageBoss(boss, dmg, breakDmg) {
  if (boss.untouchable) return;

  boss.health -= dmg;
  boss.breakGauge += breakDmg;

  if (boss.breakGauge >= BOSS_BREAK_MAX) {
    boss.breakGauge = 0;
    boss.state = "stagger";
    boss.staggerTimer = 3;
  }

  if (boss.health <= 0) {
    boss.state = "dead";
  }
}

function updateBoss(boss) {
  if (boss.state === "stagger") {
    boss.staggerTimer -= DT;
    if (boss.staggerTimer <= 0) {
      boss.state = "idle";
    }
  }
}
/* =========================================================
   CINEMATIC FINISHER
   ========================================================= */

function tryCinematicFinish(player, boss) {
  if (boss.state !== "stagger") return false;
  if (boss.health > 50) return false;

  boss.state = "cinematic";
  boss.untouchable = true;

  player.state = "cinematic";
  player.vx = 0;
  player.vy = 0;

  boss.cinematicTimer = 4;
  return true;
}

function updateCinematic(boss, player) {
  if (boss.state !== "cinematic") return;

  boss.cinematicTimer -= DT;
  if (boss.cinematicTimer <= 0) {
    boss.health = 0;
    boss.state = "dead";
    player.state = "idle";
  }
}
/* =========================================================
   MAIN GAME LOOP
   ========================================================= */

function updateGame() {
  frameIndex++;

  for (const id in players) {
    const p = players[id];

    updatePlayerPhysics(p);
    updateHitstun(p);
    tryAirTech(p);
    checkWallCollision(p);
    tryWallTech(p);
    updateGrapple(p);
  }

  for (const id in bosses) {
    updateBoss(bosses[id]);
  }
}

setInterval(updateGame, 1000 / TICK_RATE);

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  players,
  bosses,
  Player,
  Boss,
  updateGame
};
/* =========================================================
   INPUT BUFFER & DIRECTIONAL PARSER
   ========================================================= */

const INPUT_BUFFER_TIME = 0.25;

class InputBuffer {
  constructor() {
    this.buffer = [];
  }

  push(input) {
    this.buffer.push({
      input,
      time: INPUT_BUFFER_TIME
    });
  }

  update() {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      this.buffer[i].time -= DT;
      if (this.buffer[i].time <= 0) {
        this.buffer.splice(i, 1);
      }
    }
  }

  consume(pattern) {
    let idx = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].input === pattern[idx]) {
        idx++;
        if (idx === pattern.length) {
          this.buffer.splice(0, i + 1);
          return true;
        }
      }
    }
    return false;
  }
}

/* =========================================================
   ATTACH INPUT BUFFER TO PLAYER
   ========================================================= */

for (const id in players) {
  players[id].inputBuffer = new InputBuffer();
}

/* =========================================================
   UPDATE INPUT BUFFER PER PLAYER
   ========================================================= */

function updateInputBuffer(p) {
  if (p.inputs.left) p.inputBuffer.push("LEFT");
  if (p.inputs.right) p.inputBuffer.push("RIGHT");
  if (p.inputs.up) p.inputBuffer.push("UP");
  if (p.inputs.down) p.inputBuffer.push("DOWN");
  if (p.inputs.attack) p.inputBuffer.push("ATTACK");
  if (p.inputs.heavy) p.inputBuffer.push("HEAVY");

  p.inputBuffer.update();
}

/* =========================================================
   DIRECTIONAL MOVE DETECTION
   ========================================================= */

function detectDirectionalMove(p) {
  // ↓ + ATTACK = launcher
  if (p.inputBuffer.consume(["DOWN", "ATTACK"])) {
    return "DOWN_ATTACK";
  }

  // → + HEAVY = forward smash
  if (p.inputBuffer.consume(["RIGHT", "HEAVY"])) {
    return "FORWARD_HEAVY";
  }

  // ↓ ↘ → + ATTACK (quarter circle)
  if (
    p.inputBuffer.consume(["DOWN", "RIGHT", "ATTACK"]) ||
    p.inputBuffer.consume(["DOWN", "RIGHT", "HEAVY"])
  ) {
    return "QC_ATTACK";
  }

  return null;
}
/* =========================================================
   WEAPON STATE MACHINES
   ========================================================= */

const WEAPON_STATES = {
  IDLE: "IDLE",
  STARTUP: "STARTUP",
  ACTIVE: "ACTIVE",
  RECOVERY: "RECOVERY"
};

/* =========================================================
   KATANA FSM
   ========================================================= */

function updateKatanaFSM(p) {
  if (!p.weaponState) {
    p.weaponState = WEAPON_STATES.IDLE;
    p.weaponTimer = 0;
    p.currentMove = null;
  }

  switch (p.weaponState) {
    case WEAPON_STATES.IDLE:
      if (p.inputs.attack) {
        p.weaponState = WEAPON_STATES.STARTUP;
        p.weaponTimer = 0.12;
        p.currentMove = "KATANA_SLASH_1";
      }
      break;

    case WEAPON_STATES.STARTUP:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.ACTIVE;
        p.weaponTimer = 0.08;
        spawnHitbox(p, {
          x: p.x + p.facing * 40,
          y: p.y,
          w: 60,
          h: 30,
          damage: 12,
          knockX: p.facing * 6,
          knockY: -2
        });
      }
      break;

    case WEAPON_STATES.ACTIVE:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.RECOVERY;
        p.weaponTimer = 0.18;
      }
      break;

    case WEAPON_STATES.RECOVERY:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.IDLE;
        p.currentMove = null;
      }
      break;
  }
}

/* =========================================================
   SCYTHE FSM (WIDER ARC, SLOWER)
   ========================================================= */

function updateScytheFSM(p) {
  if (!p.weaponState) {
    p.weaponState = WEAPON_STATES.IDLE;
    p.weaponTimer = 0;
    p.currentMove = null;
  }

  switch (p.weaponState) {
    case WEAPON_STATES.IDLE:
      if (p.inputs.attack) {
        p.weaponState = WEAPON_STATES.STARTUP;
        p.weaponTimer = 0.22;
        p.currentMove = "SCYTHE_SWEEP";
      }
      break;

    case WEAPON_STATES.STARTUP:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.ACTIVE;
        p.weaponTimer = 0.14;
        spawnHitbox(p, {
          x: p.x + p.facing * 50,
          y: p.y - 10,
          w: 90,
          h: 50,
          damage: 18,
          knockX: p.facing * 5,
          knockY: -4
        });
      }
      break;

    case WEAPON_STATES.ACTIVE:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.RECOVERY;
        p.weaponTimer = 0.32;
      }
      break;

    case WEAPON_STATES.RECOVERY:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.IDLE;
        p.currentMove = null;
      }
      break;
  }
}

/* =========================================================
   FISTS FSM (FAST, LOW DAMAGE)
   ========================================================= */

function updateFistFSM(p) {
  if (!p.weaponState) {
    p.weaponState = WEAPON_STATES.IDLE;
    p.weaponTimer = 0;
    p.currentMove = null;
  }

  switch (p.weaponState) {
    case WEAPON_STATES.IDLE:
      if (p.inputs.attack) {
        p.weaponState = WEAPON_STATES.STARTUP;
        p.weaponTimer = 0.05;
        p.currentMove = "JAB";
      }
      break;

    case WEAPON_STATES.STARTUP:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.ACTIVE;
        p.weaponTimer = 0.04;
        spawnHitbox(p, {
          x: p.x + p.facing * 25,
          y: p.y,
          w: 30,
          h: 25,
          damage: 6,
          knockX: p.facing * 3,
          knockY: -1
        });
      }
      break;

    case WEAPON_STATES.ACTIVE:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.RECOVERY;
        p.weaponTimer = 0.08;
      }
      break;

    case WEAPON_STATES.RECOVERY:
      p.weaponTimer -= DT;
      if (p.weaponTimer <= 0) {
        p.weaponState = WEAPON_STATES.IDLE;
        p.currentMove = null;
      }
      break;
  }
}

/* =========================================================
   WEAPON ROUTER
   ========================================================= */

function updateWeaponFSM(p) {
  if (p.weapon === "KATANA") updateKatanaFSM(p);
  if (p.weapon === "SCYTHE") updateScytheFSM(p);
  if (p.weapon === "FISTS") updateFistFSM(p);
}
/* =========================================================
   COMBO SYSTEM CORE
   ========================================================= */

const COMBO_WINDOW = 0.22;
const MAX_JUGGLE = 3;

function initComboData(p) {
  if (!p.combo) {
    p.combo = {
      step: 0,
      timer: 0,
      juggle: 0,
      lastMove: null
    };
  }
}

function updateComboTimer(p) {
  if (p.combo.timer > 0) {
    p.combo.timer -= DT;
    if (p.combo.timer <= 0) {
      p.combo.step = 0;
      p.combo.lastMove = null;
    }
  }
}

/* =========================================================
   JUGGLE HANDLING
   ========================================================= */

function applyJuggle(defender) {
  if (!defender.juggleCount) defender.juggleCount = 0;
  defender.juggleCount++;
  if (defender.juggleCount > MAX_JUGGLE) {
    defender.vy = Math.max(defender.vy, -2);
  }
}

function resetJuggle(defender) {
  defender.juggleCount = 0;
}

/* =========================================================
   KATANA COMBO TREE
   ========================================================= */

function katanaComboLogic(p) {
  initComboData(p);
  updateComboTimer(p);

  if (p.weaponState !== WEAPON_STATES.IDLE) return;

  if (!p.inputs.attack) return;

  if (p.combo.step === 0) {
    p.combo.step = 1;
    p.combo.timer = COMBO_WINDOW;
    p.currentMove = "KATANA_SLASH_1";
    p.weaponState = WEAPON_STATES.STARTUP;
    p.weaponTimer = 0.12;
    return;
  }

  if (p.combo.step === 1 && p.combo.timer > 0) {
    p.combo.step = 2;
    p.combo.timer = COMBO_WINDOW;
    p.currentMove = "KATANA_SLASH_2";
    p.weaponState = WEAPON_STATES.STARTUP;
    p.weaponTimer = 0.10;
    return;
  }

  if (p.combo.step === 2 && p.combo.timer > 0) {
    p.combo.step = 3;
    p.combo.timer = 0;
    p.currentMove = "KATANA_LAUNCHER";
    p.weaponState = WEAPON_STATES.STARTUP;
    p.weaponTimer = 0.14;
    return;
  }
}

/* =========================================================
   KATANA COMBO HITBOX OVERRIDES
   ========================================================= */

function katanaComboHitbox(p) {
  if (p.currentMove === "KATANA_SLASH_2") {
    spawnHitbox(p, {
      x: p.x + p.facing * 45,
      y: p.y,
      w: 65,
      h: 30,
      damage: 14,
      knockX: p.facing * 6,
      knockY: -2
    });
  }

  if (p.currentMove === "KATANA_LAUNCHER") {
    spawnHitbox(p, {
      x: p.x + p.facing * 40,
      y: p.y - 10,
      w: 60,
      h: 40,
      damage: 10,
      knockX: p.facing * 2,
      knockY: -10,
      launch: true
    });
  }
}

/* =========================================================
   SCYTHE COMBO TREE (HEAVY / DELAYED)
   ========================================================= */

function scytheComboLogic(p) {
  initComboData(p);
  updateComboTimer(p);

  if (p.weaponState !== WEAPON_STATES.IDLE) return;
  if (!p.inputs.attack) return;

  if (p.combo.step === 0) {
    p.combo.step = 1;
    p.combo.timer = COMBO_WINDOW + 0.1;
    p.currentMove = "SCYTHE_HEAVY_1";
    p.weaponState = WEAPON_STATES.STARTUP;
    p.weaponTimer = 0.25;
    return;
  }

  if (p.combo.step === 1 && p.combo.timer > 0) {
    p.combo.step = 2;
    p.combo.timer = 0;
    p.currentMove = "SCYTHE_GROUND_SLAM";
    p.weaponState = WEAPON_STATES.STARTUP;
    p.weaponTimer = 0.35;
    return;
  }
}

/* =========================================================
   SCYTHE COMBO HITBOXES
   ========================================================= */

function scytheComboHitbox(p) {
  if (p.currentMove === "SCYTHE_HEAVY_1") {
    spawnHitbox(p, {
      x: p.x + p.facing * 55,
      y: p.y - 10,
      w: 100,
      h: 45,
      damage: 22,
      knockX: p.facing * 7,
      knockY: -3
    });
  }

  if (p.currentMove === "SCYTHE_GROUND_SLAM") {
    spawnHitbox(p, {
      x: p.x + p.facing * 20,
      y: p.y + 20,
      w: 120,
      h: 60,
      damage: 30,
      knockX: p.facing * 3,
      knockY: -12,
      launch: true,
      screenShake: true
    });
  }
}

/* =========================================================
   AIR COMBOS
   ========================================================= */

function airComboLogic(p) {
  if (!p.airborne) return;
  if (!p.inputs.attack) return;
  if (p.weaponState !== WEAPON_STATES.IDLE) return;

  p.currentMove = "AIR_SLASH";
  p.weaponState = WEAPON_STATES.STARTUP;
  p.weaponTimer = 0.08;
}

function airComboHitbox(p) {
  if (p.currentMove === "AIR_SLASH") {
    spawnHitbox(p, {
      x: p.x + p.facing * 35,
      y: p.y + 5,
      w: 50,
      h: 35,
      damage: 9,
      knockX: p.facing * 4,
      knockY: -4
    });
  }
}

/* =========================================================
   GLOBAL COMBO ROUTER
   ========================================================= */

function updateCombos(p) {
  if (p.weapon === "KATANA") katanaComboLogic(p);
  if (p.weapon === "SCYTHE") scytheComboLogic(p);
  airComboLogic(p);
}

function spawnComboHitboxes(p) {
  if (p.weapon === "KATANA") katanaComboHitbox(p);
  if (p.weapon === "SCYTHE") scytheComboHitbox(p);
  airComboHitbox(p);
}
/* =========================================================
   HITSTOP SYSTEM (IMPACT FREEZE)
   ========================================================= */

let hitstopTimer = 0;
let hitstopScale = 1;

function triggerHitstop(duration, scale = 0.15) {
  hitstopTimer = Math.max(hitstopTimer, duration);
  hitstopScale = scale;
}

function applyHitstop(dt) {
  if (hitstopTimer > 0) {
    hitstopTimer -= dt;
    return dt * hitstopScale;
  }
  return dt;
}

/* =========================================================
   SCREEN SHAKE SYSTEM
   ========================================================= */

let screenShakeTime = 0;
let screenShakeIntensity = 0;

function triggerScreenShake(intensity, duration) {
  screenShakeIntensity = Math.max(screenShakeIntensity, intensity);
  screenShakeTime = Math.max(screenShakeTime, duration);
}

function getScreenShakeOffset() {
  if (screenShakeTime <= 0) return { x: 0, y: 0 };

  screenShakeTime -= DT;
  const angle = Math.random() * Math.PI * 2;
  const mag = screenShakeIntensity * (screenShakeTime);
  return {
    x: Math.cos(angle) * mag,
    y: Math.sin(angle) * mag
  };
}

/* =========================================================
   SLOW MOTION SYSTEM (CINEMATIC)
   ========================================================= */

let slowMoTimer = 0;
let slowMoFactor = 1;

function triggerSlowMo(duration, factor = 0.35) {
  slowMoTimer = Math.max(slowMoTimer, duration);
  slowMoFactor = factor;
}

function applySlowMo(dt) {
  if (slowMoTimer > 0) {
    slowMoTimer -= dt;
    return dt * slowMoFactor;
  }
  return dt;
}

/* =========================================================
   GLOBAL TIME STEP MODIFIER
   ========================================================= */

function getModifiedDelta(dt) {
  dt = applySlowMo(dt);
  dt = applyHitstop(dt);
  return dt;
}

/* =========================================================
   HIT CONFIRM EFFECTS
   ========================================================= */

function onSuccessfulHit(attacker, defender, hitbox) {
  // Basic hitstop on every confirmed hit
  triggerHitstop(0.05);

  // Heavier moves cause stronger hitstop
  if (hitbox.damage >= 20) {
    triggerHitstop(0.08, 0.1);
    triggerScreenShake(6, 0.2);
  }

  // Launchers feel heavier
  if (hitbox.launch) {
    triggerHitstop(0.1, 0.05);
    triggerScreenShake(10, 0.3);
  }

  // Finisher check
  if (defender.hp <= 0) {
    triggerSlowMo(0.6, 0.25);
    triggerScreenShake(14, 0.5);
  }
}

/* =========================================================
   CAMERA INTEGRATION
   ========================================================= */

function applyCameraEffects(camera) {
  const shake = getScreenShakeOffset();
  camera.x += shake.x;
  camera.y += shake.y;
}

/* =========================================================
   DAMAGE PIPELINE HOOK
   ========================================================= */

// CALL THIS where damage is finally confirmed
function resolveHit(attacker, defender, hitbox) {
  defender.hp -= hitbox.damage;

  defender.vx += hitbox.knockX || 0;
  defender.vy += hitbox.knockY || 0;

  if (hitbox.launch) {
    applyJuggle(defender);
  }

  if (hitbox.screenShake) {
    triggerScreenShake(12, 0.25);
  }

  onSuccessfulHit(attacker, defender, hitbox);
}
/* =========================================================
   PARRY SYSTEM
   ========================================================= */

const PARRY_WINDOW = 0.18; // seconds
const PARRY_STUN = 0.35;   // seconds opponent stunned on successful parry

function initParry(p) {
  if (!p.parry) {
    p.parry = {
      active: false,
      timer: 0
    };
  }
}

function updateParry(p, dt) {
  if (p.parry.timer > 0) {
    p.parry.timer -= dt;
    if (p.parry.timer <= 0) {
      p.parry.active = false;
    }
  }
}

function attemptParry(p) {
  if (p.inputs.parry && !p.parry.active) {
    p.parry.active = true;
    p.parry.timer = PARRY_WINDOW;
  }
}

function checkParry(attacker, defender, hitbox) {
  if (!defender.parry.active) return false;

  // Parry successful
  defender.parry.active = false;
  triggerHitstop(0.08, 0.1);
  triggerScreenShake(6, 0.15);

  // Attacker stunned
  attacker.weaponState = WEAPON_STATES.STUNNED;
  attacker.weaponTimer = PARRY_STUN;

  // Minor recoil for defender
  defender.vx -= defender.facing * 2;

  return true;
}

/* =========================================================
   WEAPON CLASH SYSTEM
   ========================================================= */

function checkWeaponClash(attacker, defender, hitbox) {
  // Clash occurs when both hitboxes active at same time and overlap
  if (!defender.currentHitbox || !attacker.currentHitbox) return false;

  const a = attacker.currentHitbox;
  const d = defender.currentHitbox;

  if (
    a.x < d.x + d.w &&
    a.x + a.w > d.x &&
    a.y < d.y + d.h &&
    a.y + a.h > d.y
  ) {
    // Clash detected
    triggerHitstop(0.12, 0.08);
    triggerScreenShake(8, 0.2);

    attacker.weaponState = WEAPON_STATES.STAGGER;
    defender.weaponState = WEAPON_STATES.STAGGER;

    attacker.weaponTimer = 0.25;
    defender.weaponTimer = 0.25;

    return true;
  }

  return false;
}

/* =========================================================
   ATTACK PRIORITY SYSTEM
   ========================================================= */

const ATTACK_PRIORITY = {
  HEAVY: 3,
  NORMAL: 2,
  LIGHT: 1
};

function getHitPriority(hitbox) {
  return ATTACK_PRIORITY[hitbox.type] || 1;
}

function resolveAttackPriority(attacker, defender, hitbox) {
  if (!defender.currentHitbox) return true;

  const attackerPriority = getHitPriority(hitbox);
  const defenderPriority = getHitPriority(defender.currentHitbox);

  if (attackerPriority >= defenderPriority) {
    // Attacker wins priority
    resolveHit(attacker, defender, hitbox);
    return true;
  } else {
    // Defender absorbs / parries attack
    checkParry(attacker, defender, hitbox);
    return false;
  }
}

/* =========================================================
   GLOBAL COMBAT UPDATE INTEGRATION
   ========================================================= */

function combatUpdate(p, opponents, dt) {
  // Update parry timer
  initParry(p);
  updateParry(p, dt);
  attemptParry(p);

  // Process all hitboxes
  p.currentHitbox = null;
  spawnComboHitboxes(p);
  if (p.currentHitbox) {
    for (let o of opponents) {
      if (o === p) continue;

      // First check clash
      if (checkWeaponClash(p, o, p.currentHitbox)) continue;

      // Then priority + parry
      resolveAttackPriority(p, o, p.currentHitbox);
    }
  }

  // Reset after update
  p.currentHitbox = null;
}
/* =========================================================
   BOSS STAGGER SYSTEM
   ========================================================= */

function initBoss(boss) {
  boss.hp = boss.maxHp || 500;
  boss.stagger = {
    current: 0,
    threshold: 100,
    timer: 0
  };
  boss.armorPhase = 0;
  boss.limbs = {
    leftArm: { hp: 100, broken: false },
    rightArm: { hp: 100, broken: false },
    leftLeg: { hp: 100, broken: false },
    rightLeg: { hp: 100, broken: false }
  };
}

function applyBossDamage(boss, damage, limb = null) {
  // Apply limb-specific damage if provided
  if (limb && boss.limbs[limb] && !boss.limbs[limb].broken) {
    boss.limbs[limb].hp -= damage;
    if (boss.limbs[limb].hp <= 0) {
      boss.limbs[limb].broken = true;
      triggerScreenShake(12, 0.35);
      triggerHitstop(0.1);
    }
  }

  boss.hp -= damage;
  boss.stagger.current += damage;

  // Check stagger threshold
  if (boss.stagger.current >= boss.stagger.threshold) {
    triggerBossStagger(boss);
    boss.stagger.current = 0;
  }

  updateBossArmorPhase(boss);
}

function triggerBossStagger(boss) {
  boss.weaponState = WEAPON_STATES.STAGGER;
  boss.weaponTimer = 0.8;

  triggerHitstop(0.12, 0.1);
  triggerScreenShake(10, 0.3);
}

/* =========================================================
   BOSS ARMOR PHASE SYSTEM
   ========================================================= */

const ARMOR_PHASES = [
  { hpRatio: 1.0, damageReduction: 0.0 }, // Phase 0: No reduction
  { hpRatio: 0.75, damageReduction: 0.15 },
  { hpRatio: 0.5, damageReduction: 0.30 },
  { hpRatio: 0.25, damageReduction: 0.50 }
];

function updateBossArmorPhase(boss) {
  const hpRatio = boss.hp / boss.maxHp;
  for (let i = ARMOR_PHASES.length - 1; i >= 0; i--) {
    if (hpRatio <= ARMOR_PHASES[i].hpRatio) {
      if (boss.armorPhase !== i) {
        boss.armorPhase = i;
        triggerScreenShake(8, 0.25);
        triggerHitstop(0.08, 0.08);
      }
      break;
    }
  }
}

function applyArmorReduction(boss, damage) {
  const reduction = ARMOR_PHASES[boss.armorPhase].damageReduction || 0;
  return damage * (1 - reduction);
}

/* =========================================================
   LIMB BREAK MECHANIC
   ========================================================= */

function isLimbBroken(boss, limb) {
  return boss.limbs[limb] && boss.limbs[limb].broken;
}

function limbDamage(boss, limb, damage) {
  if (!boss.limbs[limb] || boss.limbs[limb].broken) return 0;
  boss.limbs[limb].hp -= damage;

  if (boss.limbs[limb].hp <= 0) {
    boss.limbs[limb].broken = true;
    triggerScreenShake(10, 0.3);
    triggerHitstop(0.1);
    return damage;
  }
  return damage;
}

/* =========================================================
   BOSS UPDATE HOOK
   ========================================================= */

function bossUpdate(boss, dt) {
  // Reduce stagger timer
  if (boss.weaponState === WEAPON_STATES.STAGGER) {
    boss.weaponTimer -= dt;
    if (boss.weaponTimer <= 0) boss.weaponState = WEAPON_STATES.IDLE;
  }

  // Update limb states or apply visual effects
  for (let limb in boss.limbs) {
    if (boss.limbs[limb].broken) {
      // Example: reduce mobility or disable attack from that limb
      // Left to render logic / animation
    }
  }

  // Armor phase affects damage taken (integrated in applyBossDamage)
}

/* =========================================================
   INTEGRATED DAMAGE PIPELINE FOR BOSS
   ========================================================= */

function resolveBossHit(attacker, boss, hitbox, limb = null) {
  let rawDamage = hitbox.damage;

  // Apply armor reduction
  rawDamage = applyArmorReduction(boss, rawDamage);

  // Apply limb-specific damage if applicable
  if (limb) {
    limbDamage(boss, limb, rawDamage);
  }

  applyBossDamage(boss, rawDamage, limb);
  onSuccessfulHit(attacker, boss, hitbox);
}
