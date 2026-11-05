import { readFile,writeFile } from 'node:fs/promises';
import process from 'node:process';
import { isIP } from 'node:net';
const action=process.argv[2]??'inspect';
const secretsPath=new URL('../../.local/telegram-secrets.json',import.meta.url);
const secrets=JSON.parse(await readFile(secretsPath,'utf8'));
async function call(method,body={}){
 try{
  const response=await fetch(`https://api.telegram.org/bot${secrets.BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload=await response.json();
  if(!payload.ok){let detail=String(payload.description??'');for(const value of Object.values(secrets))if(typeof value==='string')detail=detail.replaceAll(value,'[redacted]');throw new Error(`Bot API ${method}: ${payload.error_code??response.status} ${detail}`);}
  return payload.result;
 }catch(error){if(error.message?.startsWith('Bot API '))throw error;throw new Error(`Bot API ${method}: network error`);}
}
try{
 if(action==='inspect'){
  const me=await call('getMe'),hook=await call('getWebhookInfo');
   const data={id:me.id,username:me.username,has_main_web_app:me.has_main_web_app??false,webhook_url:hook.url,webhook_ip:hook.ip_address,allowed_updates:hook.allowed_updates,pending_updates:hook.pending_update_count,last_error:hook.last_error_message??null};
  await writeFile(new URL('../../.local/bot-info.json',import.meta.url),JSON.stringify(data,null,2),{mode:0o600});console.log(JSON.stringify(data));
 }else if(action==='configure'){
  const url=process.argv[3];if(!url?.startsWith('https://'))throw new Error('Expected HTTPS app URL');
  if(!secrets.WEBHOOK_SECRET)throw new Error('Missing webhook secret');
  const ip=process.argv[4];if(ip&&!isIP(ip))throw new Error('Expected valid webhook IP');
   await call('setWebhook',{url:`${url.replace(/\/$/,'')}/api/telegram/webhook`,secret_token:secrets.WEBHOOK_SECRET,allowed_updates:['message','pre_checkout_query'],max_connections:5,...(ip?{ip_address:ip}:{})});
  await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Играть',web_app:{url}}});
   await call('setMyCommands',{commands:[{command:'start',description:'Начать ночную историю'},{command:'play',description:'Открыть STREET LEGENDS'},{command:'top',description:'Рекорды района'},{command:'gang',description:'Моя банда'},{command:'help',description:'Правила игры'},{command:'terms',description:'Условия поддержки Stars'},{command:'paysupport',description:'Вопрос по оплате и возврату'},{command:'support',description:'Связаться с владельцем'}]});
  console.log(JSON.stringify({configured:true,app_url:url,webhook:(await call('getWebhookInfo')).url,menu:await call('getChatMenuButton')}));
 }else throw new Error('Unknown action');
}catch(error){console.error(error.message);process.exitCode=1;}
