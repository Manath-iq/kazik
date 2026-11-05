import { useState,useMemo } from 'react';
import { CATALOG,JOBS,businessIncome } from '@street/shared';
import type { Profile } from '@street/shared';
import { api } from '../app/api';
import { assetUrl,hasArt } from '../app/art';
import { Button,Panel,Modal,ScreenHeading,ToolButton,PlayerFigure,Icon,money,time,useClock } from '../components/ui';
import type { FxId } from '../effects/catalog';

export function City({profile,refresh,notify}:{profile:Profile;refresh:()=>Promise<void>;notify:(s:string,fx?:FxId)=>void}){
 const [category,setCategory]=useState('work'),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string|null>(null),[info,setInfo]=useState(false);
 const offset=useMemo(()=>profile.serverNow-Date.now(),[profile.serverNow]);
 const clock=useClock(category==='business'||!!profile.job),now=clock+offset,job=profile.job;
 const currentJob=job?JOBS.find(j=>j.id===job.job_type):undefined,secondsLeft=job?Math.max(0,Math.ceil((job.ends_at-now)/1000)):0;
 const selection=CATALOG.find(item=>item.id===selected);
 async function action(path:string,body:unknown,message:string,fx?:FxId){
  if(busy)return;setBusy(true);
  try{await api(path,body);await refresh();notify(message,fx);setSelected(null);}catch(e){notify((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="screen arcade-screen city-screen">
  <ScreenHeading title="Город"><ToolButton label="О городе" icon="info" onClick={()=>setInfo(true)}/></ScreenHeading>
  <div className="segmented city-tabs">{[['work','Работа'],['business','Бизнес'],['car','Машины'],['home','Жильё']].map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);setSelected(null);}}>{label}</button>)}</div>
  {category==='work'?(job&&currentJob?<Panel className="city-work-active">
   <div className="work-emblem"><Icon name="city" size={64}/></div><h2>{currentJob.name}</h2>
   <strong className="work-timer">{secondsLeft?time(secondsLeft):'Готово'}</strong>
   <progress className="work-progress" aria-label="Ход смены" max={currentJob.seconds} value={currentJob.seconds-secondsLeft}/>
   <strong className="work-reward gold">+${money(currentJob.reward)}</strong>
   <Button disabled={busy||secondsLeft>0} onClick={()=>void action('/jobs/claim',{id:job.id},'Зарплата получена','coin')}>{busy?'ПОЛУЧАЕМ…':secondsLeft?'СМЕНА ИДЁТ':'ЗАБРАТЬ ЗАРПЛАТУ'}</Button>
  </Panel>:<div className="city-items">{JOBS.map(j=><Panel key={j.id} className="city-item job-item">
   <span className="item-glyph">{j.id==='guard'?<PlayerFigure/>:j.id==='taxi'&&hasArt('prop-car')?<img src={assetUrl('prop-car')} width="28" height="46" alt="" className="pixel-image"/>:<Icon name="run" size={36}/>}</span><div className="city-item-info"><h2>{j.name}</h2><small>{j.seconds/60} мин</small><strong className="gold">+${money(j.reward)}</strong></div>
   <button className="small-action" disabled={busy} onClick={()=>void action('/jobs/start',{jobType:j.id},'Смена началась')}>Начать</button>
  </Panel>)}</div>):<div className="city-items">{CATALOG.filter(item=>item.category===category).map(item=>{
   const owned=profile.owned.find(o=>o.item_id===item.id),income=owned?businessIncome(item.hourly,now-owned.last_claim_at):0;
   return <Panel key={item.id} className="city-item">
    <span className="item-glyph"><Icon name="city" size={36}/></span>
    <div className="city-item-info"><h2>{item.name}</h2>{item.hourly>0&&<small>${money(item.hourly)}/ч</small>}<strong className={owned?'lime':'gold'}>{owned?item.hourly>0?`+$${money(income)}`:'В коллекции':`$${money(item.price)}`}</strong></div>
    {owned?item.hourly>0?<button className="small-action claim-action" disabled={busy||income<1} onClick={()=>void action('/businesses/claim',{itemId:item.id},'Доход собран','coin')}>Забрать</button>:<span className="owned-mark" aria-label="Куплено">✓</span>:<button className="small-action" aria-label={`Купить ${item.name}`} disabled={busy} onClick={()=>setSelected(item.id)}>Купить</button>}
   </Panel>;
  })}</div>}
  {selection&&<Modal title={selection.name} onClose={()=>{if(!busy)setSelected(null);}}>
   <div className="purchase-summary"><Icon name="city" size={56}/><strong className="gold">${money(selection.price)}</strong>{selection.hourly>0&&<span className="muted">${money(selection.hourly)} в час · до 6 часов</span>}</div>
   <p className="small muted">{selection.hourly>0?'Один бизнес каждого вида.':'Только коллекция, без бонусов к силе и доходу.'} Продать обратно нельзя.</p>
   {profile.balance<selection.price&&<p className="error-text">Не хватает ${money(selection.price-profile.balance)}</p>}
   <Button disabled={busy||profile.balance<selection.price} onClick={()=>void action(`/${selection.category==='business'?'businesses':'assets'}/buy`,{itemId:selection.id},`${selection.name}: покупка сохранена`,'level')}>{busy?'ПОКУПАЕМ…':'ПОДТВЕРДИТЬ'}</Button>
  </Modal>}
  {info&&<Modal title="Город" onClose={()=>setInfo(false)}><h3>Работа</h3><p>Одна смена за раз. Продолжается, пока ты играешь или приложение закрыто.</p><h3>Бизнес</h3><p>Доход копится до 6 часов. Забирай его кнопкой — сумма сохранится в кошельке.</p><h3>Машины и жильё</h3><p>Коллекция без бонусов к бою или доходу. Продажи и передачи нет.</p></Modal>}
 </div>;
}
