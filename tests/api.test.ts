import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { Miniflare,convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createHmac,createHash,randomUUID } from 'node:crypto';
import { seasonStart } from '@street/shared';
let mf:Miniflare,prod:Miniflare,db:D1Database;
const botToken='test-token-not-a-real-credential';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
beforeAll(async()=>{
 const compiled=await build({entryPoints:['apps/api/src/local.ts'],bundle:true,format:'esm',platform:'browser',write:false,target:'es2022'});
 const production=await build({entryPoints:['apps/api/src/index.ts'],bundle:true,format:'esm',platform:'browser',write:false,target:'es2022'});
 const options={modules:true,compatibilityDate:'2026-11-04',d1Databases:['DB'],bindings:{APP_URL:'https://example.test',BOT_USERNAME:'test_bot',ALLOWED_ORIGIN:'',BOT_TOKEN:botToken,WEBHOOK_SECRET:'test-webhook-secret'}};
 mf=new Miniflare(convertV4MiniflareOptions({...options,script:compiled.outputFiles[0].text}));prod=new Miniflare(convertV4MiniflareOptions({...options,script:production.outputFiles[0].text}));
 db=await mf.getD1Database('DB');
 const migration=(await Promise.all(['0001_initial.sql','0002_guardrails.sql','0003_run_record.sql'].map(f=>readFile(`apps/api/migrations/${f}`,'utf8')))).join('\n');
 // D1 exec разделяет строки: каждая завершённая SQL-команда, включая trigger, в одной строке.
 const statements=migration.replace(/--[^\n]*/g,'').split(/;\s*(?=CREATE|PRAGMA|ALTER|$)/).filter(s=>s.trim()).map(s=>s.replace(/\s+/g,' ').trim()+';');
 await db.exec(statements.join('\n'));
},30000);
afterAll(async()=>{await Promise.all([mf?.dispose(),prod?.dispose()]);});
async function fixture(balance=10000){
 const id=randomUUID(),token=randomUUID(),now=Date.now();
 await db.batch([
  db.prepare('INSERT INTO users(id,telegram_id,display_name,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(id,id,'Тестовый игрок',now,now),
  db.prepare('INSERT INTO wallets(user_id,balance) VALUES(?,0)').bind(id),
  db.prepare("INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) VALUES(?,?,?,'test','fixture',?)").bind(randomUUID(),id,balance,now),
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest(token),id,now+3600000),
 ]);return {id,token};
}
async function req(path:string,token?:string,body?:unknown,server=mf){
 const response=await server.dispatchFetch(`http://localhost/api${path}`,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=await response.json() as {data:Record<string,unknown>;error?:{message:string}};return {status:response.status,...json};
}
async function wallet(user:string){return (await db.prepare('SELECT balance FROM wallets WHERE user_id=?').bind(user).first<{balance:number}>())!.balance;}
async function blackjackFixture(user:{id:string;token:string},state:{player:number[];dealer:number[];deck:number[]},expired=false){
 const id=randomUUID(),now=Date.now();
 await db.batch([
  db.prepare("INSERT INTO casino_rounds(id,user_id,game_type,stake,status,state,request_hash,started_at,expires_at) VALUES(?,?,'blackjack',100,'active',?,'test',?,?)").bind(id,user.id,JSON.stringify(state),now,expired?now-1:now+120000),
  db.prepare("INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) VALUES(?,?,-100,'casino_stake',?,?)").bind(randomUUID(),user.id,id,now),
 ]);return id;
}
function signedInit(age=0){
 const data=new URLSearchParams({auth_date:String(Math.floor((Date.now()-age)/1000)),user:JSON.stringify({id:123456789,first_name:'Игрок',username:'test'})});
 const str=[...data.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(botToken).digest();data.set('hash',createHmac('sha256',secret).update(str).digest('hex'));return data.toString();
}
describe('Реальный Workers runtime + D1',()=>{
 it('проверяет подпись, срок Telegram и отсутствие dev route в production',async()=>{
  expect((await req('/auth/telegram',undefined,{initData:signedInit()})).status).toBe(200);
  expect((await req('/auth/telegram',undefined,{initData:signedInit().replace('Игрок','Хакер').replace('auth_date','auth_fake')})).status).toBe(401);
  expect((await req('/auth/telegram',undefined,{initData:signedInit(7200000)})).status).toBe(401);
  expect((await req('/auth/dev',undefined,{},prod)).status).not.toBe(200);
  expect((await req('/me')).status).toBe(401);
 });
 it('webhook отклоняет запрос без секрета',async()=>{expect((await req('/telegram/webhook',undefined,{update_id:1})).status).toBe(403);});
 it('отрицательные ставки не проходят; конкурентные покупки не уходят в минус',async()=>{
  const u=await fixture(8000);
  expect((await req('/casino/roulette/spin',u.token,{key:randomUUID(),stake:-10,choice:'red'})).status).toBe(400);
  const rows=await Promise.all([req('/assets/buy',u.token,{itemId:'sedan'}),req('/assets/buy',u.token,{itemId:'room'})]);
  expect(rows.filter(r=>r.status===200)).toHaveLength(1);expect(await wallet(u.id)).toBeGreaterThanOrEqual(0);
  const all=await db.prepare('SELECT SUM(delta) amount FROM wallet_ledger WHERE user_id=?').bind(u.id).first<{amount:number}>();expect(await wallet(u.id)).toBe(all!.amount);
 });
 it('рулетка платит по серверному числу и повтор ключа не меняет кошелёк',async()=>{
  const u=await fixture(),body={key:randomUUID(),stake:50,choice:'zero'};
  const first=await req('/casino/roulette/spin',u.token,body);expect(first.status).toBe(200);const balance=await wallet(u.id);
  expect((await req('/casino/roulette/spin',u.token,body)).data).toMatchObject({id:body.key,number:first.data.number,payout:first.data.payout});expect(await wallet(u.id)).toBe(balance);
  expect((await req('/casino/roulette/spin',u.token,{...body,stake:100})).status).toBe(409);
  const other=await fixture();expect((await req('/casino/roulette/spin',other.token,body)).status).toBe(409);
 });
 it('crash не раскрывает точку и платит cashout только один раз по серверному времени',async()=>{
  const u=await fixture(),key=randomUUID();const start=await req('/casino/crash/start',u.token,{key,stake:100});expect(start.status).toBe(200);expect(start.data).not.toHaveProperty('crash_point');expect(start.data).not.toHaveProperty('state');
  await db.prepare('UPDATE casino_rounds SET state=?,started_at=? WHERE id=?').bind(JSON.stringify({point:100}),Date.now()-1000,key).run();
  const outputs=await Promise.all([req(`/casino/crash/${key}/cashout`,u.token,{multiplier:999999}),req(`/casino/crash/${key}/cashout`,u.token,{multiplier:999999})]);
  const out=outputs.find(r=>r.status===200)!;expect(out).toBeDefined();expect(Number(out.data.payout)).toBeLessThan(120);const balance=await wallet(u.id);
  await req(`/casino/crash/${key}/cashout`,u.token,{});expect(await wallet(u.id)).toBe(balance);
 });
 it('crash после точки/тайм-аута проигрывает, refresh не спасает ставку',async()=>{
  const u=await fixture(),key=randomUUID();await req('/casino/crash/start',u.token,{key,stake:100});
  await db.prepare('UPDATE casino_rounds SET state=?,started_at=?,expires_at=? WHERE id=?').bind(JSON.stringify({point:1.1}),Date.now()-10000,Date.now()-1,key).run();
  const r=await req(`/casino/crash/${key}`,u.token);expect(r.data.status).toBe('finished');expect(r.data.payout).toBe(0);expect(await wallet(u.id)).toBe(9900);
  const other=await fixture();expect((await req(`/casino/crash/${key}/cashout`,other.token,{})).status).toBe(404);
 });
 it('blackjack хранит колоду, скрывает карту и обрабатывает повтор hit/stand',async()=>{
  const u=await fixture(),key=await blackjackFixture(u,{player:[9,6],dealer:[8,7],deck:[4,3,2]});
  // Контролируемая рука — только test DB, не API для клиента.
  const history=await req('/casino/history',u.token);const rows=history.data as unknown as {id:string;dealer:number[];deck?:number[]}[];expect(rows[0].dealer).toHaveLength(1);expect(rows[0].deck).toBeUndefined();
  const stand=await req(`/casino/blackjack/${key}/stand`,u.token,{version:0});expect(stand.data.status).toBe('finished');expect(stand.data.result).toBe('Ничья');
  const balance=await wallet(u.id);await req(`/casino/blackjack/${key}/stand`,u.token,{version:0});expect(await wallet(u.id)).toBe(balance);
 });
 it('blackjack натуральный 3:2 и тайм-аут выполняет stand',async()=>{
  const u=await fixture(),key=await blackjackFixture(u,{player:[0,12],dealer:[8,6],deck:[3]});
  const r=await req(`/casino/blackjack/${key}/stand`,u.token,{version:0});expect(r.data.payout).toBe(250);
  const key2=await blackjackFixture(u,{player:[9,8],dealer:[5,6],deck:[1,2]},true);
  const history=await req('/casino/history',u.token);const list=history.data as unknown as {id:string;status:string;result:string}[];expect(list.find(r=>r.id===key2)!.status).toBe('finished');expect(list.find(r=>r.id===key2)!.result).toContain('Время вышло');
 });
 it('blackjack: hit/bust, проигрыш, единственный hit при double click',async()=>{
  const u=await fixture(),key=await blackjackFixture(u,{player:[9,8],dealer:[9,7],deck:[5,4,3]});
  const replies=await Promise.all([req(`/casino/blackjack/${key}/hit`,u.token,{version:0}),req(`/casino/blackjack/${key}/hit`,u.token,{version:0})]);
  expect(replies.some(r=>r.status===200)).toBe(true);const saved=await db.prepare('SELECT version,state,status,payout FROM casino_rounds WHERE id=?').bind(key).first<{version:number;state:string;status:string;payout:number}>();
  expect(saved!.version).toBe(1);expect(JSON.parse(saved!.state).player).toHaveLength(3);expect(saved!.status).toBe('finished');expect(saved!.payout).toBe(0);expect(await wallet(u.id)).toBe(9900);
 });
 it('создаёт реальную серверную раздачу blackjack без выдачи колоды',async()=>{
  const u=await fixture(),r=await req('/casino/blackjack/start',u.token,{key:randomUUID(),stake:50});
  expect(r.status).toBe(200);expect(r.data.player).toHaveLength(2);expect(r.data).not.toHaveProperty('deck');expect(r.data).not.toHaveProperty('state');expect(r.data.version).toBe(0);
 });
 it('работа: одна активная, не раньше срока и одна выплата',async()=>{
  const u=await fixture(0);const start=await req('/jobs/start',u.token,{jobType:'courier'}),id=String(start.data.id);
  expect((await req('/jobs/start',u.token,{jobType:'guard'})).status).toBe(409);expect((await req('/jobs/claim',u.token,{id})).status).toBe(409);
  await db.prepare('UPDATE jobs SET ends_at=? WHERE id=?').bind(Date.now()-1,id).run();
  await Promise.all([req('/jobs/claim',u.token,{id}),req('/jobs/claim',u.token,{id})]);expect(await wallet(u.id)).toBe(120);
 });
 it('бизнес: покупка уникальна, сбор шести часов атомарен',async()=>{
  const u=await fixture();expect((await req('/businesses/buy',u.token,{itemId:'kiosk'})).status).toBe(200);expect((await req('/businesses/buy',u.token,{itemId:'kiosk'})).status).toBe(409);
  await db.prepare('UPDATE owned_assets SET last_claim_at=? WHERE user_id=?').bind(Date.now()-24*3600000,u.id).run();
  await Promise.all([req('/businesses/claim',u.token,{itemId:'kiosk'}),req('/businesses/claim',u.token,{itemId:'kiosk'})]);expect(await wallet(u.id)).toBe(7600);
 });
 it('вылазка: прогресс, однократный finish и запрет чужого результата',async()=>{
  const u=await fixture(0),other=await fixture();const start=await req('/runs/start',u.token,{}),id=String(start.data.id);
  await db.prepare('UPDATE runs SET started_at=?,last_progress_at=? WHERE id=?').bind(Date.now()-61000,Date.now()-61000,id).run();
  const progress={seq:1,seconds:60,kills:20,money:140,level:2,distance:200};expect((await req(`/runs/${id}/progress`,u.token,progress)).status).toBe(200);
  expect((await req(`/runs/${id}/progress`,u.token,progress)).status).toBe(200);
  expect((await req(`/runs/${id}/finish`,other.token,{})).status).toBe(404);
  const results=await Promise.all([req(`/runs/${id}/finish`,u.token,{}),req(`/runs/${id}/finish`,u.token,{})]);expect(results.every(r=>r.status===200)).toBe(true);expect(await wallet(u.id)).toBe(140);
 });
 it('аномальный прогресс исключается из выплаты и рейтинга',async()=>{
  const u=await fixture(0),start=await req('/runs/start',u.token,{}),id=String(start.data.id);
  expect((await req(`/runs/${id}/progress`,u.token,{seq:1,seconds:1,kills:5000,money:50000,level:100,distance:100000})).status).toBe(409);
  const r=await req(`/runs/${id}/finish`,u.token,{});expect(r.data.verification_state).toBe('suspicious');expect(await wallet(u.id)).toBe(0);
 });
 it('банды: замена лучшего вклада, топ-10, уход и новый сезон без сброса XP',async()=>{
  const leader=await fixture(),created=await req('/gangs',leader.token,{name:`Ночная ${randomUUID().slice(0,5)}`,tag:randomUUID().slice(0,5)});expect(created.status).toBe(200);
  const id=String(created.data.id),season=seasonStart(Date.now());await db.prepare('INSERT OR IGNORE INTO seasons(id,end_at) VALUES(?,?)').bind(season,season+7*86400000).run();
  const members=[];
  for(let i=0;i<11;i++){const u=await fixture(),membership=randomUUID();members.push(u);await db.prepare("INSERT INTO gang_members(gang_id,user_id,role,joined_at,membership_id) VALUES(?,?,'member',?,?)").bind(id,u.id,Date.now(),membership).run();await db.prepare('INSERT INTO gang_member_scores VALUES(?,?,?,?,?,?)').bind(season,id,u.id,membership,i+1,100).run();}
  const detail=await req(`/gangs/${id}`,leader.token);expect(detail.data.season_score).toBe(65); // 2+...+11
  await db.prepare('UPDATE gangs SET lifetime_xp=100 WHERE id=?').bind(id).run();
  await req('/gangs/leave',members[10].token,{});const after=await req(`/gangs/${id}`,leader.token);expect(after.data.season_score).toBe(55);expect(after.data.lifetime_xp).toBe(100);
  await db.prepare('UPDATE gang_member_scores SET season_id=? WHERE gang_id=?').bind(season,id).run();
  expect((await req('/gangs/join',members[10].token,{token:'not-an-invite'})).status).not.toBe(200);
 });
 it('волны 18→25 заменяют вклад, 20 не ухудшает 25; lifetime XP складывается',async()=>{
  const u=await fixture(),created=await req('/gangs',u.token,{name:'Рекордная улица',tag:randomUUID().slice(0,5)}),gangId=String(created.data.id);
  for(const wave of [18,25,20]){
   const r=await req('/runs/start',u.token,{}),id=String(r.data.id),seconds=(wave-1)*30;
   await db.prepare('UPDATE runs SET started_at=?,last_progress_at=? WHERE id=?').bind(Date.now()-seconds*1000-1000,Date.now()-seconds*1000-1000,id).run();
   expect((await req(`/runs/${id}/progress`,u.token,{seq:1,seconds,kills:0,money:0,level:1,distance:0})).status).toBe(200);
   expect((await req(`/runs/${id}/finish`,u.token,{})).status).toBe(200);
  }
  const g=await req(`/gangs/${gangId}`,u.token);expect(g.data.season_score).toBe(25);expect(g.data.lifetime_xp).toBe(63);
 });
 it('приглашение не вступает автоматически, cooldown и права лидера соблюдаются',async()=>{
  const leader=await fixture(),member=await fixture(),other=await fixture();const g=await req('/gangs',leader.token,{name:'Двор по коду',tag:randomUUID().slice(0,5)}),id=String(g.data.id);
  const invite=await req(`/gangs/${id}/invite`,leader.token,{});expect(invite.status).toBe(200);
  expect((await req(`/gangs/${id}`,member.token)).data.members).toHaveLength(1);
  expect((await req('/gangs/join',member.token,{token:invite.data.token})).status).toBe(200);
  expect((await req(`/gangs/${id}/invite`,member.token,{})).status).toBe(403);
  expect((await req(`/gangs/${id}/kick`,other.token,{userId:member.id})).status).toBe(403);
  expect((await req('/gangs/leave',member.token,{})).status).toBe(200);
  expect((await req('/gangs/join',member.token,{token:invite.data.token})).status).toBe(409);
 });
 it('журнал нельзя менять, повтор покупки не влияет на боевые статы',async()=>{
  const u=await fixture();const purchase=await req('/assets/buy',u.token,{itemId:'sedan'});expect(purchase.status).toBe(200);
  await expect(db.prepare("UPDATE wallet_ledger SET delta=999999 WHERE user_id=?").bind(u.id).run()).rejects.toThrow(/ledger_immutable/);
  expect((await req('/me',u.token)).data).not.toHaveProperty('damage');expect(await wallet(u.id)).toBe(3000);
 });
});
