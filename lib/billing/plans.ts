import { ratePlans } from "../../app/lib/ratePlans";

export type HostPlan = {
  id: string;
  name: string;
  amountCents: number;
  interval: "week" | "month";
  maxPlayers: number;
  serato: boolean;
  description: string;
};

// Pricing and server-side checkout use the same original audience-based rates.
const audiencePlans: HostPlan[] = ratePlans.flatMap(plan => {
  if (plan.maximumPlayers === null) return [];
  const options: HostPlan[] = [];
  if (plan.weeklyPrice !== null) options.push({ id: `${plan.id}-weekly`, name: plan.name, amountCents: Math.round(plan.weeklyPrice * 100), interval: "week", maxPlayers: plan.maximumPlayers, serato: false, description: plan.description });
  if (plan.monthlyPrice !== null) options.push({ id: `${plan.id}-monthly`, name: plan.name, amountCents: Math.round(plan.monthlyPrice * 100), interval: "month", maxPlayers: plan.maximumPlayers, serato: false, description: plan.description });
  return options;
});
export const djPlans: HostPlan[] = [
  { id: "serato-weekly", name: "DJ Weekly", amountCents: 1995, interval: "week", maxPlayers: 25, serato: true, description: "Short-term use." },
  { id: "serato-pro", name: "DJ Pro", amountCents: 4995, interval: "month", maxPlayers: 75, serato: true, description: "For DJs hosting every weekend." },
  { id: "serato-pro-plus", name: "DJ Pro Plus", amountCents: 6995, interval: "month", maxPlayers: 100, serato: true, description: "For larger weekly events." },
];
export const hostPlans: HostPlan[] = [...audiencePlans, ...djPlans];

export function getHostPlan(id: unknown): HostPlan | undefined {
  return hostPlans.find(plan => plan.id === id);
}
export function activePlayerLimit(billing: { planId: string | null; status: string; accessUntil: Date | null } | null, now = new Date()): number {
  if (!billing || billing.status !== "active" || !billing.accessUntil || billing.accessUntil <= now) return 5;
  return getHostPlan(billing.planId)?.maxPlayers ?? 5;
}

export function activeHostPlan(billing: { planId: string | null; status: string; accessUntil: Date | null } | null, now = new Date()): HostPlan | undefined {
  if (!billing || billing.status !== "active" || !billing.accessUntil || billing.accessUntil <= now) return undefined;
  return getHostPlan(billing.planId);
}
