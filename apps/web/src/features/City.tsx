import { useState,useMemo } from 'react';
import { CATALOG,JOBS,businessIncome } from '@street/shared';
import type { Profile } from '@street/shared';
import { api } from '../app/api';
import { assetUrl,hasArt } from '../app/art';
import { Button,Panel,ScreenHeading,money,time,useClock } from '../components/ui';
export function City({profile,refresh,notify}:{profile:Profile;refresh:()=>Promise<void>;notify:(s:string)=>void}){
 const [category,setCategory]=useState('work'),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<string|null>(null);
 const offset=useMemo(()=>profile.serverNow-Date.now(),[profile.serverNow]);
 const clock=useClock(),now=clock+offset,job=profile.job,secondsLeft=job?Math.max(0,Math.ceil((job.ends_at-now)/1000)):0;
 async function action(path:string,body:unknown,message:string){setBusy(true);try{await api(path,body);await refresh();notify(message);setConfirm(null);}catch(e){notify((e as Error).message);}finally{setBusy(false);}}
 return <div className="screen"><ScreenHeading kicker="ЖИЗНЬ МЕЖДУ ВЫЛАЗКАМИ" title="Город"><p>Работай. Открывай своё. Живи красиво.</p></ScreenHeading>
  <div className="city-banner" style={hasArt('lobby-night')?{backgroundImage:`linear-gradient(90deg,#080b10f0,#080b1080),url(${assetUrl('lobby-night')})`,backgroundPosition:'center,center 70%',backgroundSize:'cover'}:undefined}><span className="eyebrow lime">ПОСЛЕ ПОЛУНОЧИ</span><h2>Своя жизнь.<br/>Своё дело.</h2><span className="eyebrow">ДЕНЬГИ ПРИХОДЯТ. РАЙОН ОСТАЁТСЯ.</span></div>
  <div className="segmented city-tabs">{[['work','Работа'],['business','Бизнес'],['car','Машины'],['home','Жильё']].map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id);setConfirm(null);}}>{label}</button>)}</div>
  {category==='work'?<>
   {job&&<Panel className="active-job"><span className="eyebrow lime">{secondsLeft?'СМЕНА ИДЁТ':'СМЕНА ЗАКОНЧЕНА'}</span><h2>{JOBS.find(j=>j.id===job.job_type)?.name}</h2><strong className="job-clock">{secondsLeft?time(secondsLeft):'Зарплата ждёт'}</strong><Button disabled={busy||secondsLeft>0} onClick={()=>void action('/jobs/claim',{id:job.id},'Зарплата в кошельке')}>{secondsLeft?'МОЖНО ИДТИ НА ВЫЛАЗКУ':'ЗАБРАТЬ ЗАРПЛАТУ →'}</Button></Panel>}
   <p className="muted small">Одна смена за раз. Работа продолжается, даже когда приложение закрыто.</p>
   {JOBS.map((j,i)=><Panel key={j.id} className="catalog-row"><span className="catalog-number">0{i+1}</span><div className="catalog-info"><h3>{j.name}</h3><p>{j.seconds/60} минут · <span className="gold">+${money(j.reward)}</span></p></div><button className="small-action" disabled={busy||!!job} onClick={()=>void action('/jobs/start',{jobType:j.id},'Смена началась')}>{job?'ЗАНЯТ':'НАЧАТЬ'}</button></Panel>)}
  </>:<>
   <p className="muted small">{category==='business'?'Доход копится до 6 часов. Один бизнес каждого вида.':'Коллекция и статус. Никаких бонусов к силе или доходу.'}</p>
   {CATALOG.filter(i=>i.category===category).map((item,i)=>{
    const owned=profile.owned.find(o=>o.item_id===item.id),income=owned?businessIncome(item.hourly,now-owned.last_claim_at):0;
    return <Panel key={item.id} className="catalog-item"><div className="row-between"><span className="catalog-number">0{i+1}</span><span className={`eyebrow ${owned?'lime':''}`}>{owned?'В КОЛЛЕКЦИИ':category==='business'?'СВОЁ ДЕЛО':'ИМУЩЕСТВО'}</span></div><h2>{item.name}</h2><p className="muted">{item.hourly?<><span className="gold">${money(item.hourly)}</span> / час · до ${money(item.hourly*6)}</>:'Твой маленький повод для гордости'}</p>
     {owned?item.hourly>0?<div className="business-claim"><strong className="gold">+${money(income)}</strong><Button secondary disabled={busy||income<1} onClick={()=>void action('/businesses/claim',{itemId:item.id},'Доход собран')}>ЗАБРАТЬ</Button></div>:<div className="owned-label">КУПЛЕНО · НАВСЕГДА ТВОЁ</div>:confirm===item.id?<div className="purchase-confirm"><p>Купить за <b className="gold">${money(item.price)}</b>? Продать обратно нельзя.</p><div className="two-actions"><Button disabled={busy} onClick={()=>void action(`/${category==='business'?'businesses':'assets'}/buy`,{itemId:item.id},`${item.name}: покупка сохранена`)}>ПОДТВЕРДИТЬ</Button><Button secondary onClick={()=>setConfirm(null)}>ОТМЕНА</Button></div></div>:<Button secondary disabled={busy||profile.balance<item.price} onClick={()=>setConfirm(item.id)}>{profile.balance<item.price?'НУЖНО':'КУПИТЬ ЗА'} ${money(item.price)}</Button>}
    </Panel>;
   })}
  </>}
 </div>;
}
