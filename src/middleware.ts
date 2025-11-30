// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// All routes that should require a logged-in user
// (root of the app + all core portal pages)
const PROTECTED_PATHS = [
  "/",
  "/dashboard",
  "/intelligence",
  "/crm",
  "/listings",
  "/billing",
  "/account",
  "/admin",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`)
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- Public / always-allowed paths ----
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/api/auth") || // NextAuth internals
    pathname.startsWith("/_next") || // next.js assets
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // If this path isn't protected, just continue
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // ---- Check auth token ----
  const token = await getToken({ req });

  // No session → send to login with callbackUrl
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname || "/dashboard");
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated → allow request
  return NextResponse.next();
}

// Apply middleware to everything except Next.js internals; we manually
// exempt auth pages & api/auth above.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};