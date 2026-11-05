import { tg } from './telegram';
let token='';
const base=(import.meta.env.VITE_API_URL??'').replace(/\/$/,'');
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export async function api<T>(path:string,body?:unknown):Promise<T> {
 const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),15000);
 try {
  const response=await fetch(`${base}/api${path}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
  const payload=await response.json() as {data:T;error?:{message:string}};
  if(!response.ok)throw new ApiError(payload.error?.message??'Ошибка сервера',response.status);
  return payload.data;
 }catch(e){if(e instanceof ApiError)throw e;throw new Error('Нет связи с районом. Проверь соединение и повтори.');}
 finally{clearTimeout(timer);}
}
export async function login() {
 const initData=tg()?.initData;
 if(initData){token=(await api<{token:string}>('/auth/telegram',{initData})).token;return;}
 if(import.meta.env.DEV&&['localhost','127.0.0.1'].includes(location.hostname)){
  token=(await api<{token:string}>('/auth/dev',{})).token;return;
 }
 throw new Error('Открой STREET LEGENDS из кнопки «Играть» в Telegram-боте.');
}
export const isDev=()=>import.meta.env.DEV&&!tg()?.initData;
export function casinoSocketUrl(game:string,ticket:string){const url=new URL(`${base}/api/casino/live/${game}/socket`,location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',ticket);return url.toString();}
