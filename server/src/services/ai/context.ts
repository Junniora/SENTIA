import type {AiMessage} from './index.js';
export interface ContextMessage {id:string;direction:string;content:string;deliveryStatus:string;messageType:string}
export function buildContext(rows:readonly ContextMessage[],maxMessages:number,maxChars:number):AiMessage[]{
 const seen=new Set<string>();
 const unique=rows.filter(m=>{
  if(seen.has(m.id))return false;seen.add(m.id);
  return m.direction==='INBOUND'||['SENT','DELIVERED','READ','AVAILABLE'].includes(m.deliveryStatus);
 });
 const result:AiMessage[]=[];let remaining=maxChars;
 for(const m of unique.slice(-maxMessages).reverse()){
  if(remaining<=0)break;
  const content=(m.messageType==='text'?m.content:`[Medio ${m.messageType}; contenido no analizado] ${m.content}`).slice(0,remaining);
  result.unshift({role:m.direction==='INBOUND'?'user':'assistant',content});remaining-=content.length;
 }
 return result;
}
