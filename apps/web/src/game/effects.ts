import type Phaser from 'phaser';
import { FX_CAPACITY,FX_IDS,FX_MANIFEST,FX_STYLE,fxKey,fxUrl } from '../effects/catalog';
import type { FxId } from '../effects/catalog';
import { FxTimeline } from '../effects/timeline';
import { effectsAllowed,subscribeEffects } from '../app/effects';
import type { Point } from './world';

type Placement={x:number;y:number;angle:number;scale:number;depth:number;follow?:Point};
export type FxOptions=Partial<Pick<Placement,'angle'|'scale'|'depth'|'follow'>>;
export class StreetEffects{
 static preload(scene:Phaser.Scene){for(const id of FX_IDS){const m=FX_MANIFEST[id];for(const sheet of m.sheets)scene.load.spritesheet(fxKey(id,sheet.layer),fxUrl(sheet.file),{frameWidth:m.frameWidth,frameHeight:m.frameHeight,endFrame:m.count-1});}}
 readonly timeline=new FxTimeline<Placement>();
 readonly played:Partial<Record<FxId,number>>={};
 private sprites:Phaser.GameObjects.Sprite[]=[];
 private stopSettings:()=>void;
 private enabled=effectsAllowed();
 constructor(private scene:Phaser.Scene){
  // One fixed pool, no animationcomplete closures or game objects created during combat.
  for(let i=0;i<FX_CAPACITY;i++)this.sprites.push(scene.add.sprite(0,0,fxKey('hit','combined')).setActive(false).setVisible(false));
  this.stopSettings=subscribeEffects(()=>{this.enabled=effectsAllowed();if(!this.enabled)this.clear();});
 }
 emit(id:FxId,x:number,y:number,now:number,options:FxOptions={}){
  if(!this.enabled)return false;
  const camera=this.scene.cameras.main,margin=70,worldX=x+(options.follow?.x??0),worldY=y+(options.follow?.y??0);
  if(worldX<camera.scrollX-margin||worldX>camera.scrollX+camera.width+margin||worldY<camera.scrollY-margin||worldY>camera.scrollY+camera.height+margin)return false;
  const ok=this.timeline.emit(id,now,{x,y,angle:0,scale:1,depth:y+18,...options});
  if(ok)this.played[id]=(this.played[id]??0)+1;
  return ok;
 }
 update(now:number){
  this.timeline.update(now);
  for(let i=0;i<this.sprites.length;i++){
   const s=this.sprites[i],slot=this.timeline.slots[i];if(!slot){if(s.visible)s.setActive(false).setVisible(false);continue;}
   const {playback:p,layer}=slot,m=FX_MANIFEST[p.id],style=FX_STYLE[p.id],v=p.payload,key=fxKey(p.id,layer);
   if(s.texture.key!==key)s.setTexture(key);
   if(Number(s.frame.name)!==p.frame)s.setFrame(p.frame);
   s.setOrigin(m.pivotX/m.frameWidth,m.pivotY/m.frameHeight).setScale(style.scale*v.scale).setRotation(v.angle).setAlpha(style.alpha);
   s.setPosition(v.x+(v.follow?.x??0),v.y+(v.follow?.y??0)).setDepth((v.follow?.y??v.depth)+(layer==='back'?-.5:.5)).setVisible(true).setActive(true);
  }
 }
 clear(){this.timeline.clear();for(const s of this.sprites)s.setVisible(false).setActive(false);}
 destroy(){this.stopSettings();this.clear();for(const s of this.sprites)s.destroy();this.sprites=[];}
}
