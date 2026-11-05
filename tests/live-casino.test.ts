import { beforeAll,afterAll,it,expect } from 'vitest';
import { Miniflare,convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { mkdtemp,rm } from 'node:fs/promises';
import { randomUUID,createHash } from 'node:crypto';
import type { CasinoRoom } from './fixtures/live-worker';
import type { LiveSnapshot,LiveBetInput,LiveGame } from '@street/shared';
let mf:Miniflare,db:D1Database,rooms:DurableObjectNamespace<CasinoRoom>,storage:string,options:ReturnType<typeof convertV4MiniflareOptions>;
beforeAll(async()=>{
 const script=await build({entryPoints:['tests/fixtures/live-worker.ts'],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']});
 storage=await mkdtemp('.local/live-test-');options=convertV4MiniflareOptions({name:'live-test',modules:true,compatibilityDate:'2026-11-04',script:script.outputFiles[0].text,d1Databases:['DB'],resourcePersistencePath:storage,durableObjects:{CASINO_ROOMS:{className:'CasinoRoom',useSQLite:true}},bindings:{APP_URL:'https://example.test',ALLOWED_ORIGIN:'https://example.test'}});mf=new Miniflare(options);
 db=await mf.getD1Database('DB');rooms=(await mf.getBindings<{CASINO_ROOMS:DurableObjectNamespace<CasinoRoom>}>()).CASINO_ROOMS;
 const migration=(await Promise.all(['0001_initial.sql','0002_guardrails.sql','0006_shared_casino.sql'].map(f=>readFile(`apps/api/migrations/${f}`,'utf8')))).join('\n');
 await db.exec(migration.replace(/--[^\n]*/g,'').split(/;\s*(?=CREATE|PRAGMA|ALTER|$)/).filter(s=>s.trim()).map(s=>s.replace(/\s+/g,' ').trim()+';').join('\n'));
},30000);
afterAll(async()=>{await mf?.dispose();if(storage)await rm(storage,{recursive:true,force:true});});
async function user(balance=10000){const id=randomUUID(),token=randomUUID();await db.batch([
 db.prepare('INSERT INTO users(id,telegram_id,display_name,created_at,last_seen_at) VALUES(?,?,?,0,0)').bind(id,id,'Тест'),
 db.prepare('INSERT INTO wallets(user_id,balance) VALUES(?,0)').bind(id),
 db.prepare("INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) VALUES(?,?,?,'fixture','initial',0)").bind(randomUUID(),id,balance),
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000),
]);return {id,token};}
const room=(game:LiveGame)=>rooms.getByName(`public-v1:${game}`);
async function req(game:LiveGame,action:string,token:string,body?:unknown){const r=await mf.dispatchFetch(`https://example.test/api/casino/live/${game}/${action}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,...await r.json() as {data:LiveSnapshot;error?:{message:string}}};}
async function balance(id:string){return (await db.prepare('SELECT balance FROM wallets WHERE user_id=?').bind(id).first<{balance:number}>())!.balance;}

it('2 игрока видят один серверный раунд; concurrent debit, replay, payload/key и late bets защищены',async()=>{
 const [a,b]=await Promise.all([user(),user()]);const id=await room('roulette').fixture('roulette');
 const [sa,sb]=await Promise.all([req('roulette','state',a.token),req('roulette','state',b.token)]);expect(sa.data.round).toEqual(sb.data.round);expect(sa.data.round.id).toBe(id);expect(sa.data.round.number).toBeUndefined();
 const body:LiveBetInput={key:randomUUID(),roundId:id,stake:100,choice:'red'};
 const replies=await Promise.all([req('roulette','bet',a.token,body),req('roulette','bet',a.token,body)]);expect(replies.every(r=>r.status===200)).toBe(true);expect(await balance(a.id)).toBe(9900);
 expect((await req('roulette','bet',a.token,{...body,stake:200})).status).toBe(409);
 expect((await req('roulette','bet',b.token,body)).status).toBe(409);
 expect((await req('roulette','bet',b.token,{...body,key:randomUUID(),stake:-1})).status).toBe(400);
 await room('roulette').transition('playing');expect((await req('roulette','bet',b.token,{...body,key:randomUUID()})).status).toBe(409);
 await room('roulette').transition('result');await room('roulette').alarmNow();
 const final=await req('roulette','state',a.token);expect(final.data.round.phase).toBe('result');expect(final.data.round.number).toBe(7);expect(final.data.bet?.payout).toBe(200);expect(await balance(a.id)).toBe(10100);
 await room('roulette').alarmNow();expect(await balance(a.id)).toBe(10100);
 const sum=await db.prepare('SELECT SUM(delta) total FROM wallet_ledger WHERE user_id=?').bind(a.id).first<{total:number}>();expect(sum!.total).toBe(await balance(a.id));
});
it('Crash скрывает deadline/point, cashout однократный, чужой/поздний отклоняется, отключённый игрок проигрывает',async()=>{
 const [a,b]=await Promise.all([user(),user()]);const id=await room('crash').fixture('crash');
 const input={key:randomUUID(),roundId:id,stake:100};const first=await req('crash','bet',a.token,input);expect(first.status).toBe(200);expect(first.data.round.crashPoint).toBeUndefined();expect(first.data.round).not.toHaveProperty('finishAt');
 const other=await req('crash','bet',b.token,{...input,key:randomUUID()});expect(other.status).toBe(200);
 await room('crash').transition('playing');const flight=await req('crash','state',a.token);expect(flight.data.round.phaseEndsAt).toBeNull();
 const cash={betId:input.key,roundId:id,multiplier:999999};expect((await req('crash','cashout',b.token,cash)).status).toBe(404);
 const outputs=await Promise.all([req('crash','cashout',a.token,cash),req('crash','cashout',a.token,cash)]);expect(outputs.every(r=>r.status===200)).toBe(true);const paid=await balance(a.id);expect(paid).toBeGreaterThanOrEqual(10000);expect(paid).toBeLessThan(10020);
 await room('crash').transition('result');await room('crash').alarmNow();expect((await req('crash','cashout',b.token,{betId:other.data.bet!.id,roundId:id})).status).toBe(409);expect(await balance(b.id)).toBe(9900);expect(await balance(a.id)).toBe(paid);
 expect((await req('crash','state',b.token)).data.round.crashPoint).toBe(100);
});
it('будильники переходят к следующему раунду без клиентов; рестарт восстанавливает сохранённое состояние',async()=>{
 await room('roulette').fixture('roulette','playing');await room('roulette').transition('result');await room('roulette').alarmNow();await room('roulette').transition('betting');await room('roulette').alarmNow();
 const a=await user(),before=await req('roulette','state',a.token);expect(before.data.round.sequence).toBe(2);expect(before.data.round.phase).toBe('betting');
 await mf.dispose();mf=new Miniflare(options);db=await mf.getD1Database('DB');rooms=(await mf.getBindings<{CASINO_ROOMS:DurableObjectNamespace<CasinoRoom>}>()).CASINO_ROOMS;
 const after=await req('roulette','state',a.token);expect(after.data.round).toEqual(before.data.round);
});
it('WebSocket: одноразовый ticket, одинаковые раунды, origin и сессия проверяются',async()=>{
 const a=await user(),r=await req('roulette','ticket',a.token,{});const ticket=(r.data as unknown as {ticket:string}).ticket;
 const url=`https://example.test/api/casino/live/roulette/socket?ticket=${ticket}`;
 const denied=await mf.dispatchFetch(url,{headers:{Upgrade:'websocket',Origin:'https://evil.test'}});expect(denied.status).toBe(403);
 const response=await mf.dispatchFetch(url,{headers:{Upgrade:'websocket',Origin:'https://example.test'}});expect(response.status).toBe(101);const ws=response.webSocket!;ws.accept();
 const frame=await new Promise<string>(resolve=>ws.addEventListener('message',e=>resolve(String(e.data)),{once:true}));expect(JSON.parse(frame).round.game).toBe('roulette');
 expect((await mf.dispatchFetch(url,{headers:{Upgrade:'websocket',Origin:'https://example.test'}})).status).toBe(401);ws.close();
});
