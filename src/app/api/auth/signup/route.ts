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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildWorkspaceName(name: string) {
  const n = name.trim();
  if (!n) return "My Workspace";
  return n.endsWith("s") ? `${n}' Workspace` : `${n}'s Workspace`;
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
    if (!email || !isValidEmail(email)) {
      return jsonError("Please enter a valid email address.", 400);
    }
    if (!password || password.length < 8) {
      return jsonError("Password must be at least 8 characters long.", 400);
    }

    const { prisma } = await import("@/lib/prisma");

    const passwordHash = await hash(password, 10);

    // ---------------------------
    // Create user + workspace + OWNER membership (atomic)
    // Workspace is the billing source of truth in your schema.
    // ---------------------------
    let created: {
      user: { id: string; email: string; name: string | null; brokerage: string | null; role: any; defaultWorkspaceId: string | null };
      workspace: { id: string; name: string; type: any; accessLevel: any; plan: any; subscriptionStatus: any; seatLimit: number; includedSeats: number };
      membership: { workspaceId: string; role: any };
    };

    try {
      created = await prisma.$transaction(async (tx) => {
        // 1) User
        const user = await tx.user.create({
          data: {
            email,
            name: name || null,
            passwordHash,
            brokerage: brokerage || null,
            emailVerified: new Date(),
          },
          select: {
            id: true,
            email: true,
            name: true,
            brokerage: true,
            role: true,
            defaultWorkspaceId: true,
          },
        });

        // 2) Personal workspace (billing gates live here)
        const workspace = await tx.workspace.create({
          data: {
            name: buildWorkspaceName(name),
            type: "PERSONAL" as any,
            createdByUserId: user.id,

            // Billing defaults (workspace-first)
            accessLevel: "EXPIRED" as any,
            plan: "STARTER" as any,
            subscriptionStatus: "NONE" as any,
            trialEndsAt: null,
            currentPeriodEnd: null,

            // Seats defaults
            seatLimit: 1,
            includedSeats: 1,
          },
          select: {
            id: true,
            name: true,
            type: true,
            accessLevel: true,
            plan: true,
            subscriptionStatus: true,
            seatLimit: true,
            includedSeats: true,
          },
        });

        // 3) Membership (OWNER)
        const membership = await tx.workspaceUser.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role: "OWNER" as any,
          },
          select: { workspaceId: true, role: true },
        });

        // 4) Set user's default workspace
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: { defaultWorkspaceId: workspace.id },
          select: {
            id: true,
            email: true,
            name: true,
            brokerage: true,
            role: true,
            defaultWorkspaceId: true,
          },
        });

        // 5) Optional timeline seed (non-blocking)
        try {
          await tx.cRMActivity.create({
            data: {
              workspaceId: workspace.id,
              actorUserId: updatedUser.id,
              type: "system",
              summary: "Workspace created.",
              data: { source: "signup" },
            },
          });
        } catch {
          // ignore
        }

        return { user: updatedUser, workspace, membership };
      });
    } catch (e: any) {
      // Prisma unique constraint violation (email already exists)
      if (e?.code === "P2002") {
        return jsonError("An account already exists with that email.", 400);
      }
      throw e;
    }

    // ---------------------------
    // Fire-and-forget welcome email (feature-flagged)
    // ---------------------------
    const appUrl = process.env.NEXTAUTH_URL || "https://app.avillo.io";
    const logoUrl =
      process.env.AVILLO_LOGO_URL || "https://app.avillo.io/avillo-logo-cream.png";

    const welcomeDisabled =
      process.env.DISABLE_WELCOME_EMAIL === "true" ||
      process.env.DISABLE_BETA_EMAILS === "true";

    if (!welcomeDisabled) {
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
    }

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
          defaultWorkspaceId: created.user.defaultWorkspaceId,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[signup] error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t create your account right now. Try again or contact support@avillo.io.",
      },
      { status: 500 }
    );
  }
}