import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Create Your Account</h1>

        <p>
          Registration is required to host or join a game.
        </p>

        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
        />
      </section>
    </main>
  );
}
