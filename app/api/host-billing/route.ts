import { createUpgradeSession } from "@/lib/billing/upgrades";
import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { activePlayerLimit, getHostPlan } from "@/lib/billing/plans";
import { HOST_BILLING_KIND, syncHostSubscription } from "@/lib/billing/subscriptions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return reply({ message: "Sign in to manage your subscription." }, 401);
  try {
    let billing = await prisma.hostBilling.findUnique({ where: { clerkId: userId } });
    // A return URL is never proof of payment: verify the stored checkout with Stripe.
    if (request.nextUrl.searchParams.get("refresh") === "1" && billing) {
      let subscriptionId = billing.stripeSubscriptionId;
      if (billing.checkoutSessionId) {
        const session = await getStripe().checkout.sessions.retrieve(billing.checkoutSessionId);
        if (session.status === "complete" && session.metadata?.clerkId === userId && session.metadata?.kind === HOST_BILLING_KIND) {
          subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? subscriptionId;
        }
      }
      if (subscriptionId) await syncHostSubscription(subscriptionId);
      billing = await prisma.hostBilling.findUnique({ where: { clerkId: userId } });
    }
    return reply({ planId: billing?.planId ?? null, status: billing?.status ?? "none", maxPlayers: activePlayerLimit(billing),
      accessUntil: billing?.accessUntil, cancelAtPeriodEnd: billing?.cancelAtPeriodEnd ?? false,
      hasSubscription: Boolean(billing?.stripeSubscriptionId), enabled: process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED === "true" });
  } catch (error) {
    console.error("Host billing status failed", error);
    return reply({ message: "Billing is temporarily unavailable. Please try again." }, 503);
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return reply({ message: "Sign in to manage your subscription." }, 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return reply({ message: "Invalid request origin." }, 403);
  try {
    const body = await request.json();
    if (!["checkout", "cancel", "resume", "portal", "upgrade"].includes(body.action)) return reply({ message: "Unknown billing action." }, 400);
    const stripe = getStripe();
    const baseUrl = process.env.BTTB_PUBLIC_URL?.replace(/\/$/, "") || request.nextUrl.origin;
    if (body.action !== "checkout") {
      const billing = await prisma.hostBilling.findUnique({ where: { clerkId: userId } });
      if (!billing?.stripeCustomerId || !billing.stripeSubscriptionId) return reply({ message: "No subscription to manage." }, 404);
      if (body.action === "upgrade") {
        if (process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED !== "true") return reply({ message: "Host subscription changes are not open yet." }, 503);
        try {
          const session = await createUpgradeSession(stripe, billing.stripeSubscriptionId, billing.stripeCustomerId, userId, body.planId, `${baseUrl}/billing`);
          return reply({ url: session.url });
        } catch (error) {
          console.error("Host upgrade unavailable", error);
          return reply({ message: "This plan change is unavailable. Refresh billing, check that renewal is enabled, and try again." }, 409);
        }
      }
      if (body.action === "portal") {
        const session = await stripe.billingPortal.sessions.create({ customer: billing.stripeCustomerId, configuration: process.env.STRIPE_HOST_PORTAL_CONFIGURATION_ID || undefined, return_url: `${baseUrl}/billing` });
        return reply({ url: session.url });
      }
      await stripe.subscriptions.update(billing.stripeSubscriptionId, { cancel_at_period_end: body.action === "cancel" });
      await syncHostSubscription(billing.stripeSubscriptionId);
      return reply({ ok: true });
    }
    const plan = getHostPlan(body.planId);
    if (!plan) return reply({ message: "Choose a valid host plan." }, 400);
    if (process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED !== "true") return reply({ message: "Host subscriptions are not open for purchases yet." }, 503);
    await prisma.hostBilling.upsert({ where: { clerkId: userId }, create: { clerkId: userId, checkoutAttempt: randomUUID() }, update: {} });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "clerkId" FROM "HostBilling" WHERE "clerkId" = ${userId} FOR UPDATE`;
      const billing = await tx.hostBilling.findUniqueOrThrow({ where: { clerkId: userId } });
      let customerId = billing.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({ metadata: { clerkId: userId, kind: HOST_BILLING_KIND } }, { idempotencyKey: `bttb-host-customer-${userId}` });
        customerId = customer.id;
        await tx.hostBilling.update({ where: { clerkId: userId }, data: { stripeCustomerId: customerId } });
      }
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      if (subscriptions.data.some(sub => !["canceled", "incomplete_expired"].includes(sub.status))) {
        return { message: "You already have a subscription. Manage it from Billing before starting another.", status: 409 };
      }
      let attempt = billing.checkoutAttempt || `initial-${userId}`;
      if (billing.checkoutSessionId) {
        const pending = await stripe.checkout.sessions.retrieve(billing.checkoutSessionId);
        if (pending.status === "open") {
          if (pending.metadata?.planId !== plan.id) return { message: "You have an open checkout for another plan. Complete it or wait for it to expire within 24 hours.", status: 409 };
          return { url: pending.url };
        }
        // The prior session ID makes retries stable even if this transaction rolls back.
        attempt = `after-${pending.id}`;
      }
      const metadata = { kind: HOST_BILLING_KIND, clerkId: userId, planId: plan.id };
      const session = await stripe.checkout.sessions.create({
        mode: "subscription", customer: customerId, client_reference_id: userId,
        payment_method_types: ["card"], metadata, subscription_data: { metadata },
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: plan.amountCents,
          recurring: { interval: plan.interval }, product_data: { name: `Bingo to the Beats — ${plan.name}`, description: `Up to ${plan.maxPlayers} players per game. One active game at a time.` } } }],
        custom_text: { submit: { message: `Renews automatically at $${(plan.amountCents / 100).toFixed(2)} every ${plan.interval} until canceled. Cancel in Billing; access continues through the paid period.` } },
        success_url: `${baseUrl}/billing?checkout=success`, cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      }, { idempotencyKey: `bttb-host-checkout-${attempt}` });
      await tx.hostBilling.update({ where: { clerkId: userId }, data: { checkoutSessionId: session.id, checkoutAttempt: attempt } });
      return { url: session.url };
    }, { timeout: 30000 });
    return reply(result, "status" in result ? result.status : 200);
  } catch (error) {
    console.error("Host billing action failed", error);
    return reply({ message: "Unable to update billing. Please try again or contact support." }, 503);
  }
}
