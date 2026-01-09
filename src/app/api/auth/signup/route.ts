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

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as SignupBody | null;

    const name = String(body?.name ?? "").trim();
    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? "");
    const brokerage = String(body?.brokerage ?? "").trim();

    // ---------------------------
    // Validation
    // ---------------------------
    if (!email || !email.includes("@")) return jsonError("Please enter a valid email address.", 400);
    if (!password || password.length < 8) return jsonError("Password must be at least 8 characters long.", 400);

    const { prisma } = await import("@/lib/prisma");

    // ---------------------------
    // Create user + workspace + OWNER membership (atomic)
    // ---------------------------
    const passwordHash = await hash(password, 10);

    let created: {
      user: { id: string; email: string; name: string | null; brokerage: string | null; role: any };
      workspace: { id: string; name: string };
      membership: { workspaceId: string; role: any };
    };

    try {
      created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            name: name || null,
            passwordHash,
            brokerage: brokerage || null,

            // If you still want "verified on signup"
            emailVerified: new Date(),

            // Billing defaults
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
            role: true,
          },
        });

        const workspace = await tx.workspace.create({
          data: {
            name: name ? `${name}'s Workspace` : "My Workspace",
            ownerId: user.id,
          },
          select: { id: true, name: true },
        });

        const membership = await tx.workspaceUser.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role: "OWNER" as any,
          },
          select: { workspaceId: true, role: true },
        });

        // Optional timeline seed (non-blocking if it fails)
        try {
          await tx.cRMActivity.create({
            data: {
              workspaceId: workspace.id,
              actorUserId: user.id,
              type: "system",
              summary: "Workspace created.",
              data: { source: "signup" },
            },
          });
        } catch {
          // ignore
        }

        return { user, workspace, membership };
      });
    } catch (e: any) {
      // Prisma unique constraint violation (email already exists)
      if (e?.code === "P2002") {
        return jsonError("An account already exists with that email.", 400);
      }
      throw e;
    }

    // ---------------------------
    // Fire-and-forget welcome email
    // ---------------------------
    const appUrl = process.env.NEXTAUTH_URL || "https://app.avillo.io";
    const logoUrl = process.env.AVILLO_LOGO_URL || "https://app.avillo.io/avillo-logo-cream.png";

    void (async () => {
      try {
        await sendEmail({
          to: created.user.email,
          subject: "Welcome to Avillo",
          html: buildWelcomeEmailHtml({
            name: created.user.name,
            appUrl,
            logoUrl,
          }),
        });
      } catch (err) {
        console.error("[signup] Welcome email failed (non-blocking):", err);
      }
    })();

    // ---------------------------
    // Response
    // ---------------------------
    return NextResponse.json(
      {
        success: true,
        user: {
          id: created.user.id,
          email: created.user.email,
          name: created.user.name,
          brokerage: created.user.brokerage ?? null,

          // Platform role (Avillo staff layer)
          platformRole: String(created.user.role),

          // Workspace context (team layer)
          workspaceId: created.workspace.id,
          workspaceRole: String(created.membership.role),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[signup] error:", err);
    return NextResponse.json(
      { error: "We couldn’t create your account right now. Try again or contact support@avillo.io." },
      { status: 500 }
    );
  }
}