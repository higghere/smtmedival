/* =========================================================
   SILKSONG PVP COMBAT - COMPLETE GAME.JS
   All advanced features properly integrated
   ========================================================= */

/* -----------------------------
   CANVAS & CONTEXT
   ----------------------------- */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 1000;
canvas.height = 600;

/* -----------------------------
   GLOBAL CONSTANTS
   ----------------------------- */
const TICK_RATE = 60;
const GRAVITY = 0.6;
const FLOOR_FRICTION = 0.85;
const AIR_FRICTION = 0.98;
const PLAYER_MAX_HP = 100;

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

/* -----------------------------
   CAMERA SYSTEM
   ----------------------------- */
let camera = {
  x: 0,
  y: 0,
  zoom: 1,
  target: null,
  lock: false
};

/* -----------------------------
   ARENA & PLATFORMS
   ----------------------------- */
const arenaCenterX = canvas.width / 2;
const arenaCenterY = canvas.height / 2;

const platforms = [
  { x: 0, y: 550, width: 1000, height: 50 },
  { x: 300, y: 400, width: 200, height: 20 },
  { x: 600, y: 300, width: 200, height: 20 }
];

/* -----------------------------
   GAME STATE
   ----------------------------- */
let gameTimeScale = 1.0;
let players = [];
let boss = null;
const particles = [];
const projectiles = [];

/* -----------------------------
   PLAYER CLASS
   ----------------------------- */
class Player {
  constructor(id, x, y, color = "blue") {
    this.id = id;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.vx = 0;
    this.vy = 0;
    this.width = 48;
    this.height = 64;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.color = color;
    this.facing = 1;
    this.onGround = false;
    this.onWall = false;
    this.wallTimer = 0;
    this.grappling = false;
    this.grappleTarget = null;
    this.grabbing = false;
    this.grabbed = false;
    this.target = null;
    this.comboCounter = 0;
    this.lastHitTime = null;
    this.airJuggle = 0;
    this.weapon = "longsword";
    this.weaponState = WEAPON_STATES.IDLE;
    this.weaponTimer = 0;
    this.inputs = {
      left: false,
      right: false,
      jump: false,
      light: false,
      heavy: false,
      grab: false,
      parry: false,
      disabled: false
    };
    this.specialCooldowns = [];
    this.weapons = ["longsword", "katana", "scythe", "fist_tanto"];
    this.gold = 0;
    this.xp = 0;
    this.hitstun = 0;
    this.attackPressed = false;
    this.parryPressed = false;
    this.groundY = y;
  }
}

/* -----------------------------
   BOSS CLASS
   ----------------------------- */
class Boss {
  constructor() {
    this.x = arenaCenterX;
    this.y = canvas.height - 150;
    this.hp = 500;
    this.maxHp = 500;
    this.speed = 2;
    this.staggered = false;
    this.staggerTimer = 0;
    this.breakGauge = 0;
    this.breakThreshold = 100;
    this.attackCooldown = 0;
    this.phase = 1;
    this.isBoss = true;
    this.players = [];
    this.limbs = {
      leftArm: { 
        hp: 100, 
        maxHp: 100, 
        broken: false, 
        state: "idle",
        offsetX: -60,
        offsetY: -100,
        vx: 0,
        vy: 0
      },
      rightArm: { 
        hp: 100, 
        maxHp: 100, 
        broken: false, 
        state: "idle",
        offsetX: 50,
        offsetY: -100,
        vx: 0,
        vy: 0
      }
    };
  }
}

/* =========================================================
   PHYSICS & MOVEMENT
   ========================================================= */

