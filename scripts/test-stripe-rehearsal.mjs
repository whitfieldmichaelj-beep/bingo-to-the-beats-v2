import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/stripe.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
for(const key of ['sk_live_fake','rk_live_fake','unknown','sk_test_fake','rk_test_fake']) {
 const exports={};let constructed=false;
 vm.runInNewContext(source,{exports,process:{env:{BTTB_PHONE_TEST:'1',STRIPE_SECRET_KEY:key}},require:id=>id==='server-only'?{}:class{constructor(){constructed=true}}});
 if(key.includes('_test_')){exports.getStripe();assert.equal(constructed,true)}
 else {assert.throws(()=>exports.getStripe(),/Live payments are disabled/);assert.equal(constructed,false)}
}
console.log('PASS rehearsal rejects live and unknown keys before creating a Stripe client');
