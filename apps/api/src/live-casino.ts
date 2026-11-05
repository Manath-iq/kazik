import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { LIVE_CASINO,CRASH,crashPoint,crashMultiplier,rouletteColor,liveBetSchema,liveGameSchema } from '@street/shared';
import type { LiveBet,LiveGame,LiveRound,LiveResult,LiveSnapshot,LiveEvent,LiveBetInput } from '@street/shared';
import { sql,fail,hash,randomInt } from './db';
import type { Bindings,AppEnv } from './types';

// Only this private durable record contains the crash deadline/secret outcome.
type RoomState={round:LiveRound;finishAt:number;point:number;number:number;recent:LiveResult[]};
type Ticket={user:string;expires:number};
type Reply={status:200;data:LiveSnapshot|{ticket:string}}|{status:400|401|403|404|409|429|503;error:{message:string}};
const dbNow="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const betColumns='id,round_id,game,stake,choice,status,payout,cashout_multiplier,result,placed_at';

/** One coordination atom per game, not a single global object. No interval loop.
 * Persist-before-publish; alarms wake empty rooms. Money never lives in DO memory.
 * A promise queue serializes external D1 I/O without blockConcurrencyWhile(network).
 * D1 triggers/unique keys remain the final guard even after eviction/retries.
 */
