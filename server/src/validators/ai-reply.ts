import {z} from 'zod';
import {ticketCreate} from './ticket.js';

export const requesterName=z.string().trim().min(2).max(100)
 .regex(/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'-]*$/u)
 .refine(name=>!['visitante web','anonimo','anónimo','cliente','usuario','sin nombre','desconocido'].includes(name.toLowerCase()));

// The model can describe a request, but cannot select a contact, conversation, owner or status.
export const aiTicket=ticketCreate.omit({contactId:true,conversationId:true})
 .extend({description:z.string().trim().min(10).max(4000),requesterName:requesterName.nullable().default(null)}).strict();
export const aiReply=z.object({text:z.string().trim().min(1).max(4000),ticket:aiTicket.nullable()}).strict();
export const aiReplyJsonSchema={
 type:'object',additionalProperties:false,required:['text','ticket'],
 properties:{
  text:{type:'string',description:'Respuesta para el cliente, sin afirmar que ya se ejecutó una acción.'},
  ticket:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,
   required:['title','description','priority','requesterName'],properties:{
    requesterName:{anyOf:[{type:'string'},{type:'null'}],description:'Nombre o alias que el cliente dijo explícitamente para registrar su solicitud; null si no lo ha dado. No inventarlo.'},
    title:{type:'string',description:'Resumen breve y específico del problema, máximo 200 caracteres.'},
    description:{type:'string',description:'Datos reales facilitados por el cliente y pasos intentados, de 10 a 4000 caracteres.'},
    priority:{type:'string',enum:['LOW','MEDIUM','HIGH'],description:'MEDIUM por defecto; HIGH solo con impacto crítico descrito.'}
   }}]}
 }
};
