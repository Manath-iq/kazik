import { Hono } from 'hono';
import { z } from 'zod';
import { betSchema,rouletteSchema,handValue,crashMultiplier,CRASH } from '@street/shared';
import type { CasinoRound, RouletteChoice } from '@street/shared';
import { sql,ledger,fail,hash,randomInt } from './db';
import type { AppEnv,RoundRow } from './types';
type State={number?:number;choice?:RouletteChoice;point?:number;deck?:number[];player?:number[];dealer?:number[];result?:string};
async function ownedRound(db:D1Database,id:string,user:string) {
 const r=await sql(db,'SELECT * FROM casino_rounds WHERE id=? AND user_id=?',id,user).first<RoundRow>();
 if(!r) fail('Раунд не найден',404); return r;
}
export function publicRound(r:RoundRow,now=Date.now()):CasinoRound {
 const s:State=JSON.parse(r.state),active=r.status==='active';
 return {id:r.id,game_type:r.game_type,stake:r.stake,status:r.status,payout:r.payout,started_at:r.started_at,serverNow:now,version:r.version,
  number:s.number,choice:s.choice,player:s.player,dealer:active?s.dealer?.slice(0,1):s.dealer,result:s.result,
  multiplier:r.game_type==='crash'?crashMultiplier(now-r.started_at):undefined,
  crash_point:!active?s.point:undefined};
}
async function updateRound(db:D1Database,r:RoundRow,s:State,done:boolean,payout=0) {
 const token=crypto.randomUUID(),now=Date.now();
 const result=await db.batch([
  sql(db,`UPDATE casino_rounds SET state=?,version=version+1,status=?,payout=?,finished_at=?,settlement_id=? WHERE id=? AND version=? AND status='active'`,JSON.stringify(s),done?'finished':'active',payout,done?now:null,token,r.id,r.version),
  sql(db,`INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) SELECT ?,user_id,payout,'casino_payout',id,? FROM casino_rounds WHERE id=? AND settlement_id=? AND status='finished'`,crypto.randomUUID(),now,r.id,token),
 ]);
 if(!result[0].meta.changes) fail('Раунд уже изменился. Обнови состояние.',409);
 return ownedRound(db,r.id,r.user_id);
}
function blackjackResult(s:State,stake:number) {
 const p=handValue(s.player!),d=handValue(s.dealer!);
 if(p>21) return {payout:0,result:'Перебор'};
 if(p===21&&s.player!.length===2) {
  if(d===21&&s.dealer!.length===2) return {payout:stake,result:'Ничья'};
  return {payout:stake*5/2,result:'Блэкджек!'};
 }
 if(d===21&&s.dealer!.length===2) return {payout:0,result:'Блэкджек дилера'};
 return d>21||p>d?{payout:stake*2,result:'Победа'}:p===d?{payout:stake,result:'Ничья'}:{payout:0,result:'Дилер выиграл'};
}
function dealerPlay(s:State) { while(handValue(s.dealer!)<17) s.dealer!.push(s.deck!.pop()!); }
export async function expireRound(db:D1Database,r:RoundRow) {
 if(r.status!=='active') return r;
 const s:State=JSON.parse(r.state),now=Date.now();
 if(r.game_type==='crash'&&(now>=r.expires_at||crashMultiplier(now-r.started_at)>=s.point!)) {
  s.result='Краш'; return updateRound(db,r,s,true);
 }
 if(r.game_type==='blackjack'&&now>=r.expires_at) {
  dealerPlay(s);const outcome=blackjackResult(s,r.stake);s.result=`Время вышло: ${outcome.result.toLowerCase()}`;
  return updateRound(db,r,s,true,outcome.payout);
 }
 return r;
}
async function start(db:D1Database,user:string,key:string,stake:number,game:RoundRow['game_type'],state:State,request:string,done=false,payout=0) {
 const old=await sql(db,'SELECT * FROM casino_rounds WHERE id=?',key).first<RoundRow>();
 const requestHash=await hash(`${game}:${request}`);
 if(old) { if(old.user_id!==user||old.request_hash!==requestHash) fail('Ключ операции уже использован',409); return old; }
 const active=await sql(db,"SELECT * FROM casino_rounds WHERE user_id=? AND status='active'",user).first<RoundRow>();
 if(active) {const expired=await expireRound(db,active); if(expired.status==='active') fail('Сначала заверши текущий раунд',409);}
 const now=Date.now();
 await db.batch([
  sql(db,'INSERT INTO casino_rounds(id,user_id,game_type,stake,status,state,request_hash,started_at,expires_at,finished_at,payout) VALUES(?,?,?,?,?,?,?,?,?,?,?)',key,user,game,stake,done?'finished':'active',JSON.stringify(state),requestHash,now,now+(game==='crash'?Math.ceil(Math.log(CRASH.max)/CRASH.growth*1000):120000),done?now:null,payout),
  ledger(db,user,-stake,'casino_stake',key),
  ...(done?[ledger(db,user,payout,'casino_payout',key)]:[]),
 ]);
 return ownedRound(db,key,user);
}
export const casino=new Hono<AppEnv>();
casino.get('/games',c=>c.json({data:{stakes:[10,50,100,500,1000],maxStake:1000,crash:CRASH,virtualOnly:true}}));
casino.get('/history',async c=>{
 const db=c.env.DB,user=c.get('userId');
 const active=await sql(db,"SELECT * FROM casino_rounds WHERE user_id=? AND status='active'",user).first<RoundRow>();
 if(active) await expireRound(db,active);
 return c.json({data:(await sql(db,'SELECT * FROM casino_rounds WHERE user_id=? ORDER BY started_at DESC LIMIT 20',user).all<RoundRow>()).results.map(r=>publicRound(r))});
});
casino.post('/roulette/spin',async c=>{
  const b=rouletteSchema.parse(await c.req.json());
  const old=await sql(c.env.DB,'SELECT * FROM casino_rounds WHERE id=? AND user_id=? AND request_hash=?',b.key,c.get('userId'),await hash(`roulette:${JSON.stringify(b)}`)).first<RoundRow>();
  if(old)return c.json({data:publicRound(old)});
  fail('Рулетка теперь общая. Обнови игру и подтверди ставку в новом раунде.',409);
});
casino.post('/crash/start',async c=>{
  const b=betSchema.parse(await c.req.json());
  const old=await sql(c.env.DB,'SELECT * FROM casino_rounds WHERE id=? AND user_id=? AND request_hash=?',b.key,c.get('userId'),await hash(`crash:${JSON.stringify(b)}`)).first<RoundRow>();
  if(old)return c.json({data:publicRound(await expireRound(c.env.DB,old))});
  fail('Ракета теперь общая. Обнови игру и подтверди ставку в новом раунде.',409);
});
casino.get('/crash/:id',async c=>{
 const db=c.env.DB,r=await ownedRound(db,c.req.param('id'),c.get('userId'));
 if(r.game_type!=='crash') fail('Не тот тип игры');
 return c.json({data:publicRound(await expireRound(db,r))});
});
casino.post('/crash/:id/cashout',async c=>{
 const db=c.env.DB,r=await ownedRound(db,c.req.param('id'),c.get('userId'));
 if(r.game_type!=='crash') fail('Не тот тип игры');
 if(r.status!=='active') return c.json({data:publicRound(r)});
 const s:State=JSON.parse(r.state),mult=crashMultiplier(Date.now()-r.started_at);
 s.result=mult>=s.point!?'Краш':`Забрано ×${mult.toFixed(2)}`;
 return c.json({data:publicRound(await updateRound(db,r,s,true,mult>=s.point!?0:Math.floor(r.stake*mult)))});
});
casino.post('/blackjack/start',async c=>{
 const b=betSchema.parse(await c.req.json()),deck=Array.from({length:52},(_,i)=>i);
 for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
 const s:State={player:[deck.pop()!,deck.pop()!],dealer:[deck.pop()!,deck.pop()!],deck};
 const natural=handValue(s.player!)===21||handValue(s.dealer!)===21,outcome=blackjackResult(s,b.stake);
 if(natural)s.result=outcome.result;
 return c.json({data:publicRound(await start(c.env.DB,c.get('userId'),b.key,b.stake,'blackjack',s,JSON.stringify(b),natural,natural?outcome.payout:0))});
});
casino.post('/blackjack/:id/:action',async c=>{
 const action=z.enum(['hit','stand']).parse(c.req.param('action'));
 const {version}=z.object({version:z.number().int().min(0)}).parse(await c.req.json());
 const db=c.env.DB,r=await expireRound(db,await ownedRound(db,c.req.param('id'),c.get('userId')));
 if(r.game_type!=='blackjack') fail('Не тот тип игры');
 if(r.status!=='active') return c.json({data:{...publicRound(r),version:r.version}});
 if(version!==r.version) fail('Действие уже выполнено',409);
 const s:State=JSON.parse(r.state);
 if(action==='hit')s.player!.push(s.deck!.pop()!);
 const done=action==='stand'||handValue(s.player!)>=21;
 if(done){if(handValue(s.player!)<=21)dealerPlay(s);const out=blackjackResult(s,r.stake);s.result=out.result;
  const updated=await updateRound(db,r,s,true,out.payout);return c.json({data:{...publicRound(updated),version:updated.version}});}
 const updated=await updateRound(db,r,s,false);return c.json({data:{...publicRound(updated),version:updated.version}});
});
