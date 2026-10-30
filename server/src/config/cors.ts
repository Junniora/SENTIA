import {env} from './env.js';
export function allowedOrigin(origin:string):boolean{
 if(origin===env.CORS_ORIGIN)return true;
 try{
  const a=new URL(origin),b=new URL(env.CORS_ORIGIN);
  const loopback=(host:string)=>host==='localhost'||host==='127.0.0.1'||host==='[::1]';
  return loopback(a.hostname)&&loopback(b.hostname)&&a.protocol===b.protocol&&a.port===b.port;
 }catch{return false}
}
