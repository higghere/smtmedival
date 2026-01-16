/* =========================================================
   Game.js → Chunk 1 (Lines 1–200)
   Core constants, player setup, physics, weapon states
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
const TICK_RATE = 60; // ticks per second
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
   ARENA
   ----------------------------- */
const arenaCenterX = canvas.width / 2;
const arenaCenterY = canvas.height / 2;

const platforms = [
  { x: 0, y: 550, width: 1000, height: 50 },
  { x: 300, y: 400, width: 200, height: 20 },
  { x: 600, y: 300, width: 200, height: 20 }
];

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
    this.weapons = ["longsword"];
    this.gold = 0;
    this.xp = 0;
    this.combo = 0;
    this.hitstun = 0;
    this.attackPressed = false;
    this.parryPressed = false;
    this.groundY = y;
  }
}

/* -----------------------------
   PLAYER LIST
   ----------------------------- */
let players = [
  new Player(1, 100, 500, "blue"),
  new Player(2, 900, 500, "red")
];

/* -----------------------------
   BASIC PHYSICS
   ----------------------------- */
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
    player.vx = 0;
  } else if (player.x + player.width > canvas.width) {
    player.x = canvas.width - player.width;
    player.vx = 0;
  }
}

/* -----------------------------
   INPUT PROCESSING
   ----------------------------- */
function processInputs(player) {
  if (player.inputs.disabled) return;

  const speed = 5;
  const jumpPower = 12;

  if (player.inputs.left) player.vx = -speed;
  else if (player.inputs.right) player.vx = speed;

  if (player.inputs.jump && player.onGround) {
    player.vy = -jumpPower;
    player.onGround = false;
  }
}

/* -----------------------------
   WEAPON STATE MACHINE
   ----------------------------- */
function updateWeaponState(player, dt) {
  switch (player.weaponState) {
    case WEAPON_STATES.IDLE:
      if (player.inputs.light) {
        player.weaponState = WEAPON_STATES.ATTACK;
        player.weaponTimer = 0.3;
      } else if (player.inputs.heavy) {
        player.weaponState = WEAPON_STATES.HEAVY;
        player.weaponTimer = 0.5;
      } else if (player.inputs.grab) {
        player.weaponState = WEAPON_STATES.GRAB;
        player.weaponTimer = 0.4;
      }
      break;

    case WEAPON_STATES.ATTACK:
    case WEAPON_STATES.HEAVY:
    case WEAPON_STATES.GRAB:
    case WEAPON_STATES.STAGGER:
      player.weaponTimer -= dt;
      if (player.weaponTimer <= 0) player.weaponState = WEAPON_STATES.IDLE;
      break;

    default:
      player.weaponState = WEAPON_STATES.IDLE;
      break;
  }
}

/* -----------------------------
   PLAYER UPDATE
   ----------------------------- */
function playerUpdate(player, dt) {
  processInputs(player);
  applyPhysics(player, dt);
  updateWeaponState(player, dt);
}
/* =========================================================
   Game.js → Chunk 2 (Lines 201–400)
   Weapon attacks, combos, air juggle, grappling, wall tech
   ========================================================= */

/* -----------------------------
   DAMAGE & COMBO SCALING
   ----------------------------- */
function applyComboScaling(defender) {
  const scale = 1 - defender.comboCounter * 0.05;
  return Math.max(scale, 0.5);
}

/* -----------------------------
   REGISTER HIT
   ----------------------------- */
function registerHit(attacker, defender, damage, knockbackX = 0, knockbackY = 0) {
  const scale = applyComboScaling(defender);
  const scaledDamage = damage * scale;

  defender.hp -= scaledDamage;
  defender.vx += knockbackX * attacker.facing;
  defender.vy += knockbackY;

  defender.weaponState = WEAPON_STATES.STAGGER;
  defender.weaponTimer = 0.3 + knockbackY * 0.02;

  defender.comboCounter++;
  defender.airJuggle += knockbackY !== 0 ? 1 : 0;
  defender.lastHitTime = Date.now();
}

/* -----------------------------
   LONGSWORD ATTACKS
   ----------------------------- */
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
      break;
  }
}

