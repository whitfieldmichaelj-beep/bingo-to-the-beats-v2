import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function toAmountCents(value: unknown): number {
  const amount = Number(value);

  return Number.isFinite(amount)
    ? Math.round(amount * 100)
    : 0;
}

function getPaymentIntentId(
  session: Stripe.Checkout.Session
): string | null {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  if (
    session.payment_intent &&
    typeof session.payment_intent === "object"
  ) {
    return session.payment_intent.id;
  }

  return null;
}

async function markPurchasePaid(
  session: Stripe.Checkout.Session,
  eventCreated: number
) {
  if (session.payment_status !== "paid") {
    return;
  }

  const purchaseId =
    session.client_reference_id?.trim() ||
    session.metadata?.purchaseId?.trim() ||
    "";

  if (!purchaseId) {
    throw new Error(
      `Stripe session ${session.id} has no purchase ID.`
    );
  }

  const purchase = await prisma.purchase.findUnique({
    where: {
      id: purchaseId,
    },
    select: {
      id: true,
      gameId: true,
      playerKey: true,
      amount: true,
      currency: true,
      status: true,
      stripeCheckoutSessionId: true,
      game: {
        select: {
          status: true,
          completedAt: true,
        },
      },
    },
  });

  if (!purchase) {
    throw new Error(
      `Purchase ${purchaseId} was not found.`
    );
  }

  if (
    purchase.stripeCheckoutSessionId &&
    purchase.stripeCheckoutSessionId !== session.id
  ) {
    throw new Error(
      `Stripe session does not match purchase ${purchase.id}.`
    );
  }

  if (
    session.metadata?.gameId &&
    session.metadata.gameId !== purchase.gameId
  ) {
    throw new Error(
      `Stripe game ID does not match purchase ${purchase.id}.`
    );
  }

  if (
    session.metadata?.playerId &&
    session.metadata.playerId !== purchase.playerKey
  ) {
    throw new Error(
      `Stripe player ID does not match purchase ${purchase.id}.`
    );
  }

  const expectedAmountCents =
    toAmountCents(purchase.amount);

  if (session.amount_total !== expectedAmountCents) {
    throw new Error(
      `Stripe amount does not match purchase ${purchase.id}.`
    );
  }

  if (
    session.currency?.toLowerCase() !==
    purchase.currency.toLowerCase()
  ) {
    throw new Error(
      `Stripe currency does not match purchase ${purchase.id}.`
    );
  }

  const paymentIntentId =
    getPaymentIntentId(session);

  const paymentOccurredAt = new Date(
    eventCreated * 1000
  );

  /*
   * BTTB_LATE_PAYMENT_AFTER_GAME_END_V1
   *
   * Stripe's event timestamp represents when the payment
   * event actually occurred. This avoids treating a delayed
   * webhook delivery as a late customer payment.
   */
  const lateForFinishedGame =
    purchase.game.status === "CANCELLED" ||
    (purchase.game.status === "COMPLETED" &&
      (!purchase.game.completedAt ||
        paymentOccurredAt >
          purchase.game.completedAt));

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: {
        id: purchase.id,
      },
      data: {
        status: "PAID",
        stripeCheckoutSessionId: session.id,
        ...(paymentIntentId
          ? {
              stripePaymentId: paymentIntentId,
            }
          : {}),
      },
    });

    if (lateForFinishedGame) {
      await tx.bingoCard.updateMany({
        where: {
          purchaseId: purchase.id,
        },
        data: {
          status: "VOID",
        },
      });

      if (purchase.playerKey) {
        await tx.gameSession.updateMany({
          where: {
            gameId: purchase.gameId,
            sessionKey: purchase.playerKey,
          },
          data: {
            connected: false,
          },
        });
      }
    }
  });
}

function getChargePaymentIntentId(
  charge: Stripe.Charge
): string | null {
  if (typeof charge.payment_intent === "string") {
    return charge.payment_intent;
  }

  if (
    charge.payment_intent &&
    typeof charge.payment_intent === "object"
  ) {
    return charge.payment_intent.id;
  }

  return null;
}

