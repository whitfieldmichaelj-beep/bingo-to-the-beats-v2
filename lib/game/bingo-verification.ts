import { prisma } from "@/lib/prisma";

export type BingoClaimStatus =
  | "pending"
  | "verified";

export type BingoVerificationSquare = {
  squareIndex: number;
  title: string;
  artist: string;
  called: boolean;
};

export type BingoClaimView = {
  id: string;
  gameId: string;
  cardId: string;
  cardNumber: number;
  playerId: string | null;
  playerName: string;
  pattern: string;
  status: BingoClaimStatus;
  eligible: boolean;
  createdAt: string;
  verifiedAt: string | null;
  winningSquares: BingoVerificationSquare[];
};

function normalizePattern(value: string) {
  const supported = new Set([
    "single-line",
    "four-corners",
    "x-pattern",
    "full-card",
    "any-line",
    "across",
    "down",
    "diagonal",
    "blackout",
  ]);

  return supported.has(value)
    ? value
    : "single-line";
}

function patternGroups(pattern: string): number[][] {
  const rows = Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, column) => row * 5 + column)
  );

  const columns = Array.from({ length: 5 }, (_, column) =>
    Array.from({ length: 5 }, (_, row) => row * 5 + column)
  );

  const diagonals = [
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ];

  switch (normalizePattern(pattern)) {
    case "four-corners":
      return [[0, 4, 20, 24]];

    case "x-pattern":
      return [
        Array.from(
          new Set([
            ...diagonals[0],
            ...diagonals[1],
          ])
        ),
      ];

    case "full-card":
    case "blackout":
      return [
        Array.from({ length: 25 }, (_, index) => index),
      ];

    case "across":
      return rows;

    case "down":
      return columns;

    case "diagonal":
      return diagonals;

    case "single-line":
    case "any-line":
    default:
      return [...rows, ...columns, ...diagonals];
  }
}

