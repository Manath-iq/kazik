import Phaser from 'phaser';
import { BALANCE,ENEMIES,spawnDelay,xpNeeded } from '@street/shared';
import type { RunTicket,UpgradeId } from '@street/shared';
import { RunModel,seededRandom } from './model';
import { hasArt,assetUrl } from '../app/art';
import { haptic } from '../app/telegram';
import { sound } from './audio';

export type Hud={hp:number;maxHp:number;xp:number;xpMax:number;level:number;seconds:number;wave:number;kills:number;money:number;enemies:number};
type Enemy={sprite:Phaser.GameObjects.Sprite;shadow:Phaser.GameObjects.Ellipse;hp:number;kind:number;hitAt:number;flashUntil:number;dashAt:number;dashUntil:number;dx:number;dy:number;maxHp:number};
type Shot={sprite:Phaser.GameObjects.Sprite;vx:number;vy:number;damage:number;life:number;bounced:boolean};
type Loot={sprite:Phaser.GameObjects.Sprite;xp:number;money:number;heal:number};
export type SceneHooks={hud:(h:Hud)=>void;upgrade:(ids:UpgradeId[])=>void;pause:()=>void;death:()=>void};
export class StreetScene extends Phaser.Scene {
 model=new RunModel(); pausedRun=false; finished=false; private rng:()=>number;
 private reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 private hero!:Phaser.GameObjects.Sprite;private floor!:Phaser.GameObjects.TileSprite;
 private heroShadow!:Phaser.GameObjects.Ellipse;private shadowPool:Phaser.GameObjects.Ellipse[]=[];private sidewalks:Phaser.GameObjects.TileSprite[]=[];
 private enemies:Enemy[]=[];private shots:Shot[]=[];private loot:Loot[]=[];
 private enemyPool:Phaser.GameObjects.Sprite[]=[];private shotPool:Phaser.GameObjects.Sprite[]=[];private lootPool:Phaser.GameObjects.Sprite[]=[];private fxPool:Phaser.GameObjects.Sprite[]=[];
 private decor:Phaser.GameObjects.Image[]=[];private held=new Set<string>();private shotAt=0;private spawnAt=700;private hudAt=0;private bossWave=0;private invulnerableUntil=0;
 private pointerId:number|null=null;private stickX=0;private stickY=0;private originX=0;private originY=0;private joyBase!:Phaser.GameObjects.Arc;private joyKnob!:Phaser.GameObjects.Arc;
 private onHidden=()=>{if(!this.finished&&!this.pausedRun){this.setPaused(true);this.hooks.pause();}};
 constructor(private ticket:RunTicket,private hooks:SceneHooks){super('street');this.rng=seededRandom(ticket.seed);}
 preload(){
  for(const name of ['player','enemy-thug','enemy-runner','enemy-brute','boss'])if(hasArt(name))this.load.spritesheet(name,assetUrl(name),{frameWidth:name==='boss'?64:48,frameHeight:name==='boss'?64:48});
  for(const name of ['tile-asphalt','tile-sidewalk','tile-road-marking','prop-lamp','prop-bin','prop-fence','prop-car','prop-neon','pickup-money','pickup-xp','pickup-medkit'])if(hasArt(name))this.load.image(name,assetUrl(name));
  for(const name of ['hit','collect'])this.load.spritesheet(`fx-${name}`,`${import.meta.env.BASE_URL}assets/fx/${name}.png`,{frameWidth:64,frameHeight:64});
 }
 create(){
  // Явные технические маркеры на время параллельной генерации графики, не финальные спрайты.
  const g=this.make.graphics({x:0,y:0});
  g.fillStyle(0x111923);g.fillRect(0,0,32,32);g.lineStyle(1,0x1b2532);g.strokeRect(0,0,32,32);g.generateTexture('dev-ground',32,32);g.clear();
  for(const [name,color]of [['dev-player',0xc5f542],['dev-enemy',0xff6575],['dev-xp',0x30c6ff],['dev-money',0xffca3a]] as const){g.clear();g.lineStyle(2,color);g.strokeRect(3,3,18,18);g.fillStyle(color);g.fillRect(8,8,8,8);g.generateTexture(name,24,24);}
  g.clear();g.fillStyle(0xe7edf5);g.fillRect(0,0,8,3);g.generateTexture('bullet',8,3);g.destroy();
  for(const name of ['player','enemy-thug','enemy-runner','enemy-brute','boss'])if(this.textures.exists(name)){
   this.anims.create({key:`${name}-idle`,frames:this.anims.generateFrameNumbers(name,{start:0,end:1}),frameRate:2,repeat:-1});
   this.anims.create({key:`${name}-run`,frames:this.anims.generateFrameNumbers(name,{start:2,end:5}),frameRate:7,repeat:-1});
  }
  for(const name of ['hit','collect'])if(this.textures.exists(`fx-${name}`))this.anims.create({key:`fx-${name}`,frames:this.anims.generateFrameNumbers(`fx-${name}`,{start:0,end:23}),frameRate:32,repeat:0});
  const w=this.scale.width,h=this.scale.height;
  this.floor=this.add.tileSprite(w/2,h/2,w+64,h+64,this.textures.exists('tile-asphalt')?'tile-asphalt':'dev-ground').setScrollFactor(0).setDepth(-10);
  if(this.textures.exists('tile-sidewalk'))for(let street=-1;street<=1;street++)for(const side of [-1,1])this.sidewalks.push(this.add.tileSprite(street*512+side*144,0,48,h+128,'tile-sidewalk').setDepth(-8));
  // Полосы улицы и ограда — декоративные, не невидимые препятствия.
  for(let y=-800;y<1200;y+=120){this.decor.push(this.add.image(-105,y,this.textures.exists('tile-road-marking')?'tile-road-marking':'bullet').setAlpha(0.3).setDepth(-2));}
  for(let i=0;i<28;i++){
   const keys=['prop-lamp','prop-bin','prop-fence','prop-car'],key=keys[i%keys.length];
   if(this.textures.exists(key))this.decor.push(this.add.image(i%2?150:-150,Math.floor(i/2)*160-1000,key).setOrigin(.5,key==='prop-lamp'?62/64:.85).setDepth(3));
  }
  if(this.textures.exists('prop-neon'))for(let i=0;i<4;i++)this.decor.push(this.add.image(i%2?178:-178,i*480-720,'prop-neon').setDepth(3));
  this.heroShadow=this.add.ellipse(0,0,22,8,0x030609,.7).setDepth(2);
  this.hero=this.add.sprite(0,0,this.textures.exists('player')?'player':'dev-player').setOrigin(.5,43/48).setDepth(10);
  this.cameras.main.startFollow(this.hero,true,1,1);this.cameras.main.roundPixels=true;
  this.joyBase=this.add.circle(65,h-80,43,0x080b10,0.55).setStrokeStyle(2,0x96a6b8,0.4).setScrollFactor(0).setDepth(100).setVisible(false);
  this.joyKnob=this.add.circle(65,h-80,19,0xc5f542,0.65).setScrollFactor(0).setDepth(101).setVisible(false);
  this.input.addPointer(1);
  this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{if(this.pausedRun||this.pointerId!==null)return;this.pointerId=p.id;this.originX=p.x;this.originY=p.y;this.joyBase.setPosition(p.x,p.y).setVisible(true);this.joyKnob.setPosition(p.x,p.y).setVisible(true);});
  this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{if(p.id!==this.pointerId)return;const dx=p.x-this.originX,dy=p.y-this.originY,len=Math.hypot(dx,dy),scale=Math.min(1,43/(len||1));this.stickX=dx*scale/43;this.stickY=dy*scale/43;this.joyKnob.setPosition(this.originX+dx*scale,this.originY+dy*scale);});
  this.input.on('pointerup',(p:Phaser.Input.Pointer)=>{if(p.id===this.pointerId)this.resetStick();});
  this.input.keyboard?.on('keydown',(e:KeyboardEvent)=>{this.held.add(e.code);if(e.code==='Escape')this.onHidden();});
  this.input.keyboard?.on('keyup',(e:KeyboardEvent)=>this.held.delete(e.code));
  this.input.keyboard?.addCapture(['UP','DOWN','LEFT','RIGHT','SPACE']);
  document.addEventListener('visibilitychange',this.onHidden);window.addEventListener('blur',this.onHidden);
  this.events.once('shutdown',()=>{document.removeEventListener('visibilitychange',this.onHidden);window.removeEventListener('blur',this.onHidden);this.held.clear();});
  this.sendHud();
 }
 private resetStick(){this.pointerId=null;this.stickX=0;this.stickY=0;this.joyBase?.setVisible(false);this.joyKnob?.setVisible(false);}
 setPaused(value:boolean){this.pausedRun=value;this.resetStick();this.held.clear();if(value){this.anims.pauseAll();this.tweens.pauseAll();}else{this.anims.resumeAll();this.tweens.resumeAll();}}
 choose(id:UpgradeId){if(!this.model.upgrade(id))return;this.setPaused(false);this.fx('collect',this.hero.x,this.hero.y,1.3);sound('level');}
 snapshot(){return {seconds:Math.floor(this.model.seconds),kills:this.model.kills,money:this.model.money,level:this.model.level,distance:Math.floor(this.model.distance)};}
 private sprite(pool:Phaser.GameObjects.Sprite[],key:string,x:number,y:number){const s=pool.pop()??this.add.sprite(x,y,key);s.setTexture(key).setPosition(x,y).setActive(true).setVisible(true).setAlpha(1).setTint(0xffffff).setScale(1).setAngle(0);return s;}
 private recycle(s:Phaser.GameObjects.Sprite,pool:Phaser.GameObjects.Sprite[]){s.stop().setActive(false).setVisible(false);pool.push(s);}
 private fx(name:string,x:number,y:number,scale=0.65){
  if(this.reducedMotion)return;
  if(this.fxPool.length===0&&this.children.list.filter(c=>c instanceof Phaser.GameObjects.Sprite&&c.active&&c.texture.key.startsWith('fx-')).length>12)return;
  const s=this.sprite(this.fxPool,`fx-${name}`,x,y).setScale(scale).setDepth(30);
  s.once('animationcomplete',()=>this.recycle(s,this.fxPool));s.play(`fx-${name}`);
 }
 private float(text:string,x:number,y:number,color:string){const t=this.add.text(x,y,text,{fontFamily:'monospace',fontSize:'12px',color,stroke:'#080b10',strokeThickness:3}).setDepth(50);this.tweens.add({targets:t,y:this.reducedMotion?y:y-24,alpha:0,duration:this.reducedMotion?250:500,onComplete:()=>t.destroy()});}
 private spawn(kind:number){
  const camera=this.cameras.main,edge=Math.floor(this.rng()*4);let x=0,y=0;
  if(edge<2){x=camera.scrollX+(edge===0?-30:camera.width+30);y=camera.scrollY+this.rng()*camera.height;}
  else{x=camera.scrollX+this.rng()*camera.width;y=camera.scrollY+(edge===2?-30:camera.height+30);}
  const name=['enemy-thug','enemy-runner','enemy-brute','boss'][kind],key=this.textures.exists(name)?name:'dev-enemy';
  const hp=ENEMIES[kind].hp*(1+(this.model.wave-1)*0.09),sprite=this.sprite(this.enemyPool,key,x,y).setOrigin(.5,kind===3?58/64:43/48).setDepth(8);
  const shadow=this.shadowPool.pop()??this.add.ellipse(x,y,22,8,0x030609,.7).setDepth(2);shadow.setPosition(x,y).setVisible(true).setScale(kind===3?1.5:1);
  if(kind===3&&!this.textures.exists(name))sprite.setScale(2);
  this.enemies.push({sprite,shadow,hp,maxHp:hp,kind,hitAt:0,flashUntil:0,dashAt:this.model.seconds+3,dashUntil:0,dx:0,dy:0});
 }
 private shoot(){
  const sorted=this.enemies.filter(e=>e.hp>0).sort((a,b)=>Phaser.Math.Distance.Squared(this.hero.x,this.hero.y,a.sprite.x,a.sprite.y)-Phaser.Math.Distance.Squared(this.hero.x,this.hero.y,b.sprite.x,b.sprite.y));
  const target=sorted[0];if(!target||Phaser.Math.Distance.Between(this.hero.x,this.hero.y,target.sprite.x,target.sprite.y)>BALANCE.range)return;
  for(let i=0;i<this.model.projectiles;i++){
   const chosen=sorted[i]??target,angle=Math.atan2(chosen.sprite.y-this.hero.y,chosen.sprite.x-this.hero.x)+(i>=sorted.length?(i-1)*0.12:0),crit=this.rng()<this.model.crit;
   const sprite=this.sprite(this.shotPool,'bullet',this.hero.x,this.hero.y-16).setRotation(angle).setDepth(20);if(crit)sprite.setTint(0xffca3a);
   this.shots.push({sprite,vx:Math.cos(angle)*460,vy:Math.sin(angle)*460,damage:this.model.damage*(crit?2:1),life:0.8,bounced:false});
  }sound('shot');
 }
 private hurtEnemy(e:Enemy,damage:number){
  e.hp-=damage;e.flashUntil=this.model.seconds*1000+100;e.sprite.setTintFill(0xe7edf5);this.time.delayedCall(75,()=>{if(e.sprite.active)e.sprite.clearTint();});
  this.fx('hit',e.sprite.x,e.sprite.y);this.float(String(Math.round(damage)),e.sprite.x,e.sprite.y-15,'#E7EDF5');
  if(e.hp>0)return;
  this.model.kills++;const cfg=ENEMIES[e.kind];
  const drop=(xp:number,money:number,heal:number,key:string)=>{const s=this.sprite(this.lootPool,this.textures.exists(key)?key:xp?'dev-xp':'dev-money',e.sprite.x+(this.rng()-0.5)*14,e.sprite.y+(this.rng()-0.5)*14).setDepth(1);if(!this.textures.exists(key))s.setScale(0.4);this.loot.push({sprite:s,xp,money,heal});};
  if(this.loot.length<240){drop(cfg.xp,0,0,'pickup-xp');drop(0,cfg.money,0,'pickup-money');if(this.rng()<0.045)drop(0,0,20,'pickup-medkit');}
  else{const nearest=this.loot[0];nearest.xp+=cfg.xp;nearest.money+=cfg.money;}
  this.recycle(e.sprite,this.enemyPool);e.shadow.setVisible(false);this.shadowPool.push(e.shadow);
 }
 private sendHud(){const m=this.model;this.hooks.hud({hp:m.hp,maxHp:m.maxHp,xp:m.xp,xpMax:xpNeeded(m.level),level:m.level,seconds:m.seconds,wave:m.wave,kills:m.kills,money:m.money,enemies:this.enemies.length});}
 update(_time:number,delta:number){
  if(this.pausedRun||this.finished)return;
  const dt=Math.min(delta,50)/1000,m=this.model;m.seconds+=dt;
  const now=m.seconds*1000;
  let dx=this.stickX+(this.held.has('KeyD')||this.held.has('ArrowRight')?1:0)-(this.held.has('KeyA')||this.held.has('ArrowLeft')?1:0);
  let dy=this.stickY+(this.held.has('KeyS')||this.held.has('ArrowDown')?1:0)-(this.held.has('KeyW')||this.held.has('ArrowUp')?1:0);
  const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
  this.hero.x+=dx*m.speed*dt;this.hero.y+=dy*m.speed*dt;m.distance+=Math.hypot(dx,dy)*m.speed*dt;
  this.heroShadow.setPosition(this.hero.x,this.hero.y-1);
  if(dx)this.hero.setFlipX(dx<0);
  if(this.textures.exists('player')){if(now<this.invulnerableUntil-400)this.hero.stop().setFrame(6);else this.hero.play(`player-${len>0.05?'run':'idle'}`,true);}
  this.hero.setAlpha(now<this.invulnerableUntil ? (this.reducedMotion ? 0.6 : Math.floor(now/100)%2 ? 0.35 : 1) : 1);
  this.floor.tilePositionX=this.cameras.main.scrollX;this.floor.tilePositionY=this.cameras.main.scrollY;
  const streetBase=Math.round(this.hero.x/512)*512;
  this.sidewalks.forEach((p,i)=>{p.x=streetBase+(Math.floor(i/2)-1)*512+(i%2?1:-1)*144;p.y=this.hero.y;p.tilePositionY=this.hero.y-this.scale.height/2;});
  for(const p of this.decor){if(p.y<this.hero.y-1100)p.y+=2200;if(p.y>this.hero.y+1100)p.y-=2200;if(p.x<this.hero.x-256)p.x+=512;if(p.x>this.hero.x+256)p.x-=512;}
  if(now>=this.spawnAt){this.spawnAt=now+spawnDelay(m.wave);if(this.enemies.length<BALANCE.maxEnemies){const roll=this.rng();this.spawn(m.wave>2&&roll<0.13?2:m.wave>1&&roll<0.42?1:0);}}
  if(m.wave%5===0&&this.bossWave!==m.wave&&this.enemies.length<BALANCE.maxEnemies){this.bossWave=m.wave;this.spawn(3);this.float('АВТОРИТЕТ',this.hero.x-40,this.hero.y-70,'#FF6575');}
  if(now>=this.shotAt){this.shotAt=now+m.fireDelay;this.shoot();}
  for(const e of this.enemies){
   if(e.hp<=0)continue;
   e.shadow.setPosition(e.sprite.x,e.sprite.y-1);
   const vx=this.hero.x-e.sprite.x,vy=this.hero.y-e.sprite.y,dist=Math.hypot(vx,vy)||1,speed=ENEMIES[e.kind].speed*(1+Math.min(m.wave*0.012,0.6));
   if(e.kind===3){
    if(m.seconds>e.dashAt&&e.dashUntil===0){e.dashUntil=m.seconds+1.1;e.dx=vx/dist;e.dy=vy/dist;}
    if(e.dashUntil>m.seconds){if(e.dashUntil-m.seconds>0.65){e.sprite.setTint(0xff6575);continue;}e.sprite.x+=e.dx*300*dt;e.sprite.y+=e.dy*300*dt;}
    else{if(e.dashUntil>0){e.dashUntil=0;e.dashAt=m.seconds+4;e.sprite.clearTint();}e.sprite.x+=vx/dist*speed*dt;e.sprite.y+=vy/dist*speed*dt;}
   }else{e.sprite.x+=vx/dist*speed*dt;e.sprite.y+=vy/dist*speed*dt;}
   e.sprite.setFlipX(vx<0);const key=['enemy-thug','enemy-runner','enemy-brute','boss'][e.kind];if(this.textures.exists(key)){if(now<e.flashUntil)e.sprite.stop().setFrame(6);else e.sprite.play(`${key}-run`,true);}
   if(dist<(e.kind===3?29:20)&&now>=e.hitAt&&now>=this.invulnerableUntil){e.hitAt=now+1000;this.invulnerableUntil=now+550;m.hit(ENEMIES[e.kind].damage);haptic();sound('hit');}
   // Вне экрана враги остаются в симуляции; очень далёких возвращаем к границе, не добавляя убийства.
   if(dist>1600){e.sprite.x=this.hero.x+Math.sign(vx)*-400;e.sprite.y=this.hero.y+(this.rng()-0.5)*700;}
  }
  for(const shot of this.shots){
   shot.life-=dt;shot.sprite.x+=shot.vx*dt;shot.sprite.y+=shot.vy*dt;
   for(const e of this.enemies){if(e.hp<=0)continue;if(Phaser.Math.Distance.Squared(shot.sprite.x,shot.sprite.y,e.sprite.x,e.sprite.y-16)<(e.kind===3?28:16)**2){
    this.hurtEnemy(e,shot.damage);
    const next=this.enemies.find(n=>n!==e&&n.hp>0&&Phaser.Math.Distance.Between(n.sprite.x,n.sprite.y,e.sprite.x,e.sprite.y)<150);
    if(!shot.bounced&&next&&this.rng()<m.ricochet){const angle=Math.atan2(next.sprite.y-16-shot.sprite.y,next.sprite.x-shot.sprite.x);shot.vx=Math.cos(angle)*460;shot.vy=Math.sin(angle)*460;shot.bounced=true;shot.sprite.rotation=angle;}else shot.life=0;
    break;
   }}
  }
  this.enemies=this.enemies.filter(e=>e.hp>0);
  // Мягкое разделение толпы: силуэты не слипаются в одну стопку.
  for(let i=0;i<this.enemies.length;i++)for(let j=i+1;j<this.enemies.length;j++){
   const a=this.enemies[i].sprite,b=this.enemies[j].sprite,ex=a.x-b.x,ey=a.y-b.y,sq=ex*ex+ey*ey;
   if(sq>0&&sq<18*18){const dist=Math.sqrt(sq),push=(18-dist)*dt*3;a.x+=ex/dist*push;a.y+=ey/dist*push;b.x-=ex/dist*push;b.y-=ey/dist*push;}
  }
  this.shots=this.shots.filter(s=>{if(s.life>0)return true;this.recycle(s.sprite,this.shotPool);return false;});
  this.loot=this.loot.filter(drop=>{
   const dist=Phaser.Math.Distance.Between(this.hero.x,this.hero.y,drop.sprite.x,drop.sprite.y);
   if(dist>m.magnet)return true;
   if(dist>12){drop.sprite.x+=(this.hero.x-drop.sprite.x)*Math.min(1,dt*12);drop.sprite.y+=(this.hero.y-drop.sprite.y)*Math.min(1,dt*12);return true;}
   m.gainXp(drop.xp);m.money+=drop.money;m.hp=Math.min(m.maxHp,m.hp+drop.heal);
   if(drop.money){this.float(`+$${drop.money}`,drop.sprite.x,drop.sprite.y,'#FFCA3A');haptic();sound('pickup');}
   if(drop.heal)this.float('+20 HP',drop.sprite.x,drop.sprite.y,'#FF6575');
   this.fx('collect',drop.sprite.x,drop.sprite.y,0.35);this.recycle(drop.sprite,this.lootPool);return false;
  });
  if(m.dead||m.seconds>=BALANCE.maxRunSeconds){this.finished=true;this.setPaused(true);if(m.dead&&this.textures.exists('player'))this.hero.stop().setFrame(7);this.sendHud();this.hooks.death();return;}
  if(m.xp>=xpNeeded(m.level)){m.levelUp();this.setPaused(true);this.sendHud();const options=m.available().sort(()=>this.rng()-0.5).slice(0,3);this.hooks.upgrade(options.map(u=>u.id));}
  if(now>=this.hudAt){this.hudAt=now+100;this.sendHud();}
 }
}
