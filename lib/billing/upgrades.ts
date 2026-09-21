import type Stripe from "stripe";
import { getHostPlan, type HostPlan } from "./plans";
import { subscriptionState, HOST_BILLING_KIND } from "./subscriptions";

export function canUpgrade(current: HostPlan, target: HostPlan) {
  return target.id !== current.id && target.serato === current.serato && target.maxPlayers >= current.maxPlayers;
}

// Stripe hosts the final price/proration confirmation and collects any required
// payment. Opening this flow does not change the subscription or grant access.
export async function createUpgradeSession(stripe: Stripe, subscriptionId: string, customerId: string, clerkId: string, targetId: unknown, returnUrl: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const current = getHostPlan(subscriptionState(subscription).planId);
  const target = getHostPlan(targetId);
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (customer !== customerId || subscription.metadata.clerkId !== clerkId || subscription.metadata.kind !== HOST_BILLING_KIND) throw new Error("Subscription ownership could not be verified.");
  if (!current || !target || !canUpgrade(current, target) || subscription.status !== "active" || subscription.cancel_at_period_end || subscription.pending_update) throw new Error("Choose an available upgrade for an active subscription with renewal enabled.");
  const key = `bttb-${target.id}-${target.amountCents}-v1`;
  const existing = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  let price = existing.data[0];
  if (!price) {
    const product = await stripe.products.create({ name: `Bingo to the Beats — ${target.name}`, metadata: { kind: HOST_BILLING_KIND, planId: target.id } }, { idempotencyKey: `${key}-product` });
    price = await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: target.amountCents, recurring: { interval: target.interval }, lookup_key: key, metadata: { kind: HOST_BILLING_KIND, planId: target.id } }, { idempotencyKey: `${key}-price` });
  }
  if (price.currency !== "usd" || price.unit_amount !== target.amountCents || price.recurring?.interval !== target.interval || price.recurring.interval_count !== 1 || price.metadata.planId !== target.id) throw new Error("The upgrade price needs administrator attention.");
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  const config = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Review your Bingo to the Beats plan change" },
    features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true }, subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "always_invoice", products: [{ product: productId, prices: [price.id] }] } },
    metadata: { kind: HOST_BILLING_KIND, planId: target.id },
  }, { idempotencyKey: `${key}-upgrade-portal-v1` });
  return stripe.billingPortal.sessions.create({
    customer: customerId, configuration: config.id, return_url: returnUrl,
    flow_data: { type: "subscription_update_confirm", subscription_update_confirm: { subscription: subscriptionId, items: [{ id: subscription.items.data[0].id, price: price.id, quantity: 1 }] }, after_completion: { type: "redirect", redirect: { return_url: `${returnUrl}?checkout=success` } } },
  });
}
