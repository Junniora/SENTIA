import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

test('PostgreSQL durable queue: deduplication, ordered claims, recovery, context and real delivery events',
 {skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const url=process.env.TEST_DATABASE_URL;
 assert.ok(url&&/test/i.test(new URL(url).pathname),'TEST_DATABASE_URL must identify an isolated test database');
 process.env.DATABASE_URL=url;
 process.env.JWT_SECRET='isolated-database-test-secret-minimum-32';
 process.env.AI_ENABLED='true';process.env.AI_AUTO_REPLY='true';
 process.env.GEMINI_API_KEY='mock-only';process.env.WHATSAPP_ACCESS_TOKEN='mock-only';
 process.env.WHATSAPP_APP_SECRET='mock-only';
 process.env.WHATSAPP_PHONE_NUMBER_ID='123';process.env.WHATSAPP_GRAPH_VERSION='v26.0';
 const {prisma}=await import('../src/lib/prisma.js');
 const {processWebhook}=await import('../src/services/whatsapp.js');
 const {claimTask,agentStore}=await import('../src/services/worker.js');
 const {executeTask}=await import('../src/services/agent.js');
 const {app}=await import('../src/app.js');
 const {default:jwt}=await import('jsonwebtoken');
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const base='http://127.0.0.1:'+address.port;
 const tag=randomUUID();const phone='5298'+Date.now();
 const now=String(Math.floor(Date.now()/1000));
 const event=(messages:unknown[]=[],statuses:unknown[]=[])=>({object:'whatsapp_business_account',
  entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},messages,statuses}}]}]});
 const inbound=(id:string,text:string)=>({id,from:phone,type:'text',timestamp:now,text:{body:text}});
 const asTask=(job:any)=>({id:job.id,messageId:job.messageId,attempts:job.attempts,state:job.state,phone,receivedAt:new Date(Number(now)*1000)});
 try{
  // Two retries concurrently must still create one contact, conversation, message and task.
  await Promise.all([processWebhook(event([inbound(tag+'-1','Mi computadora no enciende')]),'123'),
   processWebhook(event([inbound(tag+'-1','Mi computadora no enciende')]),'123')]);
  const contact=await prisma.contact.findUniqueOrThrow({where:{phoneNumber:phone}});
  assert.equal(await prisma.conversation.count({where:{contactId:contact.id}}),1);
  const conversation=await prisma.conversation.findFirstOrThrow({where:{contactId:contact.id}});
  assert.equal(await prisma.message.count({where:{conversationId:conversation.id}}),1);
  assert.equal(await prisma.replyJob.count({where:{conversationId:conversation.id}}),1);
  await processWebhook(event([inbound(tag+'-2','No hace nada')]),'123');
  const claimed=await Promise.all([claimTask(),claimTask()]);
  assert.equal(claimed.filter(Boolean).length,1,'a later task cannot overtake a live task in the same conversation');
  const first=claimed.find(Boolean)!;assert.equal(first.state,'GENERATING');
  let sends=0;
  await executeTask(asTask(first),agentStore,{async generate(){return '¿Es laptop o escritorio?'}},
   {async sendText(){sends++;return tag+'-out-1'}});
  assert.equal(sends,1);
  const outgoing=await prisma.message.findUniqueOrThrow({where:{replyToId:first.messageId}});
  assert.equal(outgoing.deliveryStatus,'SENT');assert.equal(outgoing.source,'AI');
  const admin=await prisma.user.create({data:{name:'Agent integration',email:tag+'@agent-test.invalid',passwordHash:'unused',role:'ADMIN'}});
  const token=jwt.sign({},process.env.JWT_SECRET!,{subject:admin.id,issuer:'sentia',audience:'sentia-admin',algorithm:'HS256',expiresIn:'1h'});
  const headers={authorization:'Bearer '+token};
  const history=await fetch(base+'/api/conversations/'+conversation.id+'/messages',{headers});
  assert.equal(history.status,200);
  const historyBody=await history.json();
  assert.ok(historyBody.items.some((m:any)=>m.source==='AI'&&m.deliveryStatus==='SENT'));
  assert.ok(historyBody.items.some((m:any)=>m.direction==='INBOUND'&&m.job));
  const settings=await (await fetch(base+'/api/settings',{headers})).json();
  assert.equal(settings.agent.active,true);assert.equal(settings.agent.configured,true);
  assert.ok(!JSON.stringify(settings).includes('mock-only'));
  // An HTTP retry after completion creates no new work and no new outgoing message.
  await processWebhook(event([inbound(tag+'-1','Mi computadora no enciende')]),'123');
  assert.equal(await prisma.message.count({where:{replyToId:first.messageId}}),1);
  const second=await claimTask();assert.ok(second);
  const context=await agentStore.context(asTask(second));
  assert.ok(context.some(x=>x.role==='assistant'&&x.content==='¿Es laptop o escritorio?'));
  assert.equal(context.at(-1)?.content,'No hace nada');
  // Simulate restart during generation: expired lease can be reclaimed with a new fencing attempt.
  await prisma.replyJob.update({where:{id:second.id},data:{leaseUntil:new Date(0)}});
  const recovered=await claimTask();assert.equal(recovered?.id,second.id);assert.equal(recovered!.attempts,2);
  assert.equal(await agentStore.beginSend(asTask(second)),false);
  await executeTask(asTask(recovered),agentStore,{async generate(){return 'Revisa la alimentación.'}},
   {async sendText(){return tag+'-out-2'}});
  const secondOutgoing=await prisma.message.findUniqueOrThrow({where:{replyToId:second.messageId}});
  await processWebhook(event([],[{id:tag+'-out-2',status:'read',timestamp:now,recipient_id:phone}]),'123');
  await processWebhook(event([],[{id:tag+'-out-2',status:'sent',timestamp:now,recipient_id:phone}]),'123');
  assert.equal((await prisma.message.findUniqueOrThrow({where:{id:secondOutgoing.id}})).deliveryStatus,'READ');
  // Simulate process death after beginning an external send.
  await processWebhook(event([inbound(tag+'-3','Gracias')]),'123');
  const third=await claimTask();assert.ok(third);
  await agentStore.prepare(asTask(third),'De nada');assert.equal(await agentStore.beginSend(asTask(third)),true);
  await prisma.replyJob.update({where:{id:third.id},data:{leaseUntil:new Date(0)}});
  assert.equal(await claimTask(),null);
  assert.equal((await prisma.replyJob.findUniqueOrThrow({where:{id:third.id}})).state,'UNCERTAIN');
  const thirdOutgoing=await prisma.message.findUniqueOrThrow({where:{replyToId:third.messageId}});
  assert.equal(thirdOutgoing.deliveryStatus,'UNCERTAIN');
  // Status callback correlates a send even when its response was lost in the restart.
  await processWebhook(event([],[{id:tag+'-out-3',status:'delivered',timestamp:now,
   recipient_id:phone,biz_opaque_callback_data:thirdOutgoing.id}]),'123');
  assert.equal((await prisma.replyJob.findUniqueOrThrow({where:{id:third.id}})).state,'DONE');
  assert.equal((await prisma.message.findUniqueOrThrow({where:{id:thirdOutgoing.id}})).deliveryStatus,'DELIVERED');
  // Media IDs and MIME survive without downloading or storing temporary URLs.
  await processWebhook(event([{id:tag+'-image',from:phone,type:'image',timestamp:now,
   image:{id:'123456',mime_type:'image/png',caption:'Foto del equipo'}}]),'123');
  const image=await prisma.message.findUniqueOrThrow({where:{externalMessageId:tag+'-image'}});
  assert.equal(image.mediaId,'123456');assert.equal(image.mimeType,'image/png');
 }finally{
  const contact=await prisma.contact.findUnique({where:{phoneNumber:phone}});
  if(contact){
   const conversations=await prisma.conversation.findMany({where:{contactId:contact.id},select:{id:true}});
   await prisma.replyJob.deleteMany({where:{conversationId:{in:conversations.map(x=>x.id)}}});
   await prisma.message.deleteMany({where:{conversation:{contactId:contact.id}}});
   await prisma.conversation.deleteMany({where:{contactId:contact.id}});
   await prisma.contact.delete({where:{id:contact.id}});
  }
  await prisma.user.deleteMany({where:{email:tag+'@agent-test.invalid'}});
  await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  await prisma.$disconnect();
 }
});