/* -----------------------------
   SCYTHE ATTACKS
   ----------------------------- */
function scytheAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      for (let i = 0; i < 3; i++) {
        const dmg = i === 2 ? 18 : 12;
        registerHit(player, target, dmg, 1 * (i + 1), i === 2 ? 2 : 0);
      }
      break;
    case WEAPON_STATES.HEAVY:
      registerHit(player, target, 20, 2, -1);
      break;
    case WEAPON_STATES.CHARGED:
      registerHit(player, target, 30, 3, -2);
      break;
  }
}

/* -----------------------------
   KATANA ATTACKS
   ----------------------------- */
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

/* -----------------------------
   FIST / TANTO ATTACKS
   ----------------------------- */
function fistTantoAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      registerHit(player, target, 14, 1, 0);
      registerHit(player, target, 16, 1, 0.5);
      break;
    case WEAPON_STATES.HEAVY:
      registerHit(player, target, 20, 2, -1);
      break;
    case WEAPON_STATES.CHARGED:
      registerHit(player, target, 35, 3, -2);
      break;
  }
}

/* -----------------------------
   AIR JUGGLE
   ----------------------------- */
function applyAirJuggle(player, target) {
  if (target.airJuggle > 0) {
    const launchMultiplier = 0.5 + 0.1 * target.airJuggle;
    target.vy -= 2 * launchMultiplier;
    target.vx += 1.5 * launchMultiplier * player.facing;
  }
}

/* -----------------------------
   DIRECTIONAL LAUNCH
   ----------------------------- */
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

/* -----------------------------
   PLAYER ATTACK UPDATE
   ----------------------------- */
function playerAttackUpdate(attacker, defender) {
  switch (attacker.weapon) {
    case "longsword": longswordAttack(attacker, defender); break;
    case "scythe": scytheAttack(attacker, defender); break;
    case "katana": katanaAttack(attacker, defender); break;
    case "fist_tanto": fistTantoAttack(attacker, defender); break;
  }

  if (!defender.onGround) applyAirJuggle(attacker, defender);
}

/* -----------------------------
   GRAPPLE / SWING
   ----------------------------- */
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

/* -----------------------------
   JUMP ATTACK
   ----------------------------- */
function jumpAttack(player, defender) {
  if (player.onGround) return;

  switch (player.weapon) {
    case "longsword": registerHit(player, defender, 25, 2.5, -2); break;
    case "scythe": registerHit(player, defender, 20, 1.5, -3); break;
    case "katana": registerHit(player, defender, 25, 2, -2.5); break;
    case "fist_tanto": registerHit(player, defender, 20, 1.5, -2); break;
  }

  directionalLaunch(player, defender, "diagonal");
}

/* -----------------------------
   MID-AIR GRAB
   ----------------------------- */
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

/* -----------------------------
   WALL SPLAT & TECH
   ----------------------------- */
function wallSplat(player, wallX) {
  if ((player.x < wallX && player.vx < 0) || (player.x > wallX && player.vx > 0)) {
    player.vx = 0;
    player.vy = 0;
    player.onWall = true;
    player.wallTimer = 0.5;
    player.hp -= 10;
  }
}

function wallTech(player) {
  if (player.onWall && player.wallTimer <= 0) {
    player.vx = player.facing * 3;
    player.vy = -2;
    player.onWall = false;
    player.comboCounter = 0;
  }
}

/* -----------------------------
   COMBO RESET
   ----------------------------- */
function resetCombo(player) {
  if (player.onGround && player.comboCounter > 0) {
    if (!player.lastHitTime) player.lastHitTime = Date.now();
    else if (Date.now() - player.lastHitTime > 1000) {
      player.comboCounter = 0;
      player.lastHitTime = null;
    }
  }
}

/* -----------------------------
   GRAPPLE UPDATE
   ----------------------------- */
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
      case "scythe": registerHit(player, player.target, 18, 2, -1); break;
      default: registerHit(player, player.target, 15, 1.5, -1); break;
    }
  }
}

/* -----------------------------
   INTEGRATED PLAYER UPDATE
   ----------------------------- */
