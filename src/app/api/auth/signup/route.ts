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

export async function POST(req: NextRequest) {
  try {
    const body = ((await req.json().catch(() => ({}))) || {}) as SignupBody;

    const name = (body.name ?? "").trim();
    const emailRaw = body.email ?? "";
    const email = emailRaw.trim().toLowerCase();
    const password = body.password ?? "";
    const brokerage = (body.brokerage ?? "").trim();

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

    // ------- Check for existing account -------
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account already exists with that email." },
        { status: 400 }
      );
    }

    // ------- Create user -------
    const passwordHash = await hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
        brokerage: brokerage || null,
        // For now we treat email as verified on signup.
        emailVerified: new Date(),
      },
    });

    // Seed initial CRM activity
    await prisma.cRMActivity.create({
      data: {
        userId: user.id,
        type: "system",
        summary: "Avillo workspace created.",
        data: {},
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
          to: user.email,
          subject: "Welcome to Avillo",
          html: buildWelcomeEmailHtml({
            name: user.name,
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