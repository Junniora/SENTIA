<script setup lang="ts">
import {computed,nextTick,onMounted,onUnmounted,ref,watch} from 'vue';
import {useQuasar} from 'quasar';

interface ChatMessage {
 id:string;content:string;direction:'INBOUND'|'OUTBOUND';source:string;createdAt:string;requestId?:string|null;
 job?:{state:string;errorCode:string|null}|null;
}
interface ChatTicket {id:string;title:string;status:string;priority:string;createdAt:string;requesterName?:string}
interface History {messages:ChatMessage[];tickets?:ChatTicket[];expiresAt:string;aiAvailable:boolean}
const q=useQuasar();
const token=ref(sessionStorage.getItem('sentia-web-session')||'');
const messages=ref<ChatMessage[]>([]);
const tickets=ref<ChatTicket[]>([]);
const ticketStatus:Record<string,string>={OPEN:'Abierto',IN_PROGRESS:'En atención',RESOLVED:'Resuelto'};
const ticketPriority:Record<string,string>={LOW:'Baja',MEDIUM:'Media',HIGH:'Alta'};
const draft=ref('');
const loading=ref(true);
const sending=ref(false);
const error=ref('');
const available=ref(true);
const expired=ref(false);
const feed=ref<HTMLElement|null>(null);
const dark=ref(localStorage.getItem('sentia-dark')==='true');
const pending=ref<{requestId:string;content:string}|null>(null);
try {pending.value=JSON.parse(sessionStorage.getItem('sentia-web-pending')||'null')}catch{sessionStorage.removeItem('sentia-web-pending')}
const suggestions=[
 {icon:'build',label:'Necesito soporte técnico'},
 {icon:'inventory_2',label:'Quiero información sobre un producto'},
 {icon:'description',label:'Necesito una cotización'},
 {icon:'support_agent',label:'Quiero contactar con un asesor'}
];
const generating=computed(()=>sending.value||messages.value.some(m=>m.job?.state==='GENERATING'));
const canSend=computed(()=>!loading.value&&!generating.value&&!expired.value&&available.value&&!!draft.value.trim());
watch(dark,value=>{q.dark.set(value);localStorage.setItem('sentia-dark',String(value))},{immediate:true});
watch(pending,value=>{if(value)sessionStorage.setItem('sentia-web-pending',JSON.stringify(value));else sessionStorage.removeItem('sentia-web-pending')},{deep:true});
async function scrollToEnd(){await nextTick();feed.value?.scrollTo({top:feed.value.scrollHeight,behavior:'smooth'})}
function messageError(code:string|null|undefined){
 if(code==='AI_QUOTA')return 'El asistente alcanzó su límite temporal. Puedes intentarlo más tarde.';
 if(code==='AI_BLOCKED')return 'No pudimos responder esta consulta. Intenta reformularla.';
 if(code==='AI_INTERRUPTED')return 'La respuesta se interrumpió. Puedes enviar otra consulta.';
 return 'No pudimos generar la respuesta. Puedes intentarlo más tarde.';
}
async function request<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch((import.meta.env.VITE_API_URL||'')+'/api/public/chat/'+path,{
  method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token.value?{Authorization:'Bearer '+token.value}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(75000)
 });
 const data=await response.json().catch(()=>({error:'No se pudo contactar con el asistente.'}));
 if(!response.ok){
  if(response.status===401){expired.value=true;token.value='';sessionStorage.removeItem('sentia-web-session')}
  throw Error(data.error||'No se pudo completar la solicitud.');
 }
 return data;
}
function acceptHistory(data:History){
 const changed=messages.value.length!==data.messages.length;
 messages.value=data.messages;tickets.value=data.tickets||[];available.value=data.aiAvailable;
 if(changed)void scrollToEnd();
}
async function newConversation(){
 if(sending.value)return;
 loading.value=true;error.value='';
 try{
  const session=await request<{token:string;aiAvailable:boolean}>('session',{});
  token.value=session.token;sessionStorage.setItem('sentia-web-session',session.token);
  messages.value=[];tickets.value=[];pending.value=null;draft.value='';expired.value=false;available.value=session.aiAvailable;
  q.notify({type:'positive',message:'Nueva conversación lista',timeout:1500});
 }catch(e){error.value=e instanceof Error?e.message:'No se pudo iniciar la conversación.'}
 finally{loading.value=false}
}
async function refresh(){
 if(!token.value||expired.value)return;
 const data=await request<History>('messages');acceptHistory(data);
 if(pending.value&&!data.messages.some(m=>m.job?.state==='GENERATING')&&data.messages.length){
  // A response may have persisted after the HTTP connection was lost.
  const matched=data.messages.find(m=>m.requestId===pending.value?.requestId);
  if(matched&&matched.job?.state!=='GENERATING')pending.value=null;
 }
}
async function send(suggestion?:string){
 const content=(suggestion||draft.value).trim();
 if(!content||content.length>4000||sending.value||generating.value||expired.value||!available.value)return;
 if(!token.value){await newConversation();if(!token.value)return}
 // Network retries reuse the same id; changed text is a distinct, deliberate message.
 if(!pending.value||pending.value.content!==content)pending.value={requestId:crypto.randomUUID(),content};
 sending.value=true;error.value='';draft.value='';
 void scrollToEnd();
 try{
  acceptHistory(await request<History>('messages',pending.value));pending.value=null;
 }catch(e){
  error.value=e instanceof Error&&e.name!=='TimeoutError'?e.message:'No se pudo confirmar la respuesta. Reintenta para recuperar el resultado sin duplicar tu mensaje.';
  draft.value=content;q.notify({type:'negative',message:error.value,timeout:5000});
 }finally{sending.value=false;void scrollToEnd()}
}
function keydown(event:KeyboardEvent){
 if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(canSend.value)void send()}
}
let timer:ReturnType<typeof setInterval>|undefined;
onMounted(async()=>{
 try{if(token.value)await refresh();else await newConversation()}
 catch(e){error.value=e instanceof Error?e.message:'No se pudo recuperar la conversación.'}
 finally{loading.value=false}
 timer=setInterval(()=>{if(token.value&&!sending.value&&!expired.value)void refresh().catch(e=>{if(expired.value)error.value=e instanceof Error?e.message:'Tu sesión expiró.'})},5000);
});
onUnmounted(()=>{if(timer)clearInterval(timer)});
const time=(date:string)=>new Date(date).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
</script>

