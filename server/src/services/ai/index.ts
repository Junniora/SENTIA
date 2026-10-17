export interface AiMessage {role:'user'|'assistant';content:string} export interface AiProvider {generate(messages:readonly AiMessage[],signal?:AbortSignal):Promise<string>} // No provider enabled.
