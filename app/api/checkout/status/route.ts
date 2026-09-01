import { NextRequest, NextResponse } from "next/server";

import { readPlayerSession } from "@/lib/auth/player-session";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

function toAmountCents(value: unknown): number {
  const amount = Number(value);

  return Number.isFinite(amount)
    ? Math.round(amount * 100)
    : 0;
}

export async function GET(request: NextRequest) {
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

    const sessionId =
      request.nextUrl.searchParams
        .get("session_id")
        ?.trim() ?? "";

    if (!sessionId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Checkout session ID is required.",
        },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    const checkoutSession =
      await stripe.checkout.sessions.retrieve(
        sessionId
      );

    const purchaseId =
      checkoutSession.client_reference_id?.trim() ||
      checkoutSession.metadata?.purchaseId?.trim() ||
      "";

    if (!purchaseId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Purchase could not be identified.",
        },
        { status: 400 }
      );
    }

    const purchase =
      await prisma.purchase.findFirst({
        where: {
          id: purchaseId,
          playerKey:
            trustedPlayerSession.playerId,
        },
        include: {
          game: {
            select: {
              joinCode: true,
              status: true,
              completedAt: true,
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

    if (
      purchase.stripeCheckoutSessionId !==
      checkoutSession.id
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Checkout session does not match this purchase.",
        },
        { status: 409 }
      );
    }

    if (
      checkoutSession.client_reference_id !==
      purchase.id
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Checkout reference does not match this purchase.",
        },
        { status: 409 }
      );
    }

    if (
      checkoutSession.metadata?.purchaseId !==
      purchase.id ||
      checkoutSession.metadata?.gameId !==
        purchase.gameId ||
      checkoutSession.metadata?.playerId !==
        trustedPlayerSession.playerId
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Checkout metadata does not match this purchase.",
        },
        { status: 409 }
      );
    }

    const expectedAmountCents =
      toAmountCents(purchase.amount);

    if (
      checkoutSession.amount_total !==
      expectedAmountCents
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Checkout amount does not match this purchase.",
        },
        { status: 409 }
      );
    }

    if (
      checkoutSession.currency?.toLowerCase() !==
      purchase.currency.toLowerCase()
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Checkout currency does not match this purchase.",
        },
        { status: 409 }
      );
    }

    const paid =
      checkoutSession.payment_status === "paid";

    /*
     * BTTB_COMPLETED_GAME_PAYMENT_RECOVERY_LOCK_V1
     *
     * Stripe may redirect a player back after the host has
     * already ended the game. Do not revive gameplay here.
     * The Stripe webhook remains responsible for recording
     * and reconciling an already-completed payment.
     */
    if (
      purchase.game.status === "COMPLETED" ||
      purchase.game.status === "CANCELLED"
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "GAME_COMPLETED",
          paid,
          purchaseId: purchase.id,
          joinCode: purchase.game.joinCode,
          paymentStatus:
            checkoutSession.payment_status,
          message: paid
            ? "Your payment was received, but this game has ended. The payment is being finalized and the game cannot be reopened."
            : "This game has ended. Payment can no longer be completed for this game.",
        },
        { status: 409 }
      );
    }

    if (paid && purchase.status !== "PAID") {
      const paymentIntentId =
        typeof checkoutSession.payment_intent ===
        "string"
          ? checkoutSession.payment_intent
          : checkoutSession.payment_intent &&
              typeof checkoutSession.payment_intent ===
                "object"
            ? checkoutSession.payment_intent.id
            : null;

      /*
       * BTTB_CHECKOUT_STATUS_COMPLETION_RACE_GUARD_V1
       *
       * End Game may occur after the earlier status check.
       * Promote this purchase only while the game is still
       * open. Stripe's webhook will reconcile a payment if
       * completion wins this race.
       */
      const paidUpdate =
        await prisma.purchase.updateMany({
          where: {
            id: purchase.id,
            playerKey:
              trustedPlayerSession.playerId,
            status: "PENDING",
            stripeCheckoutSessionId:
              checkoutSession.id,
            game: {
              status: {
                notIn: [
                  "COMPLETED",
                  "CANCELLED",
                ],
              },
            },
          },
          data: {
            status: "PAID",
            ...(paymentIntentId
              ? {
                  stripePaymentId:
                    paymentIntentId,
                }
              : {}),
          },
        });

      if (paidUpdate.count !== 1) {
        const latestGame =
          await prisma.game.findUnique({
            where: {
              id: purchase.gameId,
            },
            select: {
              status: true,
            },
          });

        if (
          !latestGame ||
          latestGame.status === "COMPLETED" ||
          latestGame.status === "CANCELLED"
        ) {
          return NextResponse.json(
            {
              ok: false,
              code: "GAME_COMPLETED",
              paid: true,
              purchaseId: purchase.id,
              joinCode: purchase.game.joinCode,
              paymentStatus:
                checkoutSession.payment_status,
              message:
                "Your payment was received, but this game has ended. The payment is being finalized and the game cannot be reopened.",
            },
            { status: 409 }
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      paid,
      purchaseId: purchase.id,
      joinCode: purchase.game.joinCode,
      playerName: purchase.playerName,
      cardQuantity: purchase.quantity,
      paymentStatus:
        checkoutSession.payment_status,
    });
  } catch (error) {
    console.error(
      "Unable to check Stripe payment status:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to confirm payment status.",
      },
      { status: 500 }
    );
  }
}