function applyPhysics(player, dt) {
  if (!player.onGround && !player.grappling) {
    player.vy += GRAVITY;
    player.vy *= AIR_FRICTION;
  } else {
    player.vx *= FLOOR_FRICTION;
  }

  player.x += player.vx * dt * TICK_RATE;
  player.y += player.vy * dt * TICK_RATE;

  // Floor collision
  if (player.y + player.height >= canvas.height) {
    player.y = canvas.height - player.height;
    player.vy = 0;
    player.onGround = true;
    player.airJuggle = 0;
  } else {
    player.onGround = false;
  }

  // Wall collision
  if (player.x < 0) {
    player.x = 0;
    if (player.vx < -5) wallSplat(player, 0);
    player.vx = 0;
  } else if (player.x + player.width > canvas.width) {
    player.x = canvas.width - player.width;
    if (player.vx > 5) wallSplat(player, canvas.width);
    player.vx = 0;
  }

  // Platform collision
  platforms.forEach(platform => {
    if (player.x + player.width > platform.x && 
        player.x < platform.x + platform.width &&
        player.y + player.height >= platform.y &&
        player.y + player.height <= platform.y + 20 &&
        player.vy >= 0) {
      player.y = platform.y - player.height;
      player.vy = 0;
      player.onGround = true;
      player.airJuggle = 0;
    }
  });
}

function processInputs(player) {
  if (player.inputs.disabled || player.hitstun > 0) return;

  const speed = 5;
  const jumpPower = 12;

  if (player.inputs.left) {
    player.vx = -speed;
    player.facing = -1;
  } else if (player.inputs.right) {
    player.vx = speed;
    player.facing = 1;
  }

  if (player.inputs.jump && player.onGround) {
    player.vy = -jumpPower;
    player.onGround = false;
  }
}

/* =========================================================
   WALL MECHANICS
   ========================================================= */

function wallSplat(player, wallX) {
  player.vx = 0;
  player.vy = 0;
  player.onWall = true;
  player.wallTimer = 0.5;
  player.hp -= 10;
  
  spawnParticle(player.x, player.y, "orange", 
    Math.random() * 4 - 2, -Math.random() * 4, 0.8);
}

function wallTech(player) {
  if (player.onWall && player.wallTimer <= 0) {
    player.vx = player.facing * 3;
    player.vy = -2;
    player.onWall = false;
    player.comboCounter = 0;
  }
}

/* =========================================================
   COMBO & DAMAGE SYSTEM
   ========================================================= */

function applyComboScaling(defender) {
  const scale = 1 - defender.comboCounter * 0.05;
  return Math.max(scale, 0.5);
}

function registerHit(attacker, defender, damage, knockbackX = 0, knockbackY = 0) {
  const scale = applyComboScaling(defender);
  const scaledDamage = damage * scale;

  defender.hp -= scaledDamage;
  defender.vx += knockbackX * attacker.facing;
  defender.vy += knockbackY;

  defender.weaponState = WEAPON_STATES.STAGGER;
  defender.weaponTimer = 0.3 + Math.abs(knockbackY) * 0.02;
  defender.hitstun = 0.5;

  defender.comboCounter++;
  defender.airJuggle += knockbackY !== 0 ? 1 : 0;
  defender.lastHitTime = Date.now();

  // Spawn hit particles
  for (let i = 0; i < 5; i++) {
    spawnParticle(
      defender.x, 
      defender.y - 20,
      "red",
      Math.random() * 4 - 2,
      -Math.random() * 3,
      0.5
    );
  }

  // Update attacker combo
  attacker.comboCounter++;
  attacker.lastHitTime = Date.now();

  playSFX("hit");
}

function resetCombo(player) {
  if (player.onGround && player.comboCounter > 0) {
    if (!player.lastHitTime) {
      player.lastHitTime = Date.now();
    } else if (Date.now() - player.lastHitTime > 1000) {
      player.comboCounter = 0;
      player.lastHitTime = null;
    }
  }
}

/* =========================================================
   WEAPON ATTACKS
   ========================================================= */

function longswordAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      registerHit(player, target, 15, 1.5, 0);
      break;
    case WEAPON_STATES.HEAVY:
      registerHit(player, target, 35, 4, -2);
      break;
    case WEAPON_STATES.GRAB:
      if (target.hp < 20) {
        registerHit(player, target, 50, 5, -3);
      } else {
        registerHit(player, target, 25, 3, -1);
      }
      break;
  }
}

function scytheAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      // Multi-hit combo
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
      // Rapid double hit
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

/* =========================================================
   AIR JUGGLE & DIRECTIONAL LAUNCH
   ========================================================= */

function applyAirJuggle(player, target) {
  if (target.airJuggle > 0) {
    const launchMultiplier = 0.5 + 0.1 * target.airJuggle;
    target.vy -= 2 * launchMultiplier;
    target.vx += 1.5 * launchMultiplier * player.facing;
  }
}

function directionalLaunch(player, target, direction) {
  const knockback = 4;
  const vertical = 3;

  switch (direction) {
    case "up":
      target.vy -= vertical;
      target.vx += knockback * player.facing * 0.5;
      break;
    case "forward":
      target.vx += knockback * player.facing;
      target.vy -= vertical * 0.5;
      break;
    case "diagonal":
      target.vx += knockback * player.facing;
      target.vy -= vertical;
      break;
  }

  target.airJuggle++;
}

/* =========================================================
   JUMP ATTACK
   ========================================================= */

function jumpAttack(player, defender) {
  if (player.onGround) return;

  switch (player.weapon) {
    case "longsword": 
      registerHit(player, defender, 25, 2.5, -2); 
      break;
    case "scythe": 
      registerHit(player, defender, 20, 1.5, -3); 
      break;
    case "katana": 
      registerHit(player, defender, 25, 2, -2.5); 
      break;
    case "fist_tanto": 
      registerHit(player, defender, 20, 1.5, -2); 
      break;
  }

  directionalLaunch(player, defender, "diagonal");
}

/* =========================================================
   PARRY SYSTEM
   ========================================================= */

function attemptParry(attacker, defender) {
  if (!defender.parryPressed || defender.weaponState === WEAPON_STATES.IDLE) {
    return false;
  }

  const timeDiff = Math.abs(attacker.weaponTimer - defender.weaponTimer);
  if (timeDiff < 0.15) {
    defender.weaponState = WEAPON_STATES.PARRY;
    attacker.weaponState = WEAPON_STATES.STAGGER;
    attacker.vx = -attacker.facing * 2;
    attacker.vy = -1;
    attacker.hitstun = 0.5;
    
    playSFX("block");
    
    // Parry particles
    for (let i = 0; i < 10; i++) {
      spawnParticle(
        defender.x, 
        defender.y - 30,
        "cyan",
        Math.random() * 6 - 3,
        -Math.random() * 4,
        0.6
      );
    }
    
    return true;
  }
  return false;
}

/* =========================================================
   WEAPON CLASH & PRIORITY
   ========================================================= */

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

  if (heavyAttacks.includes(attacker.weaponState) && 
      heavyAttacks.includes(defender.weaponState)) {
    const attackerPriority = getWeaponPriority(attacker.weapon);
    const defenderPriority = getWeaponPriority(defender.weapon);

    if (attackerPriority > defenderPriority) {
      defender.weaponState = WEAPON_STATES.STAGGER;
      attacker.weaponState = WEAPON_STATES.ATTACK;
    } else if (attackerPriority < defenderPriority) {
      attacker.weaponState = WEAPON_STATES.STAGGER;
      defender.weaponState = WEAPON_STATES.ATTACK;
    } else {
      // Equal priority - both stagger
      attacker.vx *= -0.5;
      defender.vx *= -0.5;
      attacker.weaponState = WEAPON_STATES.STAGGER;
      defender.weaponState = WEAPON_STATES.STAGGER;
      
      playSFX("block");
    }
  }
}

/* =========================================================
   WEAPON STATE MACHINE
   ========================================================= */

