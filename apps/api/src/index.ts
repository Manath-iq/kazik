import { app } from './app';
import { expireRound } from './casino';
import { sql } from './db';
import type { Bindings,RoundRow } from './types';
export default {
 fetch:app.fetch,
 async scheduled(_event:ScheduledController,env:Bindings) {
  const now=Date.now();
  // До 42 обращений D1: Free допускает 50 на invocation (batch считается одним).
  const expired=(await sql(env.DB,"SELECT * FROM casino_rounds WHERE status='active' AND expires_at<=? LIMIT 20",now).all<RoundRow>()).results;
  for(const round of expired)try{await expireRound(env.DB,round);}catch(error){console.warn(JSON.stringify({event:'expiry_retry',id:round.id,message:String(error).slice(0,150)}));}
  await env.DB.batch([
   sql(env.DB,'DELETE FROM sessions WHERE token_hash IN(SELECT token_hash FROM sessions WHERE expires_at<? LIMIT 500)',now),
   sql(env.DB,'DELETE FROM action_limits WHERE bucket IN(SELECT bucket FROM action_limits WHERE bucket<? LIMIT 500)',Math.floor(now/60000)-2),
   sql(env.DB,"UPDATE runs SET status='abandoned',ended_at=? WHERE id IN(SELECT id FROM runs WHERE status='active' AND last_progress_at<? LIMIT 50)",now,now-3600000),
   sql(env.DB,'DELETE FROM telegram_updates WHERE id IN(SELECT id FROM telegram_updates WHERE created_at<? LIMIT 500)',now-7*86400000),
  ]);
 },
} satisfies ExportedHandler<Bindings>;
