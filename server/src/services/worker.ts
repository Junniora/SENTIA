import type {ReplyJob} from '@prisma/client';
import {prisma} from '../lib/prisma.js';
import {env,agentStatus} from '../config/env.js';
import {GeminiProvider} from './ai/gemini.js';
import {MetaClient} from './meta.js';
import {buildContext} from './ai/context.js';
import {executeTask,type AgentTask,type AgentStore} from './agent.js';
import {nextDelivery} from './delivery.js';

type Claimed=ReplyJob;
const lease=()=>new Date(Date.now()+120000);
export async function claimTask():Promise<Claimed|null>{
 return prisma.$transaction(async tx=>{
  await tx.replyJob.updateMany({where:{message:{conversation:{channel:'WHATSAPP'}},state:'GENERATING',attempts:{gte:3},leaseUntil:{lt:new Date()}},
   data:{state:'FAILED',errorCode:'AI_RECOVERY_EXHAUSTED',leaseUntil:null}});
  // A process may have died after Meta accepted a send. Never blindly repeat that send.
  await tx.message.updateMany({where:{deliveryStatus:'SENDING',replyToId:{in:
   (await tx.replyJob.findMany({where:{message:{conversation:{channel:'WHATSAPP'}},state:'SENDING',leaseUntil:{lt:new Date()}},select:{messageId:true}})).map(x=>x.messageId)}},
   data:{deliveryStatus:'UNCERTAIN',deliveryError:'SEND_RESULT_UNKNOWN'}});
  await tx.replyJob.updateMany({where:{message:{conversation:{channel:'WHATSAPP'}},state:'SENDING',leaseUntil:{lt:new Date()}},
   data:{state:'UNCERTAIN',errorCode:'SEND_RESULT_UNKNOWN',leaseUntil:null}});
  const rows=await tx.$queryRaw<ReplyJob[]>`
   SELECT j.* FROM "ReplyJob" j
   WHERE EXISTS(SELECT 1 FROM "Conversation" c WHERE c.id=j."conversationId" AND c.channel='WHATSAPP')
   AND (((j.state IN ('PENDING','RETRY') OR (j.state='READY' AND (j."leaseUntil" IS NULL OR j."leaseUntil"<NOW()))) AND j."availableAt"<=NOW())
      OR (j.state='GENERATING' AND j.attempts<3 AND j."leaseUntil"<NOW()))
   AND NOT EXISTS(SELECT 1 FROM "ReplyJob" earlier
    WHERE earlier."conversationId"=j."conversationId" AND earlier.sequence<j.sequence
    AND earlier.state IN ('PENDING','RETRY','GENERATING','READY','SENDING'))
   ORDER BY j.sequence FOR UPDATE OF j SKIP LOCKED LIMIT 1`;
  if(!rows.length)return null;
  const row=rows[0];
  return tx.replyJob.update({where:{id:row.id},data:{
   state:row.state==='READY'?'READY':'GENERATING',attempts:{increment:1},leaseUntil:lease()}});
 });
}
function owned(task:AgentTask,states:string[]){return {id:task.id,attempts:task.attempts,state:{in:states},leaseUntil:{gt:new Date()}}}
export const agentStore:AgentStore={
 async context(task){
  const trigger=await prisma.message.findUniqueOrThrow({where:{id:task.messageId},include:{job:true}});
  const rows=await prisma.message.findMany({where:{conversationId:trigger.conversationId,OR:[
   {direction:'INBOUND',job:{sequence:{lte:trigger.job!.sequence}}},
   {direction:'INBOUND',job:null,createdAt:{lte:trigger.createdAt}},
   {direction:'OUTBOUND',replyToId:{not:null},deliveryStatus:{in:['SENT','DELIVERED','READ']}}
  ]},orderBy:[{createdAt:'desc'},{id:'desc'}],take:env.AI_CONTEXT_MESSAGES});
  // Always end on the current inbound event, regardless of provider timestamp skew.
  const prior=rows.filter(m=>m.id!==trigger.id).reverse();
  return buildContext([...prior,trigger],env.AI_CONTEXT_MESSAGES,env.AI_CONTEXT_CHARS);
 },
 async prepare(task,text){
  await prisma.$transaction(async tx=>{
   const updated=await tx.replyJob.updateMany({where:owned(task,['GENERATING']),data:{state:'READY',leaseUntil:lease(),errorCode:null}});
   if(!updated.count)throw Error('Lease lost');
   await tx.message.upsert({where:{replyToId:task.messageId},update:{},create:{
    conversationId:(await tx.message.findUniqueOrThrow({where:{id:task.messageId}})).conversationId,
    replyToId:task.messageId,direction:'OUTBOUND',source:'AI',content:text,messageType:'text',deliveryStatus:'PENDING'}});
  });
 },
 async outgoing(task){return prisma.message.findUniqueOrThrow({where:{replyToId:task.messageId},select:{id:true,content:true}})},
 async beginSend(task){
  return prisma.$transaction(async tx=>{
   if(!agentStatus().active)return false;
   const updated=await tx.replyJob.updateMany({where:owned(task,['READY']),data:{state:'SENDING',leaseUntil:lease()}});
   if(!updated.count)return false;
   await tx.message.update({where:{replyToId:task.messageId},data:{deliveryStatus:'SENDING'}});
   return true;
  });
 },
 async sent(task,id,externalId){
  await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT id FROM "Message" WHERE id=${id} FOR UPDATE`;
   const row=await tx.message.findUniqueOrThrow({where:{id}});
   await tx.message.update({where:{id},data:{externalMessageId:externalId,deliveryStatus:nextDelivery(row.deliveryStatus,'SENT')}});
   await tx.replyJob.updateMany({where:{id:task.id,attempts:task.attempts,state:'SENDING'},data:{state:row.deliveryStatus==='FAILED'?'FAILED':'DONE',leaseUntil:null,errorCode:null}});
   await tx.conversation.update({where:{id:row.conversationId},data:{updatedAt:new Date()}});
  });
 },
 async failed(task,code,retry,uncertain){
  await prisma.$transaction(async tx=>{
   const changed=await tx.replyJob.updateMany({where:{id:task.id,attempts:task.attempts,state:{in:['GENERATING','READY','SENDING']}},
    data:{state:uncertain?'UNCERTAIN':retry?'RETRY':'FAILED',errorCode:code,leaseUntil:null,
     availableAt:new Date(Date.now()+Math.min(60000,5000*2**task.attempts))}});
   if(!changed.count)return;
   await tx.message.updateMany({where:{replyToId:task.messageId,deliveryStatus:{in:['PENDING','SENDING']}},
    data:{deliveryStatus:uncertain?'UNCERTAIN':'FAILED',deliveryError:code}});
  });
 }
};
export async function workOnce(){
 if(!agentStatus().active)return false;
 const job=await claimTask();if(!job)return false;
 const message=await prisma.message.findUniqueOrThrow({where:{id:job.messageId},include:{conversation:{include:{contact:true}}}});
 await executeTask({id:job.id,messageId:job.messageId,attempts:job.attempts,state:job.state,
  phone:message.conversation.contact.phoneNumber,receivedAt:message.createdAt},agentStore,
  new GeminiProvider(env.GEMINI_API_KEY,env.GEMINI_MODEL,env.AI_TIMEOUT_MS),
  new MetaClient({token:env.WHATSAPP_ACCESS_TOKEN,phoneId:env.WHATSAPP_PHONE_NUMBER_ID,
   version:env.WHATSAPP_GRAPH_VERSION!,timeoutMs:env.META_TIMEOUT_MS}));
 return true;
}
export function startWorker(){
 let stopping=false;let timer:ReturnType<typeof setTimeout>|undefined;let running:Promise<void>=Promise.resolve();
 const tick=async()=>{
  try{await workOnce()}catch{console.error(JSON.stringify({event:'agent_worker_error',code:'WORKER_FAILURE'}))}
  if(!stopping)timer=setTimeout(()=>{running=tick()},env.WORKER_POLL_MS);
 };
 running=tick();
 return async()=>{stopping=true;if(timer)clearTimeout(timer);await running};
}
