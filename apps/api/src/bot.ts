import { z } from 'zod';
import { hash,sql } from './db';
import type { Ctx } from './types';
import { gangDetails } from './social';
const updateSchema=z.object({update_id:z.number().int(),message:z.object({chat:z.object({id:z.number(),type:z.string()}),from:z.object({id:z.number()}).optional(),text:z.string().optional()}).optional()});
export async function webhook(c:Ctx) {
 const secret=c.req.header('X-Telegram-Bot-Api-Secret-Token');
 if(!secret||!c.env.WEBHOOK_SECRET||await hash(secret)!==await hash(c.env.WEBHOOK_SECRET))return c.json({error:{message:'Нет доступа'}},403);
 const update=updateSchema.parse(await c.req.json()),db=c.env.DB;
 // Резервируем update до отправки. При сбое отправки повторяемый ответ не рассылается.
 const seen=await sql(db,'INSERT OR IGNORE INTO telegram_updates(id,created_at) VALUES(?,?)',update.update_id,Date.now()).run();
 if(!seen.meta.changes||!update.message?.text)return c.json({ok:true});
 const message=update.message,command=message.text!.split(/\s/)[0].split('@')[0];
 let text='STREET LEGENDS\nНочной район, вылазки и твоя банда.\nВся валюта только игровая: без покупки, вывода и переводов.';
 if(command==='/help')text='Двигайся — герой стреляет сам. Опыт и улучшения действуют только в вылазке.\n/play — играть\n/top — рекорды\n/gang — банда\nНикаких настоящих денег и призов.';
 else if(command==='/top') {
  const rows=(await sql(db,"SELECT u.display_name,MAX(r.wave) wave FROM runs r JOIN users u ON u.id=r.user_id WHERE r.status='finished' AND verification_state='guarded' GROUP BY r.user_id ORDER BY wave DESC LIMIT 5").all<{display_name:string;wave:number}>()).results;
  text='Рекорды района (базовые проверки, не полный античит)\n'+(rows.map((r,i)=>`${i+1}. ${r.display_name} — волна ${r.wave}`).join('\n')||'Пока нет завершённых вылазок.');
 }else if(command==='/gang') {
  const member=await sql(db,'SELECT m.gang_id FROM gang_members m JOIN users u ON u.id=m.user_id WHERE u.telegram_id=?',String(message.from?.id??'')).first<{gang_id:string}>();
  if(member){const g=await gangDetails(db,member.gang_id);text=`[${g.tag}] ${g.name}\nОчки недели: ${g.season_score}\nОпыт банды: ${g.lifetime_xp}\nПриглашение создаёт лидер в приложении.`;}else text='Ты пока без банды. Создай свою или введи приглашение в приложении.';
 }else if(!['/start','/play'].includes(command))return c.json({ok:true});
 const url=c.env.APP_URL;
 const response=await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:message.chat.id,text,reply_markup:{inline_keyboard:[[{text:'ИГРАТЬ',...(message.chat.type==='private'?{web_app:{url}}:{url:c.env.BOT_USERNAME?`https://t.me/${c.env.BOT_USERNAME}?startapp`:url})}]]}})});
 if(!response.ok)console.error(JSON.stringify({event:'telegram_send_failed',status:response.status,updateId:update.update_id}));
 return c.json({ok:true});
}
