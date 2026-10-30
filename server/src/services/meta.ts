import {z} from 'zod';
import {ProviderError} from './provider-error.js';

export interface TextSender {sendText(to:string,text:string,correlationId:string):Promise<string>}
export interface MetaConfig {token:string;phoneId:string;version:string;timeoutMs:number}
export class MetaClient implements TextSender {
 constructor(private config:MetaConfig,private request:typeof fetch=fetch){}
 private async json(path:string,init:RequestInit={}):Promise<unknown>{
  let response:Response;
  try{
   response=await this.request(`https://graph.facebook.com/${this.config.version}/${path}`,{
    ...init,redirect:'error',headers:{Authorization:'Bearer '+this.config.token,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(this.config.timeoutMs)});
  }catch{throw new ProviderError('META_TIMEOUT_OR_NETWORK',false,init.method==='POST')}
  if(!response.ok){
   if(response.status===401||response.status===403)throw new ProviderError('META_AUTH');
   if(response.status===429)throw new ProviderError('META_RATE_LIMIT');
   throw new ProviderError('META_HTTP_'+response.status,false,response.status>=500&&init.method==='POST');
  }
  try{return await response.json()}catch{throw new ProviderError('META_INVALID_RESPONSE',false,init.method==='POST')}
 }
 async sendText(to:string,text:string,correlationId:string):Promise<string>{
  if(!/^\d{5,20}$/.test(to)||!text.trim()||text.length>4096)throw new ProviderError('META_INVALID_MESSAGE');
  const result=await this.json(this.config.phoneId+'/messages',{method:'POST',body:JSON.stringify({
   messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',
   text:{body:text,preview_url:false},biz_opaque_callback_data:correlationId})});
  const parsed=z.object({messages:z.array(z.object({id:z.string().min(1)})).min(1)}).safeParse(result);
  if(!parsed.success)throw new ProviderError('META_INVALID_RESPONSE',false,true);
  return parsed.data.messages[0].id;
 }
 // Authenticated, bounded image retrieval. The temporary URL is never persisted.
 async downloadImage(mediaId:string):Promise<{data:Buffer;mimeType:string}>{
  if(!/^\d+$/.test(mediaId))throw new ProviderError('MEDIA_INVALID_ID');
  const metadata=z.object({url:z.string().url(),mime_type:z.enum(['image/jpeg','image/png','image/webp']),
   file_size:z.number().int().min(1).max(5*1024*1024)}).safeParse(await this.json(mediaId));
  if(!metadata.success)throw new ProviderError('MEDIA_INVALID');
  const url=new URL(metadata.data.url);
  if(url.protocol!=='https:'||!(url.hostname.endsWith('.facebook.com')||url.hostname.endsWith('.fbcdn.net')||url.hostname.endsWith('.fbsbx.com')))
   throw new ProviderError('MEDIA_INVALID_HOST');
  try{
   const response=await this.request(url,{headers:{Authorization:'Bearer '+this.config.token},
    redirect:'error',signal:AbortSignal.timeout(this.config.timeoutMs)});
   if(!response.ok||!response.body)throw new ProviderError('MEDIA_DOWNLOAD');
   if(response.headers.get('content-type')?.split(';')[0]!==metadata.data.mime_type)throw new ProviderError('MEDIA_FORMAT');
   const chunks:Uint8Array[]=[];let size=0;
   for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){
    size+=chunk.length;if(size>5*1024*1024){throw new ProviderError('MEDIA_TOO_LARGE')}chunks.push(chunk);
   }
   const data=Buffer.concat(chunks);
   const valid=metadata.data.mime_type==='image/jpeg'?data.subarray(0,3).equals(Buffer.from([255,216,255])):
    metadata.data.mime_type==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP';
   if(!valid||size!==metadata.data.file_size)throw new ProviderError('MEDIA_FORMAT');
   return {data,mimeType:metadata.data.mime_type};
  }catch(e){if(e instanceof ProviderError)throw e;throw new ProviderError('MEDIA_DOWNLOAD')}
 }
}
