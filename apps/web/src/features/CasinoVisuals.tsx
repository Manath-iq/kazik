import { useEffect,useRef } from 'react';
import type { MutableRefObject } from 'react';
import { CRASH,LIVE_CASINO,crashMultiplier,rouletteColor } from '@street/shared';
import type { LiveRound } from '@street/shared';
import { assetUrl } from '../app/art';
import { reducedMotion,subscribeEffects,effectsPreference } from '../app/effects';

export const wheelOrder=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export function liveMultiplier(round:LiveRound,now:number){return round.phase==='result'?round.crashPoint??1:round.phase==='playing'?crashMultiplier(now-round.startedAt):1;}
export function RouletteVisual({round,offset}:{round:LiveRound;offset:MutableRefObject<number>}){
 const wheel=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let frame=0;const el=wheel.current;if(!el)return;
  const draw=()=>{
   if(document.hidden)return;
   const target=1440-wheelOrder.indexOf(round.number??0)*360/37;
   const progress=round.phase==='betting'?0:round.phase==='result'||reducedMotion()?1:Math.max(0,Math.min(1,(Date.now()+offset.current-round.startedAt)/LIVE_CASINO.rouletteMs));
   el.style.transform=`rotate(${target*(1-(1-progress)**3)}deg)`;
   if(progress<1&&round.phase==='playing'&&!reducedMotion())frame=requestAnimationFrame(draw);
  };
  const start=()=>{cancelAnimationFrame(frame);draw();};start();
  document.addEventListener('visibilitychange',start);const stop=subscribeEffects(start);
  return ()=>{cancelAnimationFrame(frame);stop();document.removeEventListener('visibilitychange',start);};
 },[round.id,round.phase,round.number,round.startedAt,offset]);
 return <div className="roulette-stage live-wheel-stage"><div className="roulette-pointer" aria-hidden="true">▼</div><div ref={wheel} className="roulette-wheel">{wheelOrder.map((n,i)=><span key={n} className={`wheel-number ${rouletteColor(n)} ${round.phase==='result'&&round.number===n?'winner':''}`} style={{transform:`rotate(${i*360/37}deg) translateY(calc(var(--wheel-size) * -.435)) rotate(90deg)`}}>{n}</span>)}<div className="wheel-center"><span>SL</span></div></div>{round.phase==='result'&&<strong className={`wheel-outcome ${rouletteColor(round.number??0)}`}>{round.number}</strong>}</div>;
}

// A small deterministic pixel field: fixed pool, no allocating particles per frame.
const stars=Array.from({length:72},(_,i)=>({x:(i*47.37)%1,y:(i*29.71)%1,size:i%13===0?3:i%4===0?2:1,layer:i%3}));
export function CrashVisual({round,offset}:{round:LiveRound;offset:MutableRefObject<number>}){
 const canvas=useRef<HTMLCanvasElement>(null),value=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=canvas.current,context=el?.getContext('2d');if(!el||!context)return;
  const rocket=new Image();rocket.src=assetUrl('rocket');
  let frame=0,w=320,h=190,previousText='',milestone=1;
  const startAt=performance.now();
  const resize=()=>{const rect=el.getBoundingClientRect();w=Math.max(1,Math.round(rect.width/2));h=Math.max(1,Math.round(rect.height/2));el.width=w;el.height=h;draw();};
  function draw(){
   if(!el||!context||document.hidden)return;
   const now=Date.now()+offset.current,flying=round.phase==='playing',crashed=round.phase==='result',elapsed=crashed?Math.log(round.crashPoint??1)/CRASH.growth:Math.max(0,(now-round.startedAt)/1000);
   const still=reducedMotion()||!effectsPreference(),mult=liveMultiplier(round,now),ambient=(performance.now()-startAt)/1000,motion=still?0:flying?elapsed:ambient*.3;
   context.imageSmoothingEnabled=false;context.fillStyle='#080d20';context.fillRect(0,0,w,h);
   context.fillStyle='#13132d';context.fillRect(w*.55,0,w*.45,h);context.fillStyle='#11172b';context.fillRect(0,h*.6,w,h*.4);
   for(const star of stars){
    const speed=(.3+star.layer*.35)*(flying?1+Math.log(mult):.3),shift=motion*speed*.028;
    const x=Math.round((((star.x-shift)%1+1)%1)*w),y=Math.round((((star.y+shift)%1+1)%1)*h);
    context.globalAlpha=still?.65:.4+.5*(.5+.5*Math.sin(ambient*(1+star.layer)+star.x*40));context.fillStyle=star.layer===1?'#8B78FF':'#E7EDF5';context.fillRect(x,y,star.size,star.size);
   }
   context.globalAlpha=1;
   // x and y share ONE progress: the path is strictly straight, never a Bezier.
   // Perspective travel approaches the upper-right; accelerating stars preserve speed at high x.
   const t=!still&&(flying||crashed)?Math.min(1,(elapsed*.22+elapsed*elapsed*.025)/(1+elapsed*.22+elapsed*elapsed*.025)):0;
   const x=18+(w-42)*t,y=h-18-(h-44)*t;
   if(flying&&!still){
    for(let i=10;i>0;i--){context.fillStyle=i>6?'#8B78FF':i>3?'#FFCA3A':'#E7EDF5';context.globalAlpha=(11-i)/12;const len=i*(2+Math.min(2,elapsed*.04));context.fillRect(Math.round(x-len-4),Math.round(y+len+4),i%3+1,i%3+1);}
    context.globalAlpha=1;
   }
   if(!crashed&&rocket.complete&&rocket.naturalWidth)context.drawImage(rocket,Math.round(x-13),Math.round(y-13),26,26);
   if(crashed){
    const age=still?1:Math.min(1,(performance.now()-startAt)/600);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;context.fillStyle=i%2?'#FFCA3A':'#FF6575';context.globalAlpha=1-age*.7;context.fillRect(Math.round(x+Math.cos(a)*(7+age*17)),Math.round(y+Math.sin(a)*(7+age*17)),3,3);}
    context.globalAlpha=1;
   }
   if(value.current){const text=`×${mult.toFixed(2)}`;if(text!==previousText){value.current.textContent=text;previousText=text;}const next=Math.floor(Math.log2(mult));if(next>milestone&&!still){milestone=next;value.current.animate([{transform:'scale(1.05)'},{transform:'scale(1)'}],{duration:160});}}
   if(!still||flying)frame=requestAnimationFrame(draw);
  }
  const restart=()=>{cancelAnimationFrame(frame);draw();};
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);resize();});observer.observe(el);resize();rocket.onload=restart;
  const stop=subscribeEffects(restart);
  return ()=>{cancelAnimationFrame(frame);stop();observer.disconnect();rocket.onload=null;};
 },[round.id,round.phase,round.startedAt,round.crashPoint,offset]);
 return <div className={`live-space ${round.phase==='result'?'crashed':''}`}><canvas ref={canvas} aria-hidden="true"/><div ref={value} className="crash-value" aria-label="Коэффициент">×{(round.crashPoint??1).toFixed(2)}</div>{round.phase==='betting'&&<span className="space-caption">ГОТОВ К ПОЛЁТУ</span>}{round.phase==='result'&&<span className="space-caption coral">КРУШЕНИЕ</span>}</div>;
}
