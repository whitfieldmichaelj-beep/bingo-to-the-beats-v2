import { clerkMiddleware } from "@clerk/nextjs/server";

const publicPaths = [
  "/",
  "/pricing",
  "/sign-in",
  "/sign-up",
];

function isPublicPath(pathname: string) {
  return publicPaths.some(
    (path) =>
      pathname === path ||
      pathname.startsWith(`${path}/`)
  );
}

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  if (!isPublicPath(pathname)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};