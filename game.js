/* =========================================================
   Full Game.js → Part 1
   Core constants, player setup, physics, weapon states
   ========================================================= */

/* -----------------------------
   GLOBAL CONSTANTS
   ----------------------------- */
const TICK_RATE = 60; // game ticks per second
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
  JUMP_ATTACK: "jump_attack"
};

const PLAYER_MAX_HP = 100;

/* -----------------------------
   CAMERA
   ----------------------------- */
let camera = {
  x: 0,
  y: 0,
  zoom: 1.0,
  target: null,
  lock: false
};

/* -----------------------------
   PLAYER STRUCTURE
   ----------------------------- */
class Player {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.width = 48;
    this.height = 64;
    this.hp = PLAYER_MAX_HP;
    this.facing = 1; // 1 = right, -1 = left
    this.onGround = false;
    this.inputs = {
      left: false,
      right: false,
      jump: false,
      light: false,
      heavy: false,
      grab: false,
      disabled: false
    };
    this.weapon = "longsword";
    this.weaponState = WEAPON_STATES.IDLE;
    this.weaponTimer = 0;
    this.comboCounter = 0;
    this.airJuggle = 0;
  }
}

/* -----------------------------
   PLAYER LIST
   ----------------------------- */
let players = [
  new Player(1, 100, CANVAS_HEIGHT - 100),
  new Player(2, CANVAS_WIDTH - 150, CANVAS_HEIGHT - 100)
];

/* -----------------------------
   BASIC PHYSICS
   ----------------------------- */
function applyPhysics(player) {
  if (!player.onGround) {
    player.vy += GRAVITY;
    player.vy *= AIR_FRICTION;
  } else {
    player.vx *= FLOOR_FRICTION;
  }

  player.x += player.vx;
  player.y += player.vy;

  // Floor collision
  if (player.y + player.height >= CANVAS_HEIGHT) {
    player.y = CANVAS_HEIGHT - player.height;
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
  } else if (player.x + player.width > CANVAS_WIDTH) {
    player.x = CANVAS_WIDTH - player.width;
    player.vx = 0;
  }
}

/* -----------------------------
   PLAYER MOVEMENT INPUT
   ----------------------------- */
function processInputs(player) {
  if (player.inputs.disabled) return;

  const speed = 5;
  const jumpPower = 12;

  // Horizontal movement
  if (player.inputs.left) player.vx = -speed;
  else if (player.inputs.right) player.vx = speed;

  // Jumping
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
      player.weaponTimer -= dt;
      if (player.weaponTimer <= 0) {
        player.weaponState = WEAPON_STATES.IDLE;
      }
      break;

    case WEAPON_STATES.HEAVY:
      player.weaponTimer -= dt;
      if (player.weaponTimer <= 0) {
        player.weaponState = WEAPON_STATES.IDLE;
      }
      break;

    case WEAPON_STATES.GRAB:
      player.weaponTimer -= dt;
      if (player.weaponTimer <= 0) {
        player.weaponState = WEAPON_STATES.IDLE;
      }
      break;

    case WEAPON_STATES.STAGGER:
      player.weaponTimer -= dt;
      if (player.weaponTimer <= 0) {
        player.weaponState = WEAPON_STATES.IDLE;
      }
      break;

    default:
      player.weaponState = WEAPON_STATES.IDLE;
      break;
  }
}

/* -----------------------------
   PLAYER UPDATE HOOK
   ----------------------------- */
function playerUpdate(player, dt) {
  processInputs(player);
  applyPhysics(player);
  updateWeaponState(player, dt);
}

/* -----------------------------
   RENDER PLACEHOLDER
   ----------------------------- */
function renderGame(players, boss = null) {
  // Placeholder for client-side rendering
  // Replace with canvas drawing & interpolation in client.js
  console.clear();
  players.forEach(p =>
    console.log(`Player ${p.id}: x=${p.x.toFixed(1)}, y=${p.y.toFixed(1)}, hp=${p.hp}`)
  );
  if (boss) console.log(`Boss: hp=${boss.hp}, stagger=${boss.stagger.current}`);
}

