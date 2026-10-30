import type {RequestHandler,ErrorRequestHandler} from 'express';
import {ZodError} from 'zod';
import {Prisma} from '@prisma/client';
export class HttpError extends Error {constructor(public status:number,message:string){super(message)}}
export const wrap=(fn:RequestHandler):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res,next)).catch(next)};
export const errors:ErrorRequestHandler=(e,req,res,next)=>{const status=e instanceof HttpError?e.status:e instanceof ZodError?400:e instanceof Prisma.PrismaClientKnownRequestError?(e.code==='P2025'?404:['P2002','P2003'].includes(e.code)?409:500):[400,413,415].includes(e?.status)?e.status:500; console.error(JSON.stringify({event:'request_error',status,path:req.path}));res.status(status).json({error:e instanceof HttpError?e.message:status===413?'El mensaje supera el tamaño permitido':status===415?'Formato no admitido':status===400?'Datos inválidos':status===404?'Registro no encontrado':status===409?'Conflicto de datos':'Error interno del servidor'})};
