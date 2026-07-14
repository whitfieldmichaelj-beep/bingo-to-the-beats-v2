import Link from "next/link";

const plans = [
  {
    name: "Player",
    price: "Free",
    description: "Join hosted games from your phone.",
    features: [
      "Create a player account",
      "Join games with a game code",
      "Receive a unique bingo card",
      "Track your marked songs",
    ],
  },
  {
    name: "Host",
    price: "Pricing coming soon",
    description: "Run Bingo to the Beats events.",
    featured: true,
    features: [
      "Create and host games",
      "Generate unique bingo cards",
      "Connect music providers",
      "Manage players and winners",
      "Use the live caller screen",
    ],
  },
  {
    name: "Venue",
    price: "Contact us",
    description: "For venues and organizations running recurring events.",
    features: [
      "Multiple host accounts",
      "Recurring event management",
      "Venue branding",
      "Game and player reports",
      "Priority support",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="pricing-page">
      <section className="pricing-intro">
        <p className="pricing-eyebrow">Membership</p>

        <h1>Choose how you play</h1>

        <p>
          Every player and host must create an account.
          Paid host pricing will be finalized before launch.
        </p>
      </section>

      <section className="pricing-grid">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={
              plan.featured
                ? "pricing-card pricing-card-featured"
                : "pricing-card"
            }
          >
            <h2>{plan.name}</h2>
            <p className="pricing-price">{plan.price}</p>
            <p className="pricing-description">
              {plan.description}
            </p>

            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            <Link href="/sign-up" className="pricing-button">
              Register
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}