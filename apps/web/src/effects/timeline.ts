import { FX_CAPACITY,FX_RESERVED,FX_MANIFEST,FX_STYLE } from './catalog';
import type { FxId } from './catalog';

export type FxPlayback<T>={id:FxId;start:number;frame:number;payload:T;indices:number[]};
// A deterministic, renderer-independent clock. No timers, listeners, random numbers or animation queues.
export class FxTimeline<T>{
 readonly active:FxPlayback<T>[]=[];
 readonly slots:({playback:FxPlayback<T>;layer:string}|null)[]=Array.from({length:FX_CAPACITY},()=>null);
 private last=new Map<FxId,number>();
 get used(){return this.active.reduce((sum,p)=>sum+p.indices.length,0);}
 emit(id:FxId,now:number,payload:T){
  this.update(now);const style=FX_STYLE[id],meta=FX_MANIFEST[id];
  if(now-(this.last.get(id)??-Infinity)<style.cooldown||this.active.filter(p=>p.id===id).length>=style.maxActive)return false;
  const limit=style.priority<3?FX_CAPACITY-FX_RESERVED:FX_CAPACITY,cost=meta.sheets.length;
  let used=this.used;const victims:FxPlayback<T>[]=[];
  if(used+cost>limit){
   const candidates=this.active.filter(p=>FX_STYLE[p.id].priority<style.priority).sort((a,b)=>FX_STYLE[a.id].priority-FX_STYLE[b.id].priority||a.start-b.start);
   for(const p of candidates){victims.push(p);used-=p.indices.length;if(used+cost<=limit)break;}
   if(used+cost>limit)return false;
  }
  for(const p of victims)this.release(p);
  const playback:FxPlayback<T>={id,start:now,frame:0,payload,indices:[]};
  for(const sheet of meta.sheets){const i=this.slots.indexOf(null);this.slots[i]={playback,layer:sheet.layer};playback.indices.push(i);}
  this.active.push(playback);this.last.set(id,now);return true;
 }
 update(now:number){
  for(let i=this.active.length-1;i>=0;i--){const p=this.active[i],meta=FX_MANIFEST[p.id];p.frame=Math.max(0,Math.floor((now-p.start)*meta.fps/1000));if(p.frame>=meta.count)this.release(p);}
 }
 clear(){for(const p of [...this.active])this.release(p);this.last.clear();}
 private release(p:FxPlayback<T>){for(const i of p.indices)this.slots[i]=null;this.active.splice(this.active.indexOf(p),1);}
}
