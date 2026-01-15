// client.js - Extended Visuals

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1000;
canvas.height = 600;

let lastState = null;
let nextState = null;
let interpAlpha = 0;

const keys = { left: false, right: false, jump: false, light: false, heavy: false, grab: false };
const trails = [];        // weapon trails
const sparks = [];        // hit sparks
const grapples = [];      // chain arcs

window.addEventListener('keydown', e => { updateKey(e.code, true); });
window.addEventListener('keyup', e => { updateKey(e.code, false); });

function updateKey(code, down) {
    switch(code) {
        case 'KeyA': keys.left = down; break;
        case 'KeyD': keys.right = down; break;
        case 'Space': keys.jump = down; break;
        case 'KeyZ': keys.light = down; break;
        case 'KeyX': keys.heavy = down; break;
        case 'KeyE': keys.grab = down; break;
    }
    socket.emit('playerInput', keys);
}

socket.on('gameState', state => {
    lastState = nextState || state;
    nextState = state;
    interpAlpha = 0;
});

// LERP helper
function lerp(a,b,t){ return a+(b-a)*t; }

// interpolate entity
function interpolateEntity(e){
    if(!lastState || !nextState) return e;
    const l = lastState.players[e.id] || e;
    const n = nextState.players[e.id] || e;
    return { x:lerp(l.x,n.x,interpAlpha), y:lerp(l.y,n.y,interpAlpha), hp:n.hp, weapon:n.weapon, state:n.state, combo:n.combo||0 };
}

// add weapon trail
function addTrail(x,y,color){
    trails.push({x,y,color,life:8});
}

// add hit spark
function addSpark(x,y){
    sparks.push({x,y,r:Math.random()*3+2,life:6});
}

// add grapple arc
function addGrapple(x1,y1,x2,y2){
    grapples.push({x1,y1,x2,y2,life:10});
}

// render loop
function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!nextState) return;
    interpAlpha+=0.05; if(interpAlpha>1) interpAlpha=1;

    // --- players ---
    Object.values(nextState.players).forEach(p=>{
        const pl = interpolateEntity(p);
        // body
        ctx.fillStyle = p.id===socket.id?'blue':'red';
        ctx.fillRect(pl.x-20,pl.y-50,40,50);

        // HP bar
        ctx.fillStyle='black'; ctx.fillRect(pl.x-25,pl.y-60,50,5);
        ctx.fillStyle='green'; ctx.fillRect(pl.x-25,pl.y-60,50*(pl.hp/100),5);

        // weapon indicator
        ctx.fillStyle='yellow'; ctx.font='14px Arial'; ctx.fillText(pl.weapon,pl.x-20,pl.y-70);

        // combo
        if(pl.combo>1){ ctx.fillStyle='orange'; ctx.font='16px Arial'; ctx.fillText('x'+pl.combo,pl.x-10,pl.y-80); }

        // weapon trail
        if(p.state.includes('slash')) addTrail(pl.x,pl.y,'white');
        if(p.state.includes('uppercut')) addTrail(pl.x,pl.y,'cyan');
        if(p.state.includes('heavy')) addTrail(pl.x,pl.y,'red');

        // grapple
        if(p.state==='grappling') addGrapple(pl.x,pl.y,pl.grappleX||pl.x,pl.grappleY||pl.y);
    });

    // --- boss ---
    if(nextState.boss){
        const b = nextState.boss;
        const bx = lerp(lastState?.boss?.x||b.x,b.x,interpAlpha);
        const by = lerp(lastState?.boss?.y||b.y,b.y,interpAlpha);

        ctx.fillStyle='purple'; ctx.fillRect(bx-50,by-150,100,150);
        // boss HP
        ctx.fillStyle='black'; ctx.fillRect(canvas.width/2-200,20,400,20);
        ctx.fillStyle='red'; ctx.fillRect(canvas.width/2-200,20,400*(b.hp/b.maxHp),20);
    }

    // --- trails ---
    trails.forEach((t,i)=>{
        ctx.fillStyle=t.color;
        ctx.fillRect(t.x-3,t.y-3,6,6);
        t.life--; if(t.life<=0) trails.splice(i,1);
    });

    // --- sparks ---
    sparks.forEach((s,i)=>{
        ctx.fillStyle='yellow';
        ctx.beginPath();
        ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fill();
        s.life--; if(s.life<=0) sparks.splice(i,1);
    });

    // --- grapples ---
    grapples.forEach((g,i)=>{
        ctx.strokeStyle='orange';
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(g.x1,g.y1); ctx.lineTo(g.x2,g.y2); ctx.stroke();
        g.life--; if(g.life<=0) grapples.splice(i,1);
    });

    requestAnimationFrame(render);
}

render();
