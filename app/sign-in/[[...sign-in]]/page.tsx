import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Welcome Back</h1>

        <p>Sign in to continue to Bingo to the Beats.</p>

        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
        />
      </section>
    </main>
  );
}