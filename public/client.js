const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 1000;
canvas.height = 600;

// ==================== NETWORKING ====================
const socket = io();
let playerId = null;
let players = {};
let boss = {};
let particles = [];

// ==================== INPUT STATE ====================
const input = {
  left: false,
  right: false,
  jump: false,
  light: false,
  heavy: false,
  grab: false,
  grapple: false,
  parry: false,
  sprint: false,
  switchWeapon: false,
  mouseX: 0,
  mouseY: 0
};

// ==================== WEAPON INFO ====================
const weaponData = {
  longsword: { name: "Longsword", color: "#888888", priority: 3 },
  katana: { name: "Katana", color: "#FF6B6B", priority: 2 },
  scythe: { name: "Scythe", color: "#4ECDC4", priority: 1 },
  fist_tanto: { name: "Fist/Tanto", color: "#FFE66D", priority: 0 }
};

// ==================== CAMERA ====================
let camera = {
  x: 0,
  y: 0,
  zoom: 1,
  targetX: 0,
  targetY: 0
};

function updateCamera() {
  const myPlayer = players[playerId];
  if (myPlayer) {
    camera.targetX = myPlayer.x - canvas.width / 2;
    camera.targetY = myPlayer.y - canvas.height / 2;
    
    camera.x += (camera.targetX - camera.x) * 0.1;
    camera.y += (camera.targetY - camera.y) * 0.1;
  }
}

// ==================== HUD ====================
function drawHUD() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  // Player health bars
  Object.values(players).forEach((p, index) => {
    const screenX = p.x - camera.x;
    const screenY = p.y - camera.y;
    
    // Health bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(screenX - 30, screenY - 55, 60, 10);
    
    // Health bar
    const hpPercent = p.hp / p.maxHp;
    ctx.fillStyle = hpPercent > 0.5 ? '#00ff00' : hpPercent > 0.25 ? '#ffff00' : '#ff0000';
    ctx.fillRect(screenX - 30, screenY - 55, 60 * hpPercent, 10);
    
    // Health text
    ctx.fillStyle = 'white';
    ctx.font = '10px Arial';
    ctx.fillText(`${Math.round(p.hp)}`, screenX - 10, screenY - 47);
    
    // Combo counter
    if (p.combo > 1) {
      ctx.fillStyle = 'yellow';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`${p.combo} HIT COMBO!`, screenX - 35, screenY - 65);
    }
    
    // Air juggle indicator
    if (p.airJuggle > 0) {
      ctx.fillStyle = 'orange';
      ctx.font = '12px Arial';
      ctx.fillText(`Juggle x${p.airJuggle}`, screenX - 25, screenY - 75);
    }
    
    // Player ID
    if (p.id === playerId) {
      ctx.fillStyle = 'cyan';
      ctx.font = 'bold 12px Arial';
      ctx.fillText('YOU', screenX - 15, screenY - 85);
    }
    
    // Weapon name
    const weaponInfo = weaponData[p.weapon] || weaponData.longsword;
    ctx.fillStyle = weaponInfo.color;
    ctx.font = '10px Arial';
    ctx.fillText(weaponInfo.name, screenX - 25, screenY + 50);
  });
  
  // Boss health bar
  if (boss && boss.hp > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(canvas.width / 2 - 150, 10, 300, 30);
    
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(canvas.width / 2 - 145, 15, 290 * (boss.hp / boss.maxHp), 20);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`BOSS - Phase ${boss.phase}`, canvas.width / 2 - 50, 30);
    
    if (boss.staggered) {
      ctx.fillStyle = 'yellow';
      ctx.fillText('STAGGERED!', canvas.width / 2 - 40, 50);
    }
  }
  
  // Controls
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(5, 5, 400, 120);
  ctx.fillStyle = 'white';
  ctx.font = '12px Arial';
  ctx.fillText('Controls:', 10, 20);
  ctx.fillText('A/D - Move | Space - Jump | Shift - Sprint', 10, 35);
  ctx.fillText('Z - Light Attack | X - Heavy Attack | E - Grab', 10, 50);
  ctx.fillText('C - Grapple (in air) | V - Parry | Q - Switch Weapon', 10, 65);
  ctx.fillText('Mouse - Aim Grapple', 10, 80);
  
  // Current weapon info
  const myPlayer = players[playerId];
  if (myPlayer) {
    const weaponInfo = weaponData[myPlayer.weapon] || weaponData.longsword;
    ctx.fillStyle = weaponInfo.color;
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`Weapon: ${weaponInfo.name} (Priority: ${weaponInfo.priority})`, 10, 100);
    ctx.fillText(`Combo: ${myPlayer.combo} | Juggle: ${myPlayer.airJuggle}`, 10, 115);
  }
  
  ctx.restore();
}

// ==================== PARTICLES ====================
function drawParticles() {
  particles.forEach(p => {
    const screenX = p.x - camera.x;
    const screenY = p.y - camera.y;
    
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillRect(screenX, screenY, 4, 4);
    ctx.globalAlpha = 1;
  });
}

// ==================== WEAPON TRAIL ====================
function drawWeaponTrail(p) {
  if (p.weaponState === 'attack' || p.weaponState === 'heavy' || p.weaponState === 'jump_attack') {
    const weaponInfo = weaponData[p.weapon] || weaponData.longsword;
    const screenX = p.x - camera.x;
    const screenY = p.y - camera.y;
    
    ctx.strokeStyle = weaponInfo.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6;
    
    const trailLength = 30;
    ctx.beginPath();
    ctx.moveTo(screenX + p.facing * 10, screenY - 20);
    ctx.lineTo(screenX + p.facing * trailLength, screenY - 20);
    ctx.stroke();
    
    ctx.globalAlpha = 1;
  }
}