<template>
 <div :class="['public-chat',{'chat-dark':dark}]">
  <aside class="chat-rail">
   <a href="/chat" class="chat-brand" aria-label="SENTIA, inicio"><span class="chat-mark">S</span><span>SENTIA<small>ASISTENCIA INTELIGENTE</small></span></a>
   <q-btn unelevated outline icon="add" label="Nueva conversación" class="new-chat" :disable="loading||sending" @click="newConversation"/>
   <div class="rail-note"><span class="rail-dot"></span> Un espacio para resolver</div>
   <div class="rail-bottom"><q-icon name="shield" size="21px"/><p>Atención con propósito.<small>Tu conversación se conserva hasta que expire tu sesión. Evita compartir contraseñas o datos sensibles.</small></p></div>
  </aside>
  <main class="chat-main">
   <header class="chat-header">
    <div class="mobile-brand"><span class="chat-mark">S</span><strong>SENTIA</strong></div>
    <div class="chat-heading"><strong>Tu asistente, cerca de ti</strong><span><i :class="{'status-off':!available}"></i>{{available?'Listo para ayudarte':'Temporalmente no disponible'}}</span></div>
    <div class="chat-actions"><q-btn flat round icon="add_comment" aria-label="Nueva conversación" class="mobile-new" :disable="loading||sending" @click="newConversation"/><q-btn flat round :icon="dark?'light_mode':'dark_mode'" aria-label="Cambiar tema" @click="dark=!dark"/></div>
   </header>
   <section ref="feed" class="chat-feed" aria-label="Conversación con SENTIA" aria-live="polite" aria-relevant="additions text" :aria-busy="generating">
    <div v-if="loading" class="chat-loading" role="status"><q-linear-progress indeterminate color="primary"/><p>Preparando tu espacio…</p></div>
    <div v-else-if="!messages.length&&!sending" class="chat-welcome">
     <div class="welcome-symbol"><q-icon name="auto_awesome" size="30px"/></div>
     <span class="welcome-kicker">BIENVENIDO A SENTIA</span>
     <h1>Una conversación.<br><span>Muchas posibilidades.</span></h1>
     <p>Cuéntame qué necesitas. Te ayudo a entender el problema<br class="desktop-break"> y encontrar el siguiente paso.</p>
     <div class="chat-suggestions"><button v-for="s in suggestions" :key="s.label" :disabled="!available||expired" @click="send(s.label)"><q-icon :name="s.icon" size="21px"/><span>{{s.label}}</span><q-icon name="north_east" size="15px"/></button></div>
     <small class="welcome-limit">Orientación inicial con IA. Las solicitudes que requieran gestión del equipo deberán ser atendidas por una persona.</small>
    </div>
    <div class="chat-transcript">
     <article v-for="m in messages" :key="m.id" :class="['chat-turn',m.direction==='INBOUND'?'from-client':'from-ai']">
      <div class="turn-avatar"><q-icon :name="m.direction==='INBOUND'?'person_outline':'auto_awesome'" size="18px"/></div>
      <div class="turn-body"><div class="turn-label">{{m.direction==='INBOUND'?'Tú':'SENTIA'}}<span v-if="m.source==='AI'" class="ai-tag">IA</span><time :datetime="m.createdAt">{{time(m.createdAt)}}</time></div><div class="turn-content">{{m.content}}</div><p v-if="m.job?.state==='FAILED'" class="turn-error" role="status">{{messageError(m.job.errorCode)}}</p></div>
     </article>
     <article v-if="sending&&pending" class="chat-turn from-client pending-turn"><div class="turn-avatar"><q-icon name="person_outline" size="18px"/></div><div class="turn-body"><div class="turn-label">Tú</div><div class="turn-content">{{pending.content}}</div></div></article>
     <div v-if="generating" class="typing-row" role="status"><div class="turn-avatar"><q-icon name="auto_awesome" size="18px"/></div><span class="typing-dots"><i></i><i></i><i></i></span><span>SENTIA está preparando una respuesta</span></div>
     <aside v-if="tickets.length" class="chat-tickets" aria-label="Tickets de esta conversación">
      <article v-for="ticket in tickets" :key="ticket.id" class="chat-ticket">
       <q-icon name="confirmation_number" size="22px" color="primary"/>
       <div><strong>{{ticket.title}}</strong><p v-if="ticket.requesterName">A nombre de: {{ticket.requesterName}}</p><p>Referencia: <span>{{ticket.id}}</span></p><small>Prioridad {{ticketPriority[ticket.priority]||ticket.priority}}</small></div>
       <q-badge outline color="primary">{{ticketStatus[ticket.status]||ticket.status}}</q-badge>
      </article>
     </aside>
    </div>
   </section>
   <div class="chat-composer-wrap">
    <div v-if="error" class="chat-error" role="alert"><q-icon name="info_outline" size="19px"/><span>{{error}}</span><q-btn v-if="expired" flat label="Nueva conversación" @click="newConversation"/><q-btn v-else-if="pending&&!generating" flat label="Reintentar" @click="send(pending.content)"/><q-btn v-else-if="!token" flat label="Reintentar" @click="newConversation"/></div>
    <div v-if="!available&&!error" class="chat-error" role="status">El asistente no está disponible en este momento. Tu historial sigue guardado.</div>
    <form class="chat-composer" @submit.prevent="send()">
     <label class="sr-only" for="chat-message">Escribe tu mensaje para SENTIA</label>
     <textarea id="chat-message" v-model="draft" rows="1" maxlength="4000" placeholder="Escribe lo que necesitas resolver…" :disabled="loading||generating||expired||!available" @keydown="keydown"></textarea>
     <q-btn round unelevated color="primary" icon="arrow_upward" type="submit" aria-label="Enviar mensaje" :disable="!canSend"/>
    </form>
    <div class="composer-footnote"><span>SENTIA utiliza IA y puede equivocarse. Verifica la información importante.</span><span class="desktop-hint">Enter para enviar · Shift + Enter para una nueva línea</span></div>
   </div>
  </main>
 </div>
