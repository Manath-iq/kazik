import { useCallback,useEffect,useRef,useState } from 'react';
import type { SupportInfo,SupportOrder,SupportPayment } from '@street/shared';
import { api } from '../app/api';
import { canOpenInvoice,openStarInvoice } from '../app/telegram';
// Stars are real Telegram units, never apply the game-dollar denomination here.
import { Button,Modal,Panel,numberText } from '../components/ui';

const paymentLabels:Record<SupportPayment['status'],string>={paid:'Подтверждено',review:'Требует проверки',refund_pending:'Возврат уточняется',refunded:'Stars возвращены'};
export function SupportModal({onClose}:{onClose:()=>void}){
 const [info,setInfo]=useState<SupportInfo|null>(null),[amount,setAmount]=useState(25),[agreed,setAgreed]=useState(false);
 const [order,setOrder]=useState<SupportOrder|null>(null),[watching,setWatching]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[refundConfirm,setRefundConfirm]=useState<string|null>(null);
 const live=useRef(true),lock=useRef(false),requestKey=useRef<{id:string;stars:number}|null>(null);
 const refresh=useCallback(async()=>{const data=await api<SupportInfo>('/support');if(live.current)setInfo(data);return data;},[]);
 useEffect(()=>{
  live.current=true;void refresh().then(data=>{if(!live.current)return;setOrder(data.pendingOrder);if(data.pendingOrder?.status==='processing')setWatching(true);}).catch(e=>{if(live.current)setError(e.message);});
  return ()=>{live.current=false;};
 },[refresh]);

 useEffect(()=>{
  if(!watching||!order)return;
  let cancelled=false,inFlight=false,attempts=0,timer:number|undefined;
  const check=async()=>{
   if(cancelled||inFlight||document.hidden)return;inFlight=true;
   try{
    const saved=await api<SupportOrder>(`/support/orders/${order.id}`);if(cancelled)return;setOrder(saved);attempts++;
    if(saved.status==='paid'||saved.status==='refunded'){
     setWatching(false);setAgreed(false);requestKey.current=null;
     setMessage(saved.status==='paid'?'Спасибо за поддержку! Платёж подтверждён Telegram и сохранён. Игровой баланс не изменился.':'Этот платёж возвращён. Игровой баланс не изменился.');
     await refresh();
    }else if(attempts>=8){setWatching(false);setMessage('Подтверждение пока не пришло. Не плати повторно: проверь статус позже или напиши владельцу.');}
    else timer=window.setTimeout(()=>void check(),2000);
   }catch(e){if(!cancelled){setWatching(false);setError((e as Error).message);}}
   finally{inFlight=false;}
  };
  const visible=()=>{if(!document.hidden){clearTimeout(timer);void check();}};
  void check();document.addEventListener('visibilitychange',visible);
  return ()=>{cancelled=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
 },[watching,order?.id,refresh]);

 async function pay(){
  if(lock.current||!info||!agreed||!info.enabled||!canOpenInvoice())return;
  lock.current=true;setBusy(true);setError('');setMessage('');let opened=false;
  try{
   if(!requestKey.current||requestKey.current.stars!==amount){
    requestKey.current={id:order&&order.stars===amount&&order.expiresAt>Date.now()&&['awaiting_payment','processing'].includes(order.status)?order.id:crypto.randomUUID(),stars:amount};
   }
   const saved=await api<SupportOrder>('/support/invoices',{key:requestKey.current.id,stars:amount,termsAccepted:true,termsVersion:info.termsVersion});
   if(!live.current)return;setOrder(saved);
   if(saved.status==='paid'||saved.status==='refunded'){setWatching(true);return;}
   if(saved.status==='expired'){requestKey.current=null;throw new Error('Срок счёта истёк. Создай новый тем же действием.');}
   if(!saved.invoiceUrl)throw new Error('Счёт пока не готов. Повтори чуть позже.');
   opened=true;
   try{openStarInvoice(saved.invoiceUrl,status=>{
    if(!live.current)return;
    lock.current=false;setBusy(false);
    if(status==='paid'||status==='pending'){setMessage('Проверяем подтверждение Telegram. Пожалуйста, не плати повторно.');setWatching(true);}
    else{
     setMessage(status==='cancelled'?'Окно оплаты закрыто. Платёж не подтверждён.':'Telegram не подтвердил оплату. Проверь статус перед повтором.');
     void api<SupportOrder>(`/support/orders/${saved.id}`).then(current=>{if(live.current){setOrder(current);if(current.status==='paid'||current.status==='processing')setWatching(true);}}).catch(e=>{if(live.current)setError(e.message);});
    }
   });}catch(e){opened=false;throw e;}
  }catch(e){if(live.current)setError((e as Error).message);}
  finally{if(!opened){lock.current=false;if(live.current)setBusy(false);}}
 }
 async function refund(chargeId:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const saved=await api<SupportPayment>('/support/refunds',{chargeId});if(!live.current)return;
   setRefundConfirm(null);setMessage(saved.status==='refunded'?'Возврат подтверждён. Stars возвращены в Telegram.':'Запрос возврата сохранён. Telegram ещё не подтвердил результат. Повторная проверка доступна через 30 секунд.');
   await refresh();
  }catch(e){if(live.current)setError((e as Error).message);}
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 const blocked=busy||watching||order?.status==='processing';
 return <Modal title="Поддержать игру" onClose={onClose}>
  <div className="support-intro"><span className="eyebrow gold">ИГРА ОСТАЁТСЯ БЕСПЛАТНОЙ</span><h3>Район живёт благодаря тебе.</h3><p className="muted">Добровольная поддержка разработки. Без игровых наград, подписки и преимущества перед другими.</p></div>
  {!info?<><p className="loading" role="status">Загружаем условия и историю…</p>{error&&<Button secondary onClick={()=>{setError('');void refresh().catch(e=>setError(e.message));}}>ПОВТОРИТЬ</Button>}</>:<>
   <Panel className="support-boundary"><strong>Stars ≠ игровые доллары</strong><p>Донат не пополняет $, не меняет доход, бой, казино и рейтинг.</p></Panel>
   {!info.enabled||!canOpenInvoice()?<p className="virtual-notice">{info.enabled?'Для оплаты открой игру в актуальном Telegram.':'Приём новых платежей сейчас недоступен. История и возвраты сохраняются.'}</p>:null}
   <fieldset className="support-choice" disabled={!info.enabled||!canOpenInvoice()||Boolean(blocked)}><legend>Разовая поддержка в Telegram Stars</legend><div className="support-amounts">{info.amounts.map(stars=><label key={stars}><input type="radio" name="support-amount" value={stars} checked={amount===stars} onChange={()=>{setAmount(stars);setAgreed(false);requestKey.current=null;}}/><span><b>{numberText(stars)}</b><small>STARS</small></span></label>)}</div></fieldset>
   <details className="support-terms"><summary>Условия оплаты и возврата</summary><ol>{info.terms.map(term=><li key={term}>{term}</li>)}</ol><p className="small muted">Версия {info.termsVersion}. Обработчик платежа — Telegram; получатель поддержки — владелец STREET LEGENDS.</p></details>
   <label className="support-consent"><input type="checkbox" checked={agreed} disabled={Boolean(blocked)||!info.enabled||!canOpenInvoice()} onChange={e=>setAgreed(e.target.checked)}/><span>Я прочитал условия и согласен с разовой оплатой выбранной суммы настоящими Stars.</span></label>
   <Button disabled={!agreed||Boolean(blocked)||!info.enabled||!canOpenInvoice()} onClick={()=>void pay()}>{busy?'ОБРАБАТЫВАЕМ…':watching?'ПРОВЕРЯЕМ ОПЛАТУ…':`ПОДДЕРЖАТЬ · ${amount} STARS`}</Button>
   {order&&!['paid','refunded','expired'].includes(order.status)&&<div className="support-pending"><p className="small muted">Есть незавершённый счёт на {order.stars} Stars. Сначала проверь его статус.</p><Button secondary disabled={busy||watching} onClick={()=>{setError('');setWatching(true);}}>ПРОВЕРИТЬ СТАТУС</Button><small>Заказ {order.id}</small></div>}
   {message&&<p className="support-status" role="status">{message}</p>}
   <section className="support-history" aria-labelledby="support-history-title"><div className="support-history-heading"><h3 id="support-history-title">Твоя поддержка</h3><button type="button" className="support-link" disabled={busy} onClick={()=>{setError('');void refresh().catch(e=>setError(e.message));}}>Обновить</button></div>{info.history.length?info.history.map(payment=><div className="support-payment" key={payment.chargeId}><div><strong>{numberText(payment.stars)} {payment.currency==='XTR'?'Stars':payment.currency}</strong><span className={payment.status==='refunded'?'muted':'gold'}>{paymentLabels[payment.status]}</span><small>{new Date(payment.receivedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></div>{payment.status!=='refunded'&&payment.currency==='XTR'&&(refundConfirm===payment.chargeId?<div className="support-refund-confirm"><p>Вернуть все {payment.stars} Stars в Telegram?</p><Button disabled={busy} onClick={()=>void refund(payment.chargeId)}>ВЕРНУТЬ {payment.stars} STARS</Button><button className="support-link" disabled={busy} onClick={()=>setRefundConfirm(null)}>Отмена</button></div>:<button className="support-link" disabled={busy} onClick={()=>payment.status==='refund_pending'?void refund(payment.chargeId):setRefundConfirm(payment.chargeId)}>{payment.status==='refund_pending'?'Проверить возврат':'Вернуть Stars'}</button>)}</div>):<p className="muted small">Платежей пока нет. Играть можно без поддержки.</p>}</section>
   {info.supportUrl&&<a className="support-contact" href={info.supportUrl} target="_blank" rel="noreferrer">Вопрос по оплате или возврату →</a>}
  </>}
  {error&&<p className="error-text" role="alert">{error}</p>}
 </Modal>;
}
