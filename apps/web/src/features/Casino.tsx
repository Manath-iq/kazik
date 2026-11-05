import { useCallback,useEffect,useRef,useState } from 'react';
import { handValue,toGameDollars,fromGameDollars,LIVE_CASINO,stakeSchema } from '@street/shared';
import type { CasinoRound,RouletteChoice,LiveGame,LiveBet,LiveBetInput,LiveSnapshot } from '@street/shared';
import { api,ApiError } from '../app/api';
import { haptic } from '../app/haptics';
import { Button,Panel,Modal,ToolButton,PagedList,money,useClock,Empty } from '../components/ui';
import { useLiveCasino } from './useLiveCasino';
import { RouletteVisual,CrashVisual,liveMultiplier } from './CasinoVisuals';
type Props={refresh:()=>Promise<void>;notify:(message:string)=>void;balance:number};
const names={roulette:'Рулетка',crash:'Ракета',blackjack:'Блэкджек'};
const readStake=()=>{try{return localStorage.getItem('sl-casino-stake')??'50000';}catch{return '50000';}};
export function Casino(props:Props){
 const [game,setGame]=useState<CasinoRound['game_type']>('roulette'),[dialog,setDialog]=useState<'rules'|'history'|null>(null);
 return <div className={`screen arcade-screen casino-screen casino-${game}`}>
  <h1 className="sr-only">Казино</h1>
  <div className="casino-toolbar"><div className="segmented" aria-label="Игра">{(['roulette','crash','blackjack'] as const).map(id=><button aria-pressed={game===id} key={id} onClick={()=>setGame(id)}>{names[id]}</button>)}</div><ToolButton label="История казино" icon="history" onClick={()=>setDialog('history')}/><ToolButton label="Правила казино" icon="info" onClick={()=>setDialog('rules')}/></div>
  {game==='blackjack'?<Blackjack key={game} {...props}/>:<LiveTable key={game} game={game} {...props}/>}
  <p className="virtual-notice">Игровая валюта · без покупки и вывода</p>
  {dialog==='rules'&&<Modal title={names[game]} onClose={()=>setDialog(null)}><p>{game==='roulette'?'Общий раунд: 10 секунд на ставки, затем колесо крутится само. 37 равновероятных чисел. Красное/чёрное — возврат ×2; ноль/число — ×36. Возврат включает ставку.':game==='crash'?'Общий полёт стартует после 10 секунд приёма ставок. Забирай до крушения; время получения запроса решает сервер. Закрыл игру без вывода — ставка проиграет. Автозабора нет.':'Одна колода, туз — 1 или 11. Дилер стоит на любом 17. Блэкджек: возврат ×2,5; победа ×2; ничья ×1. Через 2 минуты сервер выполняет «Хватит».'}</p>{game==='crash'&&<p className="small muted">Рост exp(0,1 × секунды), максимум ×100. Точка = max(1, min(100, floor(0,97/(1−U) ×100)/100)), U равномерно в [0;1). Примерно 3,96% полётов падают на ×1. На сетке 0,01, при x&gt;1: P(точка ≥ x)=0,97/x. Вывод строго до точки; задержка сети может помешать.</p>}<p className="small muted">Одна подтверждённая ставка на раунд. ${money(10)}–${money(1000)}, шаг ${money(2)}. «ВА-БАНК» выбирает доступный баланс в пределах лимита стола. Выбор суммы не создаёт ставки автоматически.</p><p className="virtual-notice">Без вывода, обмена, переводов и реальных призов.</p></Modal>}
  {dialog==='history'&&<CasinoHistory game={game} onClose={()=>setDialog(null)} {...props}/>}
 </div>;
}
function StakePanel({draft,setDraft,balance,disabled}:{draft:string;setDraft:(value:string)=>void;balance:number;disabled:boolean}){
 const all=Math.max(0,Math.floor(Math.min(balance,LIVE_CASINO.maxStake)/2)*2);
 return <div className="live-stakes"><div className="quick-stakes">{[10,50,100].map(n=><button key={n} aria-pressed={Number(draft)===toGameDollars(n)} disabled={disabled} onClick={()=>setDraft(String(toGameDollars(n)))}>${money(n)}</button>)}</div><div className="stake-entry"><label>Ставка $<input aria-label="Сумма ставки" type="number" inputMode="numeric" min={toGameDollars(10)} max={toGameDollars(1000)} step={toGameDollars(2)} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)}/></label><button className="all-in" disabled={disabled||all<10} onClick={()=>setDraft(String(toGameDollars(all)))}>ВА-БАНК</button></div></div>;
}
function useStake(){const [draft,set]=useState(readStake);return [draft,(value:string)=>{set(value);try{localStorage.setItem('sl-casino-stake',value);}catch{/* Private-mode storage. */}}] as const;}
function betText(bet:LiveBet|null){if(!bet)return '';if(bet.status==='accepted')return `Принято · $${money(bet.stake)}`;if(bet.status==='cashed_out')return `Забрано ×${bet.cashout_multiplier!.toFixed(2)} · $${money(bet.payout)}`;return bet.payout>0?`Выигрыш · $${money(bet.payout)}`:'Ставка не сыграла';}
function LiveTable({game,refresh,notify,balance}:Props&{game:LiveGame}){
 const live=useLiveCasino(game),state=live.snapshot,round=state?.round;
 const [draft,setDraft]=useStake(),[choice,setChoice]=useState<RouletteChoice>('red'),[choiceOpen,setChoiceOpen]=useState(false),[number,setNumber]=useState('0'),[busy,setBusy]=useState(false);
 const guard=useRef(false),pending=useRef<LiveBetInput|null>(null),phase=useRef(''),notified=useRef<string|null>(null);
 const clock=useClock(true,100),now=clock+live.offset.current,stake=fromGameDollars(Number(draft)),valid=stakeSchema.safeParse(stake).success;
 const bet=state?.bet??null,displayBet=bet??state?.previousBet??null,canBet=live.connected&&round?.phase==='betting'&&now<round.bettingEndsAt&&!bet;
 const available=state?.balance??balance,mult=round?liveMultiplier(round,now):1;
 const currentChoice=typeof choice==='number'?`№ ${choice}`:({red:'Красное',black:'Чёрное',zero:'Ноль'})[choice];
 useEffect(()=>{
  if(!round)return;const key=`${round.id}:${round.phase}`;
  if(phase.current&&phase.current!==key){if(round.phase==='playing')haptic('spin');else if(round.phase==='result')haptic(game==='crash'?'crash':'stop');}
  phase.current=key;
  if(pending.current&&pending.current.roundId!==round.id)pending.current=null;
 },[round?.id,round?.phase,game]);
 useEffect(()=>{
  if(!state)return;const key=displayBet?`${displayBet.id}:${displayBet.status}`:'';
  if(notified.current===null){notified.current=key;return;}
  if(notified.current===key)return;notified.current=key;
  if(!displayBet||displayBet.status==='accepted')return;
  haptic(displayBet.payout>0?'success':'failure');void refresh().catch(()=>{});
 },[displayBet?.id,displayBet?.status,refresh]);
 async function action(cashout=false){
  if(guard.current||!round)return;guard.current=true;setBusy(true);haptic('press');
  try{
   let next:LiveSnapshot;
   if(cashout&&bet)next=await api(`/casino/live/${game}/cashout`,{betId:bet.id,roundId:round.id});
   else{
    const request={roundId:round.id,stake,...(game==='roulette'?{choice}:{})};
    if(!pending.current||JSON.stringify({...pending.current,key:undefined})!==JSON.stringify(request))pending.current={...request,key:crypto.randomUUID()};
    next=await api(`/casino/live/${game}/bet`,pending.current);pending.current=null;
   }
   live.setSnapshot(next);haptic(cashout?'success':'bet');await refresh();
  }catch(e){notify((e as Error).message);haptic('failure');if(e instanceof ApiError&&e.status<500)pending.current=null;await live.sync().catch(()=>{});}
  finally{guard.current=false;setBusy(false);}
 }
 const seconds=round?Math.max(0,Math.ceil(((round.phase==='betting'?round.bettingEndsAt:round.phaseEndsAt??now)-now)/1000)):0;
 return <>
  <div className="live-phase"><span className={`connection-dot ${live.connected?'online':''}`} aria-label={live.connected?'Соединение установлено':'Нет соединения'}/><strong>{!live.connected?'ВОССТАНАВЛИВАЕМ СВЯЗЬ':round?.phase==='betting'?'СТАВКИ ОТКРЫТЫ':round?.phase==='playing'?game==='roulette'?'КОЛЕСО КРУТИТСЯ':'ОБЩИЙ ПОЛЁТ':'РЕЗУЛЬТАТ'}</strong><span>{round?.phase==='betting'?`${seconds} с`:round?`#${round.sequence}`:'…'}</span></div>
  <Panel className="casino-board live-board">{round?(game==='roulette'?<RouletteVisual round={round} offset={live.offset}/>:<CrashVisual round={round} offset={live.offset}/>):<div className="casino-loading" role="status"><span className="loading-pixels">▪ ▪ ▪</span>Подключаем стол…</div>}<div className={`casino-result ${displayBet?.payout?'lime':''}`} role="status">{live.error||betText(displayBet)||(round?.phase==='betting'?'Выбери сумму и подтверди ставку':'Можно наблюдать без ставки')}</div></Panel>
  <div className="recent-results" aria-label="Общие результаты">{state?.recent.slice(0,7).map(r=><span key={r.id}>{game==='roulette'?r.number:`×${r.crashPoint?.toFixed(2)}`}</span>)}</div>
  <div className="casino-controls live-controls">
   {game==='roulette'&&<div className="live-choices">{(['red','black','zero'] as const).map((v,i)=><button key={v} aria-pressed={choice===v} className={v} disabled={!!bet||busy} onClick={()=>setChoice(v)}>{['Красное','Чёрное','Ноль'][i]}</button>)}<button aria-pressed={typeof choice==='number'} disabled={!!bet||busy} onClick={()=>setChoiceOpen(true)}>{typeof choice==='number'?`№ ${choice}`:'Число'}</button></div>}
   <StakePanel draft={draft} setDraft={setDraft} balance={available} disabled={busy||!!bet}/>
   {game==='crash'&&round?.phase==='playing'&&bet?.status==='accepted'?<Button data-haptic="off" className="cashout" disabled={busy||!live.connected} onClick={()=>void action(true)}>{busy?'ЗАБИРАЕМ…':`ЗАБРАТЬ $${money(Math.floor(bet.stake*mult))}`}</Button>:<Button data-haptic="off" disabled={busy||!canBet||!valid||available<stake} onClick={()=>void action()}>{busy?'ПРИНИМАЕМ…':bet?'СТАВКА ПРИНЯТА':round?.phase==='betting'?'ПОДТВЕРДИТЬ СТАВКУ':'СЛЕДУЮЩИЙ РАУНД СКОРО'}</Button>}
  </div>
  {choiceOpen&&<Modal title="Ставка на число" onClose={()=>setChoiceOpen(false)}><label>Число от 0 до 36<input aria-label="Ставка на число" type="number" inputMode="numeric" min="0" max="36" step="1" value={number} onChange={e=>setNumber(e.target.value)}/></label><Button disabled={number===''||!Number.isInteger(Number(number))||Number(number)<0||Number(number)>36} onClick={()=>{setChoice(Number(number));setChoiceOpen(false);}}>ВЫБРАТЬ № {number}</Button><small className="muted">Сейчас выбрано: {currentChoice}. Ставка — только после подтверждения.</small></Modal>}
 </>;
}
function Blackjack({refresh,notify,balance}:Props){
 const [round,setRound]=useState<CasinoRound|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[draft,setDraft]=useStake();
 const guard=useRef(false),key=useRef(crypto.randomUUID()),active=round?.status==='active',stake=fromGameDollars(Number(draft));
 const load=useCallback(async()=>{const rows=await api<CasinoRound[]>('/casino/history');setRound(rows.find(r=>r.status==='active'&&r.game_type==='blackjack')??null);},[]);
 useEffect(()=>{void load().catch(e=>notify(e.message)).finally(()=>setLoading(false));},[load,notify]);
 async function act(action?:'hit'|'stand'){
  if(guard.current)return;guard.current=true;setBusy(true);
  try{const result=await api<CasinoRound>(action&&round?`/casino/blackjack/${round.id}/${action}`:'/casino/blackjack/start',action&&round?{version:round.version}:{key:key.current,stake});setRound(result);if(!action)key.current=crypto.randomUUID();if(result.status==='finished')haptic(result.payout>=result.stake?'success':'failure');await refresh();}
  catch(e){notify((e as Error).message);await load().catch(()=>{});}finally{guard.current=false;setBusy(false);}
 }
 return <><Panel className="casino-board"><div className="blackjack-table"><CardHand label="Дилер" cards={round?.dealer??[]} hidden={!!active}/><div className="table-divider"/><CardHand label="Твоя рука" cards={round?.player??[]}/></div><div className="casino-result" role="status">{loading?'Загружаем раздачу…':round?.status==='finished'?`${round.result} · $${money(round.payout)}`:' '}</div></Panel><div className="casino-controls"><StakePanel draft={draft} setDraft={setDraft} balance={balance} disabled={busy||!!active}/>{active?<div className="two-actions"><Button disabled={busy} onClick={()=>void act('hit')}>ВЗЯТЬ</Button><Button secondary disabled={busy} onClick={()=>void act('stand')}>ХВАТИТ</Button></div>:<Button disabled={busy||loading||!stakeSchema.safeParse(stake).success||balance<stake} onClick={()=>void act()}>{busy?'РАЗДАЁМ…':'РАЗДАТЬ КАРТЫ'}</Button>}</div></>;
}
function CardHand({label,cards,hidden=false}:{label:string;cards:number[];hidden?:boolean}){
 const suits=['\u2660\uFE0E','\u2665\uFE0E','\u2663\uFE0E','\u2666\uFE0E'],ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
 return <div className="card-hand"><span className="eyebrow">{label} {cards.length?`· ${handValue(cards)}`:''}</span><div className="playing-cards">{cards.length?cards.map((card,i)=><div key={i} className={`playing-card ${Math.floor(card/13)%2?'red-card':''}`}><span>{ranks[card%13]}</span><b>{suits[Math.floor(card/13)]}</b></div>):<div className="card-slot">SL</div>}{hidden&&<div className="card-back">SL</div>}</div></div>;
}
function CasinoHistory({game,onClose,refresh,notify}:Props&{game:CasinoRound['game_type'];onClose:()=>void}){
 const [rows,setRows]=useState<(LiveBet|CasinoRound)[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;void Promise.all([game==='blackjack'?Promise.resolve([]):api<LiveBet[]>(`/casino/live/${game}/history`),api<CasinoRound[]>('/casino/history')]).then(([shared,old])=>{if(live)setRows([...shared,...old.filter(r=>r.game_type===game)].sort((a,b)=>('placed_at' in b?b.placed_at:b.started_at)-('placed_at' in a?a.placed_at:a.started_at)));}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return ()=>{live=false;};},[game]);
 async function legacyCashout(r:CasinoRound){try{const result=await api<CasinoRound>(`/casino/crash/${r.id}/cashout`,{});setRows(old=>old.map(row=>row.id===r.id?result:row));await refresh();}catch(e){notify((e as Error).message);}}
 return <Modal title="История казино" onClose={onClose}>{loading?<p role="status">Загрузка…</p>:error?<p className="error-text" role="alert">{error}</p>:<PagedList items={rows} empty={<Empty title="Пока нет раундов"/>} render={r=><div className="history-row" key={r.id}><span>{'game' in r?names[r.game]:names[r.game_type]}<small>{'game' in r?betText(r):r.result??(r.number===undefined?'Старая раздача':`Число ${r.number}`)}</small>{'game_type' in r&&r.game_type==='crash'&&r.status==='active'&&<button className="quiet-button" onClick={()=>void legacyCashout(r)}>Забрать старую ставку</button>}</span><strong className={r.payout>r.stake?'lime':'muted'}>{r.status==='accepted'||r.status==='active'?'В игре':`${r.payout-r.stake>=0?'+':''}$${money(r.payout-r.stake)}`}</strong></div>}/>}</Modal>;
}