export async function verifyCard(
  gameId: string,
  cardId: string
) {
  const card = await prisma.bingoCard.findFirst({
    where: {
      id: cardId,
      gameId,
    },
    include: {
      squares: {
        include: {
          track: true,
        },
        orderBy: {
          position: "asc",
        },
      },
      game: {
        select: {
          winningRule: true,
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  const calledTracks = await prisma.gameTrack.findMany({
    where: {
      gameId,
      called: true,
    },
    select: {
      trackId: true,
    },
  });

  const calledTrackIds = new Set(
    calledTracks.map((track) => track.trackId)
  );

  const squareByPosition = new Map(
    card.squares.map((square) => [
      square.position,
      square,
    ])
  );

  const groups = patternGroups(
    card.game.winningRule
  );

  const winningGroup =
    groups.find((group) =>
      group.every((position) => {
        const square = squareByPosition.get(position);

        return Boolean(
          square &&
            calledTrackIds.has(square.trackId)
        );
      })
    ) ?? null;

  const evidenceGroup =
    winningGroup ??
    groups
      .map((group) => ({
        group,
        calledCount: group.filter((position) => {
          const square = squareByPosition.get(position);

          return Boolean(
            square &&
              calledTrackIds.has(square.trackId)
          );
        }).length,
      }))
      .sort(
        (left, right) =>
          right.calledCount - left.calledCount
      )[0]?.group ??
    [];

  const winningSquares = evidenceGroup
    .map((position) => {
      const square = squareByPosition.get(position);

      if (!square) {
        return null;
      }

      return {
        squareIndex: square.position,
        title: square.track.title,
        artist: square.track.artist,
        called: calledTrackIds.has(square.trackId),
      };
    })
    .filter(
      (
        square
      ): square is BingoVerificationSquare =>
        square !== null
    );

  return {
    eligible: winningGroup !== null,
    pattern: normalizePattern(
      card.game.winningRule
    ),
    winningSquares,
  };
}

export async function getClaimView(
  claimId: string
): Promise<BingoClaimView | null> {
  const claim = await prisma.winner.findUnique({
    where: {
      id: claimId,
    },
    include: {
      card: {
        select: {
          cardNumber: true,
          playerName: true,
          playerKey: true,
        },
      },
    },
  });

  if (!claim) {
    return null;
  }

  const verification = await verifyCard(
    claim.gameId,
    claim.cardId
  );

  return {
    id: claim.id,
    gameId: claim.gameId,
    cardId: claim.cardId,
    cardNumber: claim.card.cardNumber,
    playerId: claim.card.playerKey,
    playerName:
      claim.card.playerName ?? "Player",
    pattern: claim.winningType,
    status: claim.verified
      ? "verified"
      : "pending",
    eligible: verification?.eligible ?? false,
    createdAt: claim.createdAt.toISOString(),
    verifiedAt:
      claim.verifiedAt?.toISOString() ?? null,
    winningSquares:
      verification?.winningSquares ?? [],
  };
}

export async function submitBingoClaim(
  gameId: string,
  cardId: string,
  playerId: string
) {
  const card = await prisma.bingoCard.findFirst({
    where: {
      id: cardId,
      gameId,
      playerKey: playerId,
    },
    select: {
      id: true,
      game: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!card) {
    return {
      ok: false as const,
      code: "CARD_NOT_OWNED",
      message:
        "This card is not assigned to this player.",
    };
  }

  if (card.game.status === "COMPLETED") {
    return {
      ok: false as const,
      code: "GAME_COMPLETED",
      message:
        "This game has already ended. BINGO claims are closed.",
    };
  }

  const verification = await verifyCard(
    gameId,
    cardId
  );

  if (!verification?.eligible) {
    return {
      ok: false as const,
      code: "NOT_VERIFIED",
      message:
        "BINGO is not verified yet. One or more required songs have not been called by the DJ system.",
      verification,
    };
  }

  const existing = await prisma.winner.findUnique({
    where: {
      cardId,
    },
  });

  if (existing?.verified) {
    return {
      ok: true as const,
      claim: await getClaimView(existing.id),
    };
  }

  const winner = await prisma.winner.upsert({
    where: {
      cardId,
    },
    update: {
      verified: false,
      verifiedAt: null,
      winningType: verification.pattern,
    },
    create: {
      gameId,
      cardId,
      verified: false,
      winningType: verification.pattern,
    },
  });

  return {
    ok: true as const,
    claim: await getClaimView(winner.id),
  };
}

export async function getPlayerClaim(
  gameId: string,
  cardId: string,
  playerId: string
) {
  const card = await prisma.bingoCard.findFirst({
    where: {
      id: cardId,
      gameId,
      playerKey: playerId,
    },
    select: {
      id: true,
    },
  });

  if (!card) {
    return null;
  }

  const claim = await prisma.winner.findUnique({
    where: {
      cardId,
    },
    select: {
      id: true,
    },
  });

  return claim
    ? getClaimView(claim.id)
    : null;
}

export async function listHostClaims(
  gameId: string,
  hostClerkId: string
) {
  const game = await prisma.game.findFirst({
    where: {
      id: gameId,
      host: {
        clerkId: hostClerkId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!game) {
    return null;
  }

  const claims = await prisma.winner.findMany({
    where: {
      gameId,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const views = await Promise.all(
    claims.map((claim) =>
      getClaimView(claim.id)
    )
  );

  return views.filter(
    (
      claim
    ): claim is BingoClaimView =>
      claim !== null
  );
}

export async function reviewBingoClaim(
  gameId: string,
  claimId: string,
  hostClerkId: string,
  action: "verify" | "reject"
) {
  const game = await prisma.game.findFirst({
    where: {
      id: gameId,
      host: {
        clerkId: hostClerkId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!game) {
    return {
      ok: false as const,
      code: "NOT_HOST",
      message:
        "This game is not owned by the current host.",
    };
  }

  const claim = await prisma.winner.findFirst({
    where: {
      id: claimId,
      gameId,
    },
  });

  if (!claim) {
    return {
      ok: false as const,
      code: "CLAIM_NOT_FOUND",
      message: "BINGO claim not found.",
    };
  }

  if (action === "reject") {
    await prisma.winner.delete({
      where: {
        id: claimId,
      },
    });

    return {
      ok: true as const,
      rejected: true as const,
    };
  }

  const verification = await verifyCard(
    gameId,
    claim.cardId
  );

  if (!verification?.eligible) {
    return {
      ok: false as const,
      code: "NOT_ELIGIBLE",
      message:
        "This card does not currently pass server verification.",
      verification,
    };
  }

  const existingWinner =
    await prisma.winner.findFirst({
      where: {
        gameId,
        verified: true,
        id: {
          not: claimId,
        },
      },
      select: {
        id: true,
      },
    });

  if (existingWinner) {
    return {
      ok: false as const,
      code: "WINNER_EXISTS",
      message:
        "This game already has a verified winner.",
    };
  }

  await prisma.$transaction([
    prisma.winner.update({
      where: {
        id: claimId,
      },
      data: {
        verified: true,
        verifiedAt: new Date(),
        winningType: verification.pattern,
      },
    }),
    prisma.bingoCard.update({
      where: {
        id: claim.cardId,
      },
      data: {
        status: "WINNER",
      },
    }),
  ]);

  return {
    ok: true as const,
    claim: await getClaimView(claimId),
  };
}
