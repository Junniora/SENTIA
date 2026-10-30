import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeTask,type AgentStore,type AgentTask} from '../src/services/agent.js';
import {ProviderError} from '../src/services/provider-error.js';
import {buildContext} from '../src/services/ai/context.js';
import {nextDelivery} from '../src/services/delivery.js';
import {MetaClient} from '../src/services/meta.js';
import type {AiProvider} from '../src/services/ai/index.js';

const task=():AgentTask=>({id:'job',messageId:'incoming',attempts:1,state:'GENERATING',phone:'525512345678',receivedAt:new Date()});
function fixture(){
 const events:string[]=[];let failure:unknown;let generated='';
 const store:AgentStore={
  async context(){events.push('context');return [{role:'user',content:'No enciende'}]},
  async prepare(_task,text){generated=text;events.push('persist-reply')},
  async outgoing(){return {id:'out',content:generated||'Respuesta guardada'}},
  async beginSend(){events.push('persist-sending');return true},
  async sent(_task,id,external){events.push('persist-sent');assert.equal(id,'out');assert.equal(external,'wamid.1')},
  async failed(_task,code,retry,uncertain){failure={code,retry,uncertain};events.push('failed')}
 };
 const ai:AiProvider={async generate(messages){events.push('generate');assert.equal(messages[0].content,'No enciende');return '¿Es laptop?'}};
 const sender={async sendText(to:string,text:string,id:string){events.push('send');assert.equal(to,'525512345678');assert.ok(text);assert.equal(id,'out');return 'wamid.1'}};
 return {events,store,ai,sender,get failure(){return failure}};
}
test('agent persists the answer before a single send and stores the external ID',async()=>{
 const f=fixture();await executeTask(task(),f.store,f.ai,f.sender);
 assert.deepEqual(f.events,['context','generate','persist-reply','persist-sending','send','persist-sent']);assert.equal(f.failure,undefined);
});
test('ready task resumes saved answer without regenerating',async()=>{
 const f=fixture();await executeTask({...task(),state:'READY'},f.store,f.ai,f.sender);
 assert.deepEqual(f.events,['persist-sending','send','persist-sent']);
});
test('AI quota retry is bounded and never sends an invented fallback',async()=>{
 for(const attempts of [1,3]){
  const f=fixture();f.ai.generate=async()=>{throw new ProviderError('AI_QUOTA',true)};
  await executeTask({...task(),attempts},f.store,f.ai,f.sender);
  assert.deepEqual(f.failure,{code:'AI_QUOTA',retry:attempts<3,uncertain:false});assert.ok(!f.events.includes('send'));
 }
});
test('AI policy block, empty output and auth fail without a send',async()=>{
 for(const code of ['AI_BLOCKED','AI_AUTH','AI_EMPTY']){
  const f=fixture();f.ai.generate=async()=>{if(code==='AI_EMPTY')return '';throw new ProviderError(code)};
  await executeTask(task(),f.store,f.ai,f.sender);assert.deepEqual(f.failure,{code,retry:false,uncertain:false});
 }
});
test('Meta timeout is uncertain, never automatically retried',async()=>{
 const f=fixture();f.sender.sendText=async()=>{throw new ProviderError('META_TIMEOUT_OR_NETWORK',false,true)};
 await executeTask(task(),f.store,f.ai,f.sender);
 assert.deepEqual(f.failure,{code:'META_TIMEOUT_OR_NETWORK',retry:false,uncertain:true});
});
test('definite Meta rejection is failed and never automatically retried',async()=>{
 const f=fixture();f.sender.sendText=async()=>{throw new ProviderError('META_AUTH')};
 await executeTask(task(),f.store,f.ai,f.sender);assert.deepEqual(f.failure,{code:'META_AUTH',retry:false,uncertain:false});
});
test('persistence failure after send cannot trigger another send',async()=>{
 const f=fixture();f.store.sent=async()=>{throw Error('database unavailable')};
 await executeTask(task(),f.store,f.ai,f.sender);assert.deepEqual(f.failure,{code:'INTERNAL_ERROR',retry:false,uncertain:true});
});
test('lost ownership never performs a send',async()=>{
 const f=fixture();f.store.beginSend=async()=>false;
 await executeTask(task(),f.store,f.ai,f.sender);assert.ok(!f.events.includes('send'));
});
test('outside 24 hours, future timestamps and demo recipients never invoke providers',async()=>{
 for(const change of [{receivedAt:new Date(Date.now()-86400001)},{receivedAt:new Date(Date.now()+600000)},{phone:'demo:contacto:ana'}]){
  const f=fixture();await executeTask({...task(),...change},f.store,f.ai,f.sender);assert.deepEqual(f.events,['failed']);
 }
});
test('context stays bounded, chronological, deduplicated and excludes unsent claims',()=>{
 const row=(id:string,direction='INBOUND',deliveryStatus='RECEIVED',content=id)=>({id,direction,deliveryStatus,content,messageType:'text'});
 const context=buildContext([row('a'),row('a'),row('b','OUTBOUND','SENT'),row('failed','OUTBOUND','FAILED'),row('c')],20,100);
 assert.deepEqual(context,[{role:'user',content:'a'},{role:'assistant',content:'b'},{role:'user',content:'c'}]);
 assert.equal(buildContext([row('abcdef'),row('123456')],20,8).reduce((n,m)=>n+m.content.length,0),8);
 assert.equal(buildContext([row('a'),row('b')],1,100)[0].content,'b');
});
test('out-of-order statuses never regress read/delivered or fabricate delivery',()=>{
 assert.equal(nextDelivery('PENDING','sent'),'PENDING');
 assert.equal(nextDelivery('SENDING','SENT'),'SENT');
 assert.equal(nextDelivery('READ','SENT'),'READ');
 assert.equal(nextDelivery('DELIVERED','FAILED'),'DELIVERED');
 assert.equal(nextDelivery('FAILED','SENT'),'FAILED');
 assert.equal(nextDelivery('UNCERTAIN','DELIVERED'),'DELIVERED');
});
test('Meta client validates recipients, payload, correlation, and returned ID with a mock',async()=>{
 let calls=0;
 const request:typeof fetch=async(input,init)=>{
  calls++;assert.equal(String(input),'https://graph.facebook.com/v26.0/123/messages');
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer secret');
  const body=JSON.parse(String(init?.body));assert.equal(body.biz_opaque_callback_data,'out');assert.equal(body.text.body,'Hola');
  return Response.json({messages:[{id:'wamid.1'}]});
 };
 const client=new MetaClient({token:'secret',phoneId:'123',version:'v26.0',timeoutMs:1000},request);
 assert.equal(await client.sendText('525512345678','Hola','out'),'wamid.1');
 await assert.rejects(()=>client.sendText('demo:ana','Hola','out'));assert.equal(calls,1);
});
test('Meta response errors are sanitized, malformed success is uncertain',async()=>{
 for(const status of [401,429,500,200]){
  const client=new MetaClient({token:'secret',phoneId:'123',version:'v26.0',timeoutMs:1000},
   async()=>Response.json({error:{message:'sensitive upstream data'}},{status}));
  await assert.rejects(()=>client.sendText('525512345678','Hola','out'),(e:unknown)=>{
   assert.ok(e instanceof ProviderError);assert.ok(!e.message.includes('sensitive'));assert.equal(e.uncertain,status===500||status===200);return true;
  });
 }
});
test('media download refuses unsupported MIME, unsafe URL, oversized metadata without downloading',async()=>{
 for(const metadata of [
  {url:'https://evil.invalid/image',mime_type:'image/png',file_size:8},
  {url:'https://lookaside.fbsbx.com/image',mime_type:'application/pdf',file_size:8},
  {url:'https://cdn.facebook.com/image',mime_type:'image/png',file_size:6000000}
 ]){
  let calls=0;const client=new MetaClient({token:'secret',phoneId:'123',version:'v26.0',timeoutMs:1000},
   async()=>{calls++;return Response.json(metadata)});
  await assert.rejects(()=>client.downloadImage('123'));assert.equal(calls,1);
 }
});
