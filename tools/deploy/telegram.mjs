import { readFile,writeFile } from 'node:fs/promises';
import process from 'node:process';
const action=process.argv[2]??'inspect';
const secretsPath=new URL('../../.local/telegram-secrets.json',import.meta.url);
const secrets=JSON.parse(await readFile(secretsPath,'utf8'));
async function call(method,body={}){
 try{
  const response=await fetch(`https://api.telegram.org/bot${secrets.BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload=await response.json();if(!payload.ok)throw new Error(`Bot API ${method}: ${payload.error_code??response.status}`);
  return payload.result;
 }catch(error){if(error.message?.startsWith('Bot API '))throw error;throw new Error(`Bot API ${method}: network error`);}
}
try{
 if(action==='inspect'){
  const me=await call('getMe'),hook=await call('getWebhookInfo');
  const data={id:me.id,username:me.username,has_main_web_app:me.has_main_web_app??false,webhook_url:hook.url,pending_updates:hook.pending_update_count};
  await writeFile(new URL('../../.local/bot-info.json',import.meta.url),JSON.stringify(data,null,2),{mode:0o600});console.log(JSON.stringify(data));
 }else if(action==='configure'){
  const url=process.argv[3];if(!url?.startsWith('https://'))throw new Error('Expected HTTPS app URL');
  if(!secrets.WEBHOOK_SECRET)throw new Error('Missing webhook secret');
  await call('setWebhook',{url:`${url.replace(/\/$/,'')}/api/telegram/webhook`,secret_token:secrets.WEBHOOK_SECRET,allowed_updates:['message'],max_connections:5});
  await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Играть',web_app:{url}}});
  await call('setMyCommands',{commands:[{command:'start',description:'Начать ночную историю'},{command:'play',description:'Открыть STREET LEGENDS'},{command:'top',description:'Рекорды района'},{command:'gang',description:'Моя банда'},{command:'help',description:'Правила игры'}]});
  console.log(JSON.stringify({configured:true,app_url:url,webhook:(await call('getWebhookInfo')).url,menu:await call('getChatMenuButton')}));
 }else throw new Error('Unknown action');
}catch(error){console.error(error.message);process.exitCode=1;}