/* -----------------------------
   GAME LOOP
   ----------------------------- */
let lastTime = performance.now();
function gameLoop() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  players.forEach(p => playerUpdate(p, dt));

  if (typeof boss !== "undefined") bossUpdate(boss, dt);

  renderGame(players, boss);

  requestAnimationFrame(gameLoop);
}

gameLoop();
/* =========================================================
   Full Game.js → Part 2
   Weapon systems, combos, directional launchers, air juggle
   ========================================================= */

/* -----------------------------
   DAMAGE & COMBO SCALING
   ----------------------------- */
function applyComboScaling(defender) {
  // Simple diminishing returns for repeated hits
  const scale = 1 - defender.comboCounter * 0.05;
  return Math.max(scale, 0.5);
}

/* -----------------------------
   COMBO HIT REGISTRATION
   ----------------------------- */
function registerHit(attacker, defender, damage, knockbackX = 0, knockbackY = 0) {
  const scale = applyComboScaling(defender);
  const scaledDamage = damage * scale;

  defender.hp -= scaledDamage;
  defender.vx += knockbackX * attacker.facing;
  defender.vy += knockbackY;

  defender.comboCounter++;
  defender.airJuggle += knockbackY !== 0 ? 1 : 0;

  // Hitstun & stagger
  defender.weaponState = WEAPON_STATES.STAGGER;
  defender.weaponTimer = 0.3 + knockbackY * 0.02;
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
      if (target.hp < 20) {
        registerHit(player, target, 50, 5, -3);
      }
      break;
    default:
      break;
  }
}

/* -----------------------------
   SCYTHE ATTACKS
   ----------------------------- */
function scytheAttack(player, target) {
  switch (player.weaponState) {
    case WEAPON_STATES.ATTACK:
      // Multi-hit combo
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
    default:
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
    default:
      break;
  }
}

/* -----------------------------
   FIST & TANTO ATTACKS
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
    default:
      break;
  }
}

/* -----------------------------
   AIR JUGGLE / LAUNCHERS
   ----------------------------- */
function applyAirJuggle(player, target) {
  if (target.airJuggle > 0) {
    const launchMultiplier = 0.5 + 0.1 * target.airJuggle;
    target.vy -= 2 * launchMultiplier;
    target.vx += 1.5 * launchMultiplier * player.facing;
  }
}

/* -----------------------------
   DIRECTIONAL LAUNCH HANDLER
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
    default:
      break;
  }
  target.airJuggle++;
}

/* -----------------------------
   PLAYER ATTACK UPDATE
   ----------------------------- */
function playerAttackUpdate(attacker, defender) {
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
    default:
      break;
  }

  // Apply air juggle if in air
  if (!defender.onGround) {
    applyAirJuggle(attacker, defender);
  }
}
/* =========================================================
   Full Game.js → Part 3
   Grappling physics, jump attacks, wall tech/splat, combo resets
   ========================================================= */

/* -----------------------------
   CHAIN GRAPPLING / SWING
   ----------------------------- */
function attemptGrapple(player, grapplePoint) {
  if (!grapplePoint) return;

  player.grappling = true;
  player.grappleTarget = grapplePoint;

  // Calculate swing vector
  const dx = grapplePoint.x - player.x;
  const dy = grapplePoint.y - player.y;
  player.vx = dx * 0.1;
  player.vy = dy * 0.1;
}

function releaseGrapple(player) {
  player.grappling = false;
  player.grappleTarget = null;
  // Launch off in current direction
  player.vx *= 1.2;
  player.vy *= 0.9;
}

/* -----------------------------
   JUMP ATTACKS
   ----------------------------- */
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
    default:
      break;
  }
  // Apply directional launcher
  directionalLaunch(player, defender, "diagonal");
}

/* -----------------------------
   MID-AIR GRAB
   ----------------------------- */
function midAirGrab(player, defender) {
  if (defender.onGround || player.grabbing) return;

  player.grabbing = true;
  defender.grabbed = true;

  // Lock both in place
  defender.vx = 0;
  defender.vy = 0;
  player.vx = 0;
  player.vy = 0;

  // Slam after 0.25s
  setTimeout(() => {
    defender.grabbed = false;
    player.grabbing = false;
    registerHit(player, defender, 40, 3, -4);
  }, 250);
}

