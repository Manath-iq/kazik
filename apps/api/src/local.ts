// Этот файл НЕ импортируется production entry. Никакого DEV_MODE env-переключателя.
import { Hono } from 'hono';
import { app } from './app';
import { createSession } from './auth';
import type { AppEnv } from './types';
const local = new Hono<AppEnv>();
local.post('/api/auth/dev',async c=>{
 const host=new URL(c.req.url).hostname;
 if(!['localhost','127.0.0.1','[::1]'].includes(host)) return c.json({error:{message:'Только локальный режим'}},403);
 return c.json({data:await createSession(c.env.DB,{id:'local-preview',name:'Ночной гость',username:'dev_player'})});
});
local.route('/',app);
export default local;