function updateWeaponState(player, dt) {
  switch (player.weaponState) {
    case WEAPON_STATES.IDLE:
      if (player.inputs.light && !player.attackPressed) {
        player.weaponState = player.onGround ? 
          WEAPON_STATES.ATTACK : WEAPON_STATES.JUMP_ATTACK;
        player.weaponTimer = 0.3;
        player.attackPressed = true;
      } else if (player.inputs.heavy) {
        player.weaponState = WEAPON_STATES.HEAVY;
        player.weaponTimer = 0.5;
      } else if (player.inputs.grab) {
        player.weaponState = WEAPON_STATES.GRAB;
        player.weaponTimer = 0.4;
      }
      
      if (player.inputs.parry && !player.parryPressed) {
        player.parryPressed = true;
      }
      break;

    case WEAPON_STATES.ATTACK:
    case WEAPON_STATES.HEAVY:
    case WEAPON_STATES.GRAB:
    case WEAPON_STATES.STAGGER:
    case WEAPON_STATES.JUMP_ATTACK:
      player.weaponTimer -= dt;
      if (player.weaponTimer <= 0) {
        player.weaponState = WEAPON_STATES.IDLE;
      }
      break;

    case WEAPON_STATES.PARRY:
      player.weaponTimer -= dt;
      if (player.weaponTimer <= 0) {
        player.weaponState = WEAPON_STATES.IDLE;
      }
      break;

    default:
      player.weaponState = WEAPON_STATES.IDLE;
      break;
  }

  // Reset attack pressed when button released
  if (!player.inputs.light) {
    player.attackPressed = false;
  }
  
  if (!player.inputs.parry) {
    player.parryPressed = false;
  }
}

/* =========================================================
   GRAPPLE MECHANICS
   ========================================================= */

function attemptGrapple(player, grapplePoint) {
  if (!grapplePoint) return;

  player.grappling = true;
  player.grappleTarget = grapplePoint;

  const dx = grapplePoint.x - player.x;
  const dy = grapplePoint.y - player.y;

  player.vx = dx * 0.1;
  player.vy = dy * 0.1;
}

function releaseGrapple(player) {
  player.grappling = false;
  player.grappleTarget = null;

  player.vx *= 1.2;
  player.vy *= 0.9;
}

function grappleUpdate(player, dt) {
  if (!player.grappling || !player.grappleTarget) return;

  const dx = player.grappleTarget.x - player.x;
  const dy = player.grappleTarget.y - player.y;

  player.vx += dx * 0.05;
  player.vy += dy * 0.05;
  player.vx *= 0.98;
  player.vy *= 0.98;

  if (player.attackPressed && player.target) {
    switch (player.weapon) {
      case "scythe": 
        registerHit(player, player.target, 18, 2, -1); 
        break;
      default: 
        registerHit(player, player.target, 15, 1.5, -1); 
        break;
    }
  }
}

/* =========================================================
   MID-AIR GRAB
   ========================================================= */

function midAirGrab(player, defender) {
  if (defender.onGround || player.grabbing) return;

  player.grabbing = true;
  defender.grabbed = true;

  defender.vx = 0;
  defender.vy = 0;
  player.vx = 0;
  player.vy = 0;

  setTimeout(() => {
    defender.grabbed = false;
    player.grabbing = false;
    registerHit(player, defender, 40, 3, -4);
  }, 250);
}

/* =========================================================
   PLAYER ATTACK UPDATE
   ========================================================= */

function playerAttackUpdate(attacker, defender) {
  const dist = distance(attacker, defender);
  
  if (dist > 60) return; // Out of range
  
  // Check parry first
  if (attemptParry(attacker, defender)) return;
  
  // Check weapon clash
  weaponClash(attacker, defender);
  
  // Execute attack based on weapon
  switch (attacker.weapon) {
    case "longsword": 
      longswordAttack(attacker, defender); 
      break;
    case "scythe": 
      scytheAttack(attacker, defender); 
      break;
    case "katana": 
      katanaAttack(attacker, defender); 
      break;
    case "fist_tanto": 
      fistTantoAttack(attacker, defender); 
      break;
  }

  // Apply air juggle if defender is airborne
  if (!defender.onGround) {
    applyAirJuggle(attacker, defender);
  }
}