</template>

<style scoped>
.chat-tickets{display:grid;gap:12px;margin:24px 0}.chat-ticket{display:flex;align-items:flex-start;gap:12px;border:1px solid var(--chat-border);background:var(--chat-surface);border-radius:13px;padding:18px}.chat-ticket>div{flex:1;min-width:0}.chat-ticket strong{font-size:13px;line-height:1.6}.chat-ticket p{font-size:10px;color:var(--chat-muted);margin:6px 0;overflow-wrap:anywhere}.chat-ticket small{font-size:10px;color:var(--chat-muted)}.chat-ticket .q-badge{flex:none;font-size:10px}
.public-chat{--chat-bg:#fbfbfe;--chat-surface:#fff;--chat-text:#222b43;--chat-muted:#7b8194;--chat-border:#e8e9f2;--chat-accent:#7755e8;min-height:100dvh;height:100dvh;display:grid;grid-template-columns:260px 1fr;background:var(--chat-bg);color:var(--chat-text);font-family:Inter,"Segoe UI",sans-serif}
.chat-dark{--chat-bg:#151a29;--chat-surface:#202638;--chat-text:#e8eaf5;--chat-muted:#a3aac1;--chat-border:#343a51}
.chat-rail{background:#151e35;color:#d0d5e6;padding:32px 22px;display:flex;flex-direction:column;gap:30px}.chat-brand{display:flex;align-items:center;gap:12px;color:white;text-decoration:none;font-size:23px;font-weight:750;letter-spacing:2px}.chat-mark{display:inline-grid;place-items:center;background:#8865ec;color:white;width:38px;height:40px;border-radius:12px;font-size:25px;font-weight:750}.chat-brand small{display:block;font-size:8px;letter-spacing:1.2px;color:#9aa5c1;margin-top:4px}.new-chat{border:1px solid #404a65;border-radius:10px;min-height:47px;color:#ebe8fa}.rail-note{font-size:11px;display:flex;align-items:center;gap:9px;color:#8f9bb9}.rail-dot{width:6px;height:6px;border-radius:50%;background:#a58af4}.rail-bottom{margin-top:auto;padding-top:25px;border-top:1px solid #30394f;display:flex;gap:12px;color:#a797d8}.rail-bottom p{font-size:12px;color:#c2c9dd;line-height:1.7}.rail-bottom small{display:block;color:#8c98b3;font-size:10px;line-height:1.8;margin-top:10px}.chat-main{min-width:0;min-height:0;display:flex;flex-direction:column}.chat-header{height:86px;min-height:86px;border-bottom:1px solid var(--chat-border);display:flex;align-items:center;justify-content:space-between;padding:0 42px;background:var(--chat-surface)}.chat-heading{display:grid;gap:6px}.chat-heading strong{font-size:13px;font-weight:600}.chat-heading span{font-size:10px;color:var(--chat-muted);display:flex;align-items:center;gap:6px}.chat-heading i{width:5px;height:5px;background:#31aa85;border-radius:50%}.chat-heading i.status-off{background:#b79548}.chat-actions{display:flex;align-items:center}.mobile-brand,.mobile-new{display:none}.chat-feed{overflow-y:auto;flex:1;scroll-behavior:smooth;padding:30px 32px;overscroll-behavior:contain}.chat-welcome{max-width:680px;margin:clamp(16px,6vh,80px) auto 20px;text-align:center;animation:enter .35s ease-out}.welcome-symbol{width:67px;height:67px;display:grid;place-items:center;border-radius:22px;background:#eee8ff;color:#8862e7;margin:0 auto 27px}.chat-dark .welcome-symbol{background:#332b4e}.welcome-kicker{font-size:10px;font-weight:700;letter-spacing:2.4px;color:#9280b9}.chat-welcome h1{font-size:clamp(28px,3vw,43px);line-height:1.22;letter-spacing:-1.6px;font-weight:650;margin:20px 0}.chat-welcome h1 span{color:#8c72c7}.chat-welcome>p{font-size:13px;color:var(--chat-muted);line-height:1.9}.chat-suggestions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:32px auto 20px;text-align:left}.chat-suggestions button{display:flex;align-items:center;gap:12px;text-align:left;min-height:76px;border:1px solid var(--chat-border);border-radius:13px;background:var(--chat-surface);color:var(--chat-text);padding:17px;cursor:pointer;font-family:inherit;font-size:12px;transition:transform .15s,border-color .15s}.chat-suggestions button:hover{border-color:#b29ae9;transform:translateY(-2px)}.chat-suggestions button:disabled{opacity:.5;cursor:not-allowed}.chat-suggestions button>.q-icon:first-child{color:#9a81cc}.chat-suggestions button>.q-icon:last-child{margin-left:auto;color:#a3a1b5}.welcome-limit{display:block;max-width:520px;margin:0 auto;color:var(--chat-muted);font-size:10px;line-height:1.8}.chat-transcript{max-width:800px;margin:0 auto}.chat-turn{display:flex;gap:15px;margin:22px 0 32px;animation:enter .2s ease-out}.turn-avatar{flex:none;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:#eee8fa;color:#8861d0}.from-client .turn-avatar{background:#e9edf3;color:#68758c}.chat-dark .turn-avatar{background:#382d50}.chat-dark .from-client .turn-avatar{background:#313a4c;color:#c5cce0}.turn-body{min-width:0;flex:1}.turn-label{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:650;min-height:30px}.turn-label time{font-size:9px;color:var(--chat-muted);font-weight:400;margin-left:auto}.ai-tag{font-size:8px;padding:1px 5px;background:#eee8fa;color:#8963ca;border-radius:4px}.turn-content{font-size:14px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;padding:9px 0}.from-client .turn-content{background:var(--chat-surface);border:1px solid var(--chat-border);border-radius:0 13px 13px 13px;padding:13px 18px}.turn-error{font-size:11px;color:#bf6858;padding:8px 0}.typing-row{display:flex;align-items:center;gap:12px;color:var(--chat-muted);font-size:11px;margin:24px 0}.typing-dots{display:flex;gap:4px}.typing-dots i{height:5px;width:5px;border-radius:50%;background:#a187d7;animation:pulse 1s infinite}.typing-dots i:nth-child(2){animation-delay:.15s}.typing-dots i:nth-child(3){animation-delay:.3s}.chat-composer-wrap{padding:14px 32px 22px;width:100%;max-width:930px;margin:0 auto}.chat-composer{display:flex;align-items:flex-end;gap:12px;padding:12px 14px 12px 20px;border:1px solid var(--chat-border);border-radius:17px;background:var(--chat-surface);box-shadow:0 4px 24px #30204a06}.chat-composer:focus-within{border-color:#b39ade;box-shadow:0 0 0 3px #9974dc0c}.chat-composer textarea{flex:1;min-width:0;min-height:32px;max-height:140px;resize:vertical;background:transparent;border:0;outline:0;padding-top:7px;font:inherit;font-size:13px;line-height:1.7;color:var(--chat-text)}.chat-composer textarea::placeholder{color:var(--chat-muted)}.chat-composer .q-btn{width:36px;height:36px;min-height:36px}.composer-footnote{display:flex;justify-content:space-between;gap:12px;color:var(--chat-muted);font-size:9px;padding:12px 5px 0;line-height:1.6}.chat-error{display:flex;align-items:center;gap:9px;font-size:12px;color:#b5634e;background:var(--chat-surface);border:1px solid var(--chat-border);border-radius:10px;margin-bottom:10px;padding:10px 14px}.chat-error>span{flex:1}.chat-loading{max-width:500px;margin:70px auto;text-align:center;font-size:12px;color:var(--chat-muted)}.chat-loading p{margin-top:18px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}button:focus-visible,a:focus-visible{outline:3px solid #9976e3;outline-offset:4px}@keyframes enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{50%{opacity:.3;transform:translateY(-3px)}}@media(max-width:1000px){.public-chat{grid-template-columns:220px 1fr}.chat-header{padding:0 24px}.chat-feed{padding:24px}.desktop-hint{display:none}}@media(max-width:700px){.public-chat{grid-template-columns:1fr}.chat-rail{display:none}.chat-header{height:72px;min-height:72px;padding:0 16px}.mobile-brand{display:flex;align-items:center;gap:9px;font-size:17px;letter-spacing:1px}.mobile-brand .chat-mark{width:29px;height:32px;font-size:21px;border-radius:9px}.chat-heading{display:none}.mobile-new{display:inline-flex}.chat-feed{padding:12px 18px}.chat-welcome{margin:20px auto}.chat-welcome h1{font-size:31px}.welcome-symbol{margin-bottom:20px;width:55px;height:55px}.chat-suggestions{gap:8px;margin-top:24px}.chat-suggestions button{min-height:84px;font-size:11px;padding:12px;gap:8px}.chat-suggestions button>.q-icon:last-child{display:none}.desktop-break{display:none}.chat-composer-wrap{padding:10px 12px max(14px,env(safe-area-inset-bottom))}.composer-footnote{font-size:8px;text-align:center;justify-content:center}.chat-turn{gap:10px;margin-bottom:24px}.turn-content{font-size:13px}.typing-row{font-size:10px;gap:8px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
</style>
