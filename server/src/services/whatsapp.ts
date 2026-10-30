import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {prisma} from '../lib/prisma.js';
import {agentStatus} from '../config/env.js';
import {nextDelivery} from './delivery.js';

export function validSignature(raw:Buffer,signature:string|undefined,secret:string){
 if(!secret||!signature||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 return timingSafeEqual(Buffer.from(signature.slice(7),'hex'),createHmac('sha256',secret).update(raw).digest());
}
const timestamp=z.string().regex(/^\d{1,11}$/).refine(v=>Number.isFinite(new Date(Number(v)*1000).getTime()));
const media=z.object({id:z.string().min(1).max(200),mime_type:z.string().max(100).optional(),caption:z.string().max(8000).optional()});
const message=z.object({id:z.string().min(1).max(300),from:z.string().regex(/^\d{5,20}$/),
 type:z.string().max(50),timestamp,text:z.object({body:z.string().max(16000)}).optional(),
 image:media.optional(),video:media.optional(),audio:media.optional(),document:media.optional(),sticker:media.optional()});
const status=z.object({id:z.string().min(1),status:z.enum(['sent','delivered','read','failed']),
 timestamp,recipient_id:z.string().optional(),biz_opaque_callback_data:z.string().max(200).optional(),
 errors:z.array(z.object({code:z.number()})).optional()});
const payload=z.object({object:z.literal('whatsapp_business_account'),entry:z.array(z.object({
 changes:z.array(z.object({field:z.string(),value:z.object({
 metadata:z.object({phone_number_id:z.string()}).optional(),
 contacts:z.array(z.object({wa_id:z.string(),profile:z.object({name:z.string().max(300)})})).optional(),
 messages:z.array(message).optional(),statuses:z.array(status).optional()
 })}))
}))});
function changes(body:unknown,phoneId:string){
 return payload.parse(body).entry.flatMap(e=>e.changes.filter(c=>c.field==='messages'&&(!phoneId||c.value.metadata?.phone_number_id===phoneId)));
}
export function extractMessages(body:unknown,phoneId:string){
 return changes(body,phoneId).flatMap(c=>(c.value.messages??[]).map(m=>({...m,
  name:c.value.contacts?.find(x=>x.wa_id===m.from)?.profile.name??m.from})));
}
export async function processWebhook(body:unknown,phoneId:string){
 const parsed=changes(body,phoneId);
 for(const m of extractMessages(body,phoneId)){
  try{
   await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${m.from}))`;
    if(await tx.message.findUnique({where:{externalMessageId:m.id}}))return;
    const contact=await tx.contact.upsert({where:{phoneNumber:m.from},create:{phoneNumber:m.from,name:m.name},update:{}});
    const conversation=await tx.conversation.findFirst({where:{contactId:contact.id,status:'OPEN'},orderBy:{createdAt:'desc'}})
     ??await tx.conversation.create({data:{contactId:contact.id}});
    const attachment=m.image??m.video??m.audio??m.document??m.sticker;
    const incoming=await tx.message.create({data:{conversationId:conversation.id,externalMessageId:m.id,
     direction:'INBOUND',source:'HUMAN',deliveryStatus:'RECEIVED',content:m.type==='text'?m.text?.body??'':attachment?.caption??'['+m.type+']',
     messageType:m.type,mediaId:attachment?.id,mimeType:attachment?.mime_type,createdAt:new Date(Number(m.timestamp)*1000)}});
    // Only events received while the agent is active enter the queue. Existing history is never backfilled.
    if(agentStatus().active)await tx.replyJob.create({data:{messageId:incoming.id,conversationId:conversation.id}});
    await tx.conversation.update({where:{id:conversation.id},data:{updatedAt:new Date()}});
   });
  }catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')continue;throw e}
 }
 for(const s of parsed.flatMap(c=>c.value.statuses??[])){
  await prisma.$transaction(async tx=>{
   // Correlation handles status callbacks arriving before the send response was committed.
   const initial=await tx.message.findFirst({where:{direction:'OUTBOUND',OR:[
    {externalMessageId:s.id},...(s.biz_opaque_callback_data?[{id:s.biz_opaque_callback_data}]:[])]}});
   if(!initial)return;
   await tx.$executeRaw`SELECT id FROM "Message" WHERE id=${initial.id} FOR UPDATE`;
   const row=await tx.message.findUniqueOrThrow({where:{id:initial.id}});
   const date=new Date(Number(s.timestamp)*1000);
   const state=nextDelivery(row.deliveryStatus,s.status.toUpperCase());
   // Read/delivered cannot regress even with out-of-order events.
   if(state===row.deliveryStatus&&row.statusAt&&date<=row.statusAt)return;
   await tx.message.update({where:{id:row.id},data:{externalMessageId:s.id,deliveryStatus:state,
    statusAt:row.statusAt&&row.statusAt>date?row.statusAt:date,
    deliveryError:state==='FAILED'?'META_DELIVERY_'+(s.errors?.[0]?.code??'FAILED'):null}});
   await tx.replyJob.updateMany({where:{messageId:row.replyToId??'',state:{in:['SENDING','UNCERTAIN']}},
    data:{state:state==='FAILED'?'FAILED':'DONE',errorCode:state==='FAILED'?'META_DELIVERY_FAILED':null,leaseUntil:null}});
  });
 }
}
