import { Hono } from 'hono';
import { z } from 'zod';
import { SUPPORT_AMOUNTS,SUPPORT_TERMS,SUPPORT_TERMS_VERSION,supportInvoiceSchema } from '@street/shared';
import type { SupportInfo,SupportOrder,SupportPayment } from '@street/shared';
import type { AppEnv,Bindings } from './types';
import { fail,rateLimit,sql } from './db';
import { TelegramApiError,telegramCall } from './telegram-api';

type OrderRow={id:string;user_id:string;telegram_id:string;stars:number;terms_version:string;created_at:number;expires_at:number;invoice_url:string|null;checkout_query_id:string|null;checkout_until:number;paid_charge_id:string|null;payment_status?:SupportPayment['status']|null};
type PaymentRow={charge_id:string;order_id:string|null;payer_telegram_id:string;invoice_payload:string;currency:string;stars:number;status:SupportPayment['status'];received_at:number;refunded_at:number|null;refund_requested_at:number|null};
export const paymentSchema=z.object({currency:z.string().min(1).max(8),total_amount:z.number().int().positive().safe(),invoice_payload:z.string().min(1).max(128),telegram_payment_charge_id:z.string().min(1).max(512),is_recurring:z.boolean().optional()});
export const preCheckoutSchema=z.object({id:z.string().min(1).max(512),from:z.object({id:z.number().int().positive().safe()}),currency:z.string().max(8),total_amount:z.number().int().positive().safe(),invoice_payload:z.string().min(1).max(128)});
type Payment=z.infer<typeof paymentSchema>;

export function paymentSupportUrl(env:Bindings){const name=env.PAYMENT_SUPPORT_USERNAME;return name&&/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name)?`https://t.me/${name}`:null;}
export function starsEnabled(env:Bindings){return String(env.STARS_ENABLED)==='true'&&Boolean(env.BOT_TOKEN&&env.WEBHOOK_SECRET&&paymentSupportUrl(env));}
async function telegramId(db:D1Database,user:string){const u=await sql(db,'SELECT telegram_id FROM users WHERE id=?',user).first<{telegram_id:string}>();if(!u)fail('Игрок не найден',404);return u.telegram_id;}
const publicPayment=(p:PaymentRow):SupportPayment=>({chargeId:p.charge_id,stars:p.stars,currency:p.currency,status:p.status,receivedAt:p.received_at,refundedAt:p.refunded_at});
function publicOrder(o:OrderRow):SupportOrder{
 const status=o.paid_charge_id?(o.payment_status==='refunded'?'refunded':'paid'):o.expires_at<=Date.now()?'expired':o.checkout_until>Date.now()?'processing':'awaiting_payment';
 return {id:o.id,stars:o.stars,invoiceUrl:o.invoice_url,expiresAt:o.expires_at,status};
}
async function getOrder(db:D1Database,id:string,user:string){
 const row=await sql(db,'SELECT o.*,p.status payment_status FROM star_orders o LEFT JOIN star_payments p ON p.charge_id=o.paid_charge_id WHERE o.id=? AND o.user_id=?',id,user).first<OrderRow>();
 if(!row)fail('Счёт не найден',404);return row;
}