function playerUpdateIntegrated(player, dt) {
  if (!player.onGround && !player.grappling) player.vy += GRAVITY * dt;

  grappleUpdate(player, dt);

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  if (player.onWall) {
    player.wallTimer -= dt;
    if (player.wallTimer <= 0) wallTech(player);
  }

  resetCombo(player);

  if (player.y >= player.groundY) {
    player.y = player.groundY;
    player.onGround = true;
    player.vy = 0;
  } else player.onGround = false;
}
/* =========================================================
   Game.js → Chunk 3 (Lines 401–600)
   Parry system, weapon clash, priority, boss stagger, armor, limb break
   ========================================================= */

/* -----------------------------
   PARRY SYSTEM
   ----------------------------- */
function attemptParry(attacker, defender) {
  if (!defender.parryPressed || defender.weaponState !== WEAPON_STATES.ATTACK) return false;

  const timeDiff = Math.abs(attacker.weaponTimer - defender.weaponTimer);
  if (timeDiff < 0.15) {
    defender.weaponState = "parry";
    attacker.weaponState = WEAPON_STATES.STAGGER;
    attacker.vx = -attacker.facing * 2;
    attacker.vy = -1;
    return true;
  }
  return false;
}

/* -----------------------------
   WEAPON CLASH + PRIORITY
   ----------------------------- */
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

function getWeaponPriority(weapon) {
  switch (weapon) {
    case "longsword": return 3;
    case "katana": return 2;
    case "scythe": return 1;
    case "fist_tanto": return 0;
    default: return 0;
  }
}

/* -----------------------------
   BOSS DAMAGE & LIMB BREAK
   ----------------------------- */
