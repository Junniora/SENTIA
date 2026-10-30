import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHmac} from 'node:crypto';
// Opt-in: migrations must already be applied to an isolated test database.
test('PostgreSQL: login, roles, incoming message deduplication and tickets',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const url=process.env.TEST_DATABASE_URL;
 assert.ok(url&&/test/i.test(new URL(url).pathname),'TEST_DATABASE_URL must identify an isolated test database');
 process.env.DATABASE_URL=url;process.env.JWT_SECRET='isolated-database-test-secret-minimum-32';
 process.env.WHATSAPP_APP_SECRET='isolated-test-app-secret';process.env.AI_ENABLED='false';process.env.AI_AUTO_REPLY='false';
 const {prisma}=await import('../src/lib/prisma.js');const {app}=await import('../src/app.js');const bcrypt=await import('bcrypt');const {env}=await import('../src/config/env.js');const tag=randomUUID();const phone='5299'+Date.now();const email=tag+'@test.invalid';const password=randomUUID();const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error();const base='http://127.0.0.1:'+addr.port;
 try{
 const user=await prisma.user.create({data:{name:'Integration test',email,passwordHash:await bcrypt.hash(password,12),role:'ADMIN'}});
 assert.equal((await fetch(base+'/health')).status,200);
 const bad=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'wrong'})});assert.equal(bad.status,401);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const {token}=await login.json();const headers={'content-type':'application/json',authorization:'Bearer '+token};
 const body=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID||'test'},messages:[{id:tag,from:phone,type:'text',timestamp:String(Math.floor(Date.now()/1000)),text:{body:'Integration message'}}]}}]}]});assert.ok(env.WHATSAPP_APP_SECRET,'Set test App Secret');const signature='sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(body).digest('hex');
 for(let i=0;i<2;i++)assert.equal((await fetch(base+'/webhooks/whatsapp',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature},body})).status,200);
 assert.equal(await prisma.message.count({where:{externalMessageId:tag}}),1);const contact=await prisma.contact.findUniqueOrThrow({where:{phoneNumber:phone}});assert.equal(await prisma.conversation.count({where:{contactId:contact.id}}),1);
 const response=await fetch(base+'/api/tickets',{method:'POST',headers,body:JSON.stringify({contactId:contact.id,title:'Test ticket',description:'Integration test'})});assert.equal(response.status,201);const ticket=await response.json();assert.equal((await fetch(base+'/api/tickets/'+ticket.id,{method:'PATCH',headers,body:JSON.stringify({status:'RESOLVED'})})).status,200);assert.equal((await prisma.ticket.findUniqueOrThrow({where:{id:ticket.id}})).status,'RESOLVED');
 assert.equal((await fetch(base+'/api/dashboard',{headers})).status,200);await prisma.user.update({where:{id:user.id},data:{role:'AGENT'}});assert.equal((await fetch(base+'/api/contacts',{headers})).status,403);
 }finally{const c=await prisma.contact.findUnique({where:{phoneNumber:phone}});if(c){await prisma.ticket.deleteMany({where:{contactId:c.id}});await prisma.message.deleteMany({where:{conversation:{contactId:c.id}}});await prisma.conversation.deleteMany({where:{contactId:c.id}});await prisma.contact.delete({where:{id:c.id}})}await prisma.user.deleteMany({where:{email}});await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await prisma.$disconnect()}
});
