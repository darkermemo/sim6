// outcome.ts
import { tryResolve } from './schema-cache';

export type Outcome = 'success'|'fail';

export function expandOutcome(o:Outcome, cols:Set<string>): string {
  const eventId = tryResolve('event_id', cols);
  const status  = tryResolve('status', cols);
  const msg     = tryResolve('message', cols);
  const et      = tryResolve('event_type', cols);

  if (eventId) {
    if (o==='success') {
      const st = status ? ` OR lower(${status}) IN ('0x0','ok','success','succeeded')` : '';
      return `( ${eventId} IN (4624,4768,4769,4776)${st} )`;
    }
    return `( ${eventId} IN (4625,4771) )`;
  }

  if (msg && et) {
    const prog = `lower(${et})`;
    if (o==='success') return `( ${prog} IN ('sshd','ssh','auth') AND match(${msg}, '(?i)accepted|authenticat(ed|ion) succeeded|login successful') )`;
    return `( ${prog} IN ('sshd','ssh','auth') AND match(${msg}, '(?i)failed|failure|denied|invalid user|pam_authenticate.*failed') )`;
  }

  if (status) {
    if (o==='success') return `lower(${status}) IN ('ok','success','succeeded','pass','accepted','true','0x0')`;
    return `lower(${status}) IN ('fail','failed','failure','denied','invalid','false')`;
  }

  const extra = tryResolve('extra', cols);
  if (extra) {
    const j = (k:string)=>`lower(JSONExtractString(${extra},'${k}'))`;
    if (o==='success') return `${j('status')} IN ('ok','success','succeeded','pass','accepted','true','0x0') OR ${j('result')} IN ('ok','success','accepted')`;
    return `${j('status')} IN ('fail','failed','failure','denied','invalid','false') OR ${j('result')} IN ('fail','failed','denied')`;
  }

  throw new Error('cannot expand success/fail with current schema');
}


