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
  "/tasks",
  "/hub",
  "/comms",
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
    // invite flows should be reachable before auth so they can sign in / create account
    pathname.startsWith("/invite") ||
    pathname.startsWith("/signup-invite") ||
    // next-auth routes
    pathname.startsWith("/api/auth") ||
    // next/static
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    // common public files
    pathname === "/favicon.ico" ||
    pathname === "/site.webmanifest" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

function normalizeAccessLevel(x: unknown) {
  const s = String(x || "").toUpperCase();
  if (s === "BETA") return "BETA";
  if (s === "PAID") return "PAID";
  if (s === "EXPIRED") return "EXPIRED";
  return "UNKNOWN";
}

/**
 * Safe internal callbackUrl:
 * - keeps full path + query
 * - only allows internal relative paths
 */
function safeCallbackFromRequest(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const raw = `${pathname}${search || ""}`;

  // must be relative + internal (block protocol-relative like //evil.com)
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";

  // avoid loops
  if (raw.startsWith("/login") || raw.startsWith("/signup")) return "/dashboard";

  return raw || "/dashboard";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // public and non-protected routes pass through
  if (isPublicPath(pathname)) return NextResponse.next();
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const token = await getToken({ req });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", safeCallbackFromRequest(req));
    return NextResponse.redirect(loginUrl);
  }

  const accessLevel = normalizeAccessLevel((token as any)?.accessLevel);

  // If access is expired, force them to Billing (but let Billing load)
  if (accessLevel === "EXPIRED" && !pathname.startsWith("/billing")) {
    const billingUrl = new URL("/billing", req.url);
    billingUrl.searchParams.set("reason", "upgrade_required");
    billingUrl.searchParams.set("callbackUrl", safeCallbackFromRequest(req));
    return NextResponse.redirect(billingUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and common public files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest).*)"],
};