/* =========================================================
   BOSS MECHANICS
   ========================================================= */

function bossTakeDamage(boss, damage, limb = null) {
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
    boss.staggerTimer = 2.0;

    Object.keys(boss.limbs).forEach(l => {
      boss.limbs[l].state = "idle";
    });
    
    playSFX("bossRoar");
  }
}

function bossArmorPhase(boss) {
  if (boss.hp > 350) boss.phase = 1;
  else if (boss.hp <= 350 && boss.hp > 150) boss.phase = 2;
  else boss.phase = 3;
}

function bossLimbBreakCheck(boss) {
  for (let limb in boss.limbs) {
    if (boss.limbs[limb].broken && boss.limbs[limb].state !== "disabled") {
      boss.limbs[limb].state = "disabled";
      boss.limbs[limb].vx = 0;
      boss.limbs[limb].vy = 0;
    }
  }
}

function bossAttackPattern(boss, target) {
  if (boss.staggered) return;

  const rand = Math.random();
  if (rand < 0.3) {
    blackOrbBarrage(boss, target);
  } else if (rand < 0.6) {
    dashSlash(boss, target);
  } else {
    normalSlashes(boss, target);
  }
}

function blackOrbBarrage(boss, target) {
  registerHit(boss, target, 35, 1, 0);
}

function dashSlash(boss, target) {
  registerHit(boss, target, 40, 3, 0);
}

function normalSlashes(boss, target) {
  registerHit(boss, target, 35, 2, 0);
}

function bossUpdate(boss, dt) {
  if (boss.staggered) {
    boss.staggerTimer -= dt;
    if (boss.staggerTimer <= 0) {
      boss.staggered = false;
    }
    return;
  }

  bossArmorPhase(boss);
  bossLimbBreakCheck(boss);

  if (!boss.players || boss.players.length === 0) return;
  
  const nearestPlayer = boss.players.reduce((a, b) => 
    distance(b, boss) < distance(a, boss) ? b : a
  );
  
  const dir = nearestPlayer.x > boss.x ? 1 : -1;
  boss.x += dir * boss.speed * dt * TICK_RATE;

  boss.attackCooldown -= dt;
  if (distance(boss, nearestPlayer) < 100 && boss.attackCooldown <= 0) {
    bossAttackPattern(boss, nearestPlayer);
    boss.attackCooldown = 2 + Math.random();
  }
}

/* =========================================================
   CINEMATIC FINISHER
   ========================================================= */

function triggerCinematicFinisher(attacker, defender) {
  if (!defender || defender.hp > 0) return;

  cameraLock(attacker, defender);
  gameTimeScale = 0.3;

  const sequence = [
    () => playAnimation(attacker, "grab"),
    () => playAnimation(attacker, "airSwing"),
    () => playAnimation(attacker, "slam"),
    () => playAnimation(defender, "impact"),
    () => playAnimation(attacker, "finish")
  ];

  let step = 0;
  const interval = setInterval(() => {
    if (step >= sequence.length) {
      clearInterval(interval);
      finishCinematic(attacker, defender);
      return;
    }
    sequence[step++]();
  }, 400);
}

function cameraLock(attacker, defender) {
  camera.x = (attacker.x + defender.x) / 2;
  camera.y = (attacker.y + defender.y) / 2;
  camera.zoom = 1.5;
  camera.lock = true;
}

function finishCinematic(attacker, defender) {
  gameTimeScale = 1.0;
  camera.zoom = 1.0;
  camera.lock = false;

  defender.x = defender.spawnX;
  defender.y = defender.spawnY;
  defender.hp = defender.maxHp;
  attacker.comboCounter = 0;

  grantRewards(attacker, defender);
}

