import { clerkMiddleware } from "@clerk/nextjs/server";

const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/dj-console",
  "/serato",
  "/music",
  "/host",
  "/game/new",
  "/game/details",
  "/game/control",
  "/game/caller",
];

const PROTECTED_API_PREFIXES = [
  "/api/game/create",
  "/api/serato",
  "/api/spotify",
  "/api/apple-music",
];

function matchesProtectedPath(
  pathname: string,
  prefixes: string[]
): boolean {
  return prefixes.some((prefix) => {
    return (
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`)
    );
  });
}

export default clerkMiddleware(
  async (auth, request) => {
    const pathname = request.nextUrl.pathname;

    const isProtectedPage = matchesProtectedPath(
      pathname,
      PROTECTED_PAGE_PREFIXES
    );

    const isProtectedApi = matchesProtectedPath(
      pathname,
      PROTECTED_API_PREFIXES
    );

    if (!isProtectedPage && !isProtectedApi) {
      return;
    }

    const {
      isAuthenticated,
      redirectToSignIn,
    } = await auth();

    if (!isAuthenticated) {
      return redirectToSignIn({
        returnBackUrl: request.url,
      });
    }
  }
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

