import { useEffect,useRef,useState } from 'react';
import { crashMultiplier,handValue,rouletteColor,toGameDollars,fromGameDollars } from '@street/shared';
import type { CasinoRound,RouletteChoice } from '@street/shared';
import { api } from '../app/api';
import { assetUrl,hasArt } from '../app/art';
import { Button,Panel,Modal,ToolButton,PagedList,money,useClock,Empty } from '../components/ui';
type Props={refresh:()=>Promise<void>;notify:(message:string)=>void;balance:number};
const wheelOrder=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export function Casino({refresh,notify,balance}:Props){
 const [game,setGame]=useState<CasinoRound['game_type']>('roulette'),[stake,setStake]=useState(50),[choice,setChoice]=useState<RouletteChoice>('red');
 const [history,setHistory]=useState<CasinoRound[]>([]),[round,setRound]=useState<CasinoRound|null>(null),[busy,setBusy]=useState(false),[spinning,setSpinning]=useState(false),[rotation,setRotation]=useState(0),[offset,setOffset]=useState(0);
 const [dialog,setDialog]=useState<'rules'|'history'|'stake'|'choice'|null>(null),[stakeDraft,setStakeDraft]=useState('50000'),[numberDraft,setNumberDraft]=useState('');
 const spinTimer=useRef<number|null>(null);
 useEffect(()=>()=>{if(spinTimer.current!==null)clearTimeout(spinTimer.current);},[]);
 const now=useClock(round?.game_type==='crash'&&round.status==='active',100);
 const active=round?.status==='active',mult=round?.game_type==='crash'?(active?crashMultiplier(now+offset-round.started_at):round.payout?round.payout/round.stake:round.crash_point??1):1;
 const flight=Math.min(1,Math.log(Math.max(1,mult))/Math.log(100)),flightX=(1-flight)**2*20+2*(1-flight)*flight*180+flight**2*280,flightY=(1-flight)**2*170+2*(1-flight)*flight*162+flight**2*30;
 async function load(){const rows=await api<CasinoRound[]>('/casino/history');setHistory(rows);const current=rows.find(r=>r.status==='active');if(current){setRound(current);setStake(current.stake);setGame(current.game_type);setOffset(current.serverNow-Date.now());}}
 useEffect(()=>{void load().catch(e=>notify(e.message));},[]); // eslint does not assume a hook dependency plugin
 useEffect(()=>{
  if(!active||round?.game_type!=='crash')return;
  let stopped=false;
  const id=setInterval(()=>{if(document.hidden)return;void api<CasinoRound>(`/casino/crash/${round.id}`).then(r=>{if(stopped)return;setRound(r);setOffset(r.serverNow-Date.now());if(r.status!=='active'){void refresh();void load();}}).catch(()=>{});},1500);
  return ()=>{stopped=true;clearInterval(id);};
 },[round?.id,active]);
 async function act(action?:'hit'|'stand'|'cashout'){
  if(busy)return;setBusy(true);
  try{
   let result:CasinoRound;
   if(action&&round)result=await api<CasinoRound>(`/casino/${round.game_type}/${round.id}/${action}`,action==='cashout'?{}:{version:round.version});
   else{if(game==='roulette')setSpinning(true);result=await api<CasinoRound>(`/casino/${game}/${game==='roulette'?'spin':'start'}`,{key:crypto.randomUUID(),stake,...(game==='roulette'?{choice}:{})});}
   setOffset(result.serverNow-Date.now());setRound(result);
   if(result.game_type==='roulette'&&result.number!==undefined){const index=wheelOrder.indexOf(result.number);setRotation(prev=>prev+(360-prev%360)+1080-index/37*360);spinTimer.current=window.setTimeout(()=>setSpinning(false),1800);}
   await refresh();await load();
  }catch(e){setSpinning(false);notify((e as Error).message);await load().catch(()=>{});}finally{setBusy(false);}
 }
 const resultText=round?.status==='finished'&&!spinning?(round.result??(round.payout?`Выпало ${round.number}. Возврат $${money(round.payout)}`:`Выпало ${round.number}. Ставка не сыграла`)):'';
 const choiceLabel=typeof choice==='number'?`Число ${choice}`:({red:'Красное',black:'Чёрное',zero:'Ноль'})[choice];
 const draftStake=fromGameDollars(Number(stakeDraft)),validDraft=Number.isInteger(draftStake)&&draftStake>=10&&draftStake<=1000&&draftStake%2===0;
 const chosenNumber=Number(numberDraft),validNumber=numberDraft!==''&&Number.isInteger(chosenNumber)&&chosenNumber>=0&&chosenNumber<=36;
 return <div className={`screen arcade-screen casino-screen casino-${game}`}>
  <h1 className="sr-only">Казино</h1>
  <div className="casino-toolbar"><div className="segmented" aria-label="Игра">{([['roulette','Рулетка'],['crash','Ракетка'],['blackjack','Блэкджек']] as const).map(([id,label])=><button aria-pressed={game===id} disabled={!!active||spinning} key={id} onClick={()=>{setGame(id);setRound(null);}}>{label}</button>)}</div><ToolButton label="История казино" icon="history" onClick={()=>setDialog('history')}/><ToolButton label="Правила казино" icon="info" onClick={()=>setDialog('rules')}/></div>
  <Panel className="casino-board">
   {game==='roulette'&&<div className="roulette-stage"><div className="roulette-pointer">▼</div><div className="roulette-wheel" style={{transform:`rotate(${rotation}deg)`}}>{wheelOrder.map((n,i)=><span key={n} className={`wheel-number ${rouletteColor(n)}`} style={{transform:`rotate(${i*360/37}deg) translateY(calc(var(--wheel-size) * -.435)) rotate(90deg)`}}>{n}</span>)}<div className="wheel-center"><span>{round?.number!==undefined&&!spinning?round.number:'SL'}</span></div></div></div>}
   {game==='crash'&&<div className={`crash-stage ${round?.status==='finished'&&!round.payout?'crashed':''}`}>
    <div className="crash-value">×{mult.toFixed(2)}</div>
    <svg viewBox="0 0 320 190" aria-hidden="true"><path className="chart-axis" d="M20 10V170H310"/><path className="flight-path" d="M20 170 Q180 162 280 30" pathLength="1" style={{strokeDasharray:1,strokeDashoffset:1-flight}}/>
     {hasArt('rocket')&&<image href={assetUrl('rocket')} width="54" height="54" x="-27" y="-27" transform={`translate(${flightX},${flightY})`}/>}
    </svg>
    {!hasArt('rocket')&&<span className="rocket-placeholder" aria-hidden="true">↗</span>}
   </div>}
   {game==='blackjack'&&<div className="blackjack-table"><CardHand label="Дилер" cards={round?.dealer??[]} hidden={!!active}/><div className="table-divider"/><CardHand label="Твоя рука" cards={round?.player??[]}/></div>}
   <div className="casino-result" role="status">{spinning?'Колесо крутится…':resultText||' '}</div>
  </Panel>
  <div className="casino-controls"><div className="wager-row">
   {game==='roulette'&&<button className={`wager-choice ${typeof choice==='string'?choice:''}`} disabled={!!active||busy||spinning} onClick={()=>{setNumberDraft(typeof choice==='number'?String(choice):'');setDialog('choice');}} aria-label={`Цель ставки: ${choiceLabel}`}><small>На что</small><strong>{choiceLabel}<span>⌄</span></strong></button>}
   <button className="wager-amount" disabled={!!active||busy||spinning} onClick={()=>{setStakeDraft(String(toGameDollars(stake)));setDialog('stake');}} aria-label={`Ставка: ${money(stake)}`}><small>Ставка</small><strong>${money(stake)}<span>⌄</span></strong></button>
  </div>
   {active&&game==='blackjack'?<div className="two-actions"><Button disabled={busy} onClick={()=>void act('hit')}>ВЗЯТЬ</Button><Button secondary disabled={busy} onClick={()=>void act('stand')}>ХВАТИТ</Button></div>:<Button className={game==='crash'&&active?'cashout':''} disabled={busy||spinning||(!active&&(balance<stake||stake<10||stake>1000||stake%2!==0))} onClick={()=>void act(active?'cashout':undefined)}>{busy?'СОЕДИНЕНИЕ…':active?`ЗАБРАТЬ $${money(Math.floor(stake*mult))}`:game==='roulette'?'КРУТИТЬ КОЛЕСО →':game==='crash'?'ЗАПУСТИТЬ →':'РАЗДАТЬ КАРТЫ →'}</Button>}
  <p className="virtual-notice">Игровая валюта · без покупки и вывода</p></div>
  {dialog==='rules'&&<Modal title="Правила казино" onClose={()=>setDialog(null)}>{game==='roulette'?<p>37 равновероятных чисел. Красное/чёрное: шанс 18/37, возврат 2×. Ноль или число: шанс 1/37, возврат 36×. Возврат включает ставку.</p>:game==='crash'?<p>Коэффициент растёт по exp(0,1 × секунды), максимум ×100 (~46 секунд). Точка: max(1, min(100, floor(0,97 / (1−U) × 100) / 100)), где U — равномерное случайное число от 0 до 1. Около 3,96% раундов падают сразу на ×1 из-за округления вниз. Для x&gt;1: P(точка ≥ x) = 0,97 / x на сетке 0,01; для cashout нужно успеть строго до точки. Решает серверное время; задержка сети учитывается. Нет автозабора: закрытый раунд без cashout проигрывает.</p>:<p>Одна колода 52 карты. Туз — 1 или 11, картинки — 10. Дилер стоит на любом 17, включая мягкие 17. Натуральный blackjack: возврат 2,5×; победа — 2×; ничья — 1×. Чётные ставки сохраняют целочисленные выплаты. Через 2 минуты сервер автоматически выполняет «Хватит».</p>}<p className="virtual-notice">Только непокупаемая игровая валюта. Без вывода, обмена, переводов и реальных призов.</p></Modal>}
  {dialog==='history'&&<Modal title="История казино" onClose={()=>setDialog(null)}><PagedList items={history} empty={<Empty title="Пока нет раундов"/>} render={r=><div className="history-row" key={r.id}><span>{({roulette:'Рулетка',crash:'Ракетка',blackjack:'Блэкджек'})[r.game_type]}<small>{r.status==='active'?'Раунд идёт':r.result??`Число ${r.number}`}</small></span><strong className={r.payout>r.stake?'lime':r.payout===r.stake?'muted':'coral'}>{r.status==='active'?'…':`${r.payout-r.stake>=0?'+':''}$${money(r.payout-r.stake)}`}</strong></div>}/></Modal>}
  {dialog==='stake'&&<Modal title="Ставка" onClose={()=>setDialog(null)}><div className="stake-buttons">{[10,50,100,500,1000].map(n=><button key={n} aria-pressed={Number(stakeDraft)===toGameDollars(n)} onClick={()=>setStakeDraft(String(toGameDollars(n)))}>${money(n)}</button>)}</div><label htmlFor="stake">Своя сумма<input id="stake" name="stake" inputMode="numeric" type="number" min={toGameDollars(10)} max={toGameDollars(1000)} step={toGameDollars(2)} value={stakeDraft} onChange={e=>setStakeDraft(e.target.value)}/></label><p className="small muted">${money(10)}–${money(1000)} · шаг ${money(2)}</p><Button disabled={!validDraft} onClick={()=>{setStake(draftStake);setDialog(null);}}>ГОТОВО</Button></Modal>}
  {dialog==='choice'&&<Modal title="На что поставить" onClose={()=>setDialog(null)}><div className="roulette-choices">{(['red','black','zero'] as const).map((v,i)=><button className={choice===v?'selected':''} key={v} onClick={()=>{setChoice(v);setDialog(null);}}><i className={`bet-dot ${v}`}/>{['Красное','Чёрное','Ноль'][i]}<small>{i===2?'×36':'×2'}</small></button>)}</div><label>Число · 0–36<input aria-label="Ставка на число" inputMode="numeric" type="number" min="0" max="36" step="1" placeholder="0–36" value={numberDraft} onChange={e=>setNumberDraft(e.target.value)}/></label><Button secondary disabled={!validNumber} onClick={()=>{setChoice(chosenNumber);setDialog(null);}}>НА ЧИСЛО {validNumber?chosenNumber:''}</Button></Modal>}
 </div>;
}
function CardHand({label,cards,hidden=false}:{label:string;cards:number[];hidden?:boolean}){
 const suits=['\u2660\uFE0E','\u2665\uFE0E','\u2663\uFE0E','\u2666\uFE0E'],ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
 return <div className="card-hand"><span className="eyebrow">{label} {cards.length?`· ${handValue(cards)}`:''}</span><div className="playing-cards">{cards.length?cards.map((card,i)=><div key={i} className={`playing-card ${Math.floor(card/13)%2?'red-card':''}`}><span>{ranks[card%13]}</span><b>{suits[Math.floor(card/13)]}</b></div>):<div className="card-slot">SL</div>}{hidden&&<div className="card-back">SL</div>}</div></div>;
}
