export type BillingPeriod = "weekly" | "monthly";

export type RatePlan = {
  id: string;
  name: string;
  minimumPlayers: number;
  maximumPlayers: number | null;
  weeklyPrice: number | null;
  monthlyPrice: number | null;
  description: string;
};

export const ratePlans: RatePlan[] = [
  {
    id: "starter",
    name: "Starter",
    minimumPlayers: 1,
    maximumPlayers: 25,
    weeklyPrice: 9.99,
    monthlyPrice: 29.99,
    description:
      "For small parties, family gatherings, and private events.",
  },
  {
    id: "standard",
    name: "Standard",
    minimumPlayers: 26,
    maximumPlayers: 50,
    weeklyPrice: 19.99,
    monthlyPrice: 59.99,
    description:
      "For bars, lounges, restaurants, and medium-sized events.",
  },
  {
    id: "pro",
    name: "Pro",
    minimumPlayers: 51,
    maximumPlayers: 100,
    weeklyPrice: 39.99,
    monthlyPrice: 119.99,
    description:
      "For professional hosts and larger venues.",
  },
  {
    id: "event-plus",
    name: "Event Plus",
    minimumPlayers: 101,
    maximumPlayers: 200,
    weeklyPrice: 69.99,
    monthlyPrice: 199.99,
    description:
      "For large events with up to 200 participating players.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    minimumPlayers: 201,
    maximumPlayers: null,
    weeklyPrice: null,
    monthlyPrice: null,
    description:
      "Custom pricing for festivals, organizations, and major events.",
  },
];

export function getRatePlan(playerCount: number): RatePlan | null {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    return null;
  }

  return (
    ratePlans.find((plan) => {
      const meetsMinimum =
        playerCount >= plan.minimumPlayers;

      const meetsMaximum =
        plan.maximumPlayers === null ||
        playerCount <= plan.maximumPlayers;

      return meetsMinimum && meetsMaximum;
    }) ?? null
  );
}

export function getPlanPrice(
  plan: RatePlan,
  billingPeriod: BillingPeriod
): number | null {
  return billingPeriod === "weekly"
    ? plan.weeklyPrice
    : plan.monthlyPrice;
}
