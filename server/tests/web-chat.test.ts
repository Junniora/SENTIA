import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomBytes} from 'node:crypto';

process.env.DATABASE_URL||='postgresql://sentia:local@127.0.0.1:5432/sentia';
process.env.JWT_SECRET||='web-chat-test-secret-with-more-than-32-characters';
const {createPublicChatRouter,publicChatInput}=await import('../src/routes/public-chat.js');
const {hashToken}=await import('../src/services/web-chat.js');
const {errors}=await import('../src/middleware/errors.js');
const {allowedOrigin}=await import('../src/config/cors.js');

test('public input rejects empty, oversized, uploaded, and extra admin fields',()=>{
 const requestId='123e4567-e89b-42d3-a456-426614174000';
 assert.ok(publicChatInput.safeParse({requestId,content:'Hola'}).success);
 for(const input of [{requestId,content:''},{requestId,content:'x'.repeat(4001)},
  {requestId,content:'Hola',conversationId:'other'},{requestId,content:'Hola',file:'image.png'},
  {requestId:'not-uuid',content:'Hola'}])assert.equal(publicChatInput.safeParse(input).success,false);
});
test('session credentials use one-way SHA-256 hashes and do not preserve raw bearer tokens',()=>{
 const a=randomBytes(32).toString('base64url'),b=randomBytes(32).toString('base64url');
 assert.equal(a.length,43);assert.notEqual(a,b);assert.equal(hashToken(a).length,64);
 assert.notEqual(hashToken(a),a);assert.notEqual(hashToken(a),hashToken(b));
});
test('CORS permits the configured local frontend and rejects unrelated origins',()=>{
 assert.ok(allowedOrigin('http://localhost:5173'));
 assert.ok(allowedOrigin('http://127.0.0.1:5173'));
 assert.equal(allowedOrigin('https://evil.invalid'),false);
 assert.equal(allowedOrigin('http://localhost.evil.invalid:5173'),false);
});
test('public HTTP API parses a dedicated bearer, validates text and refuses files or oversized bodies',async()=>{
 const token=randomBytes(32).toString('base64url');let receivedToken='';let sent=0;
 const fake={
  async rate(){},async createSession(){return {token,expiresAt:new Date(),aiAvailable:true}},
  async history(value:string){receivedToken=value;return {messages:[],aiAvailable:true}},
  async send(value:string,id:string,content:string){receivedToken=value;sent++;return {messages:[{content}],aiAvailable:true}}
 };
 const app=express();app.use(express.json({limit:'16kb'}));
 app.use('/api/public/chat',createPublicChatRouter(fake as any));app.use(errors);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const addr=server.address();assert.ok(addr&&typeof addr!=='string');const base='http://127.0.0.1:'+addr.port+'/api/public/chat';
 try{
  const created=await fetch(base+'/session',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(created.status,201);assert.equal((await created.json()).token,token);
  const history=await fetch(base+'/messages',{headers:{authorization:'Bearer '+token}});
  assert.equal(history.status,200);assert.equal(receivedToken,token);
  const input={requestId:'123e4567-e89b-42d3-a456-426614174000',content:'Hola'};
  assert.equal((await fetch(base+'/messages',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(input)})).status,200);
  assert.equal(sent,1);
  assert.equal((await fetch(base+'/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,file:'file'})})).status,400);
  assert.equal((await fetch(base+'/messages',{method:'POST',headers:{'content-type':'multipart/form-data'},body:'file'})).status,415);
  assert.equal((await fetch(base+'/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'x'.repeat(20000)})})).status,413);
  assert.equal(sent,1);
  await fetch(base+'/messages',{headers:{authorization:'Bearer admin.jwt.token'}});
  assert.equal(receivedToken,'');
 }finally{await new Promise<void>(r=>server.close(()=>r()))}
});
