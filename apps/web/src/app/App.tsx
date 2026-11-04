import { useCallback,useEffect,useState } from 'react';
import { CATALOG } from '@street/shared';
import type { Profile,RunTicket,RunResult } from '@street/shared';
import { api,login,isDev } from './api';
import { initTelegram,tg,haptic } from './telegram';
import { hasArt,assetUrl } from './art';
import { Button,Panel,Icon,money,time } from '../components/ui';
import { RunView } from '../game/RunView';
import { Casino } from '../features/Casino';
import { GangScreen } from '../features/Gang';
import { City } from '../features/City';
import { ProfileModal,RankingsModal } from '../features/Profile';
type Tab='run'|'casino'|'gang'|'city';
export function App(){
 const [profile,setProfile]=useState<Profile|null>(null),[tab,setTab]=useState<Tab>(()=>{const hash=location.hash.slice(1);return ['run','casino','gang','city'].includes(hash)?hash as Tab:'run';}),[ticket,setTicket]=useState<RunTicket|null>(null),[result,setResult]=useState<RunResult|null>(null);
 const [bootError,setBootError]=useState(''),[toast,setToast]=useState(''),[busy,setBusy]=useState(false),[modal,setModal]=useState<'profile'|'rankings'|null>(null),[soundOn,setSoundOn]=useState(localStorage.getItem('sl-sound')==='on');
 const notify=useCallback((message:string)=>setToast(message),[]);
 const refresh=useCallback(async()=>setProfile(await api<Profile>('/me')),[]);
 const boot=useCallback(async()=>{setBootError('');try{await login();await refresh();}catch(e){setBootError((e as Error).message);}},[refresh]);
 useEffect(()=>{const cleanup=initTelegram();void boot();return cleanup;},[boot]);
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),5000);return ()=>clearTimeout(id);},[toast]);
 const back=useCallback(()=>{if(ticket)return;setModal(null);setResult(null);setTab('run');},[ticket]);
 useEffect(()=>{const app=tg();if(!app?.initData)return;const should=tab!=='run'||modal||result;if(should)app.BackButton.show();else app.BackButton.hide();app.BackButton.onClick(back);return ()=>app.BackButton.offClick(back);},[tab,modal,result,back]);
 const showResult=useCallback((r:RunResult)=>{setTicket(null);setResult(r);void refresh().catch(e=>notify(e.message));},[refresh,notify]);
 async function start(){setBusy(true);try{const t=await api<RunTicket>('/runs/start',{});setResult(null);setTicket(t);haptic();}catch(e){notify((e as Error).message);}finally{setBusy(false);}}
 function navigate(next:Tab){setTab(next);setResult(null);haptic();history.replaceState(null,'',`#${next}`);void refresh().catch(e=>notify(e.message));}
 if(!profile)return <div className="boot"><div className="boot-mark">SL<span>+<br/>+</span></div><h1>STREET<br/><span>LEGENDS</span></h1><p className="eyebrow">НОЧЬ ТОЛЬКО НАЧИНАЕТСЯ</p>{bootError?<><p role="alert" className="error-text">{bootError}</p>{import.meta.env.VITE_BOT_USERNAME&&<a className="pixel-button" href={`https://t.me/${import.meta.env.VITE_BOT_USERNAME}?start=play`} style={{textDecoration:'none'}}>ОТКРЫТЬ В TELEGRAM →</a>}<Button secondary onClick={()=>void boot()}>ПОВТОРИТЬ ВХОД</Button></>:<div className="loading-track"><i/></div>}</div>;
 return <div className={`app-shell ${ticket?'playing':''}`}>
  {!ticket&&<><header className="topbar"><button className="profile-button" onClick={()=>setModal('profile')} aria-label="Открыть профиль"><span className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt="" width="40" height="40"/>:profile.display_name.slice(0,1)}</span><span><strong>{profile.display_name}</strong><small>{isDev()?'LOCAL · DEV MODE':profile.gang?`[${profile.gang.tag}] НА РАЙОНЕ`:'НОЧНОЙ ЖИТЕЛЬ'}</small></span></button><button className="wallet-button" onClick={()=>setModal('profile')} aria-label={`Кошелёк: ${money(profile.balance)} игровых долларов`}><span>$</span>{money(profile.balance)}</button><button className={`icon-button sound-toggle ${soundOn?'on':''}`} aria-label={soundOn?'Выключить звук':'Включить звук'} onClick={()=>{const v=!soundOn;setSoundOn(v);localStorage.setItem('sl-sound',v?'on':'off');}}><Icon name="sound"/>{!soundOn&&<span className="sound-off"/>}</button></header></>}
  <main className={ticket?'game-main':'content'}>
   {ticket?<RunView ticket={ticket} onClose={()=>{setTicket(null);void refresh().catch(e=>notify(e.message));}} onResult={showResult}/>:result?<div className="screen result-screen">
    <span className="eyebrow coral">ДО СЛЕДУЮЩЕЙ НОЧИ</span>
    <h1>Район тебя<br/><span className="lime">запомнил.</span></h1>
    {!!result.is_new_record&&<span className="eyebrow lime">НОВЫЙ ЛИЧНЫЙ РЕКОРД</span>}
    <div className="result-wave"><strong>{String(result.wave).padStart(2,'0')}</strong><span>ВОЛНА</span></div>
    <Panel><div className="result-numbers"><div><b>{time(result.duration_seconds)}</b><span>продержался</span></div><div><b>{result.kills}</b><span>противников</span></div></div><div className="result-income"><span>В КОШЕЛЁК</span><strong className="gold">+${money(result.earned)}</strong></div></Panel>
    {result.verification_state==='suspicious'?<p className="error-text">Результат не прошёл проверку. Выплата и рейтинг не начислены.</p>:<p className="muted">Каждая вылазка — новая история.{result.gang_xp?` Банда получила +${result.gang_xp} XP.`:''}</p>}
    <Button disabled={busy} onClick={()=>void start()}>ЕЩЁ РАЗ →</Button><Button secondary onClick={()=>setResult(null)}>НА РАЙОН</Button>
   </div>:tab==='run'?<div className="screen lobby">
    <div className="lobby-title"><div><span className="eyebrow">НОЧНАЯ УЛИЧНАЯ АРКАДА</span><h1>STREET<br/><span>LEGENDS</span></h1></div><button className="rank-button" onClick={()=>setModal('rankings')} aria-label="Открыть рейтинг"><Icon name="cup" size={26}/><span>ТОП<br/>РАЙОНА</span></button></div>
    <section className={`district-scene ${hasArt('lobby-night')?'with-art':'pending-art'}`} style={hasArt('lobby-night')?{backgroundImage:`url(${assetUrl('lobby-night')})`}:undefined} aria-label="Район ночной вылазки"><div className="district-meta"><span>РАЙОН 01</span><span><i/> ПОСЛЕ ПОЛУНОЧИ</span></div><div className="district-copy"><span className="eyebrow">ЗДЕСЬ НАЧИНАЕТСЯ ТВОЯ ИСТОРИЯ</span><h2>Твой район.<br/>Твои правила.</h2>{!hasArt('lobby-night')&&<p className="art-caption">Графика генерируется в отдельной сессии.<br/>Механика уже доступна для теста.</p>}</div><span className="scene-cross c1">+</span><span className="scene-cross c2">+</span></section>
    <div className="lobby-record"><div><span className="eyebrow">ЛИЧНЫЙ РЕКОРД</span><strong>{String(profile.best_wave).padStart(2,'0')} <small>ВОЛНА</small></strong></div><button className="record-link" onClick={()=>navigate('gang')}><span className="eyebrow">{profile.gang?'ТВОЯ БАНДА':'ОДНОМУ НЕ ОБЯЗАТЕЛЬНО'}</span><strong>{profile.gang?`[${profile.gang.tag}]`:'Найти своих'} <span>↗</span></strong></button></div>
    <Button className="start-run" disabled={busy} onClick={()=>void start()}><span className="start-icon">↗</span><span>{busy?'ВЫХОДИМ…':'НАЧАТЬ ВЫЛАЗКУ'}</span><span>→</span></Button>
    <div className="lobby-hint"><span className="hint-plus">+</span><p>Ты двигаешься. Герой стреляет сам.<br/><span>Улучшения — только на один забег.</span></p></div>
    <div className="lobby-footer"><span>БЕЗ ПЛАТЕЖЕЙ. БЕЗ PAY-TO-WIN.</span><span>v0.1</span></div>
   </div>:tab==='casino'?<Casino balance={profile.balance} refresh={refresh} notify={notify}/>:tab==='gang'?<GangScreen profile={profile} refresh={refresh} notify={notify} rankings={()=>setModal('rankings')}/>:<City profile={profile} refresh={refresh} notify={notify}/>}
  </main>
  {!ticket&&<nav className="bottom-nav" aria-label="Основная навигация">{([['run','Вылазка'],['casino','Казино'],['gang','Банда'],['city','Город']] as const).map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>navigate(id)}><Icon name={id} size={25}/><span>{label}</span>{tab===id&&<i/>}</button>)}</nav>}
  {toast&&<div className="toast" role="status" onClick={()=>setToast('')}>{toast}<span>×</span></div>}
  {modal==='profile'&&<ProfileModal profile={profile} onClose={()=>setModal(null)} notify={notify}/>}{modal==='rankings'&&<RankingsModal onClose={()=>setModal(null)} notify={notify}/>}
  <aside className="desktop-note"><span>STREET LEGENDS</span><p>Большой город.<br/>Маленькие пиксели.</p><small>Всё имущество — игровое.<br/>{CATALOG.length} объектов. Никаких платежей.</small></aside>
 </div>;
}
