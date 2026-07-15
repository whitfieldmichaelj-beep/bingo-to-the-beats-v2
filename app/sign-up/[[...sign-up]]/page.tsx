import Image from "next/image";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "72px 24px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(100%, 560px)",
          margin: "0 auto",
          padding: "36px",
          textAlign: "center",
          borderRadius: "24px",
          background: "rgba(15, 23, 42, 0.94)",
          border: "1px solid #334155",
          boxShadow: "0 24px 70px rgba(0, 0, 0, 0.28)",
        }}
      >
        <Image
          src="/logo.png"
          alt="Bingo to the Beats"
          width={190}
          height={190}
          priority
          style={{
            width: "170px",
            height: "auto",
          }}
        />

        <h1
          style={{
            margin: "22px 0 0",
            fontSize: "42px",
          }}
        >
          Create Your Account
        </h1>

        <p
          style={{
            margin: "14px auto 0",
            color: "#cbd5e1",
            lineHeight: 1.7,
          }}
        >
          Registration will be required to host or join Bingo to the
          Beats games.
        </p>

        <div
          style={{
            marginTop: "28px",
            padding: "20px",
            borderRadius: "16px",
            background: "rgba(163, 230, 53, 0.08)",
            border: "1px solid rgba(163, 230, 53, 0.25)",
            color: "#d9f99d",
          }}
        >
          Account registration is being prepared.
        </div>

        <Link
          href="/pricing"
          style={{
            display: "inline-block",
            marginTop: "28px",
            padding: "14px 22px",
            borderRadius: "999px",
            background: "#a3e635",
            color: "#172554",
            textDecoration: "none",
            fontWeight: 900,
          }}
        >
          View Pricing
        </Link>

        <p
          style={{
            marginTop: "24px",
            color: "#94a3b8",
          }}
        >
          Already have an account?{" "}
          <Link
            href="/sign-in"
            style={{
              color: "#c4b5fd",
              fontWeight: 800,
            }}
          >
            Log In
          </Link>
        </p>
      </section>
    </main>
  );
}