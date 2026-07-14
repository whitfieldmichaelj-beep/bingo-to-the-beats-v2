import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Log In</h1>
        <p>Secure account login is being prepared.</p>

        <Link href="/" className="pricing-button">
          Back to Home
        </Link>
      </section>
    </main>
  );
}