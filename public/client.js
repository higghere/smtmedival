// client.js

const socket = io(); // Connect to server
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1000;
canvas.height = 600;

// interpolation buffer
let lastState = null;
let nextState = null;
let interpAlpha = 0;

// key input state
const keys = {
    left: false,
    right: false,
    jump: false,
    light: false,
    heavy: false,
    grab: false
};

// listen to keyboard
window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyA': keys.left = true; break;
        case 'KeyD': keys.right = true; break;
        case 'Space': keys.jump = true; break;
        case 'KeyZ': keys.light = true; break;
        case 'KeyX': keys.heavy = true; break;
        case 'KeyE': keys.grab = true; break;
    }
    emitInputs();
});

window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyA': keys.left = false; break;
        case 'KeyD': keys.right = false; break;
        case 'Space': keys.jump = false; break;
        case 'KeyZ': keys.light = false; break;
        case 'KeyX': keys.heavy = false; break;
        case 'KeyE': keys.grab = false; break;
    }
    emitInputs();
});

// send input to server
function emitInputs() {
    socket.emit('playerInput', keys);
}

// receive game state from server
socket.on('gameState', (state) => {
    lastState = nextState;
    nextState = state;
    interpAlpha = 0;
});

// linear interpolation
function lerp(a, b, t) {
    return a + (b - a) * t;
}

// interpolate positions
function interpolateEntity(entity) {
    if (!lastState || !nextState) return entity;

    const last = lastState[entity.id] || entity;
    const next = nextState[entity.id] || entity;

    return {
        x: lerp(last.x, next.x, interpAlpha),
        y: lerp(last.y, next.y, interpAlpha),
        hp: next.hp,
        weapon: next.weapon,
        state: next.state
    };
}

// render everything
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!nextState) return;

    // interpolate alpha (assuming 60fps / server 20fps)
    interpAlpha += 0.05;
    if (interpAlpha > 1) interpAlpha = 1;

    // render players
    Object.values(nextState.players).forEach(player => {
        const p = interpolateEntity(player);
        // body
        ctx.fillStyle = p.id === socket.id ? 'blue' : 'red';
        ctx.fillRect(p.x - 20, p.y - 50, 40, 50);

        // HP bar
        ctx.fillStyle = 'black';
        ctx.fillRect(p.x - 25, p.y - 60, 50, 5);
        ctx.fillStyle = 'green';
        ctx.fillRect(p.x - 25, p.y - 60, 50 * (p.hp / 100), 5);

        // weapon indicator
        ctx.fillStyle = 'yellow';
        ctx.fillText(p.weapon, p.x - 20, p.y - 70);
    });

    // render boss
    if (nextState.boss) {
        const b = interpolateEntity(nextState.boss);
        ctx.fillStyle = 'purple';
        ctx.fillRect(b.x - 50, b.y - 150, 100, 150);

        // boss HP
        ctx.fillStyle = 'black';
        ctx.fillRect(canvas.width / 2 - 200, 20, 400, 20);
        ctx.fillStyle = 'red';
        ctx.fillRect(canvas.width / 2 - 200, 20, 400 * (b.hp / b.maxHp), 20);
    }

    requestAnimationFrame(render);
}

// start rendering
render();

