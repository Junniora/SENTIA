export interface AiMessage {role:'user'|'assistant';content:string}
export interface AiTicket {title:string;description:string;priority:'LOW'|'MEDIUM'|'HIGH';requesterName?:string|null}
export interface AiReply {text:string;ticket:AiTicket|null}
export interface AiProvider {
 generate(messages:readonly AiMessage[],signal?:AbortSignal):Promise<string>;
 // Optional capability: transports without actions keep their existing text-only behavior.
 respond?(messages:readonly AiMessage[],signal?:AbortSignal):Promise<AiReply>;
}
