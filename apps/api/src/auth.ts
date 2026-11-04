import { z } from 'zod';
import { sql, hash, fail } from './db';
import type { Ctx } from './types';
const enc = new TextEncoder();
const telegramUser = z.object({ id:z.number().int().positive(), first_name:z.string().max(128), last_name:z.string().max(128).optional(), username:z.string().max(64).optional(), photo_url:z.url().optional() });
async function hmac(key: Uint8Array, message: string) {
 const k=await crypto.subtle.importKey('raw',key as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(message)));
}
export async function validateInitData(raw:string, token:string, now=Date.now()) {
 const params=new URLSearchParams(raw), signature=params.get('hash')??'';
 if(!/^[a-f0-9]{64}$/i.test(signature)) fail('Неверная подпись Telegram',401);
 if(new Set([...params.keys()]).size !== [...params.keys()].length) fail('Повторяющиеся поля Telegram',401);
 params.delete('hash');
 const data=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=await hmac(enc.encode('WebAppData'),token);
 const key=await crypto.subtle.importKey('raw',secret as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=new Uint8Array(signature.match(/../g)!.map(x=>parseInt(x,16)));
 if(!await crypto.subtle.verify('HMAC',key,bytes,enc.encode(data))) fail('Неверная подпись Telegram',401);
 const date=Number(params.get('auth_date'))*1000;
 if(!Number.isFinite(date)||date>now+30000||now-date>3600000) fail('Вход устарел. Открой игру заново в Telegram.',401);
 let user:unknown; try { user=JSON.parse(params.get('user')??'null'); } catch { fail('Некорректный профиль',401); }
 return telegramUser.parse(user);
}
export async function createSession(db:D1Database, user:{id:string; name:string; username?:string; avatar?:string}) {
 const id=crypto.randomUUID(), now=Date.now();
 await db.batch([
  sql(db,`INSERT INTO users(id,telegram_id,display_name,username,avatar_url,created_at,last_seen_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,avatar_url=excluded.avatar_url,last_seen_at=excluded.last_seen_at`,id,user.id,user.name,user.username??'',user.avatar??null,now,now),
  sql(db,'INSERT OR IGNORE INTO wallets(user_id,balance) SELECT id,0 FROM users WHERE telegram_id=?',user.id),
 ]);
 const u=await sql(db,'SELECT id FROM users WHERE telegram_id=?',user.id).first<{id:string}>();
 const token=crypto.randomUUID()+crypto.randomUUID();
 await sql(db,'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',await hash(token),u!.id,now+7200000).run();
 return {token,expiresAt:now+7200000};
}
export async function telegramAuth(c:Ctx) {
 const body=z.object({initData:z.string().min(1).max(12000)}).parse(await c.req.json());
 if(!c.env.BOT_TOKEN) fail('Telegram-вход ещё не настроен',403);
 const u=await validateInitData(body.initData,c.env.BOT_TOKEN);
 return c.json({data:await createSession(c.env.DB,{id:String(u.id),name:[u.first_name,u.last_name].filter(Boolean).join(' '),username:u.username,avatar:u.photo_url})});
}