// ==================== RENDERING ====================
function drawPlayer(p) {
  const screenX = p.x - camera.x;
  const screenY = p.y - camera.y;
  
  // Player body
  ctx.fillStyle = p.color || 'blue';
  if (p.stunned) {
    ctx.fillStyle = 'yellow';
  }
  ctx.fillRect(screenX - 15, screenY - 40, 30, 40);
  
  // Weapon trail
  drawWeaponTrail(p);
  
  // Facing indicator
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(screenX + p.facing * 20, screenY - 15);
  ctx.lineTo(screenX + p.facing * 25, screenY - 18);
  ctx.lineTo(screenX + p.facing * 25, screenY - 12);
  ctx.fill();
  
  // Stagger/parry visual
  if (p.weaponState === 'stagger') {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY - 50, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  if (p.weaponState === 'parry') {
    ctx.strokeStyle = 'cyan';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(screenX, screenY - 50, 12, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = 'cyan';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('PARRY!', screenX - 20, screenY - 60);
  }
  
  // On-ground indicator
  if (!p.onGround) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(screenX - 2, screenY + 5, 4, 10);
  }
}

function drawBoss(b) {
  if (!b || b.hp <= 0) return;
  
  const screenX = b.x - camera.x;
  const screenY = b.y - camera.y;
  
  // Boss body
  ctx.fillStyle = b.staggered ? 'orange' : 'purple';
  ctx.fillRect(screenX - 50, screenY - 150, 100, 150);
  
  // Boss limbs
  if (b.limbs) {
    // Left arm
    ctx.fillStyle = b.limbs.leftArm.broken ? 'red' : 'darkviolet';
    ctx.fillRect(screenX - 70, screenY - 120, 20, 40);
    
    // Right arm
    ctx.fillStyle = b.limbs.rightArm.broken ? 'red' : 'darkviolet';
    ctx.fillRect(screenX + 50, screenY - 120, 20, 40);
  }
  
  // Phase indicator
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(`Phase ${b.phase}`, screenX - 25, screenY - 160);
}

function drawGrapple(p) {
  if (p.grappling && p.grappleTarget) {
    const screenX = p.x - camera.x;
    const screenY = p.y - camera.y;
    const targetX = p.grappleTarget.x - camera.x;
    const targetY = p.grappleTarget.y - camera.y;
    
    ctx.strokeStyle = 'cyan';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(screenX, screenY - 20);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Grapple point
    ctx.fillStyle = 'cyan';
    ctx.beginPath();
    ctx.arc(targetX, targetY, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawArena() {
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x - (camera.x % 50), 0);
    ctx.lineTo(x - (camera.x % 50), canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y - (camera.y % 50));
    ctx.lineTo(canvas.width, y - (camera.y % 50));
    ctx.stroke();
  }
  
  // Floor
  const floorY = 600 - camera.y;
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, floorY - 50, canvas.width, 50);
  
  // Floor line
  ctx.strokeStyle = '#0f3460';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, floorY - 50);
  ctx.lineTo(canvas.width, floorY - 50);
  ctx.stroke();
}

// ==================== GAME LOOP ====================
let lastTime = performance.now();

function gameLoop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Update camera
  updateCamera();
  
  // Draw arena
  drawArena();
  
  // Draw boss
  drawBoss(boss);
  
  // Draw players
  Object.values(players).forEach(p => {
    drawPlayer(p);
    drawGrapple(p);
  });
  
  // Draw particles
  drawParticles();
  
  // Draw HUD
  drawHUD();
  
  // Send input
  if (playerId) {
    socket.emit('input', input);
  }
  
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// ==================== INPUT EVENTS ====================
document.addEventListener('keydown', e => {
  switch (e.code) {
    case 'KeyA': input.left = true; break;
    case 'KeyD': input.right = true; break;
    case 'Space': input.jump = true; break;
    case 'KeyZ': input.light = true; break;
    case 'KeyX': input.heavy = true; break;
    case 'KeyE': input.grab = true; break;
    case 'KeyC': input.grapple = true; break;
    case 'KeyV': input.parry = true; break;
    case 'KeyQ': input.switchWeapon = true; break;
    case 'ShiftLeft': input.sprint = true; break;
  }
});

document.addEventListener('keyup', e => {
  switch (e.code) {
    case 'KeyA': input.left = false; break;
    case 'KeyD': input.right = false; break;
    case 'Space': input.jump = false; break;
    case 'KeyZ': input.light = false; break;
    case 'KeyX': input.heavy = false; break;
    case 'KeyE': input.grab = false; break;
    case 'KeyC': input.grapple = false; break;
    case 'KeyV': input.parry = false; break;
    case 'ShiftLeft': input.sprint = false; break;
  }
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  input.mouseX = (e.clientX - rect.left) + camera.x;
  input.mouseY = (e.clientY - rect.top) + camera.y;
});

// ==================== NETWORKING ====================
socket.on('connect', () => {
  playerId = socket.id;
  console.log('Connected with ID:', playerId);
});

socket.on('state', data => {
  // Update players
  const newPlayers = {};
  data.players.forEach(s => {
    newPlayers[s.id] = s;
  });
  players = newPlayers;
  
  // Update boss
  boss = data.boss || {};
  
  // Update particles
  particles = data.particles || [];
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  playerId = null;
});