async function markPurchaseRefunded(
  charge: Stripe.Charge
) {
  /*
   * BTTB_STRIPE_FULL_REFUND_V1
   *
   * charge.refunded may also be emitted around refund activity,
   * so only treat the purchase as REFUNDED when the entire
   * charge has actually been refunded.
   */
  const fullyRefunded =
    charge.refunded ||
    charge.amount_refunded >= charge.amount;

  if (!fullyRefunded) {
    return;
  }

  const paymentIntentId =
    getChargePaymentIntentId(charge);

  if (!paymentIntentId) {
    console.warn(
      `Refunded charge ${charge.id} has no PaymentIntent ID.`
    );
    return;
  }

  const purchase =
    await prisma.purchase.findUnique({
      where: {
        stripePaymentId: paymentIntentId,
      },
      select: {
        id: true,
        gameId: true,
        playerKey: true,
        status: true,
      },
    });

  if (
    !purchase ||
    purchase.status === "REFUNDED"
  ) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const refunded =
      await tx.purchase.updateMany({
        where: {
          id: purchase.id,
          stripePaymentId:
            paymentIntentId,
          status: "PAID",
        },
        data: {
          status: "REFUNDED",
        },
      });

    if (refunded.count !== 1) {
      return;
    }

    /*
     * Preserve an already-verified WINNER card as historical
     * game data. Cards that are still participating become VOID.
     */
    await tx.bingoCard.updateMany({
      where: {
        purchaseId: purchase.id,
        status: {
          in: [
            "ASSIGNED",
            "ACTIVE",
          ],
        },
      },
      data: {
        status: "VOID",
      },
    });

    if (purchase.playerKey) {
      await tx.gameSession.updateMany({
        where: {
          gameId: purchase.gameId,
          sessionKey: purchase.playerKey,
        },
        data: {
          connected: false,
        },
      });
    }
  });
}

