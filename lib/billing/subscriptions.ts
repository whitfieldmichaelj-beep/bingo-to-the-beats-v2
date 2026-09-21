import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getHostPlan } from "./plans";

export const HOST_BILLING_KIND = "bttb_host_subscription";
export function subscriptionState(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const price = item?.price;
  const plan = getHostPlan(price?.metadata?.planId ?? subscription.metadata.planId);
  const valid = Boolean(plan && subscription.items.data.length === 1 && item.quantity === 1 &&
    price.currency === "usd" && price.unit_amount === plan.amountCents &&
    price.recurring?.interval === plan.interval && price.recurring.interval_count === 1);
  return {
    planId: valid ? plan!.id : null,
    status: valid ? subscription.status : "invalid_plan",
    accessUntil: valid && Number.isFinite(item.current_period_end) ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeSubscriptionId: subscription.id,
  };
}

// Read Stripe's current state under the host lock. Late webhook delivery cannot
// overwrite a newer cancellation or renewal with an old event snapshot.
export async function syncHostSubscription(subscriptionId: string) {
  const stripe = getStripe();
  const initial = await stripe.subscriptions.retrieve(subscriptionId);
  if (initial.metadata.kind !== HOST_BILLING_KIND) return;
  const customerId = typeof initial.customer === "string" ? initial.customer : initial.customer.id;
  const owner = await prisma.hostBilling.findUnique({ where: { stripeCustomerId: customerId } });
  if (!owner || initial.metadata.clerkId !== owner.clerkId) throw new Error("Subscription owner does not match its billing account.");
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "clerkId" FROM "HostBilling" WHERE "clerkId" = ${owner.clerkId} FOR UPDATE`;
    const billing = await tx.hostBilling.findUniqueOrThrow({ where: { clerkId: owner.clerkId } });
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (billing.stripeSubscriptionId && billing.stripeSubscriptionId !== subscription.id) {
      const existing = await stripe.subscriptions.retrieve(billing.stripeSubscriptionId);
      if (!["canceled", "incomplete_expired"].includes(existing.status)) return;
      // Never replace a newer subscription with a delayed event from an old one.
      if (subscription.created <= existing.created) return;
    }
    await tx.hostBilling.update({ where: { clerkId: owner.clerkId }, data: subscriptionState(subscription) });
  }, { timeout: 30000 });
}

export async function handleHostBillingEvent(event: Stripe.Event): Promise<boolean> {
  if (event.type.startsWith("customer.subscription.")) {
    const subscription = event.data.object as Stripe.Subscription;
    if (subscription.metadata.kind === HOST_BILLING_KIND) await syncHostSubscription(subscription.id);
    return true;
  }
  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription") return false;
    if (session.metadata?.kind === HOST_BILLING_KIND && session.subscription) {
      await syncHostSubscription(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
    }
    return true;
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscription = invoice.parent?.subscription_details?.subscription;
    if (subscription) await syncHostSubscription(typeof subscription === "string" ? subscription : subscription.id);
    return true;
  }
  return false;
}
