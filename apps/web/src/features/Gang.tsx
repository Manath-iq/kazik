import { useEffect,useState } from 'react';
import type { Profile,Rank } from '@street/shared';
import { BALANCE } from '@street/shared';
import { api } from '../app/api';
import { Button,Panel,Modal,ScreenHeading,ToolButton,PagedList,money,numberText,Empty,Icon } from '../components/ui';

export function GangScreen({profile,refresh,notify,rankings}:{profile:Profile;refresh:()=>Promise<void>;notify:(s:string)=>void;rankings:()=>void}){
 const [name,setName]=useState(''),[tag,setTag]=useState(''),[invite,setInvite]=useState(()=>new URLSearchParams(location.search).get('tgWebAppStartParam')??''),[link,setLink]=useState(''),[busy,setBusy]=useState(false);
 const [dialog,setDialog]=useState<'create'|'join'|'invite'|'roster'|'rules'|null>(null),[roster,setRoster]=useState<'members'|'recent'>('members');
 const g=profile.gang,leader=g?.owner_id===profile.id;
 const [rank,setRank]=useState<number|null>(null);
 useEffect(()=>{if(!g)return;let live=true;void api<Rank[]>('/leaderboard/gangs').then(rows=>{if(live){const index=rows.findIndex(r=>r.id===g.id);setRank(index<0?null:index+1);}}).catch(()=>{});return ()=>{live=false;};},[g?.id,g?.season_score]);
 async function action(path:string,body:unknown,message:string,close=true){
  if(busy)return;setBusy(true);try{await api(path,body);await refresh();notify(message);if(close)setDialog(null);}catch(e){notify((e as Error).message);}finally{setBusy(false);}
 }
 async function makeInvite(){
  if(!g||busy)return;setBusy(true);setLink('');setDialog('invite');
  try{const r=await api<{token:string;url:string|null}>(`/gangs/${g.id}/invite`,{});setLink(r.url??r.token);}catch(e){notify((e as Error).message);setDialog(null);}finally{setBusy(false);}
 }
 return <div className="screen arcade-screen gang-screen">
  <ScreenHeading title="Банда"><ToolButton label="Рейтинг банд" icon="cup" onClick={rankings}/><ToolButton label="О банде" icon="info" onClick={()=>setDialog('rules')}/></ScreenHeading>
  {g?<>
   <Panel className="gang-stage">
    <div className="gang-emblem"><Icon name="gang" size={96}/></div><span className="gang-tag">{g.tag}</span><h2>{g.name}</h2>
    {rank&&<span className="gang-rank">#{rank} в рейтинге</span>}
    <div className="gang-metrics"><div><strong>{numberText(g.season_score)}</strong><span>очки недели</span></div><div><strong className="cyan">{numberText(g.lifetime_xp)}</strong><span>XP банды</span></div></div>
   </Panel>
   <div className="gang-actions"><button className="action-tile" onClick={()=>{setRoster('members');setDialog('roster');}}><Icon name="members" size={22}/><span>Состав <b>{g.members.length}/{BALANCE.gangSize}</b></span></button><button className="action-tile" onClick={()=>{setRoster('recent');setDialog('roster');}}><Icon name="history" size={22}/><span>Вылазки</span></button></div>
   {leader&&<Button disabled={busy} onClick={()=>void makeInvite()}>ПРИГЛАСИТЬ</Button>}
  </>:<>
   <div className="gang-empty-stage"><div className="gang-emblem"><Icon name="gang" size={112}/></div><h2>Пока без банды</h2></div>
   <div className="screen-actions"><Button onClick={()=>setDialog('create')}>СОЗДАТЬ БАНДУ</Button><Button secondary onClick={()=>setDialog('join')}>ВСТУПИТЬ ПО КОДУ</Button></div>
  </>}
  {dialog==='create'&&<Modal title="Создать банду" onClose={()=>setDialog(null)}><form onSubmit={e=>{e.preventDefault();void action('/gangs',{name,tag},'Банда создана');}}><label>Название<input name="gang-name" minLength={3} maxLength={24} required value={name} placeholder="Ночной маршрут" autoComplete="off" onChange={e=>setName(e.target.value)}/></label><label>Тег · 2–5 букв или цифр<input name="gang-tag" minLength={2} maxLength={5} required pattern="[A-Za-zА-Яа-яЁё0-9]{2,5}" value={tag} placeholder="NIGHT" autoComplete="off" spellCheck={false} onChange={e=>setTag(e.target.value)}/></label><Button disabled={busy||profile.balance<BALANCE.gangCost}>{busy?'СОЗДАЁМ…':`СОЗДАТЬ · $${money(BALANCE.gangCost)}`}</Button>{profile.balance<BALANCE.gangCost&&<p className="error-text">Не хватает ${money(BALANCE.gangCost-profile.balance)}</p>}</form></Modal>}
  {dialog==='join'&&<Modal title="Вступить в банду" onClose={()=>setDialog(null)}><form onSubmit={e=>{e.preventDefault();let token=invite.trim();try{token=new URL(token).searchParams.get('startapp')??token;}catch{/* A code, not a URL. */}void action('/gangs/join',{token:token.replace(/^gang_/,'')},'Ты в банде');}}><label>Код или ссылка<input name="gang-invite" required value={invite} placeholder="Приглашение от лидера" autoComplete="off" spellCheck={false} onChange={e=>setInvite(e.target.value)}/></label><Button disabled={busy}>{busy?'ВСТУПАЕМ…':'ВСТУПИТЬ'}</Button></form></Modal>}
  {dialog==='invite'&&<Modal title="Пригласить в банду" onClose={()=>setDialog(null)}>{link?<><label htmlFor="invite-link">Приглашение на 7 дней<input id="invite-link" readOnly value={link} onFocus={e=>e.target.select()}/></label><Button onClick={()=>{void navigator.clipboard.writeText(link).then(()=>notify('Приглашение скопировано')).catch(()=>notify('Выдели ссылку и скопируй вручную'));}}>СКОПИРОВАТЬ</Button></>:<p role="status">Создаём приглашение…</p>}</Modal>}
  {dialog==='roster'&&g&&<Modal title={g.name} onClose={()=>setDialog(null)}>
   <div className="segmented"><button aria-pressed={roster==='members'} onClick={()=>setRoster('members')}>Состав · {g.members.length}</button><button aria-pressed={roster==='recent'} onClick={()=>setRoster('recent')}>Вылазки</button></div>
   {roster==='members'?<PagedList items={g.members} render={(m,i)=><div className="member-row" key={m.user_id}><span className="rank-index">{i+1}</span><div className="member-name"><strong>{m.display_name}{m.user_id===profile.id?' · ты':''}</strong><small>{m.role==='leader'?'Лидер':'Участник'}</small></div><b className="lime">{m.best_wave}</b>{leader&&m.user_id!==profile.id&&<button className="icon-button" aria-label={`Удалить ${m.display_name}`} disabled={busy} onClick={()=>{if(window.confirm(`Удалить ${m.display_name} из банды?`))void action(`/gangs/${g.id}/kick`,{userId:m.user_id},'Участник удалён',false);}}><Icon name="close" size={18}/></button>}</div>}/>:<PagedList items={g.recent} empty={<Empty title="Пока нет вылазок"/>} render={r=><div className="history-row" key={r.id}><span>Волна {r.wave}<small>{r.kills} противников</small></span><b className="cyan">+{r.gang_xp} XP</b></div>}/>}
  </Modal>}
  {dialog==='rules'&&<Modal title="Банда" onClose={()=>setDialog(null)}><p>До 20 человек. Очки недели — сумма лучших волн десяти сильнейших действующих участников. Повторные забеги не складываются.</p><p>Сезон начинается в понедельник 00:00 UTC. XP банды копится и не сбрасывается.</p><p className="muted small">Забег связан с составом на старте. После смены банды — 24 часа до нового вступления. Общего банка и усилений персонажа нет.</p>{g&&!leader&&<button className="quiet-button danger" disabled={busy} onClick={()=>{if(window.confirm('Выйти из банды? Сезонный вклад исчезнет, новое вступление через 24 часа.'))void action('/gangs/leave',{},'Ты покинул банду');}}>Покинуть банду</button>}</Modal>}
 </div>;
}
