import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {GoogleGenAI} from '@google/genai';
import {GeminiProvider} from '../src/services/ai/gemini.js';
import {ProviderError} from '../src/services/provider-error.js';

function provider(generateContent:(input:any)=>Promise<unknown>){
 return new GeminiProvider('mock-key','mock-model',1000,{models:{generateContent}} as unknown as GoogleGenAI);
}
test('Gemini SDK adapter maps roles, system instructions, deadline, and output without a network call',async()=>{
 const ai=provider(async input=>{
  assert.equal(input.model,'mock-model');
  assert.deepEqual(input.contents.map((x:any)=>x.role),['user','model','user']);
  assert.ok(input.config.systemInstruction.includes('No inventes precios'));
  assert.ok(input.config.abortSignal instanceof AbortSignal);
  return {text:'  ¿Hay alguna luz?  ',candidates:[{finishReason:'STOP'}]};
 });
 assert.equal(await ai.generate([{role:'user',content:'Hola'},{role:'assistant',content:'Buen día'},{role:'user',content:'No enciende'}]),'¿Hay alguna luz?');
});
test('Gemini SDK adapter classifies quota, HTTP, authentication and network failures without exposing details',async()=>{
 for(const [status,code,retryable] of [[401,'AI_AUTH',false],[403,'AI_AUTH',false],[429,'AI_QUOTA',true],[503,'AI_UNAVAILABLE',true],[400,'AI_REQUEST',false],[undefined,'AI_TIMEOUT_OR_NETWORK',true]] as const){
  const ai=provider(async()=>{throw {status,message:'private-key secret'}});
  await assert.rejects(()=>ai.generate([{role:'user',content:'Hola'}]),(e:unknown)=>{
   assert.ok(e instanceof ProviderError);assert.equal(e.code,code);assert.equal(e.retryable,retryable);assert.ok(!e.message.includes('secret'));return true;
  });
 }
});
test('Gemini empty and blocked answers fail explicitly',async()=>{
 for(const response of [{text:''},{promptFeedback:{blockReason:'SAFETY'}},{text:'partial',candidates:[{finishReason:'SAFETY'}]}]){
  await assert.rejects(()=>provider(async()=>response).generate([{role:'user',content:'Hola'}]),ProviderError);
 }
});

test('Gemini web action uses validated structured JSON, without model-supplied ownership',async()=>{
 const ai=provider(async input=>{
  assert.equal(input.config.responseMimeType,'application/json');
  assert.ok(input.config.systemInstruction.includes('crear un ticket'));
  return {text:JSON.stringify({text:'Registraré la solicitud.',ticket:{title:'Laptop no enciende',description:'El cliente indica que su laptop no recibe energía.',priority:'MEDIUM'}})};
 });
 const reply=await ai.respond([{role:'user',content:'Crea un ticket porque mi laptop no enciende.'}]);
 assert.equal(reply.ticket?.title,'Laptop no enciende');
 assert.equal(reply.ticket?.priority,'MEDIUM');
});

test('Gemini web action rejects invalid JSON, priorities and arbitrary contact IDs',async()=>{
 const ticket={title:'Falla',description:'El equipo no enciende.',priority:'MEDIUM'};
 for(const text of ['not json',JSON.stringify({text:'Hola',ticket:{...ticket,contactId:'other'}}),
  JSON.stringify({text:'Hola',ticket:{...ticket,priority:'URGENT'}})]){
  await assert.rejects(()=>provider(async()=>({text})).respond([{role:'user',content:'Crea un ticket'}]),
   (e:unknown)=>e instanceof ProviderError&&e.code==='AI_INVALID_RESPONSE');
 }
});
