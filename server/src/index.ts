import {app} from './app.js';
import {env} from './config/env.js';
import {prisma} from './lib/prisma.js';
import {startWorker} from './services/worker.js';
const server=app.listen(env.PORT,()=>console.log('SENTIA API :'+env.PORT));
const stopWorker=startWorker();
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 if(stopping)return;stopping=true;
 server.close(async()=>{await stopWorker();await prisma.$disconnect();process.exit(0)});
});
