import { useCallback,useEffect,useRef,useState } from 'react';
import type { Profile,RunTicket,RunResult } from '@street/shared';
import { api,login,isDev } from './api';
import { initTelegram,tg,haptic } from './telegram';
import { hasArt,assetUrl } from './art';
import { Button,Panel,Icon,Modal,ToolButton,PlayerFigure,money,time } from '../components/ui';
import { RunView } from '../game/RunView';
import { Casino } from '../features/Casino';
import { GangScreen } from '../features/Gang';
import { City } from '../features/City';
import { ProfileModal,RankingsModal } from '../features/Profile';
import { SupportModal } from '../features/Support';
import { PixelBurst } from '../components/PixelBurst';
import { RunLoading } from '../components/RunLoading';
import { preloadRun } from '../game/preload';
import { initButtonFeedback } from './haptics';
import type { FxId } from '../effects/catalog';
type Tab='run'|'casino'|'gang'|'city';
export function App(){
 const [profile,setProfile]=useState<Profile|null>(null),[tab,setTab]=useState<Tab>(()=>{const hash=location.hash.slice(1);return ['run','casino','gang','city'].includes(hash)?hash as Tab:'run';}),[ticket,setTicket]=useState<RunTicket|null>(null),[result,setResult]=useState<RunResult|null>(null);
  const [bootError,setBootError]=useState(''),[toast,setToast]=useState<{message:string;id:number;fx?:FxId}|null>(null),[busy,setBusy]=useState(false),[modal,setModal]=useState<'profile'|'rankings'|'support'|'help'|null>(null),[soundOn,setSoundOn]=useState(localStorage.getItem('sl-sound')==='on');
  const toastId=useRef(0),notify=useCallback((message:string,fx?:FxId)=>setToast({message,id:++toastId.current,fx}),[]);
  const startGuard=useRef(false);
 const refresh=useCallback(async()=>setProfile(await api<Profile>('/me')),[]);
 const boot=useCallback(async()=>{setBootError('');try{await login();await refresh();}catch(e){setBootError((e as Error).message);}},[refresh]);
  useEffect(()=>{const cleanup=initTelegram();void boot();return cleanup;},[boot]);
  useEffect(()=>initButtonFeedback(),[]);
  useEffect(()=>{if(!profile)return;const timer=window.setTimeout(preloadRun,500);return ()=>clearTimeout(timer);},[!!profile]);
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(null),5000);return ()=>clearTimeout(id);},[toast]);
  const back=useCallback(()=>{if(ticket)return;const dialog=document.querySelector<HTMLDialogElement>('dialog[open]');if(dialog){dialog.dispatchEvent(new Event('cancel',{cancelable:true}));return;}setModal(null);setResult(null);setTab('run');},[ticket]);
 useEffect(()=>{const app=tg();if(!app?.initData)return;const should=tab!=='run'||modal||result;if(should)app.BackButton.show();else app.BackButton.hide();app.BackButton.onClick(back);return ()=>app.BackButton.offClick(back);},[tab,modal,result,back]);
 const showResult=useCallback((r:RunResult)=>{setTicket(null);setResult(r);void refresh().catch(e=>notify(e.message));},[refresh,notify]);
  async function start(){if(startGuard.current)return;startGuard.current=true;setBusy(true);haptic('press');preloadRun();try{const t=await api<RunTicket>('/runs/start',{});setResult(null);setTicket(t);}catch(e){haptic('failure');notify((e as Error).message);}finally{startGuard.current=false;setBusy(false);}}
  function navigate(next:Tab){if(tab===next&&!result)return;setTab(next);setResult(null);haptic('selection');history.replaceState(null,'',`#${next}`);void refresh().catch(e=>notify(e.message));}
 if(!profile)return <div className="boot"><h1>STREET<br/><span>LEGENDS</span></h1>{bootError?<><p role="alert" className="error-text">{bootError}</p>{import.meta.env.VITE_BOT_USERNAME&&<a className="pixel-button" href={`https://t.me/${import.meta.env.VITE_BOT_USERNAME}?start=play`} style={{textDecoration:'none'}}>ОТКРЫТЬ В TELEGRAM</a>}<Button secondary onClick={()=>void boot()}>ПОВТОРИТЬ ВХОД</Button></>:<div className="loading-track" role="status" aria-label="Загрузка игры"><i/></div>}</div>;
 return <div className={`app-shell game-ui ${ticket?'playing':''}`}>
  {!ticket&&<header className="topbar"><button className="profile-button" onClick={()=>setModal('profile')} aria-label="Открыть профиль"><span className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt="" width="40" height="40"/>:profile.display_name.slice(0,1)}</span><span><strong>{profile.display_name}</strong>{isDev()?<small>DEV MODE</small>:profile.gang?<small>[{profile.gang.tag}]</small>:null}</span></button><button className="wallet-button" onClick={()=>setModal('profile')} aria-label={`Кошелёк: ${money(profile.balance)} игровых долларов`}><span>$</span>{money(profile.balance)}</button><button className={`icon-button sound-toggle ${soundOn?'on':''}`} aria-label={soundOn?'Выключить звук':'Включить звук'} onClick={()=>{const v=!soundOn;setSoundOn(v);localStorage.setItem('sl-sound',v?'on':'off');}}><Icon name="sound" size={20}/>{!soundOn&&<span className="sound-off"/>}</button></header>}
   <main key={ticket?'playing':result?'result':tab} className={ticket?'game-main':'content screen-switch'}>
   {ticket?<RunView ticket={ticket} onClose={()=>{setTicket(null);void refresh().catch(e=>notify(e.message));}} onResult={showResult}/>:result?<div className="screen arcade-screen result-screen">
    <h1>Вылазка окончена</h1>
    <div className="result-focus"><PlayerFigure fallen/><div className="result-wave">{!!result.is_new_record&&result.verification_state!=='suspicious'&&<div className="result-record-fx"><PixelBurst id="level" scale={1}/></div>}<strong>{String(result.wave).padStart(2,'0')}</strong><span>ВОЛНА</span></div>{!!result.is_new_record&&result.verification_state!=='suspicious'&&<span className="record-badge">Новый рекорд</span>}</div>
    <Panel className="result-card"><div className="result-numbers"><div><b>{time(result.duration_seconds)}</b><span>время</span></div><div><b>{result.kills}</b><span>противников</span></div>{result.gang_xp>0&&<div><b className="cyan">+{result.gang_xp}</b><span>XP банды</span></div>}</div><div className="result-income">{result.earned>0&&result.verification_state!=='suspicious'&&<div className="result-income-fx"><PixelBurst id="coin" scale={.9}/></div>}<span>ДОБЫЧА</span><strong className="gold">+${money(result.earned)}</strong></div></Panel>
    {result.verification_state==='suspicious'&&<p className="error-text" role="alert">Результат не прошёл проверку. Выплата и рейтинг не начислены.</p>}
    <div className="screen-actions"><Button disabled={busy} onClick={()=>void start()}>ЕЩЁ РАЗ →</Button><button className="quiet-button" onClick={()=>setResult(null)}>На район</button></div>
   </div>:tab==='run'?<div className="screen arcade-screen lobby">
    <h1 className="sr-only">Вылазка</h1>
    <section className={`district-scene ${hasArt('lobby-night')?'with-art':'pending-art'}`} style={hasArt('lobby-night')?{backgroundImage:`url(${assetUrl('lobby-night')})`}:undefined} aria-label="Район ночной вылазки">
     <div className="lobby-scene-top"><div className="district-logo" aria-label="STREET LEGENDS">STREET<br/><span>LEGENDS</span></div><div className="scene-tools"><ToolButton label="Как играть" icon="info" onClick={()=>setModal('help')}/><ToolButton label="Открыть рейтинг" icon="cup" onClick={()=>setModal('rankings')}/></div></div>
     <div className="lobby-hero"><PlayerFigure/></div>
     <div className="lobby-scene-bottom"><button className="scene-record" onClick={()=>setModal('rankings')}><Icon name="cup" size={20}/><span><small>Лучшая волна</small><b>{String(profile.best_wave).padStart(2,'0')}</b></span></button><button className="scene-gang" onClick={()=>navigate('gang')}><Icon name="gang" size={24}/><span>{profile.gang?`[${profile.gang.tag}]`:'Банда'}</span><Icon name="next" size={16}/></button></div>
    </section>
    <Button className="start-run" disabled={busy} onClick={()=>void start()}><Icon name="run" size={28}/><span>{busy?'ВЫХОДИМ…':'НАЧАТЬ ВЫЛАЗКУ'}</span><Icon name="next" size={20}/></Button>
   </div>:tab==='casino'?<Casino balance={profile.balance} refresh={refresh} notify={notify}/>:tab==='gang'?<GangScreen profile={profile} refresh={refresh} notify={notify} rankings={()=>setModal('rankings')}/>:<City profile={profile} refresh={refresh} notify={notify}/>}
  </main>
  {!ticket&&<nav className="bottom-nav" aria-label="Основная навигация">{([['run','Вылазка'],['casino','Казино'],['gang','Банда'],['city','Город']] as const).map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>navigate(id)}><Icon name={id} size={25}/><span>{label}</span>{tab===id&&<i/>}</button>)}</nav>}
  {toast&&<div className={`toast ${toast.fx?'with-fx':''}`} role="status">{toast.fx&&<div className="toast-fx"><PixelBurst key={toast.id} id={toast.fx}/></div>}{toast.message}<button className="toast-close" aria-label="Скрыть уведомление" onClick={()=>setToast(null)}><Icon name="close" size={18}/></button></div>}
   {busy&&!ticket&&<RunLoading/>}
   {modal==='profile'&&<ProfileModal profile={profile} onClose={()=>setModal(null)} onSupport={()=>setModal('support')} notify={notify}/>}{modal==='rankings'&&<RankingsModal onClose={()=>setModal(null)} notify={notify}/>}{modal==='support'&&<SupportModal onClose={()=>setModal('profile')}/>}
   {modal==='help'&&<Modal title="Как играть" onClose={()=>setModal(null)}><div className="help-controls"><Icon name="run" size={48}/><h3>Двигайся. Герой стреляет сам.</h3></div><p>Проведи пальцем по игровому полю и удерживай. На компьютере — WASD или стрелки.</p><p>Подбирай деньги и XP. При новом уровне выбери улучшение — оно действует до конца вылазки.</p><p className="muted small">Добыча поступит в кошелёк после завершения.</p><Button onClick={()=>setModal(null)}>ПОНЯТНО</Button></Modal>}
 </div>;
}
