// src/app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { sendEmail } from "@/lib/resendClient";
import { buildWelcomeEmailHtml } from "@/lib/emails/welcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignupBody = {
  name?: string;
  email?: string;
  password?: string;
  brokerage?: string;
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = ((await req.json().catch(() => ({}))) || {}) as SignupBody;

    const name = String(body.name ?? "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const brokerage = String(body.brokerage ?? "").trim();

    // ------- Basic validation -------
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const { prisma } = await import("@/lib/prisma");

    // ------- Create user (case-insensitive by normalization) -------
    // NOTE: This assumes your DB has a unique constraint on User.email.
    // If two requests race, Prisma will throw a unique constraint error (P2002) — we handle it below.
    const passwordHash = await hash(password, 10);

    let user:
      | {
          id: string;
          email: string;
          name: string | null;
          brokerage: string | null;
        }
      | null = null;

    try {
      user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          passwordHash,
          brokerage: brokerage || null,

          // For now we treat email as verified on signup.
          emailVerified: new Date(),

          // ✅ Monetization defaults
          // New users are paywalled until they start a Stripe trial/plan.
          accessLevel: "EXPIRED" as any,
          plan: "STARTER" as any,
          subscriptionStatus: "NONE" as any,
          trialEndsAt: null,
          currentPeriodEnd: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          brokerage: true,
        },
      });
    } catch (e: any) {
      // Prisma unique constraint violation (race condition / existing email)
      if (e?.code === "P2002") {
        return NextResponse.json(
          { error: "An account already exists with that email." },
          { status: 400 }
        );
      }
      throw e;
    }

    // Seed initial CRM activity (keep your exact behavior)
    await prisma.cRMActivity.create({
      data: {
        userId: user.id,
        type: "system",
        summary: "Avillo workspace created.",
        data: { accessLevel: "EXPIRED" },
      },
    });

    // ------- Fire-and-forget welcome email (non-blocking) -------
    const appUrl = process.env.NEXTAUTH_URL || "https://app.avillo.io";
    const logoUrl =
      process.env.AVILLO_LOGO_URL ||
      "https://app.avillo.io/avillo-logo-cream.png";

    (async () => {
      try {
        await sendEmail({
          to: user!.email,
          subject: "Welcome to Avillo",
          html: buildWelcomeEmailHtml({
            name: user!.name,
            appUrl,
            logoUrl,
          }),
        });
      } catch (err) {
        console.error("Welcome email failed (non-blocking):", err);
      }
    })();

    // ------- Response to client -------
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        brokerage: user.brokerage ?? null,
      },
    });
  } catch (err) {
    console.error("signup error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t create your account right now. Try again or contact support@avillo.io.",
      },
      { status: 500 }
    );
  }
}