export class CasinoRoom extends DurableObject<Bindings>{
 private tail:Promise<unknown>=Promise.resolve();
 private serial<T>(task:()=>Promise<T>):Promise<T>{const next=this.tail.then(task,task);this.tail=next.catch(()=>{});return next;}
 private async load(game:LiveGame){
  const state=await this.ctx.storage.get<RoomState>('room');
  if(state){if(state.round.game!==game)fail('Неверная комната',409);return state;}
  return this.create(game,1,[]);
 }
 private async create(game:LiveGame,sequence:number,recent:LiveResult[]):Promise<RoomState>{
  const start=Date.now()+LIVE_CASINO.bettingMs,point=crashPoint(randomInt(1000000000)/1000000000);
  const finishAt=game==='roulette'?start+LIVE_CASINO.rouletteMs:start+Math.ceil(Math.log(point)/CRASH.growth*1000);
  const state:RoomState={round:{id:crypto.randomUUID(),game,sequence,phase:'betting',bettingEndsAt:start,startedAt:start,phaseEndsAt:start},finishAt,point,number:randomInt(37),recent};
  // State and alarm commit atomically within the DO storage transaction.
  await this.ctx.storage.transaction(async storage=>{await storage.put('room',state);await storage.setAlarm(start);});
  return state;
 }
 private event(state:RoomState):LiveEvent{return {type:'round',round:state.round,serverNow:Date.now(),recent:state.recent};}
 private broadcast(state:RoomState){
  const payload=JSON.stringify(this.event(state));
  for(const ws of this.ctx.getWebSockets())try{
   const attachment=ws.deserializeAttachment() as Ticket|null;
   if(!attachment||attachment.expires<=Date.now()){ws.close(1008,'Обнови сессию');continue;}
   ws.send(payload);
  }catch{/* Closed socket is removed by the runtime. */}
 }
 private async save(state:RoomState,alarm:number){
  await this.ctx.storage.transaction(async storage=>{await storage.put('room',state);await storage.setAlarm(Math.max(Date.now()+1,alarm));});
  this.broadcast(state);
 }
 private async settle(state:RoomState):Promise<boolean>{
  const r=state.round,now=Date.now(),result=JSON.stringify(r.game==='roulette'?{number:state.number}:{crashPoint:state.point});
  if(r.game==='roulette'){
   const win='(choice=? OR choice=?)',factor="CASE WHEN choice IN ('red','black') THEN 2 ELSE 36 END";
   await sql(this.env.DB,`UPDATE live_casino_bets SET status=CASE WHEN ${win} THEN 'won' ELSE 'lost' END,payout=CASE WHEN ${win} THEN stake*(${factor}) ELSE 0 END,result=?,finished_at=? WHERE id IN (SELECT id FROM live_casino_bets WHERE round_id=? AND status='accepted' LIMIT 100)`,String(state.number),rouletteColor(state.number),String(state.number),rouletteColor(state.number),result,now,r.id).run();
  }else await sql(this.env.DB,"UPDATE live_casino_bets SET status='lost',payout=0,result=?,finished_at=? WHERE id IN (SELECT id FROM live_casino_bets WHERE round_id=? AND status='accepted' LIMIT 100)",result,now,r.id).run();
  return !(await sql(this.env.DB,"SELECT 1 pending FROM live_casino_bets WHERE round_id=? AND status='accepted' LIMIT 1",r.id).first());
 }
 private async advance(game:LiveGame):Promise<RoomState>{
  let state=await this.load(game);const now=Date.now();
  if(state.round.phase==='result'&&now>=state.round.phaseEndsAt!){state=await this.create(game,state.round.sequence+1,state.recent);this.broadcast(state);return state;}
  if(state.round.phase==='betting'&&now>=state.round.bettingEndsAt){
   state={...state,round:{...state.round,phase:'playing',phaseEndsAt:game==='roulette'?state.finishAt:null,...(game==='roulette'?{number:state.number}:{})}};
   await this.save(state,state.finishAt);
  }
  if(state.round.phase==='playing'&&now>=state.finishAt){
   // If D1 fails, keep this round and retry; never move on leaving wagers behind.
   if(!await this.settle(state)){await this.ctx.storage.setAlarm(Date.now()+100);return state;}
   const result:LiveResult={id:state.round.id,game,...(game==='roulette'?{number:state.number}:{crashPoint:state.point})};
   state={...state,round:{...state.round,phase:'result',phaseEndsAt:Date.now()+LIVE_CASINO.resultMs,...(game==='roulette'?{number:state.number}:{crashPoint:state.point})},recent:[result,...state.recent].slice(0,10)};
   await this.save(state,state.round.phaseEndsAt!);
  }
  // Re-arm a missing/exhausted alarm on recovery, not a client-driven timer.
  if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Math.max(Date.now()+10,state.round.phase==='betting'?state.round.bettingEndsAt:state.round.phase==='result'?state.round.phaseEndsAt!:state.finishAt));
  return state;
 }
 private async snapshot(state:RoomState,user:string):Promise<LiveSnapshot>{
  const [bet,previousBet,wallet]=await Promise.all([
   sql(this.env.DB,`SELECT ${betColumns} FROM live_casino_bets WHERE user_id=? AND round_id=?`,user,state.round.id).first<LiveBet>(),
   sql(this.env.DB,`SELECT ${betColumns} FROM live_casino_bets WHERE user_id=? AND game=? AND round_id!=? ORDER BY placed_at DESC LIMIT 1`,user,state.round.game,state.round.id).first<LiveBet>(),
   sql(this.env.DB,'SELECT balance FROM wallets WHERE user_id=?',user).first<{balance:number}>(),
  ]);
  if(!wallet)fail('Кошелёк не найден',404);
  return {round:state.round,serverNow:Date.now(),recent:state.recent,bet,previousBet,balance:wallet.balance};
 }
 private async place(state:RoomState,user:string,input:unknown){
  const b:LiveBetInput=liveBetSchema.parse(input),game=state.round.game;
  if(game==='roulette'&&b.choice===undefined)fail('Выбери сектор');
  if(game==='crash'&&b.choice!==undefined)fail('У ракеты нет секторов');
  const requestHash=await hash(JSON.stringify({round:b.roundId,game,stake:b.stake,choice:b.choice??null}));
  const old=await sql(this.env.DB,'SELECT user_id,request_hash FROM live_casino_bets WHERE id=?',b.key).first<{user_id:string;request_hash:string}>();
  if(old){if(old.user_id!==user||old.request_hash!==requestHash)fail('Ключ операции уже использован',409);return;}
  if(b.roundId!==state.round.id||state.round.phase!=='betting'||Date.now()>=state.round.bettingEndsAt)fail('Приём ставок в этом раунде завершён',409);
  // Final admission time is checked INSIDE D1, after network delay, in the debit transaction.
  await sql(this.env.DB,'INSERT INTO live_casino_bets(id,user_id,round_id,game,stake,choice,request_hash,placed_at,closes_at) VALUES(?,?,?,?,?,?,?,?,?)',b.key,user,b.roundId,game,b.stake,b.choice===undefined?null:String(b.choice),requestHash,Date.now(),state.round.bettingEndsAt).run();
 }
 private async cashout(state:RoomState,user:string,input:unknown){
  const b=z.object({betId:z.uuid(),roundId:z.uuid()}).parse(input);
  const bet=await sql(this.env.DB,`SELECT ${betColumns} FROM live_casino_bets WHERE id=? AND user_id=?`,b.betId,user).first<LiveBet>();
  if(!bet||bet.game!=='crash'||bet.round_id!==b.roundId)fail('Ставка не найдена',404);
  if(bet.status==='cashed_out')return;
  const now=Date.now();
  if(state.round.game!=='crash'||state.round.id!==b.roundId||state.round.phase!=='playing'||now>=state.finishAt||bet.status!=='accepted')fail('Полёт уже завершён или ещё не начался',409);
  const multiplier=crashMultiplier(now-state.round.startedAt),payout=Math.floor(bet.stake*multiplier);
  const out=await sql(this.env.DB,`UPDATE live_casino_bets SET status='cashed_out',payout=?,cashout_multiplier=?,finished_at=? WHERE id=? AND user_id=? AND status='accepted' AND ${dbNow}<?`,payout,multiplier,now,b.betId,user,state.finishAt).run();
  if(!out.meta.changes)fail('Крушение: забрать уже не успели',409);
 }
 async request(game:LiveGame,user:string,action:'state'|'bet'|'cashout'|'ticket',body?:unknown):Promise<Reply>{
  return this.serial(async()=>{
   try{
    liveGameSchema.parse(game);const state=await this.advance(game);
    if(action==='ticket'){
     const ticket=crypto.randomUUID()+crypto.randomUUID();
     // Short-lived, one-use credential, never the main session token in a URL.
     await this.ctx.storage.put(`ticket:${await hash(ticket)}`,{user,expires:Date.now()+30000} satisfies Ticket);
     const tickets=await this.ctx.storage.list<Ticket>({prefix:'ticket:',limit:1000});
     const stale=[...tickets].filter(([,v])=>v.expires<Date.now()).map(([k])=>k);if(stale.length)await this.ctx.storage.delete(stale);
     return {status:200,data:{ticket}};
    }
    if(action==='bet')await this.place(state,user,body);
    if(action==='cashout')await this.cashout(state,user,body);
    return {status:200,data:await this.snapshot(state,user)};
   }catch(error){
    if(error instanceof HTTPException)return {status:error.status as 400|409,error:{message:error.message}};
    if(error instanceof z.ZodError)return {status:400,error:{message:'Проверь сумму и параметры ставки'}};
    const text=String(error);
    if(/bet_closed/.test(text))return {status:409,error:{message:'Приём ставок завершён'}};
    if(/CHECK constraint/.test(text))return {status:409,error:{message:'Недостаточно игровых денег или превышен лимит кошелька'}};
    if(/UNIQUE constraint/.test(text))return {status:409,error:{message:'Ставка в этом раунде уже принята'}};
    console.error(JSON.stringify({event:'live_casino_error',game,message:text.slice(0,300)}));
    await this.ctx.storage.setAlarm(Date.now()+2000);
    return {status:503,error:{message:'Стол восстанавливает связь. Обновляем состояние…'}};
   }
  });
 }
 async fetch(request:Request):Promise<Response>{
  return this.serial(async()=>{
   const url=new URL(request.url),game=liveGameSchema.parse(url.searchParams.get('game')),raw=url.searchParams.get('ticket')??'';
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket only',{status:400});
   if(raw.length!==72)return new Response('Неверный билет',{status:401});
   const key=`ticket:${await hash(raw)}`,ticket=await this.ctx.storage.get<Ticket>(key);await this.ctx.storage.delete(key);
   if(!ticket||ticket.expires<=Date.now())return new Response('Билет истёк',{status:401});
   if(this.ctx.getWebSockets().length>=LIVE_CASINO.maxConnections)return new Response('Стол заполнен',{status:429});
   const state=await this.advance(game),pair=new WebSocketPair(),[client,server]=Object.values(pair);
   this.ctx.acceptWebSocket(server);
   server.serializeAttachment({...ticket,expires:Date.now()+3600000});
   this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
   server.send(JSON.stringify(this.event(state)));
   return new Response(null,{status:101,webSocket:client});
  });
 }
 async alarm(){
  await this.serial(async()=>{
   const state=await this.ctx.storage.get<RoomState>('room');if(!state)return;
   try{await this.advance(state.round.game);}catch(error){console.error(JSON.stringify({event:'live_alarm_retry',game:state.round.game,message:String(error).slice(0,250)}));await this.ctx.storage.setAlarm(Date.now()+2000);}
  });
 }
 async ensure(game:LiveGame){await this.serial(()=>this.advance(game));}
 webSocketMessage(ws:WebSocket,_message:string|ArrayBuffer){ws.close(1008,'Соединение только для состояния');}
 webSocketClose(ws:WebSocket,code:number){ws.close(code);}
 webSocketError(ws:WebSocket){ws.close(1011,'Переподключение');}
}