async function releaseExpiredPurchase(
  session: Stripe.Checkout.Session
) {
  const purchaseId =
    session.client_reference_id?.trim() ||
    session.metadata?.purchaseId?.trim() ||
    "";

  if (!purchaseId) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const purchase =
      await tx.purchase.findUnique({
        where: {
          id: purchaseId,
        },
        select: {
          id: true,
          gameId: true,
          playerKey: true,
          status: true,
          stripeCheckoutSessionId: true,
          game: {
            select: {
              status: true,
            },
          },
        },
      });

    if (
      !purchase ||
      purchase.status === "PAID"
    ) {
      return;
    }

    // Ignore a stale expiration event if this
    // purchase already has a newer Checkout Session.
    if (
      purchase.stripeCheckoutSessionId !==
      session.id
    ) {
      return;
    }

    /*
     * BTTB_EXPIRED_CHECKOUT_GAME_HISTORY_V1
     *
     * While a game is open, an expired Checkout releases the
     * reservation so the player may retry. Once the game has
     * ended, preserve the historical reservation and void the
     * cards instead of returning them to the available pool.
     */
    if (
      purchase.game.status === "COMPLETED" ||
      purchase.game.status === "CANCELLED"
    ) {
      const cancelled =
        await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            status: "PENDING",
            stripeCheckoutSessionId:
              session.id,
          },
          data: {
            status: "CANCELLED",
          },
        });

      if (cancelled.count !== 1) {
        return;
      }

      await tx.bingoCard.updateMany({
        where: {
          purchaseId: purchase.id,
        },
        data: {
          status: "VOID",
        },
      });

      if (purchase.playerKey) {
        await tx.gameSession.updateMany({
          where: {
            gameId: purchase.gameId,
            sessionKey: purchase.playerKey,
          },
          data: {
            connected: false,
          },
        });
      }

      return;
    }

    /*
     * The host may end the game after the earlier read.
     * Release the reservation only if the game is still open.
     */
    const cancelled =
      await tx.purchase.updateMany({
        where: {
          id: purchase.id,
          status: "PENDING",
          stripeCheckoutSessionId:
            session.id,
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
          // Keep playerKey until the cards have actually
          // been released while the game is still open.
          status: "CANCELLED",
        },
      });

    if (cancelled.count !== 1) {
      /*
       * End Game may have won the race. Preserve history if so.
       */
      const latestGame =
        await tx.game.findUnique({
          where: {
            id: purchase.gameId,
          },
          select: {
            status: true,
          },
        });

      if (
        latestGame &&
        (latestGame.status === "COMPLETED" ||
          latestGame.status === "CANCELLED")
      ) {
        const finishedCancellation =
          await tx.purchase.updateMany({
            where: {
              id: purchase.id,
              status: "PENDING",
              stripeCheckoutSessionId:
                session.id,
            },
            data: {
              status: "CANCELLED",
            },
          });

        if (finishedCancellation.count === 1) {
          await tx.bingoCard.updateMany({
            where: {
              purchaseId: purchase.id,
            },
            data: {
              status: "VOID",
            },
          });

          if (purchase.playerKey) {
            await tx.gameSession.updateMany({
              where: {
                gameId: purchase.gameId,
                sessionKey: purchase.playerKey,
              },
              data: {
                connected: false,
              },
            });
          }
        }
      }

      return;
    }

    const releasedCards =
      await tx.bingoCard.updateMany({
        where: {
          purchaseId: purchase.id,
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
          purchaseId: null,
          playerKey: null,
          playerName: null,
          status: "AVAILABLE",
        },
      });

    if (releasedCards.count > 0) {
      // The reservation was released while the game was
      // still open, so the player may retry.
      await tx.purchase.updateMany({
        where: {
          id: purchase.id,
          status: "CANCELLED",
          playerKey: purchase.playerKey,
        },
        data: {
          playerKey: null,
        },
      });

      return;
    }

    /*
     * If no card could be released, End Game may have won
     * the race after the purchase was cancelled.
     */
    const latestGame =
      await tx.game.findUnique({
        where: {
          id: purchase.gameId,
        },
        select: {
          status: true,
        },
      });

    if (
      latestGame &&
      (latestGame.status === "COMPLETED" ||
        latestGame.status === "CANCELLED")
    ) {
      await tx.bingoCard.updateMany({
        where: {
          purchaseId: purchase.id,
        },
        data: {
          status: "VOID",
        },
      });

      if (purchase.playerKey) {
        await tx.gameSession.updateMany({
          where: {
            gameId: purchase.gameId,
            sessionKey: purchase.playerKey,
          },
          data: {
            connected: false,
          },
        });
      }

      return;
    }

    // No cards remained attached and the game is still open.
    // Release the player's enrollment slot.
    await tx.purchase.updateMany({
      where: {
        id: purchase.id,
        status: "CANCELLED",
        playerKey: purchase.playerKey,
      },
      data: {
        playerKey: null,
      },
    });
  });
}

export async function POST(request: NextRequest) {
  const signature =
    request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      {
        ok: false,
        message: "Stripe signature is missing.",
      },
      { status: 400 }
    );
  }

  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    console.error(
      "STRIPE_WEBHOOK_SECRET is not configured."
    );

    return NextResponse.json(
      {
        ok: false,
        message: "Webhook is not configured.",
      },
      { status: 500 }
    );
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error(
      "Invalid Stripe webhook signature:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message: "Invalid webhook signature.",
      },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session =
          event.data.object as Stripe.Checkout.Session;

        await markPurchasePaid(
          session,
          event.created
        );
        break;
      }

      case "checkout.session.expired": {
        const session =
          event.data.object as Stripe.Checkout.Session;

        await releaseExpiredPurchase(session);
        break;
      }

      case "charge.refunded": {
        const charge =
          event.data.object as Stripe.Charge;

        await markPurchaseRefunded(charge);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    console.error(
      "Unable to process Stripe webhook:",
      error
    );

    return NextResponse.json(
      {
        received: false,
      },
      { status: 500 }
    );
  }
}
