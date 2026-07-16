import Image from "next/image";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "72px 24px 100px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(100%, 560px)",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "28px",
          }}
        >
          <Image
            src="/logo.png"
            alt="Bingo to the Beats"
            width={160}
            height={160}
            priority
            style={{
              width: "150px",
              height: "auto",
            }}
          />
        </div>

        <h1
          style={{
            margin: "0 0 28px",
            fontSize: "42px",
          }}
        >
          Create Your Account
        </h1>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
          }}
        >
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            forceRedirectUrl="/dashboard"
          />
        </div>
      </section>
    </main>
  );
}