/* =========================================================
   REWARDS & PROGRESSION
   ========================================================= */

function grantRewards(attacker, defender) {
  const gold = Math.floor(Math.random() * 50 + 50);
  attacker.gold += gold;

  const xp = Math.floor(Math.random() * 20 + 30);
  attacker.xp += xp;

  if (defender.isBoss && defender.hp <= 0) {
    if (Math.random() < 0.5) {
      unlockWeapon(attacker, "Apostle Sword");
    }
  }

  showRewardUI(attacker, gold, xp);
}

function showRewardUI(player, gold, xp) {
  floatingText(`+${gold} Gold`, player.x, player.y - 50, "yellow");
  floatingText(`+${xp} XP`, player.x, player.y - 70, "green");
}

function unlockWeapon(player, weaponName) {
  if (!player.weapons.includes(weaponName)) {
    player.weapons.push(weaponName);
    floatingText(`Unlocked: ${weaponName}`, player.x, player.y - 90, "orange");
  }
}

function resetBossArena(boss) {
  boss.hp = boss.maxHp;
  boss.staggered = false;
  boss.breakGauge = 0;
  
  Object.keys(boss.limbs).forEach(limb => {
    boss.limbs[limb].broken = false;
    boss.limbs[limb].state = "idle";
    boss.limbs[limb].hp = boss.limbs[limb].maxHp;
  });

  camera.x = arenaCenterX;
  camera.y = arenaCenterY;
  camera.zoom = 1.0;
}

/* =========================================================
   PARTICLE SYSTEM
   ========================================================= */

function spawnParticle(x, y, color, vx, vy, life = 0.5) {
  particles.push({ x, y, vx, vy, life, color, maxLife: life });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt * TICK_RATE;
    p.y += p.vy * dt * TICK_RATE;
    p.vy += GRAVITY * dt;
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles(ctx) {
  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillRect(p.x, p.y, 3, 3);
    ctx.globalAlpha = 1;
  });
}

/* =========================================================
   SOUND EFFECTS
   ========================================================= */

const sfx = {
  slash: null,
  hit: null,
  grunt: null,
  block: null,
  bossRoar: null
};

// Initialize audio (optional - comment out if no audio files)
function initAudio() {
  try {
    sfx.slash = new Audio("assets/sounds/slash.mp3");
    sfx.hit = new Audio("assets/sounds/hit.mp3");
    sfx.grunt = new Audio("assets/sounds/grunt.mp3");
    sfx.block = new Audio("assets/sounds/block.mp3");
    sfx.bossRoar = new Audio("assets/sounds/boss_roar.mp3");
  } catch (e) {
    console.log("Audio files not found - continuing without sound");
  }
}

function playSFX(name) {
  if (sfx[name]) {
    try {
      sfx[name].currentTime = 0;
      sfx[name].play();
    } catch (e) {
      // Silent fail
    }
  }
}

/* =========================================================
   RENDERING
   ========================================================= */

function drawArena(ctx) {
  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Platforms
  platforms.forEach(p => {
    ctx.fillStyle = "#16213e";
    ctx.fillRect(p.x, p.y, p.width, p.height);
    
    ctx.strokeStyle = "#0f3460";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, p.width, p.height);
  });
}

function drawPlayer(ctx, player) {
  ctx.fillStyle = player.color || "blue";
  
  // Stagger effect
  if (player.weaponState === WEAPON_STATES.STAGGER) {
    ctx.fillStyle = "yellow";
  }
  
  // Parry effect
  if (player.weaponState === WEAPON_STATES.PARRY) {
    ctx.fillStyle = "cyan";
  }
  
  ctx.fillRect(player.x - 15, player.y - 40, 30, 40);
  
  // Facing direction
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(player.x + player.facing * 20, player.y - 15);
  ctx.lineTo(player.x + player.facing * 25, player.y - 18);
  ctx.lineTo(player.x + player.facing * 25, player.y - 12);
  ctx.fill();
}

