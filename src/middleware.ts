// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// All routes that should require a logged-in user
const PROTECTED_PATHS = [
  "/",
  "/dashboard",
  "/intelligence",
  "/people",
  "/listings",
  "/billing",
  "/account",
  "/autopilot",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`)
  );
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname === "/site.webmanifest" ||
    pathname === "/robots.txt"
  );
}

function normalizeAccessLevel(x: unknown) {
  const s = String(x || "").toUpperCase();
  if (s === "BETA") return "BETA";
  if (s === "PAID") return "PAID";
  if (s === "EXPIRED") return "EXPIRED";
  return "UNKNOWN";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ HARD RULE: never gate API routes with middleware.
  // (App Router API routes should be auth-checked inside the route handler.)
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ---- Public / always-allowed paths ----
  if (isPublicPath(pathname)) {
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

  // ---- Access enforcement (beta / expired) ----
  // We try to read accessLevel from the token first (fast).
  // If it’s not there, we fallback to /api/account/me.
  let accessLevel = normalizeAccessLevel((token as any)?.accessLevel);

  if (accessLevel === "UNKNOWN") {
    try {
      const meUrl = new URL("/api/account/me", req.url);
      const meRes = await fetch(meUrl.toString(), {
        headers: { cookie: req.headers.get("cookie") || "" },
        cache: "no-store",
      });

      if (meRes.ok) {
        const data = await meRes.json().catch(() => null);
        accessLevel = normalizeAccessLevel(data?.user?.accessLevel);
      }
    } catch {
      // If the lookup fails, don’t hard-block. Avoid accidental lockouts.
    }
  }

  // If access is expired, force them to Billing (but let Billing load)
  if (accessLevel === "EXPIRED" && !pathname.startsWith("/billing")) {
    const billingUrl = new URL("/billing", req.url);
    billingUrl.searchParams.set("reason", "upgrade_required");
    billingUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(billingUrl);
  }

  // Authenticated + allowed → continue
  return NextResponse.next();
}

// ✅ Apply middleware ONLY to non-API routes.
// This prevents /api/* from ever being intercepted.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};