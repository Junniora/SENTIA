export class ProviderError extends Error {
 constructor(public code:string,public retryable=false,public uncertain=false){super(code)}
}
export const safeCode=(e:unknown)=>e instanceof ProviderError?e.code:'INTERNAL_ERROR';
