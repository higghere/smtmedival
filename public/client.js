const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 1000;
canvas.height = 600;

// --- Networking ---
const socket = io();
let playerId = null;
let players = {};
let boss = {};
let projectiles = [];
let particles = [];

// --- Input ---
const input = {
  left:false,right:false,jump:false,light:false,heavy:false,grab:false,sprint:false,
  mouseX:0,mouseY:0
};

// --- HUD ---
function drawHUD(){
  Object.values(players).forEach(p=>{
    // Health bar
    ctx.fillStyle='black';
    ctx.fillRect(p.x-30,p.y-50,60,8);
    ctx.fillStyle=p.hp>50?'green':p.hp>25?'yellow':'red';
    ctx.fillRect(p.x-30,p.y-50,60*(p.hp/100),8);
    // Combo
    if(p.combo>1){
      ctx.fillStyle='white';
      ctx.font='14px Arial';
      ctx.fillText(`x${p.combo}`,p.x-10,p.y-60);
    }
  });
}

// --- Particles ---
function spawnParticle(x,y,color,dx,dy,life){particles.push({x,y,dx,dy,life,color});}
function updateParticles(dt){
  particles = particles.filter(p=>p.life>0);
  particles.forEach(p=>{
    p.x+=p.dx*dt;
    p.y+=p.dy*dt;
    p.dy+=500*dt;
    p.life-=dt*1000;
  });
}
function drawParticles(){particles.forEach(p=>{ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);});}

// --- Rendering ---
function drawPlayer(p){
  ctx.fillStyle=p.color||'blue';
  ctx.fillRect(p.x-15,p.y-40,30,40);
  (p.weaponTrail||[]).forEach(trail=>{
    ctx.fillStyle=`rgba(${trail.color.r},${trail.color.g},${trail.color.b},${trail.alpha})`;
    ctx.fillRect(trail.x,trail.y,trail.w,trail.h);
  });
  if(p.stunned){
    ctx.fillStyle='yellow';
    ctx.beginPath();
    ctx.arc(p.x,p.y-50,10,0,Math.PI*2);
    ctx.fill();
  }
}
function drawBoss(b){
  if(!b) return;
  ctx.fillStyle='purple';
  ctx.fillRect(b.x-50,b.y-150,100,150);
  ctx.fillStyle='black';
  ctx.fillRect(canvas.width/2-100,20,200,20);
  ctx.fillStyle='red';
  ctx.fillRect(canvas.width/2-100,20,200*(b.hp/b.maxHp||0),20);
}
function drawGrapple(p){if(p.grappling){ctx.strokeStyle='grey';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x,p.y-20);ctx.lineTo(p.grappleX||p.x,p.grappleY||p.y);ctx.stroke();}}
function drawProjectile(prj){ctx.fillStyle=prj.color;ctx.beginPath();ctx.arc(prj.x,prj.y,prj.radius,0,Math.PI*2);ctx.fill();}

// --- Game Loop ---
let lastTime=performance.now();
function gameLoop(now){
  const dt=(now-lastTime)/1000;
  lastTime=now;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Draw all
  drawBoss(boss);
  Object.values(players).forEach(drawPlayer);
  Object.values(players).forEach(drawGrapple);
  projectiles.forEach(drawProjectile);
  updateParticles(dt);
  drawParticles();
  drawHUD();

  // Send input each frame
  if(playerId) socket.emit('input',input);

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// --- Input Events ---
document.addEventListener('keydown', e=>{
  switch(e.code){
    case 'KeyA': input.left=true; break;
    case 'KeyD': input.right=true; break;
    case 'Space': input.jump=true; break;
    case 'KeyZ': input.light=true; break;
    case 'KeyX': input.heavy=true; break;
    case 'KeyE': input.grab=true; break;
    case 'ShiftLeft': input.sprint=true; break;
  }
});
document.addEventListener('keyup', e=>{
  switch(e.code){
    case 'KeyA': input.left=false; break;
    case 'KeyD': input.right=false; break;
    case 'Space': input.jump=false; break;
    case 'KeyZ': input.light=false; break;
    case 'KeyX': input.heavy=false; break;
    case 'KeyE': input.grab=false; break;
    case 'ShiftLeft': input.sprint=false; break;
  }
});
canvas.addEventListener('mousemove', e=>{
  const rect=canvas.getBoundingClientRect();
  input.mouseX=e.clientX-rect.left;
  input.mouseY=e.clientY-rect.top;
});

// --- Networking ---
socket.on('connect',()=>{playerId=socket.id;});
socket.on('state',data=>{
  data.players.forEach(s=>{
    const p=players[s.id]||{id:s.id,x:s.x,y:s.y,hp:s.hp,combo:0,stunned:false,grappling:false,weaponTrail:[]};
    players[s.id]={...p,...s};
  });
  boss=data.boss||boss;
  projectiles=data.projectiles||[];
});
