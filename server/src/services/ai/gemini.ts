import {GoogleGenAI} from '@google/genai';
import type {AiMessage,AiProvider,AiReply} from './index.js';
import {SYSTEM_INSTRUCTION,TICKET_SYSTEM_INSTRUCTION} from './prompt.js';
import {ProviderError} from '../provider-error.js';
import {aiReply,aiReplyJsonSchema} from '../../validators/ai-reply.js';

export class GeminiProvider implements AiProvider {
 private client:GoogleGenAI;
 constructor(apiKey:string,private model:string,private timeoutMs=30000,client?:GoogleGenAI){
  this.client=client??new GoogleGenAI({apiKey,httpOptions:{timeout:timeoutMs,retryOptions:{attempts:1}}});
 }
 async generate(messages:readonly AiMessage[],signal?:AbortSignal):Promise<string>{
  return this.request(messages,false,signal);
 }
 async respond(messages:readonly AiMessage[],signal?:AbortSignal):Promise<AiReply>{
  const raw=await this.request(messages,true,signal);
  try{return aiReply.parse(JSON.parse(raw))}catch{throw new ProviderError('AI_INVALID_RESPONSE')}
 }
 private async request(messages:readonly AiMessage[],actions:boolean,signal?:AbortSignal):Promise<string>{
  try{
   const response=await this.client.models.generateContent({
    model:this.model,
    contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),
    config:{systemInstruction:actions?TICKET_SYSTEM_INSTRUCTION:SYSTEM_INSTRUCTION,maxOutputTokens:actions?1536:1024,
      ...(actions?{responseMimeType:'application/json',responseJsonSchema:aiReplyJsonSchema}:{}),
      abortSignal:signal??AbortSignal.timeout(this.timeoutMs)}
   });
   if(response.promptFeedback?.blockReason||response.candidates?.some(c=>
     ['SAFETY','BLOCKLIST','PROHIBITED_CONTENT','RECITATION'].includes(c.finishReason??'')))
     throw new ProviderError('AI_BLOCKED');
   const text=response.text?.trim();
   if(!text)throw new ProviderError('AI_EMPTY');
   return actions?text:text.slice(0,4000);
  }catch(e){
   if(e instanceof ProviderError)throw e;
   const status=Number((e as {status?:number})?.status);
   if(status===401||status===403)throw new ProviderError('AI_AUTH');
   if(status===429)throw new ProviderError('AI_QUOTA',true);
   if(status>=500)throw new ProviderError('AI_UNAVAILABLE',true);
   if(status>=400)throw new ProviderError('AI_REQUEST');
   throw new ProviderError('AI_TIMEOUT_OR_NETWORK',true);
  }
 }
}
