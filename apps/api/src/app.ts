import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { seasonStart } from '@street/shared';
import type { AppEnv } from './types';
import { hash,sql,fail,rateLimit } from './db';
import { telegramAuth } from './auth';
import { runs } from './runs';
import { casino } from './casino';
import { gangs,gangDetails,gangRanking } from './social';
import { city } from './city';
import { webhook } from './bot';
import { support } from './support';
export const app=new Hono<AppEnv>();
app.use('/api/*',bodyLimit({maxSize:20000,onError:c=>c.json({error:{message:'Запрос слишком большой'}},413)}));
app.use('/api/*',async(c,next)=>{
 const origin=c.env.ALLOWED_ORIGIN||new URL(c.req.url).origin;
 return cors({origin,allowHeaders:['Content-Type','Authorization'],allowMethods:['GET','POST','OPTIONS'],maxAge:86400})(c,next);
});
app.use('/api/*',async(c,next)=>{
 c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');
 await next();
});
app.get('/api/health',c=>c.json({data:{ok:true}}));
app.post('/api/auth/telegram',telegramAuth);
app.post('/api/telegram/webhook',webhook);
app.use('/api/*',async(c,next)=>{
 const token=c.req.header('Authorization')?.replace(/^Bearer /,'');
 if(!token||token.length>150)fail('Открой игру через Telegram',401);
 const session=await sql(c.env.DB,'SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?',await hash(token),Date.now()).first<{user_id:string}>();
 if(!session)fail('Сессия истекла. Открой игру заново.',401);
 c.set('userId',session.user_id);
 if(c.req.method==='POST')await rateLimit(c.env.DB,session.user_id);
 await next();
});
app.get('/api/me',async c=>{
 const db=c.env.DB,user=c.get('userId');
 const [u,records,member,owned,job,best]=await Promise.all([
  sql(db,'SELECT u.id,u.display_name,u.username,u.avatar_url,w.balance FROM users u JOIN wallets w ON w.user_id=u.id WHERE u.id=?',user).first(),
  sql(db,`SELECT COALESCE(MAX(wave),0) best_wave,COALESCE(MAX(duration_seconds),0) best_duration,COUNT(*) total_runs,COALESCE(SUM(kills),0) total_kills,COALESCE(MAX(CASE WHEN season_id=? THEN wave ELSE 0 END),0) season_wave FROM runs WHERE user_id=? AND status='finished' AND verification_state='guarded'`,seasonStart(Date.now()),user).first(),
  sql(db,'SELECT gang_id FROM gang_members WHERE user_id=?',user).first<{gang_id:string}>(),
  sql(db,'SELECT item_id,purchased_at,last_claim_at FROM owned_assets WHERE user_id=?',user).all(),
  sql(db,'SELECT id,job_type,ends_at,claimed_at FROM jobs WHERE user_id=? AND claimed_at IS NULL',user).first(),
  sql(db,"SELECT duration_seconds FROM runs WHERE user_id=? AND status='finished' AND verification_state='guarded' ORDER BY wave DESC,duration_seconds DESC LIMIT 1",user).first<{duration_seconds:number}>(),
 ]);
 return c.json({data:{...u,...records,best_duration:best?.duration_seconds??0,gang:member?await gangDetails(db,member.gang_id):null,owned:owned.results,job,serverNow:Date.now()}});
});
app.get('/api/wallet/ledger',async c=>c.json({data:(await sql(c.env.DB,'SELECT id,delta,reason,created_at FROM wallet_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 50',c.get('userId')).all()).results}));
app.get('/api/leaderboard/players',async c=>c.json({data:(await sql(c.env.DB,`WITH ranked AS (SELECT user_id,wave,duration_seconds,ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY wave DESC,duration_seconds DESC) n FROM runs WHERE status='finished' AND verification_state='guarded') SELECT u.id,u.display_name name,r.wave score,r.duration_seconds duration FROM ranked r JOIN users u ON u.id=r.user_id WHERE n=1 ORDER BY score DESC,duration DESC LIMIT 50`).all()).results}));
app.get('/api/leaderboard/gangs',async c=>c.json({data:await gangRanking(c.env.DB)}));
app.route('/api/runs',runs);app.route('/api/casino',casino);app.route('/api/gangs',gangs);app.route('/api',city);app.route('/api/support',support);
app.notFound(c=>c.json({error:{message:'Маршрут не найден'}},404));
app.onError((error,c)=>{
 if(error instanceof HTTPException)return c.json({error:{message:error.message}},error.status);
 if(error instanceof z.ZodError)return c.json({error:{message:'Проверь введённые данные',details:error.issues.map(i=>i.message)}},400);
 if(error instanceof SyntaxError)return c.json({error:{message:'Некорректный JSON'}},400);
 const text=String(error);
 if(/CHECK constraint failed/.test(text))return c.json({error:{message:'Недостаточно игровых денег или превышен лимит кошелька'}},409);
 if(/UNIQUE constraint|gang_full/.test(text))return c.json({error:{message:'Действие уже выполнено, есть активная операция или достигнут лимит'}},409);
 if(/gang_cooldown/.test(text))return c.json({error:{message:'Банду можно менять раз в 24 часа'}},409);
 console.error(JSON.stringify({event:'api_error',message:text.slice(0,500)}));
 return c.json({error:{message:'Не удалось выполнить действие. Повтори чуть позже.'}},500);
});
