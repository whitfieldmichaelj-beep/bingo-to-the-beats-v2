import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => { if (!(name in mocks)) throw new Error(`Unexpected import ${name}`); return mocks[name]; }, console, process, Date });
  return exports;
}
const rates = load('app/lib/ratePlans.ts', {});
const plans = load('lib/billing/plans.ts', { '../../app/lib/ratePlans': rates });
const kind = 'bttb_host_subscription';
const makeSub = (id, created, status='active') => ({ id, created, status, customer:'cus_host', metadata:{kind,clerkId:'host',planId:'serato-pro'}, cancel_at_period_end:false, items:{data:[{quantity:1,current_period_end:2000000000,price:{currency:'usd',unit_amount:4995,recurring:{interval:'month',interval_count:1}}}]}});
let billing = {clerkId:'host',stripeCustomerId:'cus_host',stripeSubscriptionId:'sub_old',checkoutSessionId:'cs_new'};
const subscriptions = {sub_old:makeSub('sub_old',100,'canceled'),sub_new:makeSub('sub_new',200)};
let updates=0;
const prisma = {
  hostBilling:{findUnique:async()=>billing,findUniqueOrThrow:async()=>billing,update:async({data})=>{updates++;billing={...billing,...data};return billing;}},
  $queryRaw:async()=>[],
  $transaction:async callback=>callback(prisma),
};
let session={status:'complete',metadata:{kind,clerkId:'host'},subscription:'sub_new'};
const stripe={subscriptions:{retrieve:async id=>subscriptions[id]},checkout:{sessions:{retrieve:async()=>session}}};
const helpers=load('lib/billing/subscriptions.ts',{'@/lib/prisma':{prisma},'@/lib/stripe':{getStripe:()=>stripe},'./plans':plans});
for (const plan of plans.hostPlans) {
  const sub=makeSub('sub_plan',1);sub.metadata.planId=plan.id;sub.items.data[0].price.unit_amount=plan.amountCents;sub.items.data[0].price.recurring.interval=plan.interval;
  assert.equal(helpers.subscriptionState(sub).planId,plan.id);
}
for (const mutate of [s=>s.items.data[0].quantity=2,s=>s.items.data[0].price.unit_amount=1,s=>s.items.data[0].price.currency='eur',s=>s.items.data[0].price.recurring.interval='week',s=>s.items.data=[],s=>s.metadata.planId='made-up']) {
  const sub=makeSub('invalid',1);mutate(sub);assert.equal(helpers.subscriptionState(sub).status,'invalid_plan');
}
await helpers.syncHostSubscription('sub_new');
assert.equal(billing.stripeSubscriptionId,'sub_new');
await helpers.syncHostSubscription('sub_old');
assert.equal(billing.stripeSubscriptionId,'sub_new','late canceled event cannot replace current subscription');
subscriptions.sub_new.cancel_at_period_end=true;
await helpers.handleHostBillingEvent({type:'customer.subscription.updated',data:{object:makeSub('sub_new',200)}});
assert.equal(billing.cancelAtPeriodEnd,true,'read current Stripe state instead of stale event');
assert.equal(plans.activePlayerLimit(billing,new Date('2026-09-15')),100,'canceled renewal retains paid access');
subscriptions.sub_new.status='past_due';
await helpers.handleHostBillingEvent({type:'invoice.payment_failed',data:{object:{parent:{subscription_details:{subscription:'sub_new'}}}}});
assert.equal(plans.activePlayerLimit(billing,new Date('2026-09-15')),5,'failed renewal cannot grant paid capacity');
subscriptions.sub_new.status='active';
subscriptions.sub_new.items.data[0].current_period_end=2100000000;
await helpers.handleHostBillingEvent({type:'invoice.paid',data:{object:{parent:{subscription_details:{subscription:'sub_new'}}}}});
assert.equal(billing.accessUntil.getTime(),2100000000000);
assert.equal(await helpers.handleHostBillingEvent({type:'checkout.session.completed',data:{object:{mode:'payment'}}}),false,'player purchases retain their own webhook handling');
const count=updates;
subscriptions.sub_new.metadata.clerkId='foreign-host';
await assert.rejects(helpers.syncHostSubscription('sub_new'),/owner/);
assert.equal(updates,count);
subscriptions.sub_new.metadata.clerkId='host';
let userId='host';
const route=load('app/api/host-billing/route.ts',{'@/lib/billing/upgrades':{},'node:crypto':{randomUUID:()=> 'test'},'@clerk/nextjs/server':{auth:async()=>({userId})},'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/prisma':{prisma},'@/lib/stripe':{getStripe:()=>stripe},'@/lib/billing/plans':plans,'@/lib/billing/subscriptions':helpers});
const request={nextUrl:new URL('http://localhost/api/host-billing?refresh=1')};
billing.stripeSubscriptionId='sub_old';
assert.equal((await route.GET(request)).status,200);
assert.equal(billing.stripeSubscriptionId,'sub_new','completed replacement checkout refreshes new subscription');
userId=null;assert.equal((await route.GET(request)).status,401);
console.log('PASS all host prices, invalid prices, renewal, cancellation, failed payment, owner isolation, delayed events, player webhook isolation, and replacement checkout refresh');
