import Image from "next/image";
import { SignIn } from "@clerk/nextjs";
import LogoutLibraryNotice from "@/components/LogoutLibraryNotice";

type SignInPageProps = {
  searchParams: Promise<
    Record<
      string,
      string | string[] | undefined
    >
  >;
};

function firstValue(
  value: string | string[] | undefined
) {
  return Array.isArray(value)
    ? value[0]
    : value;
}

function safeReturnPath(
  value: string | undefined
) {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//")
  ) {
    return value;
  }

  return "/dashboard";
}

export default async function SignInPage({
  searchParams,
}: SignInPageProps) {
  const params = await searchParams;
  const explicitReturn =
    firstValue(params.returnTo);
  const returnTo =
    safeReturnPath(explicitReturn);
  const companionReconnect =
    firstValue(params.companion) === "1";

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
          width: "min(100%, 520px)",
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
          Welcome Back
        </h1>

        <LogoutLibraryNotice />

        {companionReconnect && (
          <div
            role="status"
            style={{
              margin: "0 auto 24px",
              padding: "14px 16px",
              maxWidth: "480px",
              border:
                "1px solid rgba(167,139,250,.55)",
              borderRadius: "12px",
              background:
                "rgba(49,46,129,.32)",
              lineHeight: 1.5,
              textAlign: "left",
            }}
          >
            <strong>
              Finish connecting BTTB Companion
            </strong>
            <div style={{ marginTop: "6px" }}>
              Sign back into the same BTTB
              account. After login, you will
              return to the Companion screen
              and the new login session will
              complete the Serato connection.
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "center",
          }}
        >
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            fallbackRedirectUrl={returnTo}
            forceRedirectUrl={
              explicitReturn
                ? returnTo
                : undefined
            }
          />
        </div>
      </section>
    </main>
  );
}
