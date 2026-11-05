// Только локальная Vite DEV-сцена. Нет входа, API, checkpoints, наград или сохранения.
import { useEffect,useRef,useState } from 'react';
import type { Hud } from './StreetScene';
import { EffectsToggle } from '../components/EffectsToggle';
export function GameReview(){
 const mount=useRef<HTMLDivElement>(null),sceneRef=useRef<import('./StreetScene').StreetScene|null>(null),[hud,setHud]=useState<Hud|null>(null),[paused,setPaused]=useState(false);
 const mode=new URLSearchParams(location.search).get('case')??'crowd';
 useEffect(()=>{
  if(!import.meta.env.DEV)return;let disposed=false,game:import('phaser').Game|undefined;
  void Promise.all([import('phaser'),import('./StreetScene')]).then(([{default:P},{StreetScene}])=>{
   if(disposed||!mount.current)return;
   class ReviewScene extends StreetScene {create(){super.create();this.startReview(mode);}}
   const scene=new ReviewScene({id:'local-review-no-rewards',seed:20261105,startedAt:Date.now()},{hud:setHud,upgrade:ids=>scene.choose(ids[0]),pause:()=>setPaused(true),death:()=>{}});sceneRef.current=scene;
   game=new P.Game({type:P.AUTO,parent:mount.current,width:360,height:720,pixelArt:true,roundPixels:true,antialias:false,backgroundColor:'#0E131B',scene:[scene],audio:{noAudio:true},scale:{mode:P.Scale.FIT,autoCenter:P.Scale.CENTER_BOTH},fps:{target:60}});
  });return ()=>{disposed=true;game?.destroy(true);sceneRef.current=null;};
 },[mode]);
 return <div className="app-shell"><header className="run-hud"><strong>LOCAL QA</strong><span>Без наград · {mode}</span><button onClick={()=>{const value=!paused;sceneRef.current?.setPaused(value);setPaused(value);}}>{paused?'Продолжить':'Пауза'}</button></header><p className="small muted">{hud?`${Math.floor(hud.seconds)} с · ${hud.enemies} мобов · $${hud.money} · XP ${hud.xp}`:'Загрузка сцены…'}</p>{['effects','feedback','wall','fx-stress'].includes(mode)&&<EffectsToggle/>}<div className="game-stage" ref={mount}/></div>;
}
