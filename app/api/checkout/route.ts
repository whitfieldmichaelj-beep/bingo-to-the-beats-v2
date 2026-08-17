import { NextRequest, NextResponse } from "next/server";

import { readPlayerSession } from "@/lib/auth/player-session";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

type CheckoutRequestBody = {
  purchaseId?: unknown;
};

function toAmountCents(value: unknown): number {
  const amount = Number(value);

  return Number.isFinite(amount)
    ? Math.round(amount * 100)
    : 0;
}

export async function POST(request: NextRequest) {
  try {
    const trustedPlayerSession =
      await readPlayerSession(request);

    if (!trustedPlayerSession) {
      return NextResponse.json(
        {
          ok: false,
          message: "Player session is required.",
        },
        { status: 401 }
      );
    }

    let body: CheckoutRequestBody;

    try {
      body = (await request.json()) as CheckoutRequestBody;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid checkout request.",
        },
        { status: 400 }
      );
    }

    const purchaseId =
      typeof body.purchaseId === "string"
        ? body.purchaseId.trim()
        : "";

    if (!purchaseId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Purchase ID is required.",
        },
        { status: 400 }
      );
    }

    const purchase = await prisma.purchase.findFirst({
      where: {
        id: purchaseId,
        playerKey: trustedPlayerSession.playerId,
        status: {
          in: ["PENDING", "PAID"],
        },
      },
      include: {
        game: {
          select: {
            title: true,
            joinCode: true,
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json(
        {
          ok: false,
          message: "Purchase not found.",
        },
        { status: 404 }
      );
    }

    if (purchase.status === "PAID") {
      return NextResponse.json({
        ok: true,
        paid: true,
        purchaseId: purchase.id,
      });
    }

    const amountCents = toAmountCents(
      purchase.amount
    );

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0
    ) {
      throw new Error(
        `Invalid purchase amount for ${purchase.id}.`
      );
    }

    const stripe = getStripe();

    let idempotencyKey =
      `bttb-checkout-${purchase.id}-initial`;

    if (purchase.stripeCheckoutSessionId) {
      const existingSession =
        await stripe.checkout.sessions.retrieve(
          purchase.stripeCheckoutSessionId
        );

      if (
        existingSession.status === "open" &&
        existingSession.url
      ) {
        return NextResponse.json({
          ok: true,
          paid: false,
          checkoutUrl: existingSession.url,
          checkoutSessionId: existingSession.id,
        });
      }

      if (existingSession.status === "complete") {
        return NextResponse.json(
          {
            ok: true,
            paid: false,
            processing: true,
            checkoutSessionId: existingSession.id,
            paymentStatus:
              existingSession.payment_status,
            message:
              "Payment is being confirmed.",
          },
          { status: 202 }
        );
      }

      if (existingSession.status === "expired") {
        idempotencyKey =
          `bttb-checkout-${purchase.id}-after-${existingSession.id}`;
      }
    }

    const metadata = {
      purchaseId: purchase.id,
      gameId: purchase.gameId,
      playerId: trustedPlayerSession.playerId,
    };

    const successUrl =
      `${request.nextUrl.origin}/join` +
      `?code=${encodeURIComponent(
        purchase.game.joinCode
      )}` +
      "&payment=success" +
      "&session_id={CHECKOUT_SESSION_ID}";

    const cancelUrl =
      `${request.nextUrl.origin}/join` +
      `?code=${encodeURIComponent(
        purchase.game.joinCode
      )}` +
      "&payment=cancelled";

    const checkoutSession =
      await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          expires_at:
            Math.floor(Date.now() / 1000) +
            30 * 60,
          client_reference_id: purchase.id,
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata,
          payment_intent_data: {
            metadata,
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency:
                  purchase.currency.toLowerCase(),
                unit_amount: amountCents,
                product_data: {
                  name:
                    `Bingo to the Beats — ` +
                    `${purchase.quantity} Card${
                      purchase.quantity === 1
                        ? ""
                        : "s"
                    }`,
                  description: purchase.game.title,
                },
              },
            },
          ],
        },
        {
          idempotencyKey,
        }
      );

    if (!checkoutSession.url) {
      throw new Error(
        "Stripe did not return a Checkout URL."
      );
    }

    await prisma.purchase.updateMany({
      where: {
        id: purchase.id,
        playerKey:
          trustedPlayerSession.playerId,
        status: "PENDING",
      },
      data: {
        stripeCheckoutSessionId:
          checkoutSession.id,
      },
    });

    return NextResponse.json({
      ok: true,
      paid: false,
      checkoutUrl: checkoutSession.url,
      checkoutSessionId:
        checkoutSession.id,
    });
  } catch (error) {
    console.error(
      "Unable to create Stripe checkout:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to start checkout.",
      },
      { status: 500 }
    );
  }
}
