import type {AiProvider} from './ai/index.js';
import type {TextSender} from './meta.js';
import type {AiMessage} from './ai/index.js';
import {ProviderError,safeCode} from './provider-error.js';

export interface AgentTask {
 id:string;messageId:string;attempts:number;state:string;phone:string;receivedAt:Date;
}
export interface AgentStore {
 context(task:AgentTask):Promise<AiMessage[]>;
 prepare(task:AgentTask,text:string):Promise<void>;
 outgoing(task:AgentTask):Promise<{id:string;content:string}>;
 beginSend(task:AgentTask):Promise<boolean>;
 sent(task:AgentTask,id:string,externalId:string):Promise<void>;
 failed(task:AgentTask,code:string,retry:boolean,uncertain:boolean):Promise<void>;
}
export async function executeTask(task:AgentTask,store:AgentStore,ai:AiProvider,sender:TextSender,now=()=>new Date()){
 let sending=false;
 try{
  // Text replies only within the customer-care window. No template bypass.
  if(!/^\d{5,20}$/.test(task.phone))throw new ProviderError('INVALID_RECIPIENT');
  if(now().getTime()-task.receivedAt.getTime()>=24*60*60*1000||task.receivedAt.getTime()>now().getTime()+300000)
   throw new ProviderError('WINDOW_EXPIRED');
  if(task.state==='GENERATING'){
   const text=await ai.generate(await store.context(task));
   if(!text.trim())throw new ProviderError('AI_EMPTY');
   await store.prepare(task,text.slice(0,4000));
  }
  const outgoing=await store.outgoing(task);
  if(now().getTime()-task.receivedAt.getTime()>=24*60*60*1000)throw new ProviderError('WINDOW_EXPIRED');
  if(!await store.beginSend(task))return;
  sending=true;
  const externalId=await sender.sendText(task.phone,outgoing.content,outgoing.id);
  await store.sent(task,outgoing.id,externalId);
 }catch(e){
  const uncertain=sending&&(!(e instanceof ProviderError)||e.uncertain);
  // Generation retries are safe and bounded. Meta sends are never automatically repeated.
  await store.failed(task,safeCode(e),!sending&&e instanceof ProviderError&&e.retryable&&task.attempts<3,uncertain);
 }
}