export const support=new Hono<AppEnv>();
support.get('/',async c=>{
 const db=c.env.DB,user=c.get('userId'),payer=await telegramId(db,user);
 const [history,pending]=await Promise.all([
  sql(db,'SELECT * FROM star_payments WHERE payer_telegram_id=? ORDER BY received_at DESC LIMIT 20',payer).all<PaymentRow>(),
  sql(db,'SELECT * FROM star_orders WHERE user_id=? AND paid_charge_id IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 1',user,Date.now()).first<OrderRow>(),
 ]);
 const data:SupportInfo={enabled:starsEnabled(c.env)&&/^\d+$/.test(payer),amounts:SUPPORT_AMOUNTS,termsVersion:SUPPORT_TERMS_VERSION,terms:SUPPORT_TERMS,supportUrl:paymentSupportUrl(c.env),history:history.results.map(publicPayment),pendingOrder:pending?publicOrder(pending):null};
 return c.json({data});
});
support.get('/orders/:id',async c=>c.json({data:publicOrder(await getOrder(c.env.DB,z.uuid().parse(c.req.param('id')),c.get('userId')))}));
support.post('/invoices',async c=>{
 const input=supportInvoiceSchema.parse(await c.req.json()),db=c.env.DB,user=c.get('userId'),payer=await telegramId(db,user);
 if(!starsEnabled(c.env)||!/^\d+$/.test(payer))fail('Приём Stars сейчас недоступен. История и возвраты продолжают работать.',503);
 let row=await sql(db,'SELECT * FROM star_orders WHERE id=?',input.key).first<OrderRow>();
 if(row&&(row.user_id!==user||row.stars!==input.stars||row.terms_version!==input.termsVersion))fail('Ключ счёта уже используется для другой операции',409);
 if(!row){
  await rateLimit(db,`stars:${user}`,5);const now=Date.now();
  await sql(db,'INSERT OR IGNORE INTO star_orders(id,user_id,telegram_id,stars,terms_version,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',input.key,user,payer,input.stars,input.termsVersion,now,now+30*60000).run();
  row=await getOrder(db,input.key,user);
  if(row.stars!==input.stars||row.terms_version!==input.termsVersion)fail('Ключ счёта уже используется',409);
 }
 if(row.paid_charge_id||row.expires_at<=Date.now())return c.json({data:publicOrder(await getOrder(db,row.id,user))});
 if(!row.invoice_url){
  let url:string;
  try{url=await telegramCall(c.env,'createInvoiceLink',{
   title:'Поддержка STREET LEGENDS',description:`Разовая поддержка разработки: ${row.stars} Stars. Без игровых денег, предметов и преимуществ. Не подписка.`,
   payload:row.id,provider_token:'',currency:'XTR',prices:[{label:'Поддержка разработки',amount:row.stars}],
  },z.string().url().max(2048));}catch{fail('Telegram не создал счёт. Повтори с тем же выбранным платежом.',503);}
  const link=new URL(url);if(link.origin!=='https://t.me'||!/^\/(?:\$|invoice\/)[A-Za-z0-9_=-]+$/.test(link.pathname))fail('Telegram вернул неверную ссылку счёта',503);
  // При конкурентном повторе возвращаем сохранённую ссылку, а не два разных результата.
  await sql(db,'UPDATE star_orders SET invoice_url=? WHERE id=? AND invoice_url IS NULL',url,row.id).run();
 }
 return c.json({data:publicOrder(await getOrder(db,row.id,user))});
});

