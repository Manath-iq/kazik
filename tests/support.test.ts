import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest';
import { Miniflare,convertV4MiniflareOptions,Response as MockResponse } from 'miniflare';
import type { V4FetchHandler } from 'miniflare';
import { build } from 'esbuild';
import { readFile,readdir } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { SUPPORT_TERMS_VERSION } from '@street/shared';
import type { SupportInfo,SupportOrder,SupportPayment } from '@street/shared';

let mf:Miniflare,disabled:Miniflare,db:D1Database,offDb:D1Database,counter=720000000;
let failure='',calls:{method:string;body:Record<string,unknown>}[]=[];
const secret='isolated-test-webhook-secret';
const outbound:V4FetchHandler=async request=>{
 const url=new URL(request.url);if(url.hostname!=='api.telegram.org')throw new Error('Unexpected external request in test');
 const method=url.pathname.split('/').pop()!,body=await request.json() as Record<string,unknown>;
 calls.push({method,body});
 if(failure===method)return MockResponse.json({ok:false,error_code:500,description:'Temporary failure'},{status:500});
 if(failure==='already-refunded'&&method==='refundStarPayment')return MockResponse.json({ok:false,error_code:400,description:'Bad Request: CHARGE_ALREADY_REFUNDED'},{status:400});
 return MockResponse.json({ok:true,result:method==='createInvoiceLink'?`https://t.me/$test_${body.payload}`:true});
};
beforeAll(async()=>{
  const compiled=await build({entryPoints:['apps/api/src/index.ts'],bundle:true,format:'esm',platform:'browser',write:false,target:'es2022',external:['cloudflare:workers']});
 const bindings={APP_URL:'https://example.test',BOT_USERNAME:'support_test_bot',ALLOWED_ORIGIN:'',BOT_TOKEN:'not-a-real-bot-token',WEBHOOK_SECRET:secret,PAYMENT_SUPPORT_USERNAME:'manath',STARS_ENABLED:'true'};
  const options={modules:true,compatibilityDate:'2026-11-04',d1Databases:['DB'],durableObjects:{CASINO_ROOMS:{className:'CasinoRoom',useSQLite:true}},script:compiled.outputFiles[0].text,outboundService:outbound};
 mf=new Miniflare(convertV4MiniflareOptions({...options,bindings}));
 disabled=new Miniflare(convertV4MiniflareOptions({...options,bindings:{...bindings,STARS_ENABLED:'false'}}));
 db=await mf.getD1Database('DB');offDb=await disabled.getD1Database('DB');
 const files=(await readdir('apps/api/migrations')).filter(f=>f.endsWith('.sql')).sort();
 const migration=(await Promise.all(files.map(f=>readFile(`apps/api/migrations/${f}`,'utf8')))).join('\n');
 const statements=migration.replace(/--[^\n]*/g,'').split(/;\s*(?=CREATE|PRAGMA|ALTER|$)/).filter(s=>s.trim()).map(s=>s.replace(/\s+/g,' ').trim()+';').join('\n');
 await Promise.all([db.exec(statements),offDb.exec(statements)]);
},30000);
beforeEach(()=>{calls=[];failure='';});
afterAll(async()=>{await Promise.all([mf?.dispose(),disabled?.dispose()]);});

