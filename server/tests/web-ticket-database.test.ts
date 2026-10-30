import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AiProvider} from '../src/services/ai/index.js';
import type {PrismaClient as Client} from '@prisma/client';

test('Web AI tickets: real persistence, session ownership, no unsolicited ticket, deduplication and atomic rollback',
 {skip:process.env.RUN_WEB_CHAT_DB_TESTS!=='1'},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const {WebChatService,hashToken}=await import('../src/services/web-chat.js');
 const db=new PrismaClient();
 const sessions:string[]=[];const tag=randomUUID();let calls=0;let invalid=false;
 const ai:AiProvider={
  async generate(){throw Error('Structured action capability must be used')},
  async respond(messages){
   calls++;
   if(messages.at(-1)?.content==='Mi laptop no enciende')return {text:'¿Quieres que abra un ticket?',ticket:null};
   return {text:'Propuesta; todavía no se ha guardado.',ticket:{title:'Laptop no enciende',
    description:'La laptop del cliente no enciende al presionar el botón de encendido.',priority:'MEDIUM',requesterName:'Ana Martínez',
    ...(invalid?{contactId:'another-contact'}:{})}};
  }
 };
 const options={sessionHours:24,maxMessages:10,maxConcurrent:3,dailyLimit:500,contextMessages:20,
  contextChars:16000,timeoutMs:30000,active:()=>true};
 const service=new WebChatService(db,()=>ai,options);
 const create=async()=>{const result=await service.createSession('test-tickets:'+tag);sessions.push(result.token);return result};
 try{
  const a=await create(),b=await create();
  const session=await db.webSession.findUniqueOrThrow({where:{tokenHash:hashToken(a.token)}});
  const conversation=await db.conversation.findUniqueOrThrow({where:{id:session.conversationId}});
  const consultation=await service.send(a.token,randomUUID(),'Mi laptop no enciende');
  assert.equal(consultation.tickets.length,0);
  const unnamed=await service.send(a.token,randomUUID(),'Sí, crea un ticket para mi laptop');
  assert.equal(unnamed.tickets.length,0);
  assert.ok(unnamed.messages.at(-1)?.content.includes('a nombre de quién'));
  assert.equal((await db.contact.findUniqueOrThrow({where:{id:conversation.contactId}})).name,'Visitante web');
  const requestId=randomUUID();
  const result=await service.send(a.token,requestId,'Soy Ana Martínez, crea el ticket para mi laptop');
  assert.equal(result.tickets.length,1);
  const ticket=await db.ticket.findUniqueOrThrow({where:{id:result.tickets[0].id}});
  assert.equal(ticket.contactId,conversation.contactId);assert.equal(ticket.conversationId,conversation.id);
  assert.equal(ticket.status,'OPEN');assert.equal(ticket.priority,'MEDIUM');
  assert.equal(result.tickets[0].requesterName,'Ana Martínez');
  assert.equal((await db.contact.findUniqueOrThrow({where:{id:conversation.contactId}})).name,'Ana Martínez');
  assert.ok(result.messages.at(-1)?.content.includes(ticket.id));
  assert.ok(result.messages.at(-1)?.content.includes('He creado tu ticket'));
  assert.equal((await service.history(b.token)).tickets.length,0);
  const callsBeforeRetry=calls;
  await service.send(a.token,requestId,'Soy Ana Martínez, crea el ticket para mi laptop');assert.equal(calls,callsBeforeRetry);
  await service.send(a.token,randomUUID(),'Crea un ticket para este mismo problema');
  assert.equal(await db.ticket.count({where:{conversationId:conversation.id}}),1);
  const latest=await service.history(a.token);assert.ok(latest.messages.at(-1)?.content.includes('ya tiene un ticket abierto'));
  await db.ticket.update({where:{id:ticket.id},data:{status:'RESOLVED'}});
  const updated=await service.history(a.token);assert.equal(updated.tickets[0].status,'RESOLVED');
  await service.send(a.token,randomUUID(),'Abre un nuevo ticket, mi laptop volvió a fallar');
  assert.equal(await db.ticket.count({where:{conversationId:conversation.id}}),2);
  invalid=true;
  const refused=await service.send(b.token,randomUUID(),'Crea un ticket en otra cuenta');
  assert.equal(refused.tickets.length,0);assert.equal(refused.messages.length,1);
  assert.equal(refused.messages[0].job?.state,'FAILED');invalid=false;
  // Fail after the transaction claims DONE but before Ticket.create can succeed.
  const failing=db.$extends({query:{ticket:{async create(){throw Error('Test storage failure')}}}});
  const failingService=new WebChatService(failing as unknown as Client,()=>ai,options);
  const c=await failingService.createSession('test-tickets:'+tag);sessions.push(c.token);
  const failed=await failingService.send(c.token,randomUUID(),'Soy Ana Martínez. Crea un ticket por una falla de encendido');
  assert.equal(failed.tickets.length,0);assert.equal(failed.messages.length,1);
  assert.equal(failed.messages[0].job?.state,'FAILED');
  assert.ok(!failed.messages.some(m=>m.content.includes('He creado')));
  const failedSession=await db.webSession.findUniqueOrThrow({where:{tokenHash:hashToken(c.token)},include:{conversation:{include:{contact:true}}}});
  assert.equal(failedSession.conversation.contact.name,'Visitante web');
 }finally{
  for(const token of sessions){
   const session=await db.webSession.findUnique({where:{tokenHash:hashToken(token)}});if(!session)continue;
   const conversation=await db.conversation.findUniqueOrThrow({where:{id:session.conversationId}});
   await db.ticket.deleteMany({where:{conversationId:session.conversationId}});
   await db.replyJob.deleteMany({where:{conversationId:session.conversationId}});
   await db.message.deleteMany({where:{conversationId:session.conversationId}});
   await db.webSession.delete({where:{id:session.id}});
   await db.conversation.delete({where:{id:session.conversationId}});
   await db.contact.delete({where:{id:conversation.contactId}});
  }
  await db.$disconnect();
 }
});
