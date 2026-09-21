"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getHostPlan, hostPlans } from "@/lib/billing/plans";
import "./billing.css";
type Billing = {planId: string | null;status: string;maxPlayers: number;accessUntil?: string;cancelAtPeriodEnd: boolean;hasSubscription: boolean;enabled: boolean};
export default function BillingPage() {
  const [billing,setBilling]=useState<Billing|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function load(refresh=false) {
    const response=await fetch(`/api/host-billing${refresh?'?refresh=1':''}`,{cache:'no-store'});
    if(response.status===401){window.location.assign('/sign-in?redirect_url=%2Fbilling');return;}
    const data=await response.json();if(!response.ok)throw new Error(data.message);setBilling(data);
  }
  useEffect(()=>{void load(new URLSearchParams(window.location.search).get('checkout')==='success').catch(e=>setError(e.message));},[]);
  async function action(action:string, planId?:string) {
    setBusy(true);setError("");
    try {const response=await fetch('/api/host-billing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,planId})});const data=await response.json();if(!response.ok)throw new Error(data.message);if(data.url){window.location.assign(data.url);return;}await load();}catch(e){setError(e instanceof Error?e.message:'Unable to update billing.');}finally{setBusy(false);}
  }
  const plan=getHostPlan(billing?.planId);
  return <main className="billing-page"><section className="billing-card billing-status"><p className="billing-eyebrow">YOUR HOST ACCOUNT</p><h1>Billing & subscription</h1>
    {error&&<p role="alert" className="billing-error">{error}</p>}
    {!billing&&!error&&<p>Loading your subscription…</p>}
    {billing&&<><h2>{plan?.name??'Free practice'}</h2><dl><dt>Status</dt><dd>{billing.status==='none'?'No paid subscription':billing.status.replaceAll('_',' ')}</dd><dt>Current player limit</dt><dd>{billing.maxPlayers} per game</dd>{billing.accessUntil&&<><dt>{billing.cancelAtPeriodEnd?'Access ends':'Paid through'}</dt><dd>{new Date(billing.accessUntil).toLocaleDateString()}</dd></>}</dl>
      {plan&&<p>${(plan.amountCents/100).toFixed(2)} every {plan.interval}. {billing.cancelAtPeriodEnd?'Automatic renewal is off.':'Renews automatically until canceled.'}</p>}
      <div className="billing-actions">{billing.hasSubscription&&!['canceled','incomplete_expired'].includes(billing.status)&&<><button className="billing-button" disabled={busy} onClick={()=>void action(billing.cancelAtPeriodEnd?'resume':'cancel')}>{billing.cancelAtPeriodEnd?'Turn automatic renewal back on':'Cancel renewal at period end'}</button><button className="billing-button" disabled={busy} onClick={()=>void action('portal')}>Payment method & invoices</button></>}<button className="billing-button" disabled={busy} onClick={()=>{setBusy(true);void load(true).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Refresh billing status</button></div>
      {plan && billing.status === 'active' && !billing.cancelAtPeriodEnd && <section><h2>Change your plan</h2><p>Review the new recurring price and any charge in Stripe before confirming. You can keep or increase your player limit.</p><div className="billing-actions">{hostPlans.filter(target => target.id !== plan.id && target.serato === plan.serato && target.maxPlayers >= plan.maxPlayers).map(target => <button key={target.id} className="billing-button" disabled={busy || !billing.enabled} onClick={()=>void action('upgrade',target.id)}>Review {target.name} — ${(target.amountCents/100).toFixed(2)}/{target.interval} · {target.maxPlayers} players</button>)}</div></section>}
      <p>Canceling stops future renewals. Your access remains available through the paid period.</p>
      {!billing.enabled&&<p className="billing-note">Host subscription purchases are not open yet.</p>}
    </>}
    <div className="billing-actions"><Link href="/pricing">View plans</Link><Link href="/music">Choose your music</Link><Link href="/dashboard">Dashboard</Link></div>
  </section></main>;
}