export async function answerCheckout(env:Bindings,q:z.infer<typeof preCheckoutSchema>){
 const db=env.DB,row=await sql(db,'SELECT * FROM star_orders WHERE id=?',q.invoice_payload).first<OrderRow>(),now=Date.now();
 let error='Счёт недействителен. Создай новый в разделе поддержки игры.';
 let accepted=false;
 if(!starsEnabled(env))error='Приём Stars временно выключен. Игра остаётся бесплатной.';
 else if(row&&row.telegram_id!==String(q.from.id))error='Этот счёт создан для другого игрока. Открой поддержку из своего профиля.';
 else if(row&&q.currency==='XTR'&&row.stars===q.total_amount&&row.expires_at>now&&row.invoice_url&&!row.paid_charge_id&&row.terms_version===SUPPORT_TERMS_VERSION){
  const result=await sql(db,`UPDATE star_orders SET checkout_query_id=?,checkout_until=? WHERE id=? AND paid_charge_id IS NULL AND expires_at>? AND (checkout_query_id IS NULL OR checkout_query_id=? OR checkout_until<=?)`,q.id,now+15*60000,row.id,now,q.id,now).run();
  accepted=Boolean(result.meta.changes);if(!accepted)error='Этот счёт уже обрабатывается. Проверь историю перед повторной оплатой.';
 }
 // Не ставим dedupe до ответа: Telegram может повторить запрос после сетевого сбоя.
 await telegramCall(env,'answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok:accepted,...(accepted?{}:{error_message:error})},z.literal(true),4500);
 return accepted;
}

export async function recordPayment(env:Bindings,payer:string,payment:Payment,refunded=false){
 const db=env.DB,charge=payment.telegram_payment_charge_id,now=Date.now();
 const [order,old]=await Promise.all([
  sql(db,'SELECT * FROM star_orders WHERE id=?',payment.invoice_payload).first<OrderRow>(),
  sql(db,'SELECT * FROM star_payments WHERE charge_id=?',charge).first<PaymentRow>(),
 ]);
 if(old&&(old.payer_telegram_id!==payer||old.currency!==payment.currency||old.stars!==payment.total_amount||old.invoice_payload!==payment.invoice_payload)){
  console.error(JSON.stringify({event:'stars_charge_identity_mismatch'}));fail('Данные платежа не совпадают',409);
 }
 // Принимаем поздний successful_payment и после выключения флага: деньги уже уплачены.
 const valid=Boolean(order&&order.telegram_id===payer&&order.stars===payment.total_amount&&payment.currency==='XTR'&&order.terms_version===SUPPORT_TERMS_VERSION&&order.checkout_query_id&&!payment.is_recurring);
 await db.batch([
  sql(db,`INSERT OR IGNORE INTO star_payments(charge_id,order_id,payer_telegram_id,invoice_payload,currency,stars,status,received_at,refunded_at) VALUES(?,?,?,?,?,?,?,?,?)`,charge,order?.id??null,payer,payment.invoice_payload,payment.currency,payment.total_amount,refunded?'refunded':'review',now,refunded?now:null),
  ...(refunded?[sql(db,"UPDATE star_payments SET status='refunded',refunded_at=COALESCE(refunded_at,?) WHERE charge_id=?",now,charge)]:[]),
  ...(valid?[
   sql(db,`UPDATE star_orders SET paid_charge_id=? WHERE id=? AND (paid_charge_id IS NULL OR paid_charge_id=?) AND EXISTS(SELECT 1 FROM star_payments WHERE charge_id=? AND payer_telegram_id=? AND stars=? AND currency='XTR' AND invoice_payload=?)`,charge,order!.id,charge,charge,payer,payment.total_amount,order!.id),
   sql(db,`UPDATE star_payments SET status='paid' WHERE charge_id=? AND status='review' AND EXISTS(SELECT 1 FROM star_orders WHERE id=? AND paid_charge_id=?)`,charge,order!.id,charge),
  ]:[]),
 ]);
 const saved=await sql(db,'SELECT * FROM star_payments WHERE charge_id=?',charge).first<PaymentRow>();
 if(saved?.status==='review')console.warn(JSON.stringify({event:'stars_payment_review',orderId:order?.id??null}));
 return saved!;
}

support.post('/refunds',async c=>{
 const {chargeId}=z.object({chargeId:z.string().min(1).max(512)}).strict().parse(await c.req.json()),db=c.env.DB,payer=await telegramId(db,c.get('userId'));
 const row=await sql(db,'SELECT * FROM star_payments WHERE charge_id=? AND payer_telegram_id=?',chargeId,payer).first<PaymentRow>();
 if(!row)fail('Платёж не найден',404);if(row.status==='refunded')return c.json({data:publicPayment(row)});
 if(row.currency!=='XTR')fail('Для разбора этого платежа свяжись с поддержкой',409);
 const now=Date.now(),lock=await sql(db,`UPDATE star_payments SET status='refund_pending',refund_requested_at=? WHERE charge_id=? AND status!='refunded' AND (refund_requested_at IS NULL OR refund_requested_at<=?)`,now,chargeId,now-30000).run();
 if(lock.meta.changes){
  let confirmed=false;
  try{await telegramCall(c.env,'refundStarPayment',{user_id:Number(payer),telegram_payment_charge_id:row.charge_id},z.literal(true));confirmed=true;}
  catch(error){confirmed=error instanceof TelegramApiError&&error.alreadyRefunded;if(!confirmed)console.warn(JSON.stringify({event:'stars_refund_pending'}));}
  if(confirmed)await sql(db,"UPDATE star_payments SET status='refunded',refunded_at=COALESCE(refunded_at,?) WHERE charge_id=?",Date.now(),chargeId).run();
 }
 const saved=(await sql(db,'SELECT * FROM star_payments WHERE charge_id=?',chargeId).first<PaymentRow>())!;
 return c.json({data:publicPayment(saved)},saved.status==='refunded'?200:202);
});
