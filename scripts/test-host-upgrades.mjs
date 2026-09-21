import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>mocks[n]??{},console,Date});return exports;}
const rates=load('app/lib/ratePlans.ts',{});
const plans=load('lib/billing/plans.ts',{'../../app/lib/ratePlans':rates});
const states=load('lib/billing/subscriptions.ts',{'./plans':plans});
const upgrades=load('lib/billing/upgrades.ts',{'./plans':plans,'./subscriptions':states});
assert.equal(upgrades.canUpgrade(plans.getHostPlan('social-monthly'),plans.getHostPlan('venue-monthly')),true);
assert.equal(upgrades.canUpgrade(plans.getHostPlan('serato-weekly'),plans.getHostPlan('serato-pro')),true);
assert.equal(upgrades.canUpgrade(plans.getHostPlan('venue-monthly'),plans.getHostPlan('social-monthly')),false);
assert.equal(upgrades.canUpgrade(plans.getHostPlan('serato-pro'),plans.getHostPlan('venue-monthly')),false);
const subscription={id:'sub',customer:'cus',status:'active',cancel_at_period_end:false,metadata:{kind:states.HOST_BILLING_KIND,clerkId:'host',planId:'social-monthly'},items:{data:[{id:'si',quantity:1,current_period_end:2000000000,price:{currency:'usd',unit_amount:2999,recurring:{interval:'month',interval_count:1}}}]}};
let createdFlow;
const stripe={subscriptions:{retrieve:async()=>subscription},prices:{list:async()=>({data:[{id:'price',product:'prod',currency:'usd',unit_amount:11999,recurring:{interval:'month',interval_count:1},metadata:{planId:'venue-monthly'}}]})},billingPortal:{configurations:{create:async()=>({id:'bpc'})},sessions:{create:async args=>{createdFlow=args;return {url:'https://billing.stripe.com/test'};}}}};
await assert.rejects(upgrades.createUpgradeSession(stripe,'sub','cus','other','venue-monthly','http://localhost/billing'),/ownership/);
subscription.cancel_at_period_end=true;
await assert.rejects(upgrades.createUpgradeSession(stripe,'sub','cus','host','venue-monthly','http://localhost/billing'),/active subscription/);
subscription.cancel_at_period_end=false;
await upgrades.createUpgradeSession(stripe,'sub','cus','host','venue-monthly','http://localhost/billing');
assert.equal(createdFlow.flow_data.type,'subscription_update_confirm');
assert.equal(createdFlow.flow_data.subscription_update_confirm.items[0].quantity,1);
assert.equal(states.subscriptionState(subscription).planId,'social-monthly','opening a review never grants upgraded access');
subscription.items.data[0].price={currency:'usd',unit_amount:11999,recurring:{interval:'month',interval_count:1},metadata:{planId:'venue-monthly'}};
assert.equal(states.subscriptionState(subscription).planId,'venue-monthly','confirmed price determines plan despite stale subscription metadata');
console.log('PASS upgrade eligibility, owner isolation, cancellation guard, Stripe confirmation flow, and confirmed price recognition');
if(process.argv.includes('--stripe')){
require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
if(!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw Error('Stripe test key required');
const Stripe=require('stripe');const api=new Stripe(process.env.STRIPE_SECRET_KEY,{timeout:15000,maxNetworkRetries:1});
let customer,sub,product;
try{
customer=await api.customers.create({name:'BTTB isolated upgrade verification',metadata:{kind:'bttb_beta_test'}});
const method=await api.paymentMethods.attach('pm_card_visa',{customer:customer.id});
await api.customers.update(customer.id,{invoice_settings:{default_payment_method:method.id}});
product=await api.products.create({name:'BTTB upgrade test fixture',metadata:{kind:'bttb_beta_test'}});
sub=await api.subscriptions.create({customer:customer.id,payment_behavior:'error_if_incomplete',items:[{price_data:{product:product.id,currency:'usd',unit_amount:2999,recurring:{interval:'month'}}}],metadata:{kind:states.HOST_BILLING_KIND,clerkId:'beta_test_owner',planId:'social-monthly'}});
const session=await upgrades.createUpgradeSession(api,sub.id,customer.id,'beta_test_owner','venue-monthly','http://localhost:3000/billing');
assert.ok(session.url.startsWith('https://billing.stripe.com/'));
const unchanged=await api.subscriptions.retrieve(sub.id);assert.equal(unchanged.items.data[0].price.unit_amount,2999);
console.log('PASS actual Stripe test upgrade confirmation session opens without changing the subscription');
}finally{
if(sub)await api.subscriptions.cancel(sub.id);
if(customer)await api.customers.del(customer.id);
if(product)await api.products.update(product.id,{active:false});
}
}
