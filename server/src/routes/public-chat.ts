import {Router} from 'express';
import {z} from 'zod';
import {prisma} from '../lib/prisma.js';
import {env,webChatStatus} from '../config/env.js';
import {GeminiProvider} from '../services/ai/gemini.js';
import {WebChatService} from '../services/web-chat.js';
import {HttpError,wrap} from '../middleware/errors.js';

export const webChat=new WebChatService(prisma,
 ()=>new GeminiProvider(env.GEMINI_API_KEY,env.GEMINI_MODEL,env.AI_TIMEOUT_MS),{
 sessionHours:env.WEB_CHAT_SESSION_HOURS,maxMessages:env.WEB_CHAT_MAX_MESSAGES,
 maxConcurrent:env.WEB_CHAT_MAX_CONCURRENT,dailyLimit:env.WEB_CHAT_DAILY_LIMIT,
 contextMessages:env.AI_CONTEXT_MESSAGES,contextChars:env.AI_CONTEXT_CHARS,
 timeoutMs:env.AI_TIMEOUT_MS,active:()=>webChatStatus().active
});
export const publicChatInput=z.object({requestId:z.string().uuid(),content:z.string().trim().min(1).max(4000)}).strict();
const token=(header:string|undefined)=>header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]??'';
export function createPublicChatRouter(service:WebChatService=webChat){
 const router=Router();
 router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method==='POST'&&!req.is('application/json'))return next(new HttpError(415,'Solo se admiten mensajes de texto en JSON. No se permiten archivos.'));
  next();
 });
 router.use(wrap(async(req,res,next)=>{
  await service.rate('http:'+req.ip,120,60000);
  next();
 }));
 router.post('/session',wrap(async(req,res)=>{
  z.object({}).strict().parse(req.body);
  res.status(201).json(await service.createSession(req.ip??'unknown'));
 }));
 router.get('/messages',wrap(async(req,res)=>res.json(await service.history(token(req.headers.authorization)))));
 router.post('/messages',wrap(async(req,res)=>{
  const input=publicChatInput.parse(req.body);
  await service.rate('ip-messages:'+req.ip,30,60000);
  res.json(await service.send(token(req.headers.authorization),input.requestId,input.content));
 }));
 return router;
}
export const publicChat=createPublicChatRouter();