async function fixture(database=db){
 const id=randomUUID(),token=randomUUID(),payer=++counter,now=Date.now();
 await database.batch([
  database.prepare('INSERT INTO users(id,telegram_id,display_name,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(id,String(payer),'Stars QA',now,now),
  database.prepare('INSERT INTO wallets(user_id,balance) VALUES(?,0)').bind(id),
  database.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),id,now+3600000),
 ]);return {id,token,payer};
}
async function req<T=Record<string,unknown>>(path:string,token?:string,body?:unknown,server=mf){
 const response=await server.dispatchFetch(`http://localhost/api${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,...await response.json() as {data:T;error?:{message:string}}};
}
const invoice=(stars=25,key=randomUUID())=>({key,stars,termsAccepted:true,termsVersion:SUPPORT_TERMS_VERSION});
async function hook(body:Record<string,unknown>,server=mf,provided=secret){return server.dispatchFetch('http://localhost/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':provided},body:JSON.stringify({update_id:++counter,...body})});}
async function checkout(user:Awaited<ReturnType<typeof fixture>>,order:string,overrides:Record<string,unknown>={},server=mf){
 return hook({pre_checkout_query:{id:randomUUID(),from:{id:user.payer},currency:'XTR',total_amount:25,invoice_payload:order,...overrides}},server);
}
function payment(user:Awaited<ReturnType<typeof fixture>>,order:string,charge=randomUUID(),overrides:Record<string,unknown>={}){
 return {chat:{id:user.payer,type:'private'},from:{id:user.payer},successful_payment:{currency:'XTR',total_amount:25,invoice_payload:order,telegram_payment_charge_id:charge,provider_payment_charge_id:'',...overrides}};
}
async function paidFixture(server=mf,database=db){const user=await fixture(database),order=randomUUID(),charge=randomUUID(),now=Date.now();await database.prepare('INSERT INTO star_orders(id,user_id,telegram_id,stars,terms_version,created_at,expires_at,invoice_url,checkout_query_id,checkout_until) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(order,user.id,String(user.payer),25,SUPPORT_TERMS_VERSION,now,now+1800000,'https://t.me/$fixture',randomUUID(),now+900000).run();expect((await hook({message:payment(user,order,charge)},server)).status).toBe(200);return {user,order,charge};}

describe('Stars: настоящий Workers + D1, только транспорт Bot API подменён',()=>{
 it('авторизация, выключенный приём и строгий список цен/согласие',async()=>{
  expect((await req('/support')).status).toBe(401);const u=await fixture();
  for(const body of [{...invoice(),stars:1},{...invoice(),stars:25.5},{...invoice(),stars:-25},{...invoice(),stars:Infinity},{...invoice(),termsAccepted:false},{...invoice(),termsVersion:'old'},{...invoice(),money:500}])expect((await req('/support/invoices',u.token,body)).status).toBe(400);
  const off=await fixture(offDb);expect((await req<SupportInfo>('/support',off.token,undefined,disabled)).data.enabled).toBe(false);
  expect((await req('/support/invoices',off.token,invoice(),disabled)).status).toBe(503);expect(calls).toHaveLength(0);
 });
 it('создаёт XTR invoice без x100/подписки, сохраняет условия и повторяет тот же ключ',async()=>{
  const u=await fixture(),body=invoice(),first=await req<SupportOrder>('/support/invoices',u.token,body);expect(first.status).toBe(200);expect(first.data.status).toBe('awaiting_payment');
  const sent=calls.find(c=>c.method==='createInvoiceLink')!.body;expect(sent).toMatchObject({currency:'XTR',provider_token:'',payload:body.key,prices:[{amount:25}]});expect(sent.prices).toHaveLength(1);expect(sent).not.toHaveProperty('subscription_period');expect(sent).not.toHaveProperty('max_tip_amount');
  expect((await req<SupportOrder>('/support/invoices',u.token,body)).data).toEqual(first.data);expect(calls).toHaveLength(1);
  expect((await req('/support/invoices',u.token,{...body,stars:100})).status).toBe(409);
  const other=await fixture();expect((await req('/support/invoices',other.token,body)).status).toBe(409);expect((await req(`/support/orders/${body.key}`,other.token)).status).toBe(404);
  const stored=await db.prepare('SELECT telegram_id,terms_version,created_at FROM star_orders WHERE id=?').bind(body.key).first();expect(stored).toMatchObject({telegram_id:String(u.payer),terms_version:SUPPORT_TERMS_VERSION});
  expect((await req('/me',u.token)).data.balance).toBe(0);
 });
 it('повтор создания после сбоя транспорта не теряет заказ и не раскрывает токен',async()=>{
  const u=await fixture(),body=invoice();failure='createInvoiceLink';const failed=await req('/support/invoices',u.token,body);expect(failed.status).toBe(503);expect(JSON.stringify(failed)).not.toContain('not-a-real-bot-token');
  failure='';expect((await req<SupportOrder>('/support/invoices',u.token,body)).data.id).toBe(body.key);
  expect((await db.prepare('SELECT COUNT(*) n FROM star_orders WHERE id=?').bind(body.key).first<{n:number}>())!.n).toBe(1);
 });
 it('100 и 250 Stars проходят тот же серверный контракт без игровых наград',async()=>{
  const u=await fixture();for(const stars of [100,250]){
   const body=invoice(stars);expect((await req<SupportOrder>('/support/invoices',u.token,body)).data.stars).toBe(stars);
   await checkout(u,body.key,{total_amount:stars});expect(calls.at(-1)?.body.ok).toBe(true);
   await hook({message:payment(u,body.key,randomUUID(),{total_amount:stars})});
  }expect((await req<SupportInfo>('/support',u.token)).data.history.every(p=>p.status==='paid')).toBe(true);expect((await req('/me',u.token)).data.balance).toBe(0);
 });
 it('просроченный счёт нельзя оплатить, даже с правильными суммой и владельцем',async()=>{
  const u=await fixture(),id=randomUUID(),now=Date.now();await db.prepare('INSERT INTO star_orders(id,user_id,telegram_id,stars,terms_version,created_at,expires_at,invoice_url) VALUES(?,?,?,?,?,?,?,?)').bind(id,u.id,String(u.payer),25,SUPPORT_TERMS_VERSION,now-3600000,now-1,'https://t.me/$expired').run();
  await checkout(u,id);expect(calls.at(-1)?.body.ok).toBe(false);expect((await req<SupportOrder>(`/support/orders/${id}`,u.token)).data.status).toBe('expired');
 });
 it('pre-checkout отвергает чужого плательщика, сумму, валюту и неизвестный счёт',async()=>{
  const u=await fixture(),body=invoice();await req('/support/invoices',u.token,body);
  for(const change of [{currency:'USD'},{total_amount:2500},{from:{id:u.payer+1}},{invoice_payload:randomUUID()}]){expect((await checkout(u,body.key,change)).status).toBe(200);expect(calls.at(-1)?.body.ok).toBe(false);}
  expect((await hook({pre_checkout_query:{id:'a',from:{id:u.payer},currency:'XTR',total_amount:25,invoice_payload:body.key}},mf,'wrong')).status).toBe(403);
 });
 it('один параллельный checkout, повтор того же query разрешён, но это ещё не оплата',async()=>{
  const u=await fixture(),body=invoice();await req('/support/invoices',u.token,body);calls=[];
  const query=randomUUID();await Promise.all([checkout(u,body.key,{id:query}),checkout(u,body.key)]);expect(calls.filter(c=>c.body.ok===true)).toHaveLength(1);expect(calls.filter(c=>c.body.ok===false)).toHaveLength(1);
  expect((await checkout(u,body.key,{id:query})).status).toBe(200);expect(calls.at(-1)?.body.ok).toBe(true);
  expect((await req<SupportOrder>(`/support/orders/${body.key}`,u.token)).data.status).toBe('processing');
  expect((await req<SupportInfo>('/support',u.token)).data.history).toHaveLength(0);
 });
 it('successful_payment подтверждает один раз даже при конкурентных повторах update/charge',async()=>{
  const u=await fixture(),body=invoice(),charge=randomUUID();await req('/support/invoices',u.token,body);await checkout(u,body.key);
  const event={update_id:++counter,message:payment(u,body.key,charge)};
  // Даже зарезервированный старым обработчиком команд update не должен терять деньги.
  await db.prepare('INSERT INTO telegram_updates(id,created_at) VALUES(?,?)').bind(event.update_id,Date.now()).run();
  const results=await Promise.all(Array.from({length:3},()=>hook(event)));expect(results.every(r=>r.status===200)).toBe(true);
  const history=(await req<SupportInfo>('/support',u.token)).data.history;expect(history).toHaveLength(1);expect(history[0]).toMatchObject({stars:25,status:'paid',chargeId:charge});
  expect((await req<SupportOrder>(`/support/orders/${body.key}`,u.token)).data.status).toBe('paid');
  const profile=(await req('/me',u.token)).data;expect(profile).toMatchObject({balance:0,best_wave:0,total_runs:0});expect(profile).not.toHaveProperty('damage');
  expect((await db.prepare('SELECT COUNT(*) n FROM wallet_ledger WHERE user_id=?').bind(u.id).first<{n:number}>())!.n).toBe(0);
  const other=await fixture();expect((await req<SupportInfo>('/support',other.token)).data.history).toHaveLength(0);
 });
 it('неверный платёж сохраняется для разбора, не подтверждает заказ; charge identity неизменна',async()=>{
  const u=await fixture(),body=invoice(),charge=randomUUID();await req('/support/invoices',u.token,body);await checkout(u,body.key);
  expect((await hook({message:payment(u,body.key,charge,{total_amount:100})})).status).toBe(200);
  expect((await req<SupportInfo>('/support',u.token)).data.history[0].status).toBe('review');expect((await req<SupportOrder>(`/support/orders/${body.key}`,u.token)).data.status).not.toBe('paid');
  expect((await hook({message:payment(u,body.key,charge)})).status).toBe(409);
 });
 it('второй реальный charge того же счёта не теряется и доступен к полному возврату',async()=>{
  const f=await paidFixture(),extra=randomUUID();await hook({message:payment(f.user,f.order,extra)});
  const history=(await req<SupportInfo>('/support',f.user.token)).data.history;expect(history).toHaveLength(2);expect(history.find(p=>p.chargeId===extra)?.status).toBe('review');
  expect((await req<SupportPayment>('/support/refunds',f.user.token,{chargeId:extra})).data.status).toBe('refunded');
 });
 it('refund раньше successful не отменяется поздним повтором success',async()=>{
  const u=await fixture(),body=invoice(),charge=randomUUID();await req('/support/invoices',u.token,body);await checkout(u,body.key);
  const event=payment(u,body.key,charge);await hook({message:{chat:event.chat,from:{id:123},refunded_payment:event.successful_payment}});
  await hook({message:event});expect((await req<SupportInfo>('/support',u.token)).data.history[0].status).toBe('refunded');expect((await req<SupportOrder>(`/support/orders/${body.key}`,u.token)).data.status).toBe('refunded');
 });
 it('выключение новых счетов не теряет позднюю оплату, историю или возврат',async()=>{
  const f=await paidFixture(disabled,offDb);expect((await req<SupportInfo>('/support',f.user.token,undefined,disabled)).data.history[0].status).toBe('paid');
  await checkout(f.user,f.order,{},disabled);expect(calls.at(-1)?.body.ok).toBe(false);
  expect((await req<SupportPayment>('/support/refunds',f.user.token,{chargeId:f.charge},disabled)).data.status).toBe('refunded');
 });
 it('возврат только своему плательщику, конкурентные запросы вызывают Bot API один раз',async()=>{
  const f=await paidFixture(),other=await fixture();expect((await req('/support/refunds',other.token,{chargeId:f.charge})).status).toBe(404);calls=[];
  const rows=await Promise.all([req<SupportPayment>('/support/refunds',f.user.token,{chargeId:f.charge}),req<SupportPayment>('/support/refunds',f.user.token,{chargeId:f.charge})]);expect(rows.every(r=>[200,202].includes(r.status))).toBe(true);
  expect(calls.filter(c=>c.method==='refundStarPayment')).toHaveLength(1);expect(calls[0].body).toEqual({user_id:f.user.payer,telegram_payment_charge_id:f.charge});
  expect((await req<SupportPayment>('/support/refunds',f.user.token,{chargeId:f.charge})).data.status).toBe('refunded');expect(calls).toHaveLength(1);
  expect((await req('/me',f.user.token)).data.balance).toBe(0);
 });
 it('неопределённый возврат остаётся pending, повтор безопасен и webhook завершает его',async()=>{
  const f=await paidFixture();failure='refundStarPayment';const r=await req<SupportPayment>('/support/refunds',f.user.token,{chargeId:f.charge});expect(r.status).toBe(202);expect(r.data.status).toBe('refund_pending');
  const n=calls.length;await req('/support/refunds',f.user.token,{chargeId:f.charge});expect(calls).toHaveLength(n);
  const event=payment(f.user,f.order,f.charge);await hook({message:{chat:event.chat,refunded_payment:event.successful_payment}});expect((await req<SupportInfo>('/support',f.user.token)).data.history[0].status).toBe('refunded');
 });
 it('retry после неопределённого возврата учитывает ответ already refunded',async()=>{
  const f=await paidFixture();failure='refundStarPayment';await req('/support/refunds',f.user.token,{chargeId:f.charge});
  await db.prepare('UPDATE star_payments SET refund_requested_at=? WHERE charge_id=?').bind(Date.now()-31000,f.charge).run();failure='already-refunded';
  expect((await req<SupportPayment>('/support/refunds',f.user.token,{chargeId:f.charge})).data.status).toBe('refunded');
 });
 it('сбой записи D1 не дедуплицирует платёж навсегда: повтор webhook восстанавливается',async()=>{
  const u=await fixture(),body=invoice(),charge=randomUUID();await req('/support/invoices',u.token,body);await checkout(u,body.key);
  await db.exec("CREATE TRIGGER test_failure BEFORE INSERT ON star_payments BEGIN SELECT RAISE(ABORT,'test_failure'); END;");
  const event={update_id:++counter,message:payment(u,body.key,charge)};expect((await hook(event)).status).toBe(500);
  await db.exec('DROP TRIGGER test_failure;');expect((await hook(event)).status).toBe(200);expect((await req<SupportInfo>('/support',u.token)).data.history[0].status).toBe('paid');
 });
  it('условия, /support и /paysupport доступны в боте без платёжного согласия',async()=>{
  const u=await fixture();for(const text of ['/terms','/support','/paysupport'])expect((await hook({message:{chat:{id:u.payer,type:'private'},from:{id:u.payer},text}})).status).toBe(200);
   expect(calls.filter(c=>c.method==='sendMessage')).toHaveLength(3);expect(calls.every(c=>String(c.body.text).includes('https://t.me/manath'))).toBe(true);
  });
  it('/start сохраняет рабочий WebApp fallback и повторяет доставку после сбоя Bot API',async()=>{
   const u=await fixture(),event={update_id:++counter,message:{chat:{id:u.payer,type:'private'},from:{id:u.payer},text:'/start play'}};
   failure='sendMessage';expect((await hook(event)).status).toBe(503);failure='';expect((await hook(event)).status).toBe(200);expect((await hook(event)).status).toBe(200);
   const sent=calls.filter(c=>c.method==='sendMessage');expect(sent).toHaveLength(2);expect(sent[1].body.text).toContain('<b>БОТ-БАНДИТ</b>');expect(sent[1].body.parse_mode).toBe('HTML');
   expect(sent[1].body.reply_markup).toMatchObject({inline_keyboard:[[{text:'🎮 Начать игру',web_app:{url:'https://example.test'}}]]});expect(calls.some(c=>c.method==='sendWidget')).toBe(false);
  });
 it('БД запрещает переписать цену/владельца платежа и отменить подтверждённый возврат',async()=>{
  const f=await paidFixture();await expect(db.prepare('UPDATE star_orders SET stars=250 WHERE id=?').bind(f.order).run()).rejects.toThrow(/star_order_immutable/);
  await expect(db.prepare('UPDATE star_payments SET stars=250 WHERE charge_id=?').bind(f.charge).run()).rejects.toThrow(/star_payment_immutable/);
  await req('/support/refunds',f.user.token,{chargeId:f.charge});await expect(db.prepare("UPDATE star_payments SET status='paid' WHERE charge_id=?").bind(f.charge).run()).rejects.toThrow(/star_refund_final/);
 });
});
