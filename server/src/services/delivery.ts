const rank:Record<string,number>={UNKNOWN:0,PENDING:0,SENDING:0,UNCERTAIN:0,SENT:1,DELIVERED:2,READ:3};
export function nextDelivery(current:string,incoming:string):string{
 if(!['SENT','DELIVERED','READ','FAILED'].includes(incoming))return current;
 if(incoming==='FAILED')return ['DELIVERED','READ'].includes(current)?current:'FAILED';
 if(current==='FAILED')return ['DELIVERED','READ'].includes(incoming)?incoming:current;
 return (rank[incoming]??0)>(rank[current]??0)?incoming:current;
}
