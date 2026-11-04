import { Hono } from 'hono';
import { z } from 'zod';
import { CATALOG,JOBS,businessIncome } from '@street/shared';
import { sql,ledger,fail } from './db';
import type { AppEnv } from './types';
export const city=new Hono<AppEnv>();
city.get('/city/catalog',c=>c.json({data:{items:CATALOG,jobs:JOBS}}));
city.post('/jobs/start',async c=>{
 const {jobType}=z.object({jobType:z.string()}).parse(await c.req.json()),job=JOBS.find(j=>j.id===jobType);
 if(!job)fail('Неизвестная работа');const now=Date.now(),id=crypto.randomUUID();
 await sql(c.env.DB,'INSERT INTO jobs(id,user_id,job_type,started_at,ends_at) VALUES(?,?,?,?,?)',id,c.get('userId'),job.id,now,now+job.seconds*1000).run();
 return c.json({data:{id,endsAt:now+job.seconds*1000}});
});
city.post('/jobs/claim',async c=>{
 const {id}=z.object({id:z.uuid()}).parse(await c.req.json()),db=c.env.DB,user=c.get('userId');
 const row=await sql(db,'SELECT job_type,ends_at,claimed_at FROM jobs WHERE id=? AND user_id=?',id,user).first<{job_type:string;ends_at:number;claimed_at:number|null}>();
 if(!row)fail('Работа не найдена',404);if(row.claimed_at)return c.json({data:{claimed:true}});
 if(Date.now()<row.ends_at)fail('Работа ещё не завершена',409);
 const reward=JOBS.find(j=>j.id===row.job_type)!.reward,token=crypto.randomUUID(),now=Date.now();
 await db.batch([
  sql(db,'UPDATE jobs SET claimed_at=?,claim_token=? WHERE id=? AND user_id=? AND claimed_at IS NULL AND ends_at<=?',now,token,id,user,now),
  sql(db,`INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) SELECT ?,user_id,?,'job',id,? FROM jobs WHERE id=? AND claim_token=?`,crypto.randomUUID(),reward,now,id,token),
 ]);
 return c.json({data:{claimed:true}});
});
async function buy(db:D1Database,user:string,id:string) {
 const item=CATALOG.find(i=>i.id===id);if(!item)fail('Неизвестный объект');const now=Date.now();
 await db.batch([
  sql(db,'INSERT INTO owned_assets(user_id,item_id,purchased_at,last_claim_at) VALUES(?,?,?,?)',user,id,now,now),
  ledger(db,user,-item.price,'purchase',id),
 ]);
 return {purchased:true};
}
city.post('/businesses/buy',async c=>{
 const {itemId}=z.object({itemId:z.string()}).parse(await c.req.json());
 if(!CATALOG.some(i=>i.id===itemId&&i.category==='business'))fail('Это не бизнес');
 return c.json({data:await buy(c.env.DB,c.get('userId'),itemId)});
});
city.post('/assets/buy',async c=>{
 const {itemId}=z.object({itemId:z.string()}).parse(await c.req.json());
 if(!CATALOG.some(i=>i.id===itemId&&i.category!=='business'))fail('Это не имущество');
 return c.json({data:await buy(c.env.DB,c.get('userId'),itemId)});
});
city.post('/businesses/claim',async c=>{
 const {itemId}=z.object({itemId:z.string()}).parse(await c.req.json()),db=c.env.DB,user=c.get('userId');
 const item=CATALOG.find(i=>i.id===itemId&&i.hourly>0);if(!item)fail('Это не бизнес');
 const row=await sql(db,'SELECT last_claim_at FROM owned_assets WHERE user_id=? AND item_id=?',user,itemId).first<{last_claim_at:number}>();
 if(!row)fail('Бизнес не куплен');const now=Date.now(),amount=businessIncome(item.hourly,now-row.last_claim_at);
 if(amount<1)fail('Доход ещё не накопился');
 // Сохраняем дробную часть дохода временем, а не теряем её при каждом нажатии.
 const next=now-Math.floor(((Math.min(now-row.last_claim_at,21600000)*item.hourly)%3600000)/item.hourly),token=crypto.randomUUID();
 const result=await db.batch([
  sql(db,'UPDATE owned_assets SET last_claim_at=?,claim_token=? WHERE user_id=? AND item_id=? AND last_claim_at=?',next,token,user,itemId,row.last_claim_at),
  sql(db,`INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) SELECT ?,user_id,?,'business',?,? FROM owned_assets WHERE user_id=? AND item_id=? AND claim_token=?`,crypto.randomUUID(),amount,`${itemId}:${row.last_claim_at}`,now,user,itemId,token),
 ]);
 if(!result[0].meta.changes)fail('Доход уже собран другим запросом',409);
 return c.json({data:{earned:amount}});
});