export const liveCasino=new Hono<AppEnv>();
for(const action of ['state','bet','cashout','ticket'] as const){
 const handler=async(c:import('./types').Ctx)=>{
  const game=liveGameSchema.parse(c.req.param('game'));
  const reply=await c.env.CASINO_ROOMS.getByName(`public-v1:${game}`).request(game,c.get('userId'),action,c.req.method==='POST'&&action!=='ticket'?await c.req.json():undefined);
  return reply.status===200?c.json({data:reply.data},200):c.json({error:reply.error},reply.status);
 };
 if(action==='state')liveCasino.get('/:game/state',handler);else liveCasino.post(`/:game/${action}`,handler);
}
liveCasino.get('/:game/history',async c=>{const game=liveGameSchema.parse(c.req.param('game'));return c.json({data:(await sql(c.env.DB,`SELECT ${betColumns} FROM live_casino_bets WHERE user_id=? AND game=? ORDER BY placed_at DESC LIMIT 30`,c.get('userId'),game).all<LiveBet>()).results});});

export async function liveSocket(c:import('./types').Ctx){
 const game=liveGameSchema.parse(c.req.param('game')),origin=c.req.header('Origin');
 if(origin&&(origin!==(c.env.ALLOWED_ORIGIN||new URL(c.req.url).origin)))fail('Нет доступа',403);
 const url=new URL(c.req.url);url.searchParams.set('game',game);
 return c.env.CASINO_ROOMS.getByName(`public-v1:${game}`).fetch(new Request(url,c.req.raw));
}