function drawBoss(ctx, boss) {
  if (!boss) return;
  
  ctx.fillStyle = boss.staggered ? "orange" : "purple";
  ctx.fillRect(boss.x - 50, boss.y - 100, 100, 100);

  // Draw limbs
  Object.keys(boss.limbs).forEach(limb => {
    const l = boss.limbs[limb];
    ctx.fillStyle = l.broken ? "red" : "darkviolet";
    ctx.fillRect(
      boss.x - 50 + l.offsetX, 
      boss.y - 100 + l.offsetY, 
      10, 
      10
    );
  });
}

function drawComboText(ctx, player) {
  if (player.comboCounter > 1) {
    ctx.fillStyle = "white";
    ctx.font = "18px Arial";
    ctx.fillText(`x${player.comboCounter} Hit`, player.x - 20, player.y - 60);
  }
}

function drawCooldowns(ctx, player) {
  if (!player.specialCooldowns) return;
  player.specialCooldowns.forEach((cd, index) => {
    const percent = Math.max(0, cd.timer / cd.max);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(player.x - 20, player.y - 50 - index * 10, 40 * percent, 5);
  });
}

function floatingText(text, x, y, color) {
  ctx.fillStyle = color;
  ctx.font = "20px Arial";
  ctx.fillText(text, x, y);
}

function playAnimation(entity, animationName) {
  console.log(`${entity.id || "Boss"} plays animation: ${animationName}`);
}

/* =========================================================
   UTILITY FUNCTIONS
   ========================================================= */

function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/* =========================================================
   PLAYER UPDATE SYSTEM
   ========================================================= */

function playerUpdate(player, dt) {
  processInputs(player);
  applyPhysics(player, dt);
  updateWeaponState(player, dt);
  grappleUpdate(player, dt);
  
  if (player.onWall) {
    player.wallTimer -= dt;
    if (player.wallTimer <= 0) {
      wallTech(player);
    }
  }
  
  if (player.hitstun > 0) {
    player.hitstun -= dt;
  }
  
  resetCombo(player);
}

/* =========================================================
   MAIN GAME LOOP
   ========================================================= */

let lastTime = performance.now();

function gameLoop(now) {
  const dt = ((now - lastTime) / 1000) * gameTimeScale;
  lastTime = now;

  // Update all players
  players.forEach(p => playerUpdate(p, dt));

  // Update boss
  if (boss) {
    boss.players = players;
    bossUpdate(boss, dt);
    
    // Reset boss if dead
    if (boss.hp <= 0) {
      resetBossArena(boss);
    }
  }

  // Update particles
  updateParticles(dt);

  // Check combat between players
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      if (players[i].weaponState !== WEAPON_STATES.IDLE ||
          players[j].weaponState !== WEAPON_STATES.IDLE) {
        playerAttackUpdate(players[i], players[j]);
        playerAttackUpdate(players[j], players[i]);
      }
    }
  }

  requestAnimationFrame(gameLoop);
}

/* =========================================================
   RENDER LOOP
   ========================================================= */

function renderGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawArena(ctx);

  // Draw all entities
  players.forEach(player => {
    drawPlayer(ctx, player);
    drawComboText(ctx, player);
    drawCooldowns(ctx, player);
  });

  drawParticles(ctx);

  if (boss) {
    drawBoss(ctx, boss);
  }

  requestAnimationFrame(renderGame);
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function initGame() {
  // Initialize players
  players = [
    new Player(1, 100, 500, "blue"),
    new Player(2, 900, 500, "red")
  ];

  // Initialize boss
  boss = new Boss();

  // Initialize audio (optional)
  // initAudio();

  // Start loops
  renderGame();
  gameLoop(performance.now());
}

// Auto-start when canvas is ready
if (canvas && ctx) {
  initGame();
} else {
  console.error("Canvas not found! Make sure you have <canvas id='gameCanvas'></canvas> in your HTML");
}
