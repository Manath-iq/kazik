import { Hono } from 'hono';
import { BALANCE, progressSchema, seasonStart, maxSpawned } from '@street/shared';
import type { RunProgress } from '@street/shared';
import { sql, fail, randomInt } from './db';
import type { AppEnv, RunRow } from './types';

export function checkProgress(run:RunRow,p:RunProgress,now:number) {
 const dt=p.seconds-run.duration_seconds;
 const real=(now-run.started_at)/1000;
 if(p.seq!==run.seq+1 || dt<0 || p.seconds>real+2 || p.kills<run.kills || p.money<run.earned || p.distance<run.distance) return 'Нарушена последовательность забега';
 if(dt>(now-run.last_progress_at)/1000+3) return 'Игровое время не соответствует серверному';
 if(p.kills>maxSpawned(p.seconds)+2 || p.kills-run.kills>maxSpawned(p.seconds)-maxSpawned(run.duration_seconds)+74) return 'Слишком много убийств';
 if(p.distance-run.distance>(dt+2)*BALANCE.speed*1.5) return 'Недопустимая скорость';
 if(p.money>p.kills*25+Math.floor((p.seconds/30+1)/5)*150 || p.level>1+Math.floor(p.kills*3/6)) return 'Неправдоподобный прогресс';
 return null;
}
async function getRun(db:D1Database,id:string,user:string) {
 const row=await sql(db,'SELECT * FROM runs WHERE id=? AND user_id=?',id,user).first<RunRow>();
 if(!row) fail('Вылазка не найдена',404); return row;
}
export const runs=new Hono<AppEnv>();
runs.post('/start',async c=>{
 const db=c.env.DB,user=c.get('userId'),now=Date.now(),id=crypto.randomUUID(),seed=randomInt(2147483647),season=seasonStart(now);
 const member=await sql(db,'SELECT gang_id,membership_id FROM gang_members WHERE user_id=?',user).first<{gang_id:string;membership_id:string}>();
 await db.batch([
  sql(db,"UPDATE runs SET status='abandoned',ended_at=? WHERE user_id=? AND status='active'",now,user),
  sql(db,'INSERT OR IGNORE INTO seasons(id,end_at) VALUES(?,?)',season,season+7*86400000),
  sql(db,'INSERT INTO runs(id,user_id,seed,gang_id_at_start,membership_id,season_id,started_at,last_progress_at) VALUES(?,?,?,?,?,?,?,?)',id,user,seed,member?.gang_id??null,member?.membership_id??null,season,now,now),
 ]);
 return c.json({data:{id,seed,startedAt:now}});
});
runs.get('/history',async c=>c.json({data:(await sql(c.env.DB,'SELECT id,wave,duration_seconds,kills,earned,verification_state,gang_xp FROM runs WHERE user_id=? AND status=? ORDER BY started_at DESC LIMIT 30',c.get('userId'),'finished').all()).results}));
runs.post('/:id/progress',async c=>{
 const p=progressSchema.parse(await c.req.json()),db=c.env.DB,row=await getRun(db,c.req.param('id'),c.get('userId')),now=Date.now();
 if(row.status!=='active') fail('Вылазка уже завершена',409);
 if(p.seq===row.seq) {
  const previous=await sql(db,'SELECT payload FROM run_checkpoints WHERE run_id=? AND seq=?',row.id,p.seq).first<{payload:string}>();
  if(previous?.payload===JSON.stringify(p)) return c.json({data:{accepted:true}});
 }
 const issue=checkProgress(row,p,now);
 if(issue) {
  await sql(db,"UPDATE runs SET verification_state='suspicious' WHERE id=?",row.id).run();
  console.warn(JSON.stringify({event:'run_anomaly',runId:row.id,reason:issue})); fail(issue,409);
 }
 // CAS + уникальный checkpoint: конкурирующие/повторные события не меняют прогресс.
 await db.batch([
  sql(db,`UPDATE runs SET seq=?,duration_seconds=?,kills=?,earned=?,run_level=?,distance=?,wave=?,last_progress_at=? WHERE id=? AND seq=? AND status='active'`,p.seq,p.seconds,p.kills,p.money,p.level,p.distance,Math.floor(p.seconds/30)+1,now,row.id,row.seq),
  sql(db,'INSERT INTO run_checkpoints(run_id,seq,received_at,payload) SELECT id,?,?,? FROM runs WHERE id=? AND seq=?',p.seq,now,JSON.stringify(p),row.id,p.seq),
 ]);
 return c.json({data:{accepted:true}});
});
runs.post('/:id/finish',async c=>{
 const db=c.env.DB,user=c.get('userId'),row=await getRun(db,c.req.param('id'),user);
 if(row.status==='finished') return c.json({data:row});
 if(row.status!=='active') fail('Вылазка закрыта без выплаты',409);
 const now=Date.now(),token=crypto.randomUUID();
 const trusted=row.verification_state!=='suspicious' && now-row.last_progress_at<60000;
 // Клиентские деньги — только верхняя граница. Сервер ограничивает доход временем/спавном.
 const earned=trusted?Math.min(row.earned,Math.floor(row.duration_seconds*2.4),row.kills*25):0;
 const xp=trusted && row.duration_seconds>=30?Math.min(row.wave,30):0;
 const best=await sql(db,"SELECT wave,duration_seconds FROM runs WHERE user_id=? AND status='finished' AND verification_state='guarded' ORDER BY wave DESC,duration_seconds DESC LIMIT 1",user).first<{wave:number;duration_seconds:number}>();
 const newRecord=trusted&&(!best||row.wave>best.wave||(row.wave===best.wave&&row.duration_seconds>best.duration_seconds))?1:0;
 await db.batch([
  sql(db,`UPDATE runs SET status='finished',ended_at=?,earned=?,verification_state=?,settlement_id=?,gang_xp=CASE WHEN EXISTS(SELECT 1 FROM gang_members m WHERE m.user_id=runs.user_id AND m.membership_id=runs.membership_id) THEN ? ELSE 0 END,is_new_record=? WHERE id=? AND status='active'`,now,earned,trusted?'guarded':'suspicious',token,xp,newRecord,row.id),
  sql(db,`INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) SELECT ?,user_id,earned,'run',id,? FROM runs WHERE id=? AND settlement_id=?`,crypto.randomUUID(),now,row.id,token),
  sql(db,`UPDATE gangs SET lifetime_xp=lifetime_xp+? WHERE id=? AND EXISTS(SELECT 1 FROM runs WHERE id=? AND settlement_id=?) AND EXISTS(SELECT 1 FROM gang_members WHERE user_id=? AND membership_id=?)`,xp,row.gang_id_at_start,row.id,token,user,row.membership_id),
  sql(db,`INSERT INTO gang_member_scores(season_id,gang_id,user_id,membership_id,best_wave,best_duration)
    SELECT season_id,gang_id_at_start,user_id,membership_id,wave,duration_seconds FROM runs r
    WHERE id=? AND settlement_id=? AND verification_state='guarded' AND duration_seconds>=30
    AND EXISTS(SELECT 1 FROM gang_members m WHERE m.user_id=r.user_id AND m.membership_id=r.membership_id)
    ON CONFLICT(season_id,gang_id,user_id,membership_id) DO UPDATE SET
    best_wave=excluded.best_wave,best_duration=excluded.best_duration
    WHERE excluded.best_wave>best_wave OR (excluded.best_wave=best_wave AND excluded.best_duration>best_duration)`,row.id,token),
 ]);
 return c.json({data:await getRun(db,row.id,user)});
});
