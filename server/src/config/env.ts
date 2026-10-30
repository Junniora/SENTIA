import 'dotenv/config';
import {z} from 'zod';
const flag=z.enum(['true','false']).default('false').transform(v=>v==='true');
const integer=(n:number,min:number,max:number)=>z.coerce.number().int().min(min).max(max).default(n);
export const envSchema=z.object({
 DATABASE_URL:z.string().url(),JWT_SECRET:z.string().min(32),PORT:integer(3000,1,65535),
 CORS_ORIGIN:z.string().url().default('http://localhost:5173'),
 WHATSAPP_VERIFY_TOKEN:z.string().default(''),WHATSAPP_APP_SECRET:z.string().default(''),
 WHATSAPP_PHONE_NUMBER_ID:z.string().regex(/^\d*$/).default(''),WHATSAPP_ACCESS_TOKEN:z.string().default(''),
 WHATSAPP_GRAPH_VERSION:z.string().regex(/^v\d+\.0$/).optional(),
 GEMINI_API_KEY:z.string().default(''),GEMINI_MODEL:z.string().min(1).default('gemini-3.5-flash-lite'),
 AI_ENABLED:flag,AI_AUTO_REPLY:flag,AI_TIMEOUT_MS:integer(30000,1000,60000),
 META_TIMEOUT_MS:integer(15000,1000,30000),AI_CONTEXT_MESSAGES:integer(20,1,100),
 AI_CONTEXT_CHARS:integer(16000,1000,64000),WORKER_POLL_MS:integer(2000,100,30000),
 WEB_CHAT_AI_ENABLED:z.enum(['true','false']).default('true').transform(v=>v==='true'),
 WEB_CHAT_SESSION_HOURS:integer(24,1,168),WEB_CHAT_MAX_MESSAGES:integer(50,1,200),
 WEB_CHAT_MAX_CONCURRENT:integer(3,1,20),WEB_CHAT_DAILY_LIMIT:integer(500,1,10000)
});
export const env=envSchema.parse(process.env);
export function webChatStatus(){
 return {enabled:env.WEB_CHAT_AI_ENABLED,configured:Boolean(env.GEMINI_API_KEY),
 active:env.AI_ENABLED&&env.WEB_CHAT_AI_ENABLED&&Boolean(env.GEMINI_API_KEY)};
}
export function agentStatus(){
 const configured=Boolean(env.GEMINI_API_KEY);
 const whatsappReady=Boolean(env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.WHATSAPP_GRAPH_VERSION&&env.WHATSAPP_APP_SECRET);
 return {enabled:env.AI_ENABLED,autoReply:env.AI_AUTO_REPLY,configured,whatsappReady,
 active:env.AI_ENABLED&&env.AI_AUTO_REPLY&&configured&&whatsappReady,provider:'gemini',model:env.GEMINI_MODEL};
}
