import { Hono } from 'hono';
import { z } from 'zod';
import { seasonStart,BALANCE } from '@street/shared';
import { sql,ledger,fail } from './db';
import type { AppEnv } from './types';
export async function gangDetails(db:D1Database,id:string) {
 const gang=await sql(db,'SELECT * FROM gangs WHERE id=?',id).first<{id:string;name:string;tag:string;owner_id:string;lifetime_xp:number}>();
 if(!gang)fail('Банда не найдена',404);
 const members=(await sql(db,`SELECT m.user_id,u.display_name,m.role,COALESCE(s.best_wave,0) best_wave FROM gang_members m JOIN users u ON u.id=m.user_id LEFT JOIN gang_member_scores s ON s.user_id=m.user_id AND s.gang_id=m.gang_id AND s.membership_id=m.membership_id AND s.season_id=? WHERE m.gang_id=? ORDER BY best_wave DESC`,seasonStart(Date.now()),id).all<{user_id:string;display_name:string;role:string;best_wave:number}>()).results;
 const recent=(await sql(db,"SELECT id,wave,duration_seconds,kills,earned,verification_state,gang_xp FROM runs WHERE gang_id_at_start=? AND status='finished' ORDER BY ended_at DESC LIMIT 8",id).all()).results;
 return {...gang,members,season_score:members.slice(0,10).reduce((n,m)=>n+m.best_wave,0),recent};
}
export async function gangRanking(db:D1Database) {
 return (await sql(db,`WITH scores AS (
 SELECT m.gang_id,s.best_wave,ROW_NUMBER() OVER(PARTITION BY m.gang_id ORDER BY s.best_wave DESC,s.best_duration DESC) n
 FROM gang_members m JOIN gang_member_scores s ON s.membership_id=m.membership_id AND s.season_id=?)
 SELECT g.id,g.name,COALESCE(SUM(CASE WHEN s.n<=10 THEN s.best_wave ELSE 0 END),0) score
 FROM gangs g LEFT JOIN scores s ON s.gang_id=g.id GROUP BY g.id ORDER BY score DESC,g.created_at LIMIT 50`,seasonStart(Date.now())).all()).results;
}
export const gangs=new Hono<AppEnv>();
gangs.get('/leaderboard',async c=>c.json({data:await gangRanking(c.env.DB)}));
gangs.post('/',async c=>{
 const b=z.object({name:z.string().trim().min(3).max(24),tag:z.string().trim().regex(/^[A-Za-zА-Яа-яЁё0-9]{2,5}$/u)}).parse(await c.req.json());
 const db=c.env.DB,user=c.get('userId'),id=crypto.randomUUID(),now=Date.now();
 const u=await sql(db,'SELECT gang_changed_at FROM users WHERE id=?',user).first<{gang_changed_at:number}>();
 if(now-u!.gang_changed_at<86400000)fail('Банду можно менять раз в 24 часа',409);
 await db.batch([
  sql(db,'INSERT INTO gangs(id,name,tag,owner_id,created_at) VALUES(?,?,?,?,?)',id,b.name,b.tag.toUpperCase(),user,now),
  sql(db,"INSERT INTO gang_members(gang_id,user_id,role,joined_at,membership_id) VALUES(?,?,'leader',?,?)",id,user,now,crypto.randomUUID()),
  ledger(db,user,-BALANCE.gangCost,'gang_create',id),
  sql(db,'UPDATE users SET gang_changed_at=? WHERE id=?',now,user),
 ]);
 return c.json({data:await gangDetails(db,id)});
});
gangs.post('/join',async c=>{
 const b=z.object({token:z.string().min(10).max(100)}).parse(await c.req.json()),db=c.env.DB,user=c.get('userId'),now=Date.now();
 const invite=await sql(db,'SELECT gang_id FROM gang_invites WHERE token=? AND expires_at>?',b.token.replace(/^gang_/,''),now).first<{gang_id:string}>();
 if(!invite)fail('Приглашение истекло или не найдено');
 const u=await sql(db,'SELECT gang_changed_at FROM users WHERE id=?',user).first<{gang_changed_at:number}>();
 if(now-u!.gang_changed_at<86400000)fail('Банду можно менять раз в 24 часа',409);
 await db.batch([
  sql(db,"INSERT INTO gang_members(gang_id,user_id,role,joined_at,membership_id) VALUES(?,?,'member',?,?)",invite.gang_id,user,now,crypto.randomUUID()),
  sql(db,'UPDATE users SET gang_changed_at=? WHERE id=?',now,user),
 ]);
 return c.json({data:await gangDetails(db,invite.gang_id)});
});
gangs.post('/leave',async c=>{
 const db=c.env.DB,user=c.get('userId');
 const m=await sql(db,'SELECT role FROM gang_members WHERE user_id=?',user).first<{role:string}>();
 if(!m)fail('Ты не в банде');if(m.role==='leader')fail('Лидер не может покинуть банду в MVP');
 await db.batch([sql(db,'DELETE FROM gang_members WHERE user_id=?',user),sql(db,'UPDATE users SET gang_changed_at=? WHERE id=?',Date.now(),user)]);
 return c.json({data:{left:true}});
});
gangs.post('/:id/invite',async c=>{
 const db=c.env.DB,id=c.req.param('id');
 const leader=await sql(db,"SELECT user_id FROM gang_members WHERE gang_id=? AND user_id=? AND role='leader'",id,c.get('userId')).first();
 if(!leader)fail('Приглашать может только лидер',403);
 const token=crypto.randomUUID().replaceAll('-','');
 await sql(db,'INSERT INTO gang_invites(token,gang_id,expires_at) VALUES(?,?,?)',token,id,Date.now()+7*86400000).run();
 return c.json({data:{token,url:c.env.BOT_USERNAME?`https://t.me/${c.env.BOT_USERNAME}?startapp=gang_${token}`:null}});
});
gangs.post('/:id/kick',async c=>{
 const {userId}=z.object({userId:z.uuid()}).parse(await c.req.json()),db=c.env.DB,id=c.req.param('id');
 if(userId===c.get('userId'))fail('Нельзя удалить себя');
 const result=await db.batch([
  sql(db,`UPDATE users SET gang_changed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM gang_members WHERE gang_id=? AND user_id=? AND role='leader') AND EXISTS(SELECT 1 FROM gang_members WHERE gang_id=? AND user_id=?)`,Date.now(),userId,id,c.get('userId'),id,userId),
  sql(db,`DELETE FROM gang_members WHERE gang_id=? AND user_id=? AND EXISTS(SELECT 1 FROM gangs WHERE id=? AND owner_id=?)`,id,userId,id,c.get('userId')),
 ]);
 if(!result[1].meta.changes)fail('Нет прав или участник не найден',403);
 return c.json({data:{removed:true}});
});
gangs.get('/:id',async c=>c.json({data:await gangDetails(c.env.DB,c.req.param('id'))}));
