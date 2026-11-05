import { useCallback,useEffect,useRef,useState } from 'react';
import type Phaser from 'phaser';
import { BALANCE,UPGRADES } from '@street/shared';
import type { RunTicket,RunResult,RunProgress,UpgradeId } from '@street/shared';
import { api } from '../app/api';
import { tg } from '../app/telegram';
import { Button,Panel,time,money } from '../components/ui';
import type { StreetScene,Hud } from './StreetScene';
import { hasArt } from '../app/art';
import { EffectsToggle } from '../components/EffectsToggle';
const initialHud:Hud={hp:100,maxHp:100,xp:0,xpMax:6,level:1,seconds:0,wave:1,kills:0,money:0,enemies:0};
export function RunView({ticket,onClose,onResult}:{ticket:RunTicket;onClose:()=>void;onResult:(result:RunResult)=>void}){
 const mount=useRef<HTMLDivElement>(null),sceneRef=useRef<StreetScene|null>(null),gameRef=useRef<Phaser.Game|null>(null);
 const [hud,setHud]=useState(initialHud),[paused,setPaused]=useState(false),[choices,setChoices]=useState<UpgradeId[]>([]),[dead,setDead]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const pending=useRef<RunProgress|null>(null),seq=useRef(0),queue=useRef(Promise.resolve()),alive=useRef(true),didSave=useRef(false);
 const checkpoint=useCallback(()=>{
  const scene=sceneRef.current;if(!scene)return Promise.resolve();
  // Последовательная очередь. При сетевом сбое повторяется ТОТ ЖЕ payload и seq.
  const task=async()=>{
   const p=pending.current??{...scene.snapshot(),seq:seq.current+1};pending.current=p;
   await api(`/runs/${ticket.id}/progress`,p);seq.current=p.seq;pending.current=null;
  };
  const next=queue.current.then(task);queue.current=next.catch(()=>{});return next;
 },[ticket.id]);
 const finish=useCallback(async()=>{
  if(didSave.current)return;setSaving(true);setError('');
  try{
   await checkpoint();
   // После восстановленного pending checkpoint отправляем финальный снимок, если он отличается.
   await checkpoint();
   const result=await api<RunResult>(`/runs/${ticket.id}/finish`,{});didSave.current=true;onResult(result);
  }catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setSaving(false);}
 },[ticket.id,checkpoint,onResult]);
 useEffect(()=>{
   let cancelled=false;alive.current=true;
   const resize=()=>{const box=mount.current?.getBoundingClientRect(),game=gameRef.current;if(box&&box.width>0&&box.height>0&&game?.isBooted)game.scale.setGameSize(360,Math.round(360*box.height/box.width));};
   const observer=new ResizeObserver(resize);if(mount.current)observer.observe(mount.current);
  void Promise.all([import('phaser'),import('./StreetScene')]).then(([{default:P},{StreetScene:Scene}])=>{
   if(cancelled||!mount.current)return;
    const box=mount.current.getBoundingClientRect(),height=Math.max(1,Math.round(box.height/(box.width/360)));
   const scene=new Scene(ticket,{hud:setHud,upgrade:setChoices,pause:()=>setPaused(true),death:()=>setDead(true)});sceneRef.current=scene;
   gameRef.current=new P.Game({type:P.AUTO,parent:mount.current,width:360,height,pixelArt:true,roundPixels:true,backgroundColor:'#0E131B',antialias:false,scene:[scene],scale:{mode:P.Scale.FIT,autoCenter:P.Scale.CENTER_BOTH},input:{activePointers:2},audio:{noAudio:true},fps:{target:60,forceSetTimeOut:false}});
  }).catch(e=>setError(String(e)));
  const id=setInterval(()=>{if(!sceneRef.current||sceneRef.current.pausedRun||sceneRef.current.finished)return;void checkpoint().catch(e=>{sceneRef.current?.setPaused(true);setPaused(true);setError((e as Error).message);});},BALANCE.checkpointSeconds*1000);
  const app=tg();if(app?.initData&&app.isVersionAtLeast('7.7'))app.disableVerticalSwipes();
  const beforeUnload=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',beforeUnload);
   return ()=>{cancelled=true;alive.current=false;observer.disconnect();clearInterval(id);window.removeEventListener('beforeunload',beforeUnload);gameRef.current?.destroy(true);gameRef.current=null;sceneRef.current=null;if(app?.initData&&app.isVersionAtLeast('7.7'))app.enableVerticalSwipes();};
 },[ticket,checkpoint]);
 useEffect(()=>{if(dead)void finish();},[dead,finish]);
 const resume=async()=>{setError('');try{if(pending.current)await checkpoint();setPaused(false);sceneRef.current?.setPaused(false);}catch(e){setError((e as Error).message);}};
 return <div className="run-view">
  <header className="run-hud"><div><span className="eyebrow">ВОЛНА {hud.wave}</span><strong>{time(hud.seconds)}</strong></div><div className="run-stats"><span>× {hud.kills}</span><span className="gold">${money(hud.money)}</span></div><button className="icon-button" aria-label="Пауза" onClick={()=>{sceneRef.current?.setPaused(true);setPaused(true);}}>Ⅱ</button></header>
  <div className="run-bars"><div className="meter hp" aria-label={`Здоровье ${Math.ceil(hud.hp)} из ${hud.maxHp}`}><i style={{width:`${hud.hp/hud.maxHp*100}%`}}/><span>HP {Math.ceil(hud.hp)} / {hud.maxHp}</span></div><div className="meter xp"><i style={{width:`${hud.xp/hud.xpMax*100}%`}}/><span>УР. {hud.level}</span></div></div>
   <div className="game-stage" ref={mount} aria-label="Вылазка: двигайся джойстиком или WASD, атака автоматическая"/>
  {!hasArt('player')&&<div className="art-pending">ТЕСТ МЕХАНИК · ГРАФИКА В ГЕНЕРАЦИИ</div>}
  {choices.length>0&&<div className="game-overlay"><Panel><span className="eyebrow lime">УРОВЕНЬ {hud.level}</span><h2>Выбери улучшение</h2><div className="upgrade-list">{choices.map(id=>{const u=UPGRADES.find(u=>u.id===id)!;return <button key={id} onClick={()=>{sceneRef.current?.choose(id);setChoices([]);}}><span className="upgrade-mark">+</span><span><strong>{u.name}</strong><small>{u.text}</small></span><span>→</span></button>;})}</div></Panel></div>}
  {paused&&!dead&&choices.length===0&&<div className="game-overlay"><Panel><h2>Пауза</h2><div className="pause-effects"><EffectsToggle compact/></div>{error&&<p className="error-text" role="alert">{error}</p>}<Button onClick={()=>void resume()}>ПРОДОЛЖИТЬ →</Button><Button secondary onClick={()=>{sceneRef.current!.finished=true;setDead(true);}}>ЗАВЕРШИТЬ ВЫЛАЗКУ</Button><button className="text-button" onClick={onClose}>Выйти без награды</button></Panel></div>}
  {dead&&<div className="game-overlay"><Panel><h2>{saving?'Сохраняем добычу…':'Не удалось сохранить'}</h2>{error&&<p className="error-text" role="alert">{error}</p>}{!saving&&<Button onClick={()=>void finish()}>ПОВТОРИТЬ СОХРАНЕНИЕ</Button>}</Panel></div>}
 </div>;
}
