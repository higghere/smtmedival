
console.log('Game Loaded');

class Player {
  constructor(name){ this.name=name; this.hp=100; this.airJuggle=0; }
  update(dt){ /* player update logic */ }
}

const players=[new Player('P1'),new Player('P2')];

class BossLimb{
  constructor(name,maxDur){this.name=name;this.maxDurability=maxDur;this.currentDurability=maxDur;this.broken=false;}
  takeDamage(amount){if(this.broken) return false; this.currentDurability-=amount; if(this.currentDurability<=0){this.breakLimb(); return true;} return false;}
  breakLimb(){this.broken=true;this.currentDurability=0;console.log(this.name+' broken!');}
}

class Boss{
  constructor(){
    this.health=500; 
    this.limbs={rightArm:new BossLimb('Right Arm',100), leftArm:new BossLimb('Left Arm',100)}
  }
  takeLimbHit(limb,dmg){if(!this.limbs[limb]) return; this.limbs[limb].takeDamage(dmg);}
}

const boss=new Boss();

function gameLoop(){players.forEach(p=>p.update(0.016)); requestAnimationFrame(gameLoop);}
gameLoop();
