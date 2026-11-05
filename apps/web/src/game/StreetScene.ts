import Phaser from 'phaser';
import { BALANCE,ENEMIES,spawnDelay,xpNeeded,formatGameMoney } from '@street/shared';
import type { RunTicket,UpgradeId } from '@street/shared';
import { RunModel,seededRandom } from './model';
import { hasArt,assetUrl } from '../app/art';
import { haptic } from '../app/telegram';
import { sound } from './audio';
import { SpatialGrid } from './spatial';
import { HERO_BODY,PROP_BODIES,advancePickup,moveBody,unstickBody,obstacleWaypoint,segmentRectTime,segmentCircleTime } from './world';
import type { Point,Rect } from './world';
import { StreetEffects } from './effects';
import type { FxOptions } from './effects';
import type { FxId } from '../effects/catalog';
import { FX_IDS } from '../effects/catalog';
import { reducedMotion,subscribeEffects } from '../app/effects';

export type Hud={hp:number;maxHp:number;xp:number;xpMax:number;level:number;seconds:number;wave:number;kills:number;money:number;enemies:number};
type Enemy={sprite:Phaser.GameObjects.Sprite;shadow:Phaser.GameObjects.Image;hp:number;kind:number;key:string;hitAt:number;flashUntil:number;dashAt:number;dashUntil:number;dx:number;dy:number;maxHp:number;navAt:number;waypoint:Point|null;index:number;pushX:number;pushY:number};
type Shot={sprite:Phaser.GameObjects.Sprite;vx:number;vy:number;damage:number;crit:boolean;life:number;bounced:boolean;lastHit:Enemy|null};
type Loot={sprite:Phaser.GameObjects.Sprite;xp:number;money:number;heal:number;attracted:boolean;speed:number};
type Floating={text:Phaser.GameObjects.Text;y:number;until:number;duration:number};
export type SceneHooks={hud:(h:Hud)=>void;upgrade:(ids:UpgradeId[])=>void;pause:()=>void;death:()=>void};
export class StreetScene extends Phaser.Scene {
 model=new RunModel(); pausedRun=false; finished=false; private rng:()=>number;
 private reducedMotion=reducedMotion();private effects!:StreetEffects;
 private hero!:Phaser.GameObjects.Sprite;private floor!:Phaser.GameObjects.TileSprite;
 private heroShadow!:Phaser.GameObjects.Image;private shadowPool:Phaser.GameObjects.Image[]=[];private sidewalks:Phaser.GameObjects.TileSprite[]=[];
 private enemies:Enemy[]=[];private shots:Shot[]=[];private loot:Loot[]=[];
 private enemyPool:Phaser.GameObjects.Sprite[]=[];private shotPool:Phaser.GameObjects.Sprite[]=[];private lootPool:Phaser.GameObjects.Sprite[]=[];
 private grid=new SpatialGrid<Enemy>();private obstacles:Rect[]=[];private solids:{image:Phaser.GameObjects.Image;offset:Rect;body:Rect}[]=[];
 private floatPool:Phaser.GameObjects.Text[]=[];private floats:Floating[]=[];private depthAt=0;private pickupFeedbackAt=0;private pickupMoney=0;private neighborChecks=0;
 private decor:Phaser.GameObjects.Image[]=[];private held=new Set<string>();private shotAt=0;private spawnAt=700;private hudAt=0;private bossWave=0;private invulnerableUntil=0;
 private pointerId:number|null=null;private stickX=0;private stickY=0;private originX=0;private originY=0;private joyBase!:Phaser.GameObjects.Arc;private joyKnob!:Phaser.GameObjects.Arc;
 private onHidden=()=>{if(!this.finished&&!this.pausedRun){this.setPaused(true);this.hooks.pause();}};
 constructor(private ticket:RunTicket,private hooks:SceneHooks){super('street');this.rng=seededRandom(ticket.seed);}
 preload(){
  for(const name of ['player','enemy-thug','enemy-runner','enemy-brute','boss'])if(hasArt(name))this.load.spritesheet(name,assetUrl(name),{frameWidth:name==='boss'?64:48,frameHeight:name==='boss'?64:48});
  for(const name of ['tile-asphalt','tile-sidewalk','tile-road-marking','prop-lamp','prop-bin','prop-fence','prop-car','prop-neon','pickup-money','pickup-xp','pickup-medkit'])if(hasArt(name))this.load.image(name,assetUrl(name));
  StreetEffects.preload(this);
 }
 create(){
  // Явные технические маркеры на время параллельной генерации графики, не финальные спрайты.
  const g=this.make.graphics({x:0,y:0});
  g.fillStyle(0x111923);g.fillRect(0,0,32,32);g.lineStyle(1,0x1b2532);g.strokeRect(0,0,32,32);g.generateTexture('dev-ground',32,32);g.clear();
  for(const [name,color]of [['dev-player',0xc5f542],['dev-enemy',0xff6575],['dev-xp',0x30c6ff],['dev-money',0xffca3a]] as const){g.clear();g.lineStyle(2,color);g.strokeRect(3,3,18,18);g.fillStyle(color);g.fillRect(8,8,8,8);g.generateTexture(name,24,24);}
   g.clear();g.fillStyle(0xe7edf5);g.fillRect(0,0,8,3);g.generateTexture('bullet',8,3);
   // Одна маленькая тень-текстура вместо отдельного triangulated Shape под каждым мобом.
   g.clear();g.fillStyle(0x030609,.7);g.fillEllipse(12,4,22,8);g.generateTexture('actor-shadow',24,8);g.destroy();
  for(const name of ['player','enemy-thug','enemy-runner','enemy-brute','boss'])if(this.textures.exists(name)){
   this.anims.create({key:`${name}-idle`,frames:this.anims.generateFrameNumbers(name,{start:0,end:1}),frameRate:2,repeat:-1});
   this.anims.create({key:`${name}-run`,frames:this.anims.generateFrameNumbers(name,{start:2,end:5}),frameRate:7,repeat:-1});
  }
  this.effects=new StreetEffects(this);
  const w=this.scale.width,h=this.scale.height;
   this.floor=this.add.tileSprite(w/2,h/2,w+64,h+64,this.textures.exists('tile-asphalt')?'tile-asphalt':'dev-ground').setScrollFactor(0).setDepth(-1000000000);
   if(this.textures.exists('tile-sidewalk'))for(let street=-1;street<=1;street++)for(const side of [-1,1])this.sidewalks.push(this.add.tileSprite(street*512+side*144,0,48,h+128,'tile-sidewalk').setDepth(-999999999));
   // Разметка/вывески декоративные; у наземных пропов есть отдельные физические footprints.
   for(let y=-800;y<1200;y+=120){this.decor.push(this.add.image(-105,y,this.textures.exists('tile-road-marking')?'tile-road-marking':'bullet').setAlpha(0.3).setDepth(-999999998));}
  for(let i=0;i<28;i++){
   const keys=['prop-lamp','prop-bin','prop-fence','prop-car'],key=keys[i%keys.length];
    if(this.textures.exists(key)){
     const image=this.add.image(i%2?150:-150,Math.floor(i/2)*160-1000,key).setOrigin(.5,key==='prop-lamp'?62/64:.85).setDepth(0),offset=PROP_BODIES[key];this.decor.push(image);
     const body={left:image.x+offset.left,right:image.x+offset.right,top:image.y+offset.top,bottom:image.y+offset.bottom};this.solids.push({image,offset,body});this.obstacles.push(body);
    }
  }
  if(this.textures.exists('prop-neon'))for(let i=0;i<4;i++)this.decor.push(this.add.image(i%2?178:-178,i*480-720,'prop-neon').setDepth(3));
   this.heroShadow=this.add.image(0,0,'actor-shadow').setDepth(-999999997);
  this.hero=this.add.sprite(0,0,this.textures.exists('player')?'player':'dev-player').setOrigin(.5,43/48).setDepth(10);
  this.cameras.main.startFollow(this.hero,true,1,1);this.cameras.main.roundPixels=true;
   this.joyBase=this.add.circle(65,h-80,43,0x080b10,0.55).setStrokeStyle(2,0x96a6b8,0.4).setScrollFactor(0).setDepth(1000000000).setVisible(false);
   this.joyKnob=this.add.circle(65,h-80,19,0xc5f542,0.65).setScrollFactor(0).setDepth(1000000001).setVisible(false);
  this.input.addPointer(1);
  this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{if(this.pausedRun||this.pointerId!==null)return;this.pointerId=p.id;this.originX=p.x;this.originY=p.y;this.joyBase.setPosition(p.x,p.y).setVisible(true);this.joyKnob.setPosition(p.x,p.y).setVisible(true);});
  this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{if(p.id!==this.pointerId)return;const dx=p.x-this.originX,dy=p.y-this.originY,len=Math.hypot(dx,dy),scale=Math.min(1,43/(len||1));this.stickX=dx*scale/43;this.stickY=dy*scale/43;this.joyKnob.setPosition(this.originX+dx*scale,this.originY+dy*scale);});
  this.input.on('pointerup',(p:Phaser.Input.Pointer)=>{if(p.id===this.pointerId)this.resetStick();});
  this.input.keyboard?.on('keydown',(e:KeyboardEvent)=>{this.held.add(e.code);if(e.code==='Escape')this.onHidden();});
  this.input.keyboard?.on('keyup',(e:KeyboardEvent)=>this.held.delete(e.code));
  this.input.keyboard?.addCapture(['UP','DOWN','LEFT','RIGHT','SPACE']);
  document.addEventListener('visibilitychange',this.onHidden);window.addEventListener('blur',this.onHidden);
   this.scale.on('resize',this.resizeWorld,this);
   const stopEffectsSettings=subscribeEffects(()=>{this.reducedMotion=reducedMotion();});
   this.events.once('shutdown',()=>{document.removeEventListener('visibilitychange',this.onHidden);window.removeEventListener('blur',this.onHidden);this.scale.off('resize',this.resizeWorld,this);stopEffectsSettings();this.effects.destroy();this.held.clear();this.grid.clear();});
  this.sendHud();
 }
  private resetStick(){this.pointerId=null;this.stickX=0;this.stickY=0;this.joyBase?.setVisible(false);this.joyKnob?.setVisible(false);}
  startReview(mode:string){
   if(!import.meta.env.DEV)return;
   this.model.hp=this.model.maxHp=100000;this.model.seconds=300;
   if(mode==='crowd'||mode==='fx-stress')for(let i=0;i<72;i++){this.spawn(i%9===0?2:i%3===0?1:0);const e=this.enemies[this.enemies.length-1];e.hp=e.maxHp=100000;e.sprite.setPosition((i%9-4)*34,(Math.floor(i/9)-4)*36);}
   if(mode==='magnet'){
    this.model.level=50;
    for(let i=0;i<5;i++){this.model.upgrade('magnet');this.model.upgrade('speed');}
    for(let i=0;i<20;i++){const sprite=this.sprite(this.lootPool,i%2?'pickup-money':'pickup-xp',(i%5-2)*18,40+Math.floor(i/5)*18).setDepth(-999999996);this.loot.push({sprite,xp:i%2?0:1,money:i%2?7:0,heal:0,attracted:false,speed:0});}
    this.held.add('KeyD');
   }
   if(mode==='effects'){
    this.spawnAt=this.shotAt=Infinity;
    const burst=()=>FX_IDS.forEach((id,i)=>this.fx(id,(i%3-1)*110,Math.floor(i/3)*150-190));
    for(const [i,id] of FX_IDS.entries())this.add.text((i%3-1)*110,Math.floor(i/3)*150-140,id,{fontFamily:'monospace',fontSize:'12px',color:'#96a6b8'}).setOrigin(.5);
    this.time.delayedCall(100,burst);this.time.addEvent({delay:1800,loop:true,callback:burst});
   }
   if(mode==='fx-stress'){
    this.model.fireDelay=260;this.model.projectiles=3;this.model.crit=.3;this.model.level=50;
    let cycle=0;this.time.addEvent({delay:180,loop:true,callback:()=>{for(let i=0;i<3;i++){const n=cycle++%FX_IDS.length;this.fx(FX_IDS[n],(n%3-1)*50,Math.floor(n/3)*40-50);}}});
   }
   if(mode==='feedback'||mode==='wall'){
    this.model.seconds=0;this.model.hp=40;this.model.maxHp=100;this.spawnAt=Infinity;this.model.fireDelay=260;this.model.crit=.3;this.model.damage=24;this.model.magnet=120;
    if(mode==='feedback'){
     for(let i=0;i<12;i++){this.spawn(0);const e=this.enemies[this.enemies.length-1];e.hp=e.maxHp=40;e.sprite.setPosition((i%4-1.5)*36,-110-Math.floor(i/4)*35);}
     for(const [key,xp,money,heal,x] of [['pickup-xp',6,0,0,-20],['pickup-money',0,7,0,20],['pickup-medkit',0,0,20,0]] as const){const sprite=this.sprite(this.lootPool,key,x,10).setDepth(-999999996);this.loot.push({sprite,xp,money,heal,attracted:false,speed:0});}
    }else{
     this.spawn(0);this.enemies[0].sprite.setPosition(185,0);this.enemies[0].hp=100000;
     this.add.image(90,-5,'prop-bin').setOrigin(.5,.85).setDepth(0);this.obstacles.push({left:82,right:98,top:-30,bottom:0});
    }
   }
   this.sendHud();
  }
 private resizeWorld(){const w=this.scale.width,h=this.scale.height;this.floor.setPosition(w/2,h/2).setSize(w+64,h+64);for(const p of this.sidewalks)p.setSize(48,h+128);this.resetStick();}
  setPaused(value:boolean){this.pausedRun=value;this.resetStick();this.held.clear();if(import.meta.env.DEV)this.game.canvas.dataset.paused=String(value);if(value){this.anims.pauseAll();this.tweens.pauseAll();this.game.loop.sleep();}else{this.anims.resumeAll();this.tweens.resumeAll();this.game.loop.wake();}}
 choose(id:UpgradeId){const hp=this.model.hp;if(!this.model.upgrade(id))return;this.setPaused(false);this.fx('level',0,0,{follow:this.hero});if(this.model.hp>hp){this.fx('heal',0,-20,{follow:this.hero});this.float(`+${Math.round(this.model.hp-hp)} HP`,this.hero.x,this.hero.y-28,'#FF6575');}sound('level');}
 snapshot(){return {seconds:Math.floor(this.model.seconds),kills:this.model.kills,money:this.model.money,level:this.model.level,distance:Math.floor(this.model.distance)};}
 private sprite(pool:Phaser.GameObjects.Sprite[],key:string,x:number,y:number){const s=pool.pop()??this.add.sprite(x,y,key);s.setTexture(key).setPosition(x,y).setActive(true).setVisible(true).setAlpha(1).setTint(0xffffff).setScale(1).setAngle(0);return s;}
 private recycle(s:Phaser.GameObjects.Sprite,pool:Phaser.GameObjects.Sprite[]){s.stop().setActive(false).setVisible(false);pool.push(s);}
 private fx(name:FxId,x:number,y:number,options:FxOptions={}){return this.effects.emit(name,x,y,this.model.seconds*1000,options);}
  private float(text:string,x:number,y:number,color:string){
   if(this.floats.length>=12)return;
   const t=this.floatPool.pop()??this.add.text(x,y,'',{fontFamily:'monospace',fontSize:'12px',stroke:'#080b10',strokeThickness:3}).setDepth(999999999);
   t.setText(text).setColor(color).setPosition(x,y).setAlpha(1).setVisible(true).setActive(true);
   const duration=this.reducedMotion?250:500;this.floats.push({text:t,y,until:this.model.seconds*1000+duration,duration});
  }
 private spawn(kind:number){
  const camera=this.cameras.main,edge=Math.floor(this.rng()*4);let x=0,y=0;
  if(edge<2){x=camera.scrollX+(edge===0?-30:camera.width+30);y=camera.scrollY+this.rng()*camera.height;}
  else{x=camera.scrollX+this.rng()*camera.width;y=camera.scrollY+(edge===2?-30:camera.height+30);}
  const name=['enemy-thug','enemy-runner','enemy-brute','boss'][kind],key=this.textures.exists(name)?name:'dev-enemy';
  const hp=ENEMIES[kind].hp*(1+(this.model.wave-1)*0.09),sprite=this.sprite(this.enemyPool,key,x,y).setOrigin(.5,kind===3?58/64:43/48).setDepth(8);
   const shadow=this.shadowPool.pop()??this.add.image(x,y,'actor-shadow').setDepth(-999999997);shadow.setPosition(x,y).setVisible(true).setScale(kind===3?1.5:1);
  if(kind===3&&!this.textures.exists(name))sprite.setScale(2);
   sprite.y+=HERO_BODY.offsetY;unstickBody(sprite,kind===3?14:8,kind===3?8:5,this.obstacles);sprite.y-=HERO_BODY.offsetY;
   if(key!=='dev-enemy')sprite.play(`${key}-run`);
   this.enemies.push({sprite,shadow,hp,maxHp:hp,kind,key,hitAt:0,flashUntil:0,dashAt:this.model.seconds+3,dashUntil:0,dx:0,dy:0,navAt:0,waypoint:null,index:0,pushX:0,pushY:0});
  }
  private shoot(){
   const sorted:Enemy[]=[];const distance=(e:Enemy)=>(e.sprite.x-this.hero.x)**2+(e.sprite.y-this.hero.y)**2;
   for(const e of this.enemies){if(e.hp<=0||distance(e)>BALANCE.range**2)continue;let i=0;while(i<sorted.length&&distance(sorted[i])<=distance(e))i++;sorted.splice(i,0,e);if(sorted.length>this.model.projectiles)sorted.pop();}
   const target=sorted[0];if(!target)return;
  for(let i=0;i<this.model.projectiles;i++){
   const chosen=sorted[i]??target,angle=Math.atan2(chosen.sprite.y-this.hero.y,chosen.sprite.x-this.hero.x)+(i>=sorted.length?(i-1)*0.12:0),crit=this.rng()<this.model.crit;
    const sprite=this.sprite(this.shotPool,'bullet',this.hero.x,this.hero.y-16).setRotation(angle).setDepth(999999997);if(crit)sprite.setTint(0xffca3a);
    this.shots.push({sprite,vx:Math.cos(angle)*460,vy:Math.sin(angle)*460,damage:this.model.damage*(crit?2:1),crit,life:0.8,bounced:false,lastHit:null});
    this.fx('muzzle',this.hero.x+Math.cos(angle)*10,this.hero.y-16+Math.sin(angle)*10,{angle,depth:this.hero.y+1});
  }sound('shot');
 }
 private hurtEnemy(e:Enemy,shot:Shot){
   const damage=shot.damage;
   e.hp-=damage;e.flashUntil=this.model.seconds*1000+100;e.sprite.setTintFill(0xe7edf5);
  this.fx(shot.crit?'crit':'hit',shot.sprite.x,shot.sprite.y,{angle:Math.atan2(shot.vy,shot.vx),depth:e.sprite.y+1});this.float(`${shot.crit?'КРИТ ':''}${Math.round(damage)}`,e.sprite.x,e.sprite.y-30,shot.crit?'#FFCA3A':'#E7EDF5');
  if(e.hp>0)return;
  this.model.kills++;this.fx('death',e.sprite.x,e.sprite.y-18,{scale:e.kind===3?1.4:1,depth:e.sprite.y+1});const cfg=ENEMIES[e.kind];
   const drop=(xp:number,money:number,heal:number,key:string)=>{
    if(this.loot.length>=240){let nearest=this.loot[0],best=Infinity;for(const item of this.loot){const sq=(item.sprite.x-e.sprite.x)**2+(item.sprite.y-e.sprite.y)**2;if(sq<best){best=sq;nearest=item;}}nearest.xp+=xp;nearest.money+=money;nearest.heal+=heal;return;}
    const s=this.sprite(this.lootPool,this.textures.exists(key)?key:xp?'dev-xp':'dev-money',e.sprite.x+(this.rng()-0.5)*14,e.sprite.y+(this.rng()-0.5)*14).setDepth(-999999996);if(!this.textures.exists(key))s.setScale(0.4);this.loot.push({sprite:s,xp,money,heal,attracted:false,speed:0});
   };
   drop(cfg.xp,0,0,'pickup-xp');drop(0,cfg.money,0,'pickup-money');if(this.rng()<0.045)drop(0,0,20,'pickup-medkit');
  this.recycle(e.sprite,this.enemyPool);e.shadow.setVisible(false);this.shadowPool.push(e.shadow);
 }
  private sendHud(){const m=this.model;this.hooks.hud({hp:m.hp,maxHp:m.maxHp,xp:m.xp,xpMax:xpNeeded(m.level),level:m.level,seconds:m.seconds,wave:m.wave,kills:m.kills,money:m.money,enemies:this.enemies.length});
   if(import.meta.env.DEV)Object.assign(this.game.canvas.dataset,{playerX:String(this.hero.x),playerY:String(this.hero.y),enemies:String(this.enemies.length),loot:String(this.loot.length),neighborChecks:String(this.neighborChecks),drawables:String(this.children.length),paused:String(this.pausedRun),fps:String(Math.round(this.game.loop.actualFps)),fxActive:String(this.effects.timeline.used),fxPlayed:JSON.stringify(this.effects.played),fxFrames:this.effects.timeline.active.map(p=>`${p.id}:${p.frame}`).join(','),simSeconds:String(this.model.seconds)});
  }
 update(_time:number,delta:number){
  if(this.pausedRun||this.finished)return;
  const dt=Math.min(delta,50)/1000,m=this.model;m.seconds+=dt;
  const now=m.seconds*1000;
  let dx=this.stickX+(this.held.has('KeyD')||this.held.has('ArrowRight')?1:0)-(this.held.has('KeyA')||this.held.has('ArrowLeft')?1:0);
  let dy=this.stickY+(this.held.has('KeyS')||this.held.has('ArrowDown')?1:0)-(this.held.has('KeyW')||this.held.has('ArrowUp')?1:0);
  const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
   for(const p of this.decor){if(p.y<this.hero.y-1100)p.y+=2200;if(p.y>this.hero.y+1100)p.y-=2200;if(p.x<this.hero.x-256)p.x+=512;if(p.x>this.hero.x+256)p.x-=512;}
   for(const solid of this.solids){const {body,image,offset}=solid;body.left=image.x+offset.left;body.right=image.x+offset.right;body.top=image.y+offset.top;body.bottom=image.y+offset.bottom;}
   const oldX=this.hero.x,oldY=this.hero.y;this.hero.y+=HERO_BODY.offsetY;
   moveBody(this.hero,dx*m.speed*dt,dy*m.speed*dt,HERO_BODY.halfWidth,HERO_BODY.halfHeight,this.obstacles);this.hero.y-=HERO_BODY.offsetY;
   m.distance+=Math.hypot(this.hero.x-oldX,this.hero.y-oldY);
  this.heroShadow.setPosition(this.hero.x,this.hero.y-1);
  if(dx)this.hero.setFlipX(dx<0);
  if(this.textures.exists('player')){if(now<this.invulnerableUntil-400)this.hero.stop().setFrame(6);else this.hero.play(`player-${len>0.05?'run':'idle'}`,true);}
  this.hero.setAlpha(now<this.invulnerableUntil ? (this.reducedMotion ? 0.6 : Math.floor(now/100)%2 ? 0.35 : 1) : 1);
  this.floor.tilePositionX=this.cameras.main.scrollX;this.floor.tilePositionY=this.cameras.main.scrollY;
  const streetBase=Math.round(this.hero.x/512)*512;
  this.sidewalks.forEach((p,i)=>{p.x=streetBase+(Math.floor(i/2)-1)*512+(i%2?1:-1)*144;p.y=this.hero.y;p.tilePositionY=this.hero.y-this.scale.height/2;});
  if(now>=this.spawnAt){this.spawnAt=now+spawnDelay(m.wave);if(this.enemies.length<BALANCE.maxEnemies){const roll=this.rng();this.spawn(m.wave>2&&roll<0.13?2:m.wave>1&&roll<0.42?1:0);}}
  if(m.wave%5===0&&this.bossWave!==m.wave&&this.enemies.length<BALANCE.maxEnemies){this.bossWave=m.wave;this.spawn(3);this.float('АВТОРИТЕТ',this.hero.x-40,this.hero.y-70,'#FF6575');}
   for(const e of this.enemies){
    if(e.hp<=0)continue;
    const sprite=e.sprite,vx=this.hero.x-sprite.x,vy=this.hero.y-sprite.y,dist=Math.hypot(vx,vy)||1,speed=ENEMIES[e.kind].speed*(1+Math.min(m.wave*0.012,0.6)),halfWidth=e.kind===3?14:8,halfHeight=e.kind===3?8:5;
    if(now>=e.navAt||e.waypoint&&Math.hypot(e.waypoint.x-sprite.x,e.waypoint.y-sprite.y-HERO_BODY.offsetY)<5){e.navAt=now+180;e.waypoint=obstacleWaypoint({x:sprite.x,y:sprite.y+HERO_BODY.offsetY},{x:this.hero.x,y:this.hero.y+HERO_BODY.offsetY},halfWidth,halfHeight,this.obstacles);}
    const goalX=e.waypoint?.x??this.hero.x,goalY=e.waypoint?.y??this.hero.y+HERO_BODY.offsetY,gx=goalX-sprite.x,gy=goalY-sprite.y-HERO_BODY.offsetY,gdist=Math.hypot(gx,gy)||1;
    let moveX=gx/gdist*speed*dt,moveY=gy/gdist*speed*dt;
    if(e.kind===3){
     if(m.seconds>e.dashAt&&e.dashUntil===0){e.dashUntil=m.seconds+1.1;e.dx=vx/dist;e.dy=vy/dist;}
     if(e.dashUntil>m.seconds){if(e.dashUntil-m.seconds>0.65){sprite.setTint(0xff6575);moveX=moveY=0;}else{moveX=e.dx*300*dt;moveY=e.dy*300*dt;}}
     else if(e.dashUntil>0){e.dashUntil=0;e.dashAt=m.seconds+4;sprite.clearTint();}
    }
    sprite.y+=HERO_BODY.offsetY;moveBody(sprite,moveX,moveY,halfWidth,halfHeight,this.obstacles);sprite.y-=HERO_BODY.offsetY;
    const visible=Math.abs(sprite.x-this.hero.x)<this.scale.width/2+80&&Math.abs(sprite.y-this.hero.y)<this.scale.height/2+80;
    sprite.setVisible(visible).setActive(visible).setFlipX(vx<0);e.shadow.setVisible(visible);
    if(e.key!=='dev-enemy'){
     if(!visible)sprite.anims.pause();
     else if(now<e.flashUntil){if(sprite.anims.isPlaying)sprite.stop();sprite.setFrame(6);}
     else{if(e.dashUntil-m.seconds<=.65)sprite.clearTint();if(!sprite.anims.isPlaying)sprite.play(`${e.key}-run`);else if(sprite.anims.isPaused)sprite.anims.resume();}
    }
    if(Math.hypot(this.hero.x-sprite.x,this.hero.y-sprite.y)<(e.kind===3?29:20)&&now>=e.hitAt&&now>=this.invulnerableUntil&&!this.obstacles.some(r=>segmentRectTime(sprite.x,sprite.y+HERO_BODY.offsetY,this.hero.x,this.hero.y+HERO_BODY.offsetY,r)<Infinity)){e.hitAt=now+1000;this.invulnerableUntil=now+550;m.hit(ENEMIES[e.kind].damage);haptic();sound('hit');}
   // Вне экрана враги остаются в симуляции; очень далёких возвращаем к границе, не добавляя убийства.
    if(dist>1600){sprite.x=this.hero.x+Math.sign(vx)*-400;sprite.y=this.hero.y+(this.rng()-0.5)*700;sprite.y+=HERO_BODY.offsetY;unstickBody(sprite,halfWidth,halfHeight,this.obstacles);sprite.y-=HERO_BODY.offsetY;}
   }
   this.grid.clear();let aliveCount=0;
   for(const e of this.enemies)if(e.hp>0){this.enemies[aliveCount]=e;e.index=aliveCount++;e.pushX=e.pushY=0;this.grid.insert(e,e.sprite.x,e.sprite.y-16);}
   this.enemies.length=aliveCount;this.neighborChecks=0;
   // Spatial broadphase + ограниченный бюджет близких пар. В плотном комке порядок
   // обхода buckets меняется, чтобы бюджет не отдавался вечно одним и тем же мобам.
   for(const a of this.enemies){let visits=0,pairs=0;this.grid.nearby(a.sprite.x,a.sprite.y-16,22,b=>{
    if(++visits>24||pairs>=12)return false;if(b.index<=a.index)return;
    pairs++;this.neighborChecks++;let ex=a.sprite.x-b.sprite.x,ey=a.sprite.y-b.sprite.y,sq=ex*ex+ey*ey;
    if(sq>=18*18)return;if(sq<.0001){ex=(a.index%2?1:-1)*.01;ey=(b.index%2?1:-1)*.01;sq=ex*ex+ey*ey;}
    const dist=Math.sqrt(sq),push=(18-dist)*dt*3,px=ex/dist*push,py=ey/dist*push;a.pushX+=px;a.pushY+=py;b.pushX-=px;b.pushY-=py;
   });}
   this.grid.clear();
   for(const e of this.enemies){const strength=Math.min(1,6/(Math.hypot(e.pushX,e.pushY)||1));e.sprite.y+=HERO_BODY.offsetY;moveBody(e.sprite,e.pushX*strength,e.pushY*strength,e.kind===3?14:8,e.kind===3?8:5,this.obstacles);e.sprite.y-=HERO_BODY.offsetY;e.shadow.setPosition(e.sprite.x,e.sprite.y-1);this.grid.insert(e,e.sprite.x,e.sprite.y-16);}
   if(now>=this.depthAt){this.depthAt=now+100;this.hero.setDepth(this.hero.y);for(const e of this.enemies)e.sprite.setDepth(e.sprite.y);for(const solid of this.solids)solid.image.setDepth(solid.body.bottom);}
   if(now>=this.shotAt){this.shotAt=now+m.fireDelay;this.shoot();}
   let liveShots=0;
   for(const shot of this.shots){
    shot.life-=dt;const ax=shot.sprite.x,ay=shot.sprite.y,bx=ax+shot.vx*dt,by=ay+shot.vy*dt;
    const impact:{enemy:Enemy|null;time:number}={enemy:null,time:Infinity};
    for(const r of this.obstacles)impact.time=Math.min(impact.time,segmentRectTime(ax,ay,bx,by,r));
    this.grid.nearby((ax+bx)/2,(ay+by)/2,Math.hypot(bx-ax,by-ay)/2+28,e=>{if(e.hp<=0||e===shot.lastHit)return;const t=segmentCircleTime(ax,ay,bx,by,e.sprite.x,e.sprite.y-16,e.kind===3?28:16);if(t<impact.time){impact.time=t;impact.enemy=e;}});
    shot.sprite.setPosition(impact.time<Infinity?ax+(bx-ax)*impact.time:bx,impact.time<Infinity?ay+(by-ay)*impact.time:by);
    if(impact.enemy){
     const e=impact.enemy;shot.lastHit=e;this.hurtEnemy(e,shot);let next:Enemy|undefined;
     if(!shot.bounced&&this.rng()<m.ricochet){let best=150*150;for(const n of this.enemies){if(n===e||n.hp<=0)continue;const sq=(n.sprite.x-e.sprite.x)**2+(n.sprite.y-e.sprite.y)**2;if(sq<best){best=sq;next=n;}}}
     if(next){const angle=Math.atan2(next.sprite.y-16-shot.sprite.y,next.sprite.x-shot.sprite.x);shot.vx=Math.cos(angle)*460;shot.vy=Math.sin(angle)*460;shot.bounced=true;shot.sprite.rotation=angle;}else shot.life=0;
    }else if(impact.time<Infinity){this.fx('wall',shot.sprite.x,shot.sprite.y,{angle:Math.atan2(shot.vy,shot.vx),depth:shot.sprite.y+1});shot.life=0;}
    if(shot.life>0)this.shots[liveShots++]=shot;else this.recycle(shot.sprite,this.shotPool);
   }this.shots.length=liveShots;
   aliveCount=0;for(const e of this.enemies)if(e.hp>0)this.enemies[aliveCount++]=e;this.enemies.length=aliveCount;
   let remaining=0,collectedXp=0,collectedMoney=0,healed=0;
   for(const drop of this.loot){
    if(!advancePickup(drop.sprite,this.hero,drop,m.magnet,m.speed,dt)){this.loot[remaining++]=drop;continue;}
    m.gainXp(drop.xp);m.money+=drop.money;this.pickupMoney+=drop.money;healed+=Math.min(m.maxHp-m.hp,drop.heal);m.hp=Math.min(m.maxHp,m.hp+drop.heal);collectedXp+=drop.xp;collectedMoney+=drop.money;this.recycle(drop.sprite,this.lootPool);
   }this.loot.length=remaining;
   if(collectedXp)this.fx('xp',this.hero.x-9,this.hero.y-20);
   if(collectedMoney)this.fx('coin',this.hero.x+9,this.hero.y-14);
   if(this.pickupMoney&&now>=this.pickupFeedbackAt){this.float(`+$${formatGameMoney(this.pickupMoney)}`,this.hero.x,this.hero.y-20,'#FFCA3A');this.pickupMoney=0;this.pickupFeedbackAt=now+100;haptic();sound('pickup');}
   if(healed){this.fx('heal',0,-20,{follow:this.hero});this.float(`+${healed} HP`,this.hero.x,this.hero.y-24,'#FF6575');}
   let liveFloats=0;
   for(const value of this.floats){const left=value.until-now;if(left<=0){value.text.setActive(false).setVisible(false);this.floatPool.push(value.text);continue;}value.text.setAlpha(left/value.duration).setY(value.y-(this.reducedMotion?0:24*(1-left/value.duration)));this.floats[liveFloats++]=value;}
   this.floats.length=liveFloats;this.effects.update(now);
  if(m.dead||m.seconds>=BALANCE.maxRunSeconds){this.finished=true;this.setPaused(true);if(m.dead&&this.textures.exists('player'))this.hero.stop().setFrame(7);this.sendHud();this.hooks.death();return;}
  if(m.xp>=xpNeeded(m.level)){m.levelUp();this.setPaused(true);this.sendHud();const options=m.available().sort(()=>this.rng()-0.5).slice(0,3);this.hooks.upgrade(options.map(u=>u.id));}
  if(now>=this.hudAt){this.hudAt=now+100;this.sendHud();}
 }
}
