// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PATHS = [
  "/",
  "/dashboard",
  "/intelligence",
  "/people",
  "/listings",
  "/billing",
  "/account",
  "/autopilot",
  "/workspace",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
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

  // ✅ never gate API routes in middleware
  if (pathname.startsWith("/api")) return NextResponse.next();

  if (isPublicPath(pathname)) return NextResponse.next();
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const token = await getToken({ req });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname || "/dashboard");
    return NextResponse.redirect(loginUrl);
  }

  const accessLevel = normalizeAccessLevel((token as any)?.accessLevel);

  // If access is expired, force them to Billing (but let Billing load)
  if (accessLevel === "EXPIRED" && !pathname.startsWith("/billing")) {
    const billingUrl = new URL("/billing", req.url);
    billingUrl.searchParams.set("reason", "upgrade_required");
    billingUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(billingUrl);
  }

  // Unknown => don’t hard-block (prevents accidental lockouts)
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};