function bossTakeDamage(boss, damage, limb = null) {
  if (limb && boss.limbs[limb]) {
    boss.limbs[limb].hp -= damage;
    if (boss.limbs[limb].hp <= 0) {
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
  }
}

/* -----------------------------
   BOSS ARMOR PHASES
   ----------------------------- */
function bossArmorPhase(boss) {
  if (boss.hp > 350) boss.phase = 1;
  else if (boss.hp <= 350 && boss.hp > 150) boss.phase = 2;
  else boss.phase = 3;
}

/* -----------------------------
   BOSS LIMB BREAK CHECK
   ----------------------------- */
function bossLimbBreakCheck(boss) {
  for (let limb in boss.limbs) {
    if (boss.limbs[limb].broken && boss.limbs[limb].state !== "disabled") {
      boss.limbs[limb].state = "disabled";
      boss.limbs[limb].vx = 0;
      boss.limbs[limb].vy = 0;
    }
  }
}

/* -----------------------------
   BOSS UPDATE LOOP
   ----------------------------- */
function bossUpdate(boss, dt) {
  if (boss.staggered) {
    boss.staggerTimer -= dt;
    if (boss.staggerTimer <= 0) boss.staggered = false;
    return;
  }

  bossArmorPhase(boss);
  bossLimbBreakCheck(boss);

  if (!boss.players || boss.players.length === 0) return;
  const nearestPlayer = boss.players.reduce((a, b) => (distance(b, boss) < distance(a, boss) ? b : a));
  const dir = nearestPlayer.x > boss.x ? 1 : -1;
  boss.x += dir * boss.speed * dt;

  bossAttackPattern(boss, nearestPlayer);
}

/* -----------------------------
   DISTANCE UTILITY
   ----------------------------- */
function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/* -----------------------------
   BOSS ATTACK PATTERNS
   ----------------------------- */
function bossAttackPattern(boss, target) {
  if (boss.staggered) return;

  const rand = Math.random();
  if (rand < 0.3) blackOrbBarrage(boss, target);
  else if (rand < 0.6) dashSlash(boss, target);
  else normalSlashes(boss, target);
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
/* =========================================================
   Game.js → Chunk 4 (Lines 601–800)
   Cinematic finishers, camera locks, rewards, UI
   ========================================================= */

/* -----------------------------
   CINEMATIC FINISHER
   ----------------------------- */
function triggerCinematicFinisher(attacker, defender) {
  if (!defender || defender.hp > 0) return;

  // Lock camera
  cameraLock(attacker, defender);

  // Slow motion effect
  gameTimeScale = 0.3;

  // Animation sequence
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

/* -----------------------------
   CAMERA LOCK
   ----------------------------- */
function cameraLock(attacker, defender) {
  camera.x = (attacker.x + defender.x) / 2;
  camera.y = (attacker.y + defender.y) / 2;
  camera.zoom = 1.5;
}

/* -----------------------------
   FINISH CINEMATIC
   ----------------------------- */
function finishCinematic(attacker, defender) {
  gameTimeScale = 1.0;
  camera.zoom = 1.0;

  defender.x = defender.spawnX;
  defender.y = defender.spawnY;
  defender.hp = defender.maxHp;
  attacker.comboCounter = 0;

  grantRewards(attacker, defender);
}

/* -----------------------------
   GRANT REWARDS
   ----------------------------- */
function grantRewards(attacker, defender) {
  const gold = Math.floor(Math.random() * 50 + 50);
  attacker.gold += gold;

  const xp = Math.floor(Math.random() * 20 + 30);
  attacker.xp += xp;

  if (defender.isBoss && defender.hp <= 0) {
    if (Math.random() < 0.5) unlockWeapon(attacker, "Apostle Sword");
  }

  showRewardUI(attacker, gold, xp);
}

/* -----------------------------
   DISPLAY REWARD UI
   ----------------------------- */
function showRewardUI(player, gold, xp) {
  floatingText(`+${gold} Gold`, player.x, player.y - 50, "yellow");
  floatingText(`+${xp} XP`, player.x, player.y - 70, "green");
}

/* -----------------------------
   FLOATING TEXT EFFECT
   ----------------------------- */
function floatingText(text, x, y, color) {
  ctx.fillStyle = color;
  ctx.font = "20px Arial";
  ctx.fillText(text, x, y);
  setTimeout(() => clearText(x, y), 1000);
}

function clearText(x, y) {
  ctx.clearRect(x - 10, y - 20, 100, 30);
}

/* -----------------------------
   WEAPON UNLOCK
   ----------------------------- */
function unlockWeapon(player, weaponName) {
  if (!player.weapons.includes(weaponName)) {
    player.weapons.push(weaponName);
    floatingText(`Unlocked: ${weaponName}`, player.x, player.y - 90, "orange");
  }
}

/* -----------------------------
   POST-BOSS RESET
   ----------------------------- */
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

/* -----------------------------
   MOCK PLAY ANIMATION
   ----------------------------- */
function playAnimation(entity, animationName) {
  // Placeholder for actual animation triggers
  console.log(`${entity.id || "Boss"} plays animation: ${animationName}`);
}
/* =========================================================
   Game.js → Chunk 5 (Lines 801–1000)
   Particles, SFX, hit effects, combo text, render loop
   ========================================================= */

/* -----------------------------
   PARTICLE SYSTEM
   ----------------------------- */
const particles = [];

function spawnParticle(x, y, color, vx, vy, life = 0.5) {
  particles.push({ x, y, vx, vy, life, color });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles(ctx) {
  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 2, 2);
  });
}

/* -----------------------------
   SOUND EFFECTS
   ----------------------------- */
const sfx = {
  slash: new Audio("assets/sounds/slash.mp3"),
  hit: new Audio("assets/sounds/hit.mp3"),
  grunt: new Audio("assets/sounds/grunt.mp3"),
  block: new Audio("assets/sounds/block.mp3"),
  bossRoar: new Audio("assets/sounds/boss_roar.mp3")
};

function playSFX(name) {
  if (sfx[name]) sfx[name].play();
}

/* -----------------------------
   HIT REGISTRATION
   ----------------------------- */
function registerHit(attacker, defender, damage, knockback = 1, verticalLaunch = 0) {
  defender.hp -= damage;
  defender.vx += knockback * (defender.x < attacker.x ? -1 : 1);
  defender.vy -= verticalLaunch;
  defender.hitstun = 0.5;

  spawnParticle(defender.x, defender.y, "red", Math.random() * 2 - 1, -2, 0.5);

  playSFX("hit");

  attacker.comboCounter++;
  attacker.lastHitTime = Date.now();
}

/* -----------------------------
   COMBO FLOATING TEXT
   ----------------------------- */
function drawComboText(ctx, player) {
  if (player.comboCounter > 1) {
    ctx.fillStyle = "white";
    ctx.font = "18px Arial";
    ctx.fillText(`x${player.comboCounter} Hit`, player.x, player.y - 60);
  }
}

/* -----------------------------
   COOLDOWN VISUALS
   ----------------------------- */
function drawCooldowns(ctx, player) {
  if (!player.specialCooldowns) return;
  player.specialCooldowns.forEach(cd => {
    const percent = Math.max(0, cd.timer / cd.max);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(player.x - 20, player.y - 50 - cd.index * 10, 40 * percent, 5);
  });
}

/* -----------------------------
   DRAW PLAYER
   ----------------------------- */
function drawPlayer(ctx, player) {
  ctx.fillStyle = player.color || "blue";
  ctx.fillRect(player.x - 15, player.y - 40, 30, 40);
}

/* -----------------------------
   DRAW BOSS
   ----------------------------- */
function drawBoss(ctx, boss) {
  ctx.fillStyle = "purple";
  ctx.fillRect(boss.x - 50, boss.y - 100, 100, 100);

  Object.keys(boss.limbs).forEach(limb => {
    if (boss.limbs[limb].broken) {
      ctx.fillStyle = "red";
      ctx.fillRect(boss.x - 50 + boss.limbs[limb].offsetX, boss.y - 100 + boss.limbs[limb].offsetY, 10, 10);
    }
  });
}

/* -----------------------------
   DRAW ARENA
   ----------------------------- */
function drawArena(ctx) {
  ctx.fillStyle = "#444";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  platforms.forEach(p => {
    ctx.fillStyle = "#666";
    ctx.fillRect(p.x, p.y, p.width, p.height);
  });
}

/* -----------------------------
   INTERPOLATE PLAYERS (NETWORK)
   ----------------------------- */
function interpolatePlayers(dt) {
  players.forEach(p => {
    if (p.targetX !== undefined) {
      p.x += (p.targetX - p.x) * 0.1;
      p.y += (p.targetY - p.y) * 0.1;
    }
  });
}

/* -----------------------------
   NETWORK STUBS
   ----------------------------- */
function sendPlayerUpdate(player) {
  if (!socket) return;
  socket.emit("playerUpdate", {
    id: player.id,
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    hp: player.hp,
    comboCounter: player.comboCounter
  });
}

function receivePlayerUpdate(data) {
  const p = players.find(pl => pl.id === data.id);
  if (!p) return;
  p.targetX = data.x;
  p.targetY = data.y;
  p.hp = data.hp;
  p.comboCounter = data.comboCounter;
}

/* -----------------------------
   MAIN RENDER LOOP
   ----------------------------- */
function renderGame() {
  const dt = 1 / 60;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawArena(ctx);

  players.forEach(player => {
    drawPlayer(ctx, player);
    drawComboText(ctx, player);
    drawCooldowns(ctx, player);
  });

  drawParticles(ctx);

  if (boss) drawBoss(ctx, boss);

  requestAnimationFrame(renderGame);
}

/* -----------------------------
   START RENDER & GAME LOOPS
   ----------------------------- */
renderGame();
gameLoop();
/* =========================================================
   Game.js → Chunk 6 (Lines 1001–1200)
   Boss finishers, rewards, multiplayer hooks, final polish
   ========================================================= */

/* -----------------------------
   CINEMATIC FINISHER
   ----------------------------- */
function triggerCinematicFinisher(attacker, defender) {
  if (!defender || defender.hp > 0) return;

  cameraLock(attacker, defender);
  gameTimeScale = 0.3; // slow motion

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

/* -----------------------------
   CAMERA LOCK
   ----------------------------- */
function cameraLock(attacker, defender) {
  camera.x = (attacker.x + defender.x) / 2;
  camera.y = (attacker.y + defender.y) / 2;
  camera.zoom = 1.5;
}

/* -----------------------------
   FINISH CINEMATIC
   ----------------------------- */
function finishCinematic(attacker, defender) {
  gameTimeScale = 1.0;
  camera.zoom = 1.0;

  defender.x = defender.spawnX || defender.x;
  defender.y = defender.spawnY || defender.y;
  defender.hp = defender.maxHp || PLAYER_MAX_HP;
  attacker.comboCounter = 0;

  grantRewards(attacker, defender);
}

/* -----------------------------
   REWARD SYSTEM
   ----------------------------- */
function grantRewards(attacker, defender) {
  const gold = Math.floor(Math.random() * 50 + 50);
  const xp = Math.floor(Math.random() * 20 + 30);
  attacker.gold = (attacker.gold || 0) + gold;
  attacker.xp = (attacker.xp || 0) + xp;

  if (defender.isBoss && defender.hp <= 0) {
    if (Math.random() < 0.5) unlockWeapon(attacker, "Apostle Sword");
  }

  showRewardUI(attacker, gold, xp);
}

/* -----------------------------
   UI DISPLAY FUNCTIONS
   ----------------------------- */
function showRewardUI(player, gold, xp) {
  floatingText(`+${gold} Gold`, player.x, player.y - 50, "yellow");
  floatingText(`+${xp} XP`, player.x, player.y - 70, "green");
}

function floatingText(text, x, y, color) {
  ctx.fillStyle = color;
  ctx.font = "20px Arial";
  ctx.fillText(text, x, y);
  setTimeout(() => clearText(x, y), 1000);
}

function clearText(x, y) {
  ctx.clearRect(x - 10, y - 20, 100, 30);
}

/* -----------------------------
   WEAPON UNLOCK
   ----------------------------- */
function unlockWeapon(player, weaponName) {
  if (!player.weapons) player.weapons = [];
  if (!player.weapons.includes(weaponName)) {
    player.weapons.push(weaponName);
    floatingText(`Unlocked: ${weaponName}`, player.x, player.y - 90, "orange");
  }
}

/* -----------------------------
   POST-BOSS RESET
   ----------------------------- */
function resetBossArena(boss) {
  boss.hp = boss.maxHp || 500;
  boss.staggered = false;
  boss.breakGauge = 0;

  Object.keys(boss.limbs).forEach(limb => {
    boss.limbs[limb].broken = false;
    boss.limbs[limb].state = "idle";
    boss.limbs[limb].hp = boss.limbs[limb].maxHp || 100;
  });

  camera.x = arenaCenterX || CANVAS_WIDTH / 2;
  camera.y = arenaCenterY || CANVAS_HEIGHT / 2;
  camera.zoom = 1.0;
}

/* -----------------------------
   MULTIPLAYER HOOKS
   ----------------------------- */
function sendPlayerUpdate(player) {
  if (!socket) return;
  socket.emit("playerUpdate", {
    id: player.id,
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    hp: player.hp,
    comboCounter: player.comboCounter
  });
}

function receivePlayerUpdate(data) {
  const p = players.find(pl => pl.id === data.id);
  if (!p) return;
  p.targetX = data.x;
  p.targetY = data.y;
  p.hp = data.hp;
  p.comboCounter = data.comboCounter;
}

/* -----------------------------
   CLIENT INTERPOLATION
   ----------------------------- */
function interpolatePlayers(dt) {
  players.forEach(p => {
    if (p.targetX !== undefined) {
      p.x += (p.targetX - p.x) * 0.1;
      p.y += (p.targetY - p.y) * 0.1;
    }
  });
}

/* -----------------------------
   GAME LOOP (CLIENT-SIDE)
   ----------------------------- */
function gameLoop() {
  const dt = 1 / 60;

  players.forEach(p => playerUpdate(p, dt));

  if (boss) bossUpdate(boss, dt);

  interpolatePlayers(dt);

  updateParticles(dt);

  players.forEach(p => sendPlayerUpdate(p));

  requestAnimationFrame(gameLoop);
}

// Start everything
renderGame();
gameLoop();
