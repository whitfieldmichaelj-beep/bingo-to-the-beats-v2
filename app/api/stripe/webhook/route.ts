import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { isDisputeFinanciallyUnavailable } from "@/lib/payments/disputes";

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

  /*
   * We only need the immutable game ID before entering the
   * transaction so Game and Purchase can be locked in the
   * same order used by End Game.
   */
  const initialPurchase =
    await prisma.purchase.findUnique({
      where: {
        id: purchaseId,
      },
      select: {
        id: true,
        gameId: true,
      },
    });

  if (!initialPurchase) {
    throw new Error(
      `Purchase ${purchaseId} was not found.`
    );
  }

  const paymentIntentId =
    getPaymentIntentId(session);

  const paymentOccurredAt =
    new Date(eventCreated * 1000);

  /*
   * BTTB_PAYMENT_END_GAME_SERIALIZATION_V1
   *
   * End Game locks Game first and then changes pending
   * purchases. Stripe payment completion uses the same lock
   * order so the two operations cannot leave a purchase/card
   * combination in an inconsistent state.
   */
  await prisma.$transaction(
    async (tx) => {
      const lockedGames =
        await tx.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT "id"
          FROM "Game"
          WHERE "id" = ${initialPurchase.gameId}
          FOR UPDATE
        `;

      if (lockedGames.length !== 1) {
        throw new Error(
          `Game ${initialPurchase.gameId} was not found.`
        );
      }

      const lockedPurchases =
        await tx.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT "id"
          FROM "Purchase"
          WHERE "id" = ${purchaseId}
          FOR UPDATE
        `;

      if (lockedPurchases.length !== 1) {
        throw new Error(
          `Purchase ${purchaseId} was not found.`
        );
      }

      const purchase =
        await tx.purchase.findUnique({
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
            stripeCheckoutSessionId:
              true,
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
        purchase.stripeCheckoutSessionId !==
          session.id
      ) {
        throw new Error(
          `Stripe session does not match purchase ${purchase.id}.`
        );
      }

      if (
        session.metadata?.purchaseId &&
        session.metadata.purchaseId !==
          purchase.id
      ) {
        throw new Error(
          `Stripe purchase ID does not match purchase ${purchase.id}.`
        );
      }

      if (
        session.metadata?.gameId &&
        session.metadata.gameId !==
          purchase.gameId
      ) {
        throw new Error(
          `Stripe game ID does not match purchase ${purchase.id}.`
        );
      }

      if (
        session.metadata?.playerId &&
        session.metadata.playerId !==
          purchase.playerKey
      ) {
        throw new Error(
          `Stripe player ID does not match purchase ${purchase.id}.`
        );
      }

      const expectedAmountCents =
        toAmountCents(
          purchase.amount
        );

      if (
        session.amount_total !==
        expectedAmountCents
      ) {
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

      /*
       * A replayed payment event must never reverse a completed
       * refund.
       */
      if (
        purchase.status ===
        "REFUNDED"
      ) {
        return;
      }

      const finishedGame =
        purchase.game.status ===
          "COMPLETED" ||
        purchase.game.status ===
          "CANCELLED";

      /*
       * BTTB_DELAYED_PRE_COMPLETION_PAYMENT_V1
       *
       * Stripe event.created represents when the payment event
       * actually occurred. If Stripe delivers the webhook after
       * End Game, but the payment happened on or before the
       * game's completedAt timestamp, this was a legitimate
       * pre-completion payment.
       */
      const completionSecond =
        purchase.game.completedAt
          ? Math.floor(
              purchase.game.completedAt.getTime() /
                1000
            )
          : null;

      const paidBeforeCompletion =
        purchase.game.status ===
          "COMPLETED" &&
        completionSecond !== null &&
        eventCreated <=
          completionSecond;

      const lateForFinishedGame =
        purchase.game.status ===
          "CANCELLED" ||
        (purchase.game.status ===
          "COMPLETED" &&
          !paidBeforeCompletion);

      await tx.purchase.update({
        where: {
          id: purchase.id,
        },
        data: {
          status: "PAID",
          stripeCheckoutSessionId:
            session.id,
          ...(paymentIntentId
            ? {
                stripePaymentId:
                  paymentIntentId,
              }
            : {}),
        },
      });

      if (paidBeforeCompletion) {
        /*
         * End Game may already have changed this reservation
         * from CANCELLED/VOID. Restore only its VOID cards to
         * the normal paid-card state used by the application.
         */
        await tx.bingoCard.updateMany({
          where: {
            purchaseId:
              purchase.id,
            status: "VOID",
          },
          data: {
            status: "ASSIGNED",
          },
        });
      } else if (lateForFinishedGame) {
        await tx.bingoCard.updateMany({
          where: {
            purchaseId:
              purchase.id,
          },
          data: {
            status: "VOID",
          },
        });
      }

      /*
       * A completed/cancelled game remains disconnected even
       * when a delayed webhook proves that payment was valid.
       */
      if (
        finishedGame &&
        purchase.playerKey
      ) {
        await tx.gameSession.updateMany({
          where: {
            gameId:
              purchase.gameId,
            sessionKey:
              purchase.playerKey,
          },
          data: {
            connected: false,
          },
        });
      }
    },
    {
      timeout: 60_000,
      maxWait: 20_000,
    }
  );
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
        stripePaymentId:
          paymentIntentId,
      },
      select: {
        id: true,
        gameId: true,
        playerKey: true,
        amount: true,
        currency: true,
        status: true,
        refundedAmount: true,
      },
    });

  if (!purchase) {
    return;
  }

  const expectedAmountCents =
    toAmountCents(purchase.amount);

  if (charge.amount !== expectedAmountCents) {
    throw new Error(
      `Stripe refund amount does not match purchase ${purchase.id}.`
    );
  }

  if (
    charge.currency.toLowerCase() !==
    purchase.currency.toLowerCase()
  ) {
    throw new Error(
      `Stripe refund currency does not match purchase ${purchase.id}.`
    );
  }

  /*
   * Stripe reports amount_refunded cumulatively on the Charge.
   * Store that absolute value instead of incrementing so replayed
   * webhook events remain idempotent.
   */
  const refundedAmountCents =
    Math.max(
      0,
      Math.min(
        charge.amount,
        charge.amount_refunded
      )
    );

  await prisma.$transaction(async (tx) => {
    /*
     * BTTB_REFUND_EVENT_SERIALIZATION_V1
     *
     * Stripe refund events may be delivered concurrently or
     * out of order. Lock the purchase so a stale partial-refund
     * event can never reduce the cumulative refunded amount.
     */
    const lockedPurchases =
      await tx.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT "id"
        FROM "Purchase"
        WHERE "id" = ${purchase.id}
        FOR UPDATE
      `;

    if (lockedPurchases.length !== 1) {
      return;
    }

    const current =
      await tx.purchase.findUnique({
        where: {
          id: purchase.id,
        },
        select: {
          status: true,
          refundedAmount: true,
        },
      });

    if (!current) {
      return;
    }

    const effectiveRefundedAmountCents =
      Math.max(
        refundedAmountCents,
        toAmountCents(
          current.refundedAmount
        )
      );

    const fullyRefunded =
      charge.refunded ||
      effectiveRefundedAmountCents >=
        charge.amount;

    /*
     * BTTB_STRIPE_PARTIAL_REFUND_ACCOUNTING_V1
     *
     * Partial refunds reduce net revenue but leave the purchase
     * PAID and its bingo cards valid. A full refund moves the
     * purchase to REFUNDED and removes participating cards.
     */
    if (!fullyRefunded) {
      if (current.status !== "PAID") {
        return;
      }

      await tx.purchase.update({
        where: {
          id: purchase.id,
        },
        data: {
          refundedAmount:
            effectiveRefundedAmountCents /
            100,
        },
      });

      return;
    }

    if (current.status === "REFUNDED") {
      await tx.purchase.update({
        where: {
          id: purchase.id,
        },
        data: {
          refundedAmount:
            charge.amount / 100,
        },
      });

      return;
    }

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
          refundedAmount:
            charge.amount / 100,
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
          gameId:
            purchase.gameId,
          sessionKey:
            purchase.playerKey,
        },
        data: {
          connected: false,
        },
      });
    }
  });
}


type PurchaseDisputeEventType =
  | "charge.dispute.created"
  | "charge.dispute.updated"
  | "charge.dispute.closed"
  | "charge.dispute.funds_withdrawn"
  | "charge.dispute.funds_reinstated";

function getDisputePaymentIntentId(
  dispute: Stripe.Dispute
) {
  const paymentIntent =
    dispute.payment_intent;

  if (!paymentIntent) {
    return null;
  }

  return typeof paymentIntent === "string"
    ? paymentIntent
    : paymentIntent.id;
}

async function markPurchaseDisputed(
  dispute: Stripe.Dispute,
  eventType: PurchaseDisputeEventType,
  eventCreated: number
) {
  const paymentIntentId =
    getDisputePaymentIntentId(dispute);

  if (!paymentIntentId) {
    console.warn(
      `Stripe dispute ${dispute.id} has no PaymentIntent ID.`
    );
    return;
  }

  const initialPurchase =
    await prisma.purchase.findUnique({
      where: {
        stripePaymentId:
          paymentIntentId,
      },
      select: {
        id: true,
        gameId: true,
        playerKey: true,
        currency: true,
      },
    });

  if (!initialPurchase) {
    return;
  }

  if (
    dispute.currency.toLowerCase() !==
    initialPurchase.currency.toLowerCase()
  ) {
    throw new Error(
      `Stripe dispute currency does not match purchase ${initialPurchase.id}.`
    );
  }

  const eventCreatedValue =
    BigInt(eventCreated);

  const fundsEvent =
    eventType ===
      "charge.dispute.funds_withdrawn" ||
    eventType ===
      "charge.dispute.funds_reinstated";

  const fundsWithdrawn =
    eventType ===
    "charge.dispute.funds_withdrawn";

  await prisma.$transaction(
    async (tx) => {
      /*
       * BTTB_STRIPE_DISPUTE_SERIALIZATION_V1
       *
       * Rejoin/refund/dispute decisions all lock the Purchase
       * row so their final session state is deterministic.
       */
      const lockedPurchases =
        await tx.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT "id"
          FROM "Purchase"
          WHERE "id" = ${initialPurchase.id}
          FOR UPDATE
        `;

      if (lockedPurchases.length !== 1) {
        return;
      }

      const purchase =
        await tx.purchase.findUnique({
          where: {
            id: initialPurchase.id,
          },
          select: {
            id: true,
            gameId: true,
            playerKey: true,
            currency: true,
          },
        });

      if (!purchase) {
        return;
      }

      if (
        dispute.currency.toLowerCase() !==
        purchase.currency.toLowerCase()
      ) {
        throw new Error(
          `Stripe dispute currency does not match purchase ${purchase.id}.`
        );
      }

      const existing =
        await tx.purchaseDispute.findUnique({
          where: {
            stripeDisputeId:
              dispute.id,
          },
        });

      const statusEventIsCurrent =
        !existing ||
        eventCreatedValue >=
          existing.lastStatusEventCreated;

      const fundsEventIsCurrent =
        fundsEvent &&
        (
          !existing ||
          eventCreatedValue >=
            existing.lastFundsEventCreated
        );

      if (!existing) {
        await tx.purchaseDispute.create({
          data: {
            stripeDisputeId:
              dispute.id,
            purchaseId:
              purchase.id,
            amount:
              Math.max(
                0,
                dispute.amount
              ) / 100,
            currency:
              dispute.currency.toUpperCase(),
            status:
              dispute.status,
            reason:
              dispute.reason ?? null,
            fundsWithdrawn:
              fundsEvent
                ? fundsWithdrawn
                : false,
            lastStatusEventCreated:
              eventCreatedValue,
            lastFundsEventCreated:
              fundsEvent
                ? eventCreatedValue
                : BigInt(0),
          },
        });
      } else {
        const data: {
          amount?: number;
          currency?: string;
          status?: string;
          reason?: string | null;
          fundsWithdrawn?: boolean;
          lastStatusEventCreated?: bigint;
          lastFundsEventCreated?: bigint;
        } = {};

        if (statusEventIsCurrent) {
          data.amount =
            Math.max(
              0,
              dispute.amount
            ) / 100;
          data.currency =
            dispute.currency.toUpperCase();
          data.status =
            dispute.status;
          data.reason =
            dispute.reason ?? null;
          data.lastStatusEventCreated =
            eventCreatedValue;
        }

        if (fundsEventIsCurrent) {
          data.fundsWithdrawn =
            fundsWithdrawn;
          data.lastFundsEventCreated =
            eventCreatedValue;
        }

        if (Object.keys(data).length > 0) {
          await tx.purchaseDispute.update({
            where: {
              stripeDisputeId:
                dispute.id,
            },
            data,
          });
        }
      }

      /*
       * A purchase remains blocked while any dispute is active
       * OR while Stripe still has dispute funds withdrawn.
       *
       * This prevents a "won" status from restoring access
       * before the separate funds_reinstated event arrives.
       */
      const allDisputes =
        await tx.purchaseDispute.findMany({
          where: {
            purchaseId:
              purchase.id,
          },
          select: {
            status: true,
            fundsWithdrawn: true,
          },
        });

      const purchaseBlocked =
        allDisputes.some(
          (currentDispute) =>
            isDisputeFinanciallyUnavailable(
              currentDispute
            )
        );

      if (
        purchaseBlocked &&
        purchase.playerKey
      ) {
        await tx.gameSession.updateMany({
          where: {
            gameId:
              purchase.gameId,
            sessionKey:
              purchase.playerKey,
          },
          data: {
            connected: false,
          },
        });
      }
    },
    {
      maxWait: 20_000,
      timeout: 60_000,
    }
  );
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

      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated": {
        const dispute =
          event.data.object as Stripe.Dispute;

        await markPurchaseDisputed(
          dispute,
          event.type,
          event.created
        );
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
