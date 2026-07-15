import Link from "next/link";

const plans = [
  {
    name: "Player",
    price: "Free",
    description: "Join hosted games directly from your phone.",
    features: [
      "Create a player account",
      "Join games with a game code",
      "Receive a unique bingo card",
      "Track your marked songs",
    ],
    buttonText: "Register Free",
  },
  {
    name: "Host",
    price: "$19.99",
    priceNote: "per month",
    description: "Create and run Bingo to the Beats events.",
    featured: true,
    features: [
      "Create and host games",
      "Generate unique bingo cards",
      "Connect music providers",
      "Manage players and winners",
      "Use the live caller screen",
    ],
    buttonText: "Start Hosting",
  },
  {
    name: "Venue",
    price: "Contact Us",
    description:
      "For venues and organizations running recurring events.",
    features: [
      "Multiple host accounts",
      "Recurring event management",
      "Custom venue branding",
      "Game and player reports",
      "Priority support",
    ],
    buttonText: "Contact Us",
  },
];

export default function PricingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "72px 24px 100px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 42%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#a78bfa",
            fontSize: "14px",
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Membership
        </p>

        <h1
          style={{
            margin: "14px 0 0",
            fontSize: "clamp(42px, 7vw, 72px)",
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          Choose how you play
        </h1>

        <p
          style={{
            maxWidth: "680px",
            margin: "22px auto 0",
            color: "#cbd5e1",
            fontSize: "19px",
            lineHeight: 1.7,
          }}
        >
          Join games for free or choose a host plan to create and run
          your own Bingo to the Beats events.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(270px, 1fr))",
          gap: "24px",
          width: "min(100%, 1120px)",
          margin: "54px auto 0",
        }}
      >
        {plans.map((plan) => (
          <article
            key={plan.name}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              minHeight: "520px",
              padding: "32px",
              borderRadius: "24px",
              background: plan.featured
                ? "linear-gradient(180deg, rgba(88,28,135,.72), rgba(15,23,42,.96))"
                : "rgba(15, 23, 42, 0.94)",
              border: plan.featured
                ? "1px solid #a78bfa"
                : "1px solid #334155",
              boxShadow: plan.featured
                ? "0 24px 70px rgba(126, 34, 206, 0.28)"
                : "0 18px 50px rgba(0, 0, 0, 0.2)",
            }}
          >
            {plan.featured && (
              <span
                style={{
                  position: "absolute",
                  top: "18px",
                  right: "18px",
                  padding: "7px 12px",
                  borderRadius: "999px",
                  background: "#a78bfa",
                  color: "#1e1b4b",
                  fontSize: "12px",
                  fontWeight: 900,
                  textTransform: "uppercase",
                }}
              >
                Most Popular
              </span>
            )}

            <h2
              style={{
                margin: 0,
                fontSize: "30px",
              }}
            >
              {plan.name}
            </h2>

            <div style={{ marginTop: "22px" }}>
              <span
                style={{
                  color: "#a3e635",
                  fontSize: "34px",
                  fontWeight: 900,
                }}
              >
                {plan.price}
              </span>

              {plan.priceNote && (
                <span
                  style={{
                    marginLeft: "8px",
                    color: "#94a3b8",
                  }}
                >
                  {plan.priceNote}
                </span>
              )}
            </div>

            <p
              style={{
                marginTop: "18px",
                color: "#cbd5e1",
                lineHeight: 1.65,
              }}
            >
              {plan.description}
            </p>

            <ul
              style={{
                flex: 1,
                margin: "26px 0 0",
                paddingLeft: "20px",
                color: "#e2e8f0",
                lineHeight: 2,
              }}
            >
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            <Link
              href={
                plan.name === "Venue"
                  ? "/sign-up"
                  : "/sign-up"
              }
              style={{
                display: "block",
                marginTop: "30px",
                padding: "15px 20px",
                borderRadius: "999px",
                background: plan.featured
                  ? "#a3e635"
                  : "#a78bfa",
                color: "#172554",
                textAlign: "center",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              {plan.buttonText}
            </Link>
          </article>
        ))}
      </section>

      <section
        style={{
          maxWidth: "850px",
          margin: "70px auto 0",
          padding: "34px",
          textAlign: "center",
          borderRadius: "22px",
          background: "rgba(30, 41, 59, 0.76)",
          border: "1px solid #334155",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "30px",
          }}
        >
          Need a custom plan?
        </h2>

        <p
          style={{
            margin: "14px auto 0",
            color: "#cbd5e1",
            lineHeight: 1.7,
          }}
        >
          Contact Bingo to the Beats for schools, corporate events,
          large venues, and multi-location organizations.
        </p>

        <Link
          href="/sign-up"
          style={{
            display: "inline-block",
            marginTop: "22px",
            color: "#c4b5fd",
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          Contact us →
        </Link>
      </section>
    </main>
  );
}