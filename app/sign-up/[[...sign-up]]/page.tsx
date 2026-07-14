import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Create Your Account</h1>
        <p>Registration is being prepared for BTTB v2.</p>

        <Link href="/pricing" className="pricing-button">
          View Pricing
        </Link>
      </section>
    </main>
  );
}