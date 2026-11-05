import { z } from 'zod';
import { sql } from './db';
import type { Ctx } from './types';
import { gangDetails } from './social';
import { SUPPORT_TERMS } from '@street/shared';
import { answerCheckout,paymentSchema,preCheckoutSchema,recordPayment,paymentSupportUrl } from './support';
import { telegramCall } from './telegram-api';
const updateSchema=z.object({update_id:z.number().int(),pre_checkout_query:preCheckoutSchema.optional(),message:z.object({chat:z.object({id:z.number().int().safe(),type:z.string()}),from:z.object({id:z.number().int().safe()}).optional(),text:z.string().optional(),successful_payment:paymentSchema.optional(),refunded_payment:paymentSchema.optional()}).optional()});
export async function webhook(c:Ctx) {
 const secret=c.req.header('X-Telegram-Bot-Api-Secret-Token');
 if(!secret||!c.env.WEBHOOK_SECRET)return c.json({error:{message:'Нет доступа'}},403);
 const encoder=new TextEncoder(),digests=await Promise.all([secret,c.env.WEBHOOK_SECRET].map(value=>crypto.subtle.digest('SHA-256',encoder.encode(value))));
 // Общий TS-проект содержит DOM SubtleCrypto; расширение Workers проверяем структурно.
 if(!('timingSafeEqual' in crypto.subtle)||typeof crypto.subtle.timingSafeEqual!=='function')throw new Error('Workers timingSafeEqual is required');
 if(!crypto.subtle.timingSafeEqual(digests[0],digests[1]))return c.json({error:{message:'Нет доступа'}},403);
 const update=updateSchema.parse(await c.req.json()),db=c.env.DB;
 // Финансовые события не резервируются в старом dedupe команд до успешной записи D1.
 if(update.pre_checkout_query){await answerCheckout(c.env,update.pre_checkout_query);return c.json({ok:true});}
 const payment=update.message?.successful_payment??update.message?.refunded_payment;
 if(payment){
  const message=update.message!;
  if(message.chat.type!=='private'||message.chat.id<=0||(!message.refunded_payment&&message.from?.id!==message.chat.id))return c.json({error:{message:'Неверный плательщик'}},400);
  await recordPayment(c.env,String(message.chat.id),payment,Boolean(message.refunded_payment));return c.json({ok:true});
 }
 // Резервируем update до отправки. При сбое отправки повторяемый ответ не рассылается.
 const seen=await sql(db,'INSERT OR IGNORE INTO telegram_updates(id,created_at) VALUES(?,?)',update.update_id,Date.now()).run();
 if(!seen.meta.changes||!update.message?.text)return c.json({ok:true});
 const message=update.message,command=message.text!.split(/\s/)[0].split('@')[0];
  const welcome=command==='/start'||command==='/play';
  let text='<b>БОТ-БАНДИТ</b>\n<i>Твой район. Твои правила.</i>\n\nДобро пожаловать в город, где всё решают твоя банда, репутация и сила.\n\nНачни с нуля, зарабатывай игровую валюту, участвуй в вылазках и поднимайся на вершину рейтинга.\n\n⚔️ ВЫЛАЗКИ  ·  🎰 КАЗИНО\n👑 БАНДЫ  ·  🏙️ ГОРОД\n\nТолько игровая валюта — без покупки, вывода и обмена.';
  if(command==='/help')text='Двигайся — герой стреляет сам. Опыт и улучшения действуют только в вылазке.\n/play — играть\n/top — рекорды\n/gang — банда\n/terms — условия поддержки\n/paysupport — вопросы по оплате\nДоллары нельзя купить, вывести или передать. Поддержка Stars не даёт наград и не связана с казино.';
  else if(command==='/terms')text='Условия поддержки STREET LEGENDS\n\n'+SUPPORT_TERMS.join('\n\n')+'\n\nКонтакт владельца: '+(paymentSupportUrl(c.env)??'Приём Stars выключен: контакт ещё не настроен.');
  else if(command==='/paysupport'||command==='/support')text='Оплата и возвраты STREET LEGENDS\n\nВ профиле → «Поддержать игру» → история можно запросить полный возврат Stars. Если платёж не появился или возврат ожидает подтверждения, напиши владельцу: '+(paymentSupportUrl(c.env)??'Контакт пока не настроен; новые платежи недоступны.')+'\nУкажи дату, сумму и ID заказа или квитанцию Telegram. Не присылай пароль, код входа или данные карты. Поддержка Telegram не решает споры с владельцем игры.\n/terms — условия. Поддержка не пополняет игровые доллары.';
 else if(command==='/top') {
  const rows=(await sql(db,"SELECT u.display_name,MAX(r.wave) wave FROM runs r JOIN users u ON u.id=r.user_id WHERE r.status='finished' AND verification_state='guarded' GROUP BY r.user_id ORDER BY wave DESC LIMIT 5").all<{display_name:string;wave:number}>()).results;
  text='Рекорды района (базовые проверки, не полный античит)\n'+(rows.map((r,i)=>`${i+1}. ${r.display_name} — волна ${r.wave}`).join('\n')||'Пока нет завершённых вылазок.');
 }else if(command==='/gang') {
  const member=await sql(db,'SELECT m.gang_id FROM gang_members m JOIN users u ON u.id=m.user_id WHERE u.telegram_id=?',String(message.from?.id??'')).first<{gang_id:string}>();
  if(member){const g=await gangDetails(db,member.gang_id);text=`[${g.tag}] ${g.name}\nОчки недели: ${g.season_score}\nОпыт банды: ${g.lifetime_xp}\nПриглашение создаёт лидер в приложении.`;}else text='Ты пока без банды. Создай свою или введи приглашение в приложении.';
 }else if(!['/start','/play'].includes(command))return c.json({ok:true});
 const url=c.env.APP_URL;
   try{await telegramCall(c.env,'sendMessage',{chat_id:message.chat.id,text,...(welcome?{parse_mode:'HTML'}:{}),reply_markup:{inline_keyboard:[[{text:'🎮 Начать игру',...(message.chat.type==='private'?{web_app:{url}}:{url:c.env.BOT_USERNAME?`https://t.me/${c.env.BOT_USERNAME}?start=play`:url})}]]}},z.unknown());}
   catch{console.error(JSON.stringify({event:'telegram_send_failed',updateId:update.update_id}));await sql(db,'DELETE FROM telegram_updates WHERE id=?',update.update_id).run();return c.json({error:{message:'Повторить доставку приветствия'}},503);}
 return c.json({ok:true});
}
