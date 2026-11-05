import { useEffect,useState } from 'react';
import { CATALOG } from '@street/shared';
import type { Profile,Rank,LedgerEntry } from '@street/shared';
import { api } from '../app/api';
import { Modal,Panel,PagedList,Icon,money,numberText,Empty,time } from '../components/ui';
import { EffectsToggle } from '../components/EffectsToggle';

export function ProfileModal({profile,onClose,onSupport,notify}:{profile:Profile;onClose:()=>void;onSupport:()=>void;notify:(s:string)=>void}){
 const [section,setSection]=useState<'stats'|'collection'|'settings'|'ledger'>('stats');
 const [ledger,setLedger]=useState<LedgerEntry[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [vibration,setVibration]=useState(localStorage.getItem('sl-vibration')!=='off');
 useEffect(()=>{
  if(section!=='ledger')return;let live=true;setLoading(true);setError('');
  void api<LedgerEntry[]>('/wallet/ledger').then(rows=>{if(live)setLedger(rows);}).catch(e=>{if(live){setError(e.message);notify(e.message);}}).finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[section,notify]);
 const reasons:Record<string,string>={run:'Награда за вылазку',run_correction:'Доначисление за вылазку',casino_stake:'Ставка',casino_payout:'Возврат в казино',purchase:'Покупка',business:'Доход бизнеса',job:'Зарплата',gang_create:'Создание банды'};
 return <Modal title="Твоё досье" onClose={onClose}>
  <div className="profile-name"><div className="avatar large">{profile.avatar_url?<img src={profile.avatar_url} width="64" height="64" alt=""/>:profile.display_name.slice(0,1)}</div><div><h2>{profile.display_name}</h2>{profile.username&&<span className="muted">@{profile.username}</span>}</div></div>
  <div className="segmented profile-tabs">{([['stats','Досье'],['collection','Вещи'],['settings','Настройки'],['ledger','Операции']] as const).map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
  {section==='stats'&&<><Panel className="profile-wallet"><span>Кошелёк</span><strong className="profile-balance gold">${money(profile.balance)}</strong></Panel><div className="stats-grid"><div><b>{profile.best_wave}</b><span>лучшая волна</span></div><div><b>{profile.season_wave}</b><span>волна недели</span></div><div><b>{numberText(profile.total_runs)}</b><span>вылазок</span></div><div><b>{numberText(profile.total_kills)}</b><span>противников</span></div></div></>}
  {section==='collection'&&<PagedList items={profile.owned} empty={<Empty title="Пока нет вещей"/>} render={o=><div className="collection-row" key={o.item_id}><Icon name="city" size={28}/><strong>{CATALOG.find(i=>i.id===o.item_id)?.name??o.item_id}</strong><span className="lime">✓</span></div>}/>}
  {section==='settings'&&<div className="profile-settings"><label className="toggle-row">Вибрация<input type="checkbox" checked={vibration} onChange={e=>{setVibration(e.target.checked);localStorage.setItem('sl-vibration',e.target.checked?'on':'off');}}/></label><EffectsToggle compact/></div>}
  {section==='ledger'&&(loading?<p className="loading" role="status">Загрузка…</p>:error?<p className="error-text" role="alert">{error}</p>:<PagedList items={ledger} empty={<Empty title="Пока нет операций"/>} render={l=><div className="history-row" key={l.id}><span>{reasons[l.reason]??l.reason}<small>{new Date(l.created_at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span><b className={l.delta>=0?'lime':'muted'}>{l.delta>=0?'+':''}${money(l.delta)}</b></div>}/>)}
  <button className="profile-support" onClick={onSupport}>ПОДДЕРЖАТЬ ИГРУ · STARS <Icon name="next" size={18}/></button>
 </Modal>;
}

export function RankingsModal({onClose,notify}:{onClose:()=>void;notify:(s:string)=>void}){
 const [tab,setTab]=useState('players'),[ranks,setRanks]=useState<Rank[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;setLoading(true);setError('');void api<Rank[]>(`/leaderboard/${tab}`).then(rows=>{if(live)setRanks(rows);}).catch(e=>{if(live){setError(e.message);notify(e.message);}}).finally(()=>{if(live)setLoading(false);});return ()=>{live=false;};},[tab,notify]);
 return <Modal title="Легенды района" onClose={onClose}>
  <div className="segmented"><button aria-pressed={tab==='players'} onClick={()=>setTab('players')}>Игроки</button><button aria-pressed={tab==='gangs'} onClick={()=>setTab('gangs')}>Банды</button></div>
  {loading?<p className="loading" role="status">Загрузка…</p>:error?<p className="error-text" role="alert">{error}</p>:<PagedList key={tab} items={ranks} empty={<Empty title="Пока нет рекордов"/>} render={(r,i)=><div className="member-row" key={r.id}><span className={`rank-index ${i===0?'gold':''}`}>{i+1}</span><div className="member-name"><strong>{r.name}</strong>{r.duration!==undefined&&<small>{time(r.duration)}</small>}</div><b className="lime">{numberText(r.score)}</b></div>}/>}
  <details className="rules"><summary>О рейтинге</summary><p>{tab==='players'?'Лучшая волна, затем время выживания.':'Сумма лучших волн топ-10 действующих участников.'} Проверки результата базовые, не полный античит.</p></details>
 </Modal>;
}
