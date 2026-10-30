import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {PrismaClient,Prisma,ReplyJob} from '@prisma/client';
import type {AiProvider} from './ai/index.js';
import {buildContext} from './ai/context.js';
import {HttpError} from '../middleware/errors.js';
import {safeCode} from './provider-error.js';
import {aiReply,requesterName} from '../validators/ai-reply.js';

export interface WebChatOptions {
 sessionHours:number;maxMessages:number;maxConcurrent:number;dailyLimit:number;
 contextMessages:number;contextChars:number;timeoutMs:number;active:()=>boolean;
}
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export const publicMessageSelect={
 id:true,content:true,direction:true,source:true,deliveryStatus:true,createdAt:true,externalMessageId:true,
 job:{select:{state:true,errorCode:true}},replyToId:true
} satisfies Prisma.MessageSelect;

// Persistent fixed-window limits, shared across processes. Only hashed IP/session keys are stored.
export async function consumeRate(tx:Prisma.TransactionClient,key:string,limit:number,windowMs:number,now=new Date()){
 const bucket=hashToken(key+':'+Math.floor(now.getTime()/windowMs));
 const row=await tx.publicRateBucket.upsert({where:{key:bucket},create:{key:bucket,hits:1,
  expiresAt:new Date((Math.floor(now.getTime()/windowMs)+1)*windowMs)},
  update:{hits:{increment:1}}});
 if(row.hits>limit)throw new HttpError(429,'Alcanzaste el límite de solicitudes. Espera unos minutos e inténtalo de nuevo.');
}
export class WebChatService {
 constructor(private db:PrismaClient,private ai:()=>AiProvider,private options:WebChatOptions){}
 async rate(key:string,limit:number,windowMs:number){
  await this.db.$transaction(async tx=>{
   await consumeRate(tx,key,limit,windowMs);
   // Bounded by request cadence; deletes only expired rate counters, never conversation data.
   await tx.publicRateBucket.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-86400000)}}});
  });
 }
 async createSession(ip:string){
  const token=randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+this.options.sessionHours*3600000);
  const session=await this.db.$transaction(async tx=>{
   await consumeRate(tx,'sessions:'+ip,10,3600000);
   const contact=await tx.contact.create({data:{name:'Visitante web',phoneNumber:'web:'+randomUUID()}});
   const conversation=await tx.conversation.create({data:{contactId:contact.id,channel:'WEB'}});
   return tx.webSession.create({data:{tokenHash:hashToken(token),conversationId:conversation.id,expiresAt}});
  });
  return {token,expiresAt:session.expiresAt,aiAvailable:this.options.active()};
 }
 async session(token:string){
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new HttpError(401,'La sesión no es válida. Inicia una nueva conversación.');
  const session=await this.db.webSession.findUnique({where:{tokenHash:hashToken(token)}});
  if(!session||session.expiresAt<=new Date())throw new HttpError(401,'Tu sesión expiró. Inicia una nueva conversación.');
  return session;
 }
 async history(token:string){
  const session=await this.session(token);
  await this.db.replyJob.updateMany({where:{conversationId:session.conversationId,state:'GENERATING',leaseUntil:{lte:new Date()}},
   data:{state:'FAILED',errorCode:'AI_INTERRUPTED',leaseUntil:null}});
  const messages=await this.db.message.findMany({where:{conversationId:session.conversationId},
   orderBy:[{createdAt:'asc'},{id:'asc'}],select:publicMessageSelect});
  const tickets=await this.db.ticket.findMany({where:{conversationId:session.conversationId},
   select:{id:true,title:true,status:true,priority:true,createdAt:true,contact:{select:{name:true}}},orderBy:{createdAt:'desc'}});
  return {messages:messages.map(({externalMessageId,...message})=>({...message,
   requestId:externalMessageId?.startsWith('web:')?externalMessageId.split(':').at(-1):null})),
   tickets:tickets.map(({contact,...ticket})=>({...ticket,requesterName:contact.name})),expiresAt:session.expiresAt,aiAvailable:this.options.active()};
 }
 async send(token:string,requestId:string,content:string){
  const session=await this.session(token);
  const externalId='web:'+session.id+':'+requestId;
  const claimed=await this.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT id FROM "WebSession" WHERE id=${session.id} FOR UPDATE`;
   const current=await tx.webSession.findUniqueOrThrow({where:{id:session.id}});
   if(current.expiresAt<=new Date())throw new HttpError(401,'Tu sesión expiró. Inicia una nueva conversación.');
   const previous=await tx.message.findUnique({where:{externalMessageId:externalId},include:{job:true}});
   if(previous&&previous.content!==content)throw new HttpError(409,'El identificador ya se utilizó para otro mensaje.');
   if(previous?.job?.state==='DONE')return {job:previous.job,cached:true};
   if(previous?.job?.state==='FAILED')return {job:previous.job,cached:true};
   if(!this.options.active())throw new HttpError(503,'El asistente no está disponible por ahora. Inténtalo más tarde.');
   const now=new Date();
   const busy=await tx.replyJob.findFirst({where:{conversationId:session.conversationId,state:'GENERATING',leaseUntil:{gt:now}}});
   if(busy)throw new HttpError(409,'Espera a que termine la respuesta anterior.');
   // A crash or disconnected HTTP request may leave an expired generation. Preserve it as a failure.
   await tx.replyJob.updateMany({where:{conversationId:session.conversationId,state:'GENERATING',leaseUntil:{lte:now}},
    data:{state:'FAILED',errorCode:'AI_INTERRUPTED',leaseUntil:null}});
   if(previous)return {job:await tx.replyJob.findUniqueOrThrow({where:{messageId:previous.id}}),cached:true};
   const count=await tx.replyJob.count({where:{conversationId:session.conversationId}});
   if(count>=this.options.maxMessages)throw new HttpError(429,'Esta conversación alcanzó su límite. Inicia una nueva conversación.');
   await consumeRate(tx,'session-messages:'+session.id,10,60000);
   // Serializes admission only, never holds a database transaction during Gemini.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(73105912)`;
   const inflight=await tx.replyJob.count({where:{state:'GENERATING',leaseUntil:{gt:now},message:{conversation:{channel:'WEB'}}}});
   if(inflight>=this.options.maxConcurrent)throw new HttpError(503,'El asistente está atendiendo otras consultas. Inténtalo en unos segundos.');
   await consumeRate(tx,'web-generations-global',this.options.dailyLimit,86400000);
   const incoming=await tx.message.create({data:{conversationId:session.conversationId,externalMessageId:externalId,
    direction:'INBOUND',source:'HUMAN',deliveryStatus:'RECEIVED',messageType:'text',content}});
   const job=await tx.replyJob.create({data:{messageId:incoming.id,conversationId:session.conversationId,
    state:'GENERATING',attempts:1,leaseUntil:new Date(now.getTime()+this.options.timeoutMs+15000)}});
   await tx.conversation.update({where:{id:session.conversationId},data:{updatedAt:now}});
   return {job,cached:false};
  });
  if(!claimed.cached)await this.generate(claimed.job);
  return this.history(token);
 }
 private async generate(job:ReplyJob){
  try{
   const rows=await this.db.message.findMany({where:{conversationId:job.conversationId},
    orderBy:[{createdAt:'desc'},{id:'desc'}],take:this.options.contextMessages});
   const context=buildContext(rows.reverse(),this.options.contextMessages,this.options.contextChars);
   // The provider receives only this visitor's conversation and the shared system policy.
   // No knowledge/catalogue/rule database exists yet; do not fabricate retrieved business facts.
   const provider=this.ai();
   const signal=AbortSignal.timeout(this.options.timeoutMs);
   const reply=aiReply.parse(provider.respond?await provider.respond(context,signal):
    {text:await provider.generate(context,signal),ticket:null});
   await this.db.$transaction(async tx=>{
    const owned=await tx.replyJob.updateMany({where:{id:job.id,state:'GENERATING',leaseUntil:{gt:new Date()}},
     data:{state:'DONE',leaseUntil:null,errorCode:null}});
    if(!owned.count)throw new Error('Lease expired');
    let answer=reply.text;
    if(reply.ticket){
     // The model never supplies ownership. Scope and deduplication are enforced in PostgreSQL.
     await tx.$executeRaw`SELECT id FROM "Conversation" WHERE id=${job.conversationId} FOR UPDATE`;
     const conversation=await tx.conversation.findUniqueOrThrow({where:{id:job.conversationId}});
     if(conversation.channel!=='WEB')throw new Error('Invalid channel');
     const contact=await tx.contact.findUniqueOrThrow({where:{id:conversation.contactId}});
     const savedName=requesterName.safeParse(contact.name);
     const proposedName=requesterName.safeParse(reply.ticket.requesterName);
     // Names are self-reported, not verified identity. Never save an invented name from the model.
     const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
     const namePattern=proposedName.success?new RegExp('(^|[^\\p{L}\\p{N}])'+
      normalize(proposedName.data).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^\\p{L}\\p{N}])','u'):null;
     const stated=!!namePattern&&rows.some(m=>m.direction==='INBOUND'&&namePattern.test(normalize(m.content)));
     const name=savedName.success?savedName.data:stated&&proposedName.success?proposedName.data:null;
     const existing=await tx.ticket.findFirst({where:{conversationId:conversation.id,
      contactId:conversation.contactId,status:{not:'RESOLVED'}},orderBy:{createdAt:'asc'}});
     if(!name){
      answer='Para registrar tu solicitud, ¿a nombre de quién registro el ticket? Puedes darme tu nombre o un alias.';
     }else{
     await tx.contact.update({where:{id:contact.id},data:{name}});
     const {requesterName:_name,...ticketData}=reply.ticket;
     const ticket=existing??await tx.ticket.create({data:{...ticketData,
      contactId:conversation.contactId,conversationId:conversation.id,status:'OPEN'}});
     answer=existing?
      `Tu conversación ya tiene un ticket abierto a nombre de ${name}: ${ticket.title}. Referencia: ${ticket.id}. No creé otro para evitar duplicados.`:
      `He creado tu ticket a nombre de ${name}: ${ticket.title}. Referencia: ${ticket.id}. Estado: abierto. Queda registrado para que el equipo pueda darle seguimiento; todavía no hay un plazo de atención confirmado.`;
     }
    }
    await tx.message.create({data:{conversationId:job.conversationId,replyToId:job.messageId,
     direction:'OUTBOUND',source:'AI',messageType:'text',content:answer.slice(0,4000),deliveryStatus:'AVAILABLE'}});
    await tx.conversation.update({where:{id:job.conversationId},data:{updatedAt:new Date()}});
   });
  }catch(error){
   await this.db.replyJob.updateMany({where:{id:job.id,state:'GENERATING'},data:{
    state:'FAILED',errorCode:safeCode(error)==='INTERNAL_ERROR'?'AI_UNAVAILABLE':safeCode(error),leaseUntil:null}});
  }
 }
}
