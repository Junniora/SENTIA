import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

test('Web chat PostgreSQL: sessions, isolation, persistence, Gemini mock, concurrency, retries, errors, limits and admin',
 {skip:process.env.RUN_WEB_CHAT_DB_TESTS!=='1'},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const {WebChatService,hashToken,consumeRate}=await import('../src/services/web-chat.js');
 const {HttpError}=await import('../src/middleware/errors.js');
 const {ProviderError}=await import('../src/services/provider-error.js');
 const db=new PrismaClient();
 const sessions:string[]=[];const tag=randomUUID();
 let calls=0;let fail=false;let gate:Promise<void>|undefined;let entered:(()=>void)|undefined;
 const ai={async generate(context:any[]){
  calls++;entered?.();if(gate)await gate;if(fail)throw new ProviderError('AI_QUOTA',true);
  assert.ok(context.at(-1).role==='user');
  if(calls===2)assert.ok(context.some(m=>m.role==='assistant'&&m.content.includes('computadora de escritorio')));
  return calls===1?'¿Es una laptop o una computadora de escritorio?':'Revisemos el adaptador de energía.';
 }};
 const service=new WebChatService(db,()=>ai,{sessionHours:24,maxMessages:4,maxConcurrent:1,dailyLimit:500,
  contextMessages:20,contextChars:16000,timeoutMs:30000,active:()=>true});
 const create=async()=>{
  const result=await service.createSession('test:'+tag);sessions.push(result.token);return result;
 };
 try{
  const a=await create(),b=await create();assert.notEqual(a.token,b.token);
  const stored=await db.webSession.findUniqueOrThrow({where:{tokenHash:hashToken(a.token)}});
  assert.notEqual(stored.tokenHash,a.token);
  assert.equal((await db.conversation.findUniqueOrThrow({where:{id:stored.conversationId}})).channel,'WEB');
  await assert.rejects(()=>service.history('invalid'),(e:any)=>e instanceof HttpError&&e.status===401);
  const requestId=randomUUID();
  const first=await service.send(a.token,requestId,'Mi laptop no enciende');
  assert.equal(calls,1);assert.equal(first.messages.length,2);
  assert.equal(first.messages[1].source,'AI');assert.equal(first.messages[1].deliveryStatus,'AVAILABLE');
  assert.equal((await service.history(b.token)).messages.length,0);
  await service.send(a.token,requestId,'Mi laptop no enciende');assert.equal(calls,1);
  await assert.rejects(()=>service.send(a.token,requestId,'Otro contenido'),(e:any)=>e.status===409);
  let resume!:()=>void;gate=new Promise(r=>{resume=r});
  const reached=new Promise<void>(r=>{entered=r});
  const active=service.send(a.token,randomUUID(),'Es una laptop');await reached;
  await assert.rejects(()=>service.send(a.token,randomUUID(),'Un segundo mensaje'),(e:any)=>e.status===409);
  await assert.rejects(()=>service.send(b.token,randomUUID(),'Otra sesión'),(e:any)=>e.status===503);
  resume();await active;gate=undefined;entered=undefined;
  const contextCalls=calls;
  fail=true;
  const failedId=randomUUID();
  const failed=await service.send(a.token,failedId,'¿Qué hago?');
  assert.equal(failed.messages.at(-1)?.job?.state,'FAILED');
  assert.equal(failed.messages.at(-1)?.job?.errorCode,'AI_QUOTA');
  assert.equal(calls,contextCalls+1);fail=false;
  await service.send(a.token,failedId,'¿Qué hago?');assert.equal(calls,contextCalls+1);
  // A fresh service instance recovers history from PostgreSQL, not process memory.
  const restarted=new WebChatService(db,()=>ai,{sessionHours:24,maxMessages:4,maxConcurrent:1,dailyLimit:500,
   contextMessages:20,contextChars:16000,timeoutMs:30000,active:()=>true});
  assert.equal((await restarted.history(a.token)).messages.length,5);
  await service.send(a.token,randomUUID(),'Última consulta');
  await assert.rejects(()=>service.send(a.token,randomUUID(),'Una más'),(e:any)=>e.status===429);
  await db.webSession.update({where:{tokenHash:hashToken(b.token)},data:{expiresAt:new Date(0)}});
  await assert.rejects(()=>service.history(b.token),(e:any)=>e.status===401);
  const rateKey='rate-test:'+tag;
  await db.$transaction(tx=>consumeRate(tx,rateKey,1,60000));
  await assert.rejects(()=>db.$transaction(tx=>consumeRate(tx,rateKey,1,60000)),(e:any)=>e.status===429);
  // Existing admin routes still require JWT and list WEB conversations with the same messages.
  const {app}=await import('../src/app.js');const {default:jwt}=await import('jsonwebtoken');
  const {env}=await import('../src/config/env.js');
  const admin=await db.user.create({data:{name:'Web integration test',email:tag+'@web-test.invalid',passwordHash:'unused',role:'ADMIN'}});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const addr=server.address();assert.ok(addr&&typeof addr!=='string');const base='http://127.0.0.1:'+addr.port;
  try{
   assert.equal((await fetch(base+'/api/conversations')).status,401);
   const token=jwt.sign({},env.JWT_SECRET,{subject:admin.id,issuer:'sentia',audience:'sentia-admin',algorithm:'HS256',expiresIn:'1h'});
   const headers={authorization:'Bearer '+token};
   const response=await fetch(base+'/api/conversations?channel=WEB',{headers});assert.equal(response.status,200);
   const list=await response.json();assert.ok(list.items.some((x:any)=>x.id===stored.conversationId));
   assert.ok(list.items.every((x:any)=>x.channel==='WEB'));
   const history=await (await fetch(base+'/api/conversations/'+stored.conversationId+'/messages',{headers})).json();
   assert.ok(history.items.some((x:any)=>x.source==='AI'&&x.deliveryStatus==='AVAILABLE'));
  }finally{await new Promise<void>(r=>server.close(()=>r()));await db.user.deleteMany({where:{id:admin.id}})}
 }finally{
  // Delete exclusively artifacts created by this test, never pre-existing conversations.
  for(const token of sessions){
   const session=await db.webSession.findUnique({where:{tokenHash:hashToken(token)}});
   if(!session)continue;
   const conversation=await db.conversation.findUniqueOrThrow({where:{id:session.conversationId}});
   await db.replyJob.deleteMany({where:{conversationId:session.conversationId}});
   await db.message.deleteMany({where:{conversationId:session.conversationId}});
   await db.webSession.delete({where:{id:session.id}});
   await db.conversation.delete({where:{id:session.conversationId}});
   await db.contact.delete({where:{id:conversation.contactId}});
  }
  await db.$disconnect();
 }
});