/* -----------------------------
   WALL SPLAT
   ----------------------------- */
function wallSplat(player, wallX) {
  // Determine if player hits wall
  if ((player.x < wallX && player.vx < 0) || (player.x > wallX && player.vx > 0)) {
    player.vx = 0;
    player.vy = 0;
    player.onWall = true;
    player.wallTimer = 0.5; // seconds stuck
    player.hp -= 10; // minor impact damage
  }
}

/* -----------------------------
   WALL TECH
   ----------------------------- */
function wallTech(player) {
  if (player.onWall && player.wallTimer <= 0) {
    player.vx = player.facing * 3; // push off wall
    player.vy = -2; // small jump
    player.onWall = false;
    player.comboCounter = 0; // reset combo
  }
}

/* -----------------------------
   COMBO RESET HANDLER
   ----------------------------- */
function resetCombo(player) {
  if (player.onGround && player.comboCounter > 0) {
    // Reset if not hitting for 1 second
    if (!player.lastHitTime) player.lastHitTime = Date.now();
    else if (Date.now() - player.lastHitTime > 1000) {
      player.comboCounter = 0;
      player.lastHitTime = null;
    }
  }
}

/* -----------------------------
   PLAYER GRAPPLE UPDATE
   ----------------------------- */
function grappleUpdate(player, dt) {
  if (!player.grappling || !player.grappleTarget) return;

  const dx = player.grappleTarget.x - player.x;
  const dy = player.grappleTarget.y - player.y;

  // Simple spring physics
  player.vx += dx * 0.05;
  player.vy += dy * 0.05;
  player.vx *= 0.98; // damping
  player.vy *= 0.98;

  // Allow attacking while swinging
  if (player.attackPressed) {
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

/* -----------------------------
   INTEGRATED PLAYER UPDATE
   ----------------------------- */
function playerUpdate(player, dt) {
  // Gravity
  if (!player.onGround && !player.grappling) player.vy += GRAVITY * dt;

  // Grapple physics
  grappleUpdate(player, dt);

  // Apply velocities
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Wall checks
  if (player.onWall) {
    player.wallTimer -= dt;
    if (player.wallTimer <= 0) wallTech(player);
  }

  // Combo reset
  resetCombo(player);

  // Ground collision
  if (player.y >= player.groundY) {
    player.y = player.groundY;
    player.onGround = true;
    player.vy = 0;
  } else {
    player.onGround = false;
  }
}
/* =========================================================
   Full Game.js → Part 4
   Parry, weapon clash, priority, boss stagger & limb break
   ========================================================= */

/* -----------------------------
   PARRY SYSTEM
   ----------------------------- */
function attemptParry(attacker, defender) {
  if (!defender.parryPressed || defender.weaponState !== WEAPON_STATES.ATTACK) return false;

  // Parry timing window
  const timeDiff = Math.abs(attacker.weaponTimer - defender.weaponTimer);
  if (timeDiff < 0.15) {
    // Successful parry
    defender.weaponState = WEAPON_STATES.PARRY;
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
  // If both attacking heavy attacks at same time
  if (
    (attacker.weaponState === WEAPON_STATES.HEAVY || attacker.weaponState === WEAPON_STATES.CHARGED) &&
    (defender.weaponState === WEAPON_STATES.HEAVY || defender.weaponState === WEAPON_STATES.CHARGED)
  ) {
    // Compare weapon priority
    const attackerPriority = getWeaponPriority(attacker.weapon);
    const defenderPriority = getWeaponPriority(defender.weapon);

    if (attackerPriority > defenderPriority) {
      defender.weaponState = WEAPON_STATES.STAGGER;
      attacker.weaponState = WEAPON_STATES.ATTACK; // recovers faster
    } else if (attackerPriority < defenderPriority) {
      attacker.weaponState = WEAPON_STATES.STAGGER;
      defender.weaponState = WEAPON_STATES.ATTACK;
    } else {
      // Equal priority → bounce off
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
   BOSS STAGGER / BREAK GAUGE
   ----------------------------- */
function bossTakeDamage(boss, damage, limb = null) {
  // Apply damage to break gauge if attacking limb
  if (limb && boss.limbs[limb]) {
    boss.limbs[limb].hp -= damage;
    if (boss.limbs[limb].hp <= 0) {
      boss.limbs[limb].broken = true;
      boss.attackCooldown += 1.5; // penalize boss
    }
  }

  // Main HP
  boss.hp -= damage;
  boss.breakGauge += damage * 0.5;

  // Stagger thresholds
  if (boss.breakGauge >= boss.breakThreshold) {
    boss.staggered = true;
    boss.breakGauge = 0;
    boss.staggerTimer = 2.0; // 2 seconds stagger
    // Force all limbs to idle
    Object.keys(boss.limbs).forEach(l => {
      boss.limbs[l].state = "idle";
    });
  }
}

/* -----------------------------
   BOSS ARMOR PHASES
   ----------------------------- */
function bossArmorPhase(boss) {
  if (boss.hp > 350) boss.phase = 1; // default armor, normal attacks
  else if (boss.hp <= 350 && boss.hp > 150) boss.phase = 2; // weakened armor, faster attacks
  else boss.phase = 3; // critical armor, very aggressive
}

/* -----------------------------
   LIMB BREAK SYSTEM
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
   BOSS UPDATE
   ----------------------------- */
function bossUpdate(boss, dt) {
  // Stagger handling
  if (boss.staggered) {
    boss.staggerTimer -= dt;
    if (boss.staggerTimer <= 0) boss.staggered = false;
    return;
  }

  // Armor phase update
  bossArmorPhase(boss);

  // Limb break check
  bossLimbBreakCheck(boss);

  // Basic AI for movement
  const nearestPlayer = boss.players.reduce((a, b) => (distance(b, boss) < distance(a, boss) ? b : a));
  const dir = nearestPlayer.x > boss.x ? 1 : -1;
  boss.x += dir * boss.speed * dt;

  // Attack patterns
  bossAttackPattern(boss, nearestPlayer);
}

/* -----------------------------
   UTILITY: DISTANCE
   ----------------------------- */
function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/* -----------------------------
   BOSS ATTACK PATTERN (simplified)
   ----------------------------- */
function bossAttackPattern(boss, target) {
  if (boss.staggered) return;

  const rand = Math.random();
  if (rand < 0.3) blackOrbBarrage(boss, target);
  else if (rand < 0.6) dashSlash(boss, target);
  else normalSlashes(boss, target);
}

/* -----------------------------
   MOCKED BOSS ATTACKS
   ----------------------------- */
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
   Full Game.js → Part 5
   Cinematic Finishers, Final Stagger, Camera Locks, Rewards
   ========================================================= */

/* -----------------------------
   CINEMATIC FINISHER
   ----------------------------- */
function triggerCinematicFinisher(attacker, defender) {
  if (!defender || defender.hp > 0) return;

  // Lock camera on target
  cameraLock(attacker, defender);

  // Slow down time
  gameTimeScale = 0.3;

  // Play animation sequence
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
  // Restore normal time
  gameTimeScale = 1.0;
  camera.zoom = 1.0;

  // Reset positions slightly for respawn or post-match
  defender.x = defender.spawnX;
  defender.y = defender.spawnY;
  defender.hp = defender.maxHp;
  attacker.combo = 0;

  // Trigger rewards
  grantRewards(attacker, defender);
}

/* -----------------------------
   REWARDS / LOOT SYSTEM
   ----------------------------- */
function grantRewards(attacker, defender) {
  // Gold / currency
  const gold = Math.floor(Math.random() * 50 + 50);
  attacker.gold += gold;

  // Experience points
  const xp = Math.floor(Math.random() * 20 + 30);
  attacker.xp += xp;

  // Weapon unlock chance (boss only)
  if (defender.isBoss && defender.hp <= 0) {
    const dropChance = Math.random();
    if (dropChance < 0.5) {
      unlockWeapon(attacker, "Apostle Sword");
    }
  }

  // Display reward UI
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
  // Add temporary UI element
  ctx.fillStyle = color;
  ctx.font = "20px Arial";
  ctx.fillText(text, x, y);
  setTimeout(() => clearText(x, y), 1000);
}

function clearText(x, y) {
  // Overdraw with background (simple clear)
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
   POST-BOSS DEFEAT RESET
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
/* =========================================================
   Full Game.js → Part 6
   Particle effects, sounds, render loop, client-server hooks
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
   SOUND HOOKS
   ----------------------------- */
const sfx = {
  slash: new Audio("assets/sounds/slash.mp3"),
  hit: new Audio("assets/sounds/hit.mp3"),
  grunt: new Audio("assets/sounds/grunt.mp3"),
  block: new Audio("assets/sounds/block.mp3"),
  bossRoar: new Audio("assets/sounds/boss_roar.mp3"),
};

function playSFX(name) {
  if (sfx[name]) sfx[name].play();
}

/* -----------------------------
   HIT EFFECTS
   ----------------------------- */
function registerHit(attacker, defender, damage, knockback, verticalLaunch) {
  defender.hp -= damage;
  defender.vx += knockback * (defender.x < attacker.x ? -1 : 1);
  defender.vy -= verticalLaunch;
  defender.hitstun = 0.5;

  // Spawn particles
  spawnParticle(defender.x, defender.y, "red", Math.random() * 2 - 1, -2, 0.5);

  // Play sound
  playSFX("hit");

  // Increment combo
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
  player.specialCooldowns.forEach(cd => {
    const percent = Math.max(0, cd.timer / cd.max);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(player.x - 20, player.y - 50 - cd.index * 10, 40 * percent, 5);
  });
}

/* -----------------------------
   MAIN RENDER LOOP
   ----------------------------- */
function renderGame() {
  const dt = 1 / 60;

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw arena
  drawArena(ctx);

  // Draw players
  players.forEach(player => {
    drawPlayer(ctx, player);
    drawComboText(ctx, player);
    drawCooldowns(ctx, player);
  });

  // Draw particles
  drawParticles(ctx);

  // Boss draw
  if (boss) drawBoss(ctx, boss);

  requestAnimationFrame(renderGame);
}

/* -----------------------------
   PLAYER DRAW
   ----------------------------- */
function drawPlayer(ctx, player) {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x - 15, player.y - 40, 30, 40);
}

/* -----------------------------
   BOSS DRAW
   ----------------------------- */
function drawBoss(ctx, boss) {
  ctx.fillStyle = "purple";
  ctx.fillRect(boss.x - 50, boss.y - 100, 100, 100);

  // Limb break indicator
  Object.keys(boss.limbs).forEach(limb => {
    if (boss.limbs[limb].broken) {
      ctx.fillStyle = "red";
      ctx.fillRect(boss.x - 50 + boss.limbs[limb].offsetX, boss.y - 100 + boss.limbs[limb].offsetY, 10, 10);
    }
  });
}

/* -----------------------------
   ARENA DRAW
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
   NETWORK SYNC STUBS
   ----------------------------- */
function sendPlayerUpdate(player) {
  // Example stub: emit position, state to server
  if (!socket) return;
  socket.emit("playerUpdate", {
    id: player.id,
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    hp: player.hp,
    comboCounter: player.comboCounter,
  });
}

function receivePlayerUpdate(data) {
  const p = players.find(pl => pl.id === data.id);
  if (!p) return;
  // Basic interpolation
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
   GAME LOOP
   ----------------------------- */
function gameLoop() {
  const dt = 1 / 60;

  // Update players
  players.forEach(p => playerUpdate(p, dt));

  // Update boss
  if (boss) bossUpdate(boss, dt);

  // Interpolation
  interpolatePlayers(dt);

  // Update particles
  updateParticles(dt);

  // Send network updates
  players.forEach(p => sendPlayerUpdate(p));

  requestAnimationFrame(gameLoop);
}

// Start render & game loops
renderGame();
gameLoop();
