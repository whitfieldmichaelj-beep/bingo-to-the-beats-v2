export type BillingPeriod = "weekly" | "monthly";
export type RatePlan = { id: string; name: string; minimumPlayers: number; maximumPlayers: number | null; weeklyPrice: number | null; monthlyPrice: number | null; description: string };
export const ratePlans: RatePlan[] = [
  { id: "social", name: "Social", minimumPlayers: 1, maximumPlayers: 25, weeklyPrice: 9.99, monthlyPrice: 29.99, description: "Up to 25 players. Great for home parties and small groups." },
  { id: "venue", name: "Venue", minimumPlayers: 26, maximumPlayers: 100, weeklyPrice: 39.99, monthlyPrice: 119.99, description: "Up to 100 players. Great for bars, restaurants, and smaller hotels." },
  { id: "event-plus", name: "Event Plus", minimumPlayers: 101, maximumPlayers: 200, weeklyPrice: 69.99, monthlyPrice: 199.99, description: "Up to 200 players. Great for larger hotels and events." },
];
export function getRatePlan(playerCount: number): RatePlan | null {
  if (!Number.isInteger(playerCount) || playerCount < 1) return null;
  return ratePlans.find(plan => playerCount >= plan.minimumPlayers && (plan.maximumPlayers === null || playerCount <= plan.maximumPlayers)) ?? null;
}
export function getPlanPrice(plan: RatePlan, period: BillingPeriod): number | null { return period === "weekly" ? plan.weeklyPrice : plan.monthlyPrice; }
