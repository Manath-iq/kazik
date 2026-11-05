import { useEffect,useRef } from 'react';
import type { MutableRefObject } from 'react';
import { CRASH,LIVE_CASINO,crashMultiplier,rouletteColor } from '@street/shared';
import type { LiveRound } from '@street/shared';
import { assetUrl } from '../app/art';
import { reducedMotion,subscribeEffects,effectsPreference } from '../app/effects';
import { wheelOrder,wheelPoint,wheelPocket,rocketPosition } from './casino-geometry';

export { wheelOrder } from './casino-geometry';
export function liveMultiplier(round:LiveRound,now:number){return round.phase==='result'?round.crashPoint??1:round.phase==='playing'?crashMultiplier(now-round.startedAt):1;}
export function RouletteVisual({round,offset}:{round:LiveRound;offset:MutableRefObject<number>}){
 const wheel=useRef<SVGGElement>(null);
 useEffect(()=>{
  let frame=0;const el=wheel.current;if(!el)return;
  const draw=()=>{
   if(document.hidden)return;
   const target=1440-wheelOrder.indexOf(round.number??0)*360/37;
   const progress=round.phase==='betting'?0:round.phase==='result'||reducedMotion()?1:Math.max(0,Math.min(1,(Date.now()+offset.current-round.startedAt)/LIVE_CASINO.rouletteMs));
    el.setAttribute('transform',`rotate(${target*(1-(1-progress)**3)} 160 160)`);
   if(progress<1&&round.phase==='playing'&&!reducedMotion())frame=requestAnimationFrame(draw);
  };
  const start=()=>{cancelAnimationFrame(frame);draw();};start();
  document.addEventListener('visibilitychange',start);const stop=subscribeEffects(start);
  return ()=>{cancelAnimationFrame(frame);stop();document.removeEventListener('visibilitychange',start);};
 },[round.id,round.phase,round.number,round.startedAt,offset]);
 return <div className="roulette-stage live-wheel-stage"><svg className="roulette-dial" viewBox="0 0 320 320" role="img" aria-label={`Европейская рулетка, числа от 0 до 36${round.phase==='result'?`. Выпало ${round.number}`:''}`}>
  <circle cx="160" cy="160" r="153" fill="#080B10" stroke="#FFCA3A" strokeWidth="5"/>
  <circle cx="160" cy="160" r="146" fill="#1B2532" stroke="#344154" strokeWidth="3"/>
  <g ref={wheel}>{wheelOrder.map((n,i)=>{const color=rouletteColor(n),winner=round.phase==='result'&&round.number===n,p=wheelPoint(i*360/37-90,124);return <g key={n} className={`roulette-pocket ${color} ${winner?'winning-pocket':''}`}>
   <path d={wheelPocket(i)} fill={winner?'#FFCA3A':color==='red'?'#FF6575':color==='zero'?'#C5F542':'#141B25'} stroke={winner?'#E7EDF5':'#080B10'} strokeWidth={winner?2.5:1}/>
   <text className="roulette-pocket-number" x={p.x} y={p.y} transform={`rotate(${i*360/37} ${p.x} ${p.y})`} textAnchor="middle" dominantBaseline="central" fill={winner||color!=='black'?'#080B10':'#E7EDF5'}>{n}</text>
  </g>;})}</g>
  <circle cx="160" cy="160" r="103" fill="#0E131B" stroke="#FFCA3A" strokeWidth="2"/>
  {Array.from({length:8},(_,i)=>{const a=wheelPoint(i*45,58),b=wheelPoint(i*45,96);return <path key={i} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#344154" strokeWidth="2"/>;})}
  <circle cx="160" cy="160" r="54" fill="#141B25" stroke="#FFCA3A" strokeWidth="3"/>
  <circle cx="160" cy="160" r="46" fill="#080B10" stroke="#344154" strokeWidth="1"/>
  <text x="160" y="160" textAnchor="middle" dominantBaseline="central" className="roulette-hub-text">{round.phase==='result'?round.number:'SL'}</text>
  <path d="M148 3H172L160 27Z" fill="#FFCA3A" stroke="#080B10" strokeWidth="2"/>
 </svg></div>;
}

// A small deterministic pixel field: fixed pool, no allocating particles per frame.
const stars=Array.from({length:72},(_,i)=>({x:(i*47.37)%1,y:(i*29.71)%1,size:i%13===0?3:i%4===0?2:1,layer:i%3}));
export function CrashVisual({round,offset}:{round:LiveRound;offset:MutableRefObject<number>}){
 const canvas=useRef<HTMLCanvasElement>(null),value=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=canvas.current,context=el?.getContext('2d');if(!el||!context)return;
  const rocket=new Image();rocket.src=assetUrl('rocket');
   let frame=0,w=320,h=190,previousText='',milestone=0;
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
    // The chart/rocket position is meaningful state, not optional particle FX.
    // Turning effects off must not pin the rocket at the launch pad.
    const {x,y,startX,startY}=rocketPosition(flying||crashed?elapsed:0,w,h);
    if(flying||crashed){
     context.beginPath();context.moveTo(startX,startY);context.lineTo(x,y);context.lineTo(x,startY);context.closePath();context.fillStyle=crashed?'#FF657512':'#8B78FF12';context.fill();
     context.lineCap='square';context.lineJoin='miter';
     context.beginPath();context.moveTo(startX,startY);context.lineTo(x,y);context.strokeStyle=crashed?'#FF657540':'#8B78FF45';context.lineWidth=5;context.stroke();
     context.strokeStyle=crashed?'#FF6575':'#FFCA3A';context.lineWidth=1.5;context.stroke();
     context.fillStyle='#E7EDF5';context.fillRect(Math.round(x-1),Math.round(y-1),2,2);
    }
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
    if(value.current){const text=`×${mult.toFixed(2)}`;if(text!==previousText){value.current.textContent=text;previousText=text;}const next=Math.floor(Math.log2(mult));if(next>milestone&&!still){milestone=next;value.current.animate?.([{transform:'scale(1.05)'},{transform:'scale(1)'}],{duration:160});}}
   if(!still||flying)frame=requestAnimationFrame(draw);
  }
  const restart=()=>{cancelAnimationFrame(frame);draw();};
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);resize();});observer.observe(el);resize();rocket.onload=restart;
  const stop=subscribeEffects(restart);
  return ()=>{cancelAnimationFrame(frame);stop();observer.disconnect();rocket.onload=null;};
 },[round.id,round.phase,round.startedAt,round.crashPoint,offset]);
 return <div className={`live-space ${round.phase==='result'?'crashed':''}`}><canvas ref={canvas} aria-hidden="true"/><div ref={value} className="crash-value" aria-label="Коэффициент">×{(round.crashPoint??1).toFixed(2)}</div>{round.phase==='betting'&&<span className="space-caption">ГОТОВ К ПОЛЁТУ</span>}{round.phase==='result'&&<span className="space-caption coral">КРУШЕНИЕ</span>}</div>;
}
