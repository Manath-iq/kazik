import { useEffect,useRef,useState } from 'react';
import { useEffectsSettings,effectsAllowed } from '../app/effects';
import { FX_MANIFEST,fxUrl } from '../effects/catalog';
import type { FxId } from '../effects/catalog';

// One-shot bitmap feedback, shared with Phaser. No canvas, RAF loop or particle simulator in the shell.
export function PixelBurst({id,scale=.6}:{id:FxId;scale?:number}){
 const root=useRef<HTMLSpanElement>(null),attempted=useRef(false),[done,setDone]=useState(false);
 const {enabled,reduced}=useEffectsSettings(),m=FX_MANIFEST[id];
 useEffect(()=>{
  if(attempted.current)return;attempted.current=true;
  if(!effectsAllowed())return;
  let cancelled=false;const animations:Animation[]=[];
  const finish=()=>{setDone(true);for(const animation of animations)animation.cancel();};
  const hidden=()=>{if(document.hidden)finish();};document.addEventListener('visibilitychange',hidden);
  const images=m.sheets.map(sheet=>{const image=new Image();image.src=fxUrl(sheet.file);return image.decode();});
  void Promise.all(images).then(()=>{
   if(cancelled||!root.current||!effectsAllowed())return;
   root.current.style.visibility='visible';
   const keys=Array.from({length:m.count},(_,frame)=>({backgroundPosition:`${-frame%m.columns*m.frameWidth*scale}px ${-Math.floor(frame/m.columns)*m.frameHeight*scale}px`,offset:frame/m.count,easing:'steps(1, end)'}));
   keys.push({...keys[keys.length-1],offset:1});
   for(const element of root.current.children)animations.push(element.animate(keys,{duration:m.durationMs,iterations:1,fill:'forwards',easing:'linear'}));
   void animations[0]?.finished.then(finish).catch(()=>{});
  }).catch(()=>{if(!cancelled)setDone(true);});
  return ()=>{cancelled=true;document.removeEventListener('visibilitychange',hidden);for(const animation of animations)animation.cancel();};
 },[m,scale,enabled,reduced]);
 if(!enabled||reduced||done)return null;
 return <span ref={root} className="pixel-burst" data-fx={id} aria-hidden="true" style={{width:m.frameWidth*scale,height:m.frameHeight*scale,visibility:'hidden'}}>{m.sheets.map(sheet=><span key={sheet.layer} style={{backgroundImage:`url(${fxUrl(sheet.file)})`,backgroundSize:`${m.columns*m.frameWidth*scale}px ${m.rows*m.frameHeight*scale}px`}}/>)}</span>;
}
