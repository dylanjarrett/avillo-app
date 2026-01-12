// src/lib/auth.ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

/* ----------------------------------------
 * Types
 * ------------------------------------- */

type WorkspaceRoleWire = "OWNER" | "ADMIN" | "AGENT" | string;
type WorkspaceTypeWire = "PERSONAL" | "TEAM" | string;
type AccessWire = "BETA" | "PAID" | "EXPIRED" | string;
type PlanWire = "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE" | string;
type StatusWire = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | string;

type TokenShape = {
  id?: string;
  role?: string; // platform role (Avillo staff/admin)

  sessionKey?: string | null;
  email?: string | null;

  // Workspace context
  workspaceId?: string | null;
  workspaceRole?: WorkspaceRoleWire | null;

  // Workspace billing snapshot (for middleware + client UI)
  workspaceType?: WorkspaceTypeWire | null;
  accessLevel?: AccessWire | null;
  plan?: PlanWire | null;
  subscriptionStatus?: StatusWire | null;
  seatLimit?: number | null;
  includedSeats?: number | null;
};

/* ----------------------------------------
 * Utils
 * ------------------------------------- */

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function displayWorkspaceName(name?: string | null) {
  const n = String(name ?? "").trim();
  return n ? `${n}'s Workspace` : "My Workspace";
}

/**
 * Create a PERSONAL workspace + OWNER membership for the user,
 * and set user.defaultWorkspaceId.
 *
 * Important: billing defaults live on Workspace now.
 */
async function createPersonalWorkspaceForUser(userId: string, userName?: string | null) {
  const workspace = await prisma.workspace.create({
    data: {
      name: displayWorkspaceName(userName),
      type: "PERSONAL",
      createdByUserId: userId,

      // Billing defaults (source of truth)
      accessLevel: "EXPIRED",
      plan: "STARTER",
      subscriptionStatus: "NONE",
      seatLimit: 1,
      includedSeats: 1,
    },
    select: { id: true },
  });

  await prisma.workspaceUser.create({
    data: {
      workspaceId: workspace.id,
      userId,
      role: "OWNER",
    },
    select: { id: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { defaultWorkspaceId: workspace.id },
  });

  // Optional audit (best-effort)
  try {
    await prisma.cRMActivity.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: userId,
        type: "system",
        summary: "Workspace created.",
        data: { source: "createPersonalWorkspaceForUser" },
      },
    });
  } catch {
    // ignore
  }

  return workspace.id;
}

/**
 * Ensures user has:
 * - a defaultWorkspaceId
 * - membership in that workspace
 *
 * Returns workspace context for token hydration.
 */
async function ensureDefaultWorkspaceForUser(userId: string, userName?: string | null) {
  // 1) Prefer existing defaultWorkspaceId if valid + membership exists
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultWorkspaceId: true, name: true },
  });

  if (u?.defaultWorkspaceId) {
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId, workspaceId: u.defaultWorkspaceId, removedAt: null },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            type: true,
            accessLevel: true,
            plan: true,
            subscriptionStatus: true,
            seatLimit: true,
            includedSeats: true,
          },
        },
      },
    });

    if (membership?.workspace?.id) {
      return {
        workspaceId: membership.workspace.id,
        workspaceRole: String(membership.role),
        workspaceType: String(membership.workspace.type),
        accessLevel: String(membership.workspace.accessLevel),
        plan: String(membership.workspace.plan),
        subscriptionStatus: String(membership.workspace.subscriptionStatus),
        seatLimit: membership.workspace.seatLimit,
        includedSeats: membership.workspace.includedSeats,
      };
    }
  }

  // 2) Otherwise, pick a recent membership and set it as default
  const memberPick = await prisma.workspaceUser.findFirst({
    where: { userId, removedAt: null },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          type: true,
          accessLevel: true,
          plan: true,
          subscriptionStatus: true,
          seatLimit: true,
          includedSeats: true,
        },
      },
    },
  });

  if (memberPick?.workspace?.id) {
    await prisma.user.update({
      where: { id: userId },
      data: { defaultWorkspaceId: memberPick.workspace.id },
    });

    return {
      workspaceId: memberPick.workspace.id,
      workspaceRole: String(memberPick.role),
      workspaceType: String(memberPick.workspace.type),
      accessLevel: String(memberPick.workspace.accessLevel),
      plan: String(memberPick.workspace.plan),
      subscriptionStatus: String(memberPick.workspace.subscriptionStatus),
      seatLimit: memberPick.workspace.seatLimit,
      includedSeats: memberPick.workspace.includedSeats,
    };
  }

  // 3) Else create a PERSONAL workspace
  const wsId = await createPersonalWorkspaceForUser(userId, userName ?? u?.name ?? null);

  const ws = await prisma.workspace.findUnique({
    where: { id: wsId },
    select: { id: true, type: true, accessLevel: true, plan: true, subscriptionStatus: true, seatLimit: true, includedSeats: true },
  });

  return {
    workspaceId: wsId,
    workspaceRole: "OWNER",
    workspaceType: String(ws?.type ?? "PERSONAL"),
    accessLevel: String(ws?.accessLevel ?? "EXPIRED"),
    plan: String(ws?.plan ?? "STARTER"),
    subscriptionStatus: String(ws?.subscriptionStatus ?? "NONE"),
    seatLimit: ws?.seatLimit ?? 1,
    includedSeats: ws?.includedSeats ?? 1,
  };
}

/**
 * Pull fresh user + workspace context for token refresh.
 */
async function loadUserAndWorkspaceContext(userId: string) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      currentSessionKey: true,
      email: true,
      name: true,
      defaultWorkspaceId: true,
    },
  });

  // ensureDefaultWorkspaceForUser handles missing/invalid defaultWorkspaceId
  const ws = await ensureDefaultWorkspaceForUser(userId, dbUser?.name ?? null);

  return { dbUser, ws };
}

/* ----------------------------------------
 * NextAuth Config
 * ------------------------------------- */

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),

    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email);
        const password = String(credentials?.password ?? "");
        if (!email || !password) throw new Error("Missing email or password");

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, passwordHash: true },
        });

        if (!user || !user.passwordHash) throw new Error("Invalid login");
        const valid = await compare(password, user.passwordHash);
        if (!valid) throw new Error("Invalid login");

        return { id: user.id, email: user.email, name: user.name ?? null };
      },
    }),
  ],

  /* ----------------------------------------
   * Events
   * ------------------------------------- */

  events: {
    async createUser({ user }) {
      try {
        // Keep email normalized
        await prisma.user.update({
          where: { id: user.id },
          data: {
            email: user.email ? normalizeEmail(user.email) : undefined,
          },
        });

        // Ensure workspace + defaultWorkspaceId exist
        await ensureDefaultWorkspaceForUser(user.id, (user as any)?.name ?? null);
      } catch (e) {
        console.error("[auth.events.createUser] Failed:", e);
      }
    },
  },

  /* ----------------------------------------
   * Callbacks
   * ------------------------------------- */

  callbacks: {
    async jwt({ token, user, trigger }) {
      const t = token as TokenShape;

      // Initial sign-in
      if (user) {
        const userId = String((user as any).id);

        const dbUser = await prisma.user.update({
          where: { id: userId },
          data: {
            currentSessionKey: crypto.randomUUID(),
            lastLoginAt: new Date(),
            email: (user as any)?.email ? normalizeEmail((user as any).email) : undefined,
          },
          select: {
            id: true,
            role: true,
            currentSessionKey: true,
            email: true,
            name: true,
          },
        });

        const ws = await ensureDefaultWorkspaceForUser(dbUser.id, dbUser.name ?? null);

        t.id = dbUser.id;
        t.role = String(dbUser.role);
        t.sessionKey = dbUser.currentSessionKey ?? null;
        t.email = dbUser.email ? normalizeEmail(dbUser.email) : null;

        t.workspaceId = ws.workspaceId ?? null;
        t.workspaceRole = ws.workspaceRole ?? null;

        t.workspaceType = ws.workspaceType ?? null;
        t.accessLevel = ws.accessLevel ?? null;
        t.plan = ws.plan ?? null;
        t.subscriptionStatus = ws.subscriptionStatus ?? null;
        t.seatLimit = ws.seatLimit ?? null;
        t.includedSeats = ws.includedSeats ?? null;

        return token;
      }

      if (!t?.id) return token;

      // Client called useSession().update()
      if (trigger === "update") {
        try {
          const { dbUser, ws } = await loadUserAndWorkspaceContext(String(t.id));
          if (dbUser) {
            t.role = String(dbUser.role);
            t.sessionKey = dbUser.currentSessionKey ?? t.sessionKey ?? null;
            t.email = dbUser.email ? normalizeEmail(dbUser.email) : t.email ?? null;

            t.workspaceId = ws.workspaceId ?? t.workspaceId ?? null;
            t.workspaceRole = ws.workspaceRole ?? t.workspaceRole ?? null;

            t.workspaceType = ws.workspaceType ?? t.workspaceType ?? null;
            t.accessLevel = ws.accessLevel ?? t.accessLevel ?? null;
            t.plan = ws.plan ?? t.plan ?? null;
            t.subscriptionStatus = ws.subscriptionStatus ?? t.subscriptionStatus ?? null;
            t.seatLimit = ws.seatLimit ?? t.seatLimit ?? null;
            t.includedSeats = ws.includedSeats ?? t.includedSeats ?? null;
          }
        } catch {
          // keep token
        }
        return token;
      }

      // Safety net: hydrate missing fields
      if (!t.workspaceId || !t.workspaceRole || !t.plan || !t.accessLevel || !t.subscriptionStatus) {
        try {
          const { dbUser, ws } = await loadUserAndWorkspaceContext(String(t.id));
          if (dbUser) {
            t.role = String(dbUser.role);
            t.sessionKey = dbUser.currentSessionKey ?? t.sessionKey ?? null;
            t.email = dbUser.email ? normalizeEmail(dbUser.email) : t.email ?? null;

            t.workspaceId = ws.workspaceId ?? null;
            t.workspaceRole = ws.workspaceRole ?? null;

            t.workspaceType = ws.workspaceType ?? null;
            t.accessLevel = ws.accessLevel ?? null;
            t.plan = ws.plan ?? null;
            t.subscriptionStatus = ws.subscriptionStatus ?? null;
            t.seatLimit = ws.seatLimit ?? null;
            t.includedSeats = ws.includedSeats ?? null;
          }
        } catch {
          // ignore
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && token) {
        const t = token as TokenShape;

        (session.user as any).id = t.id;
        (session.user as any).role = t.role; // platform role

        (session.user as any).sessionKey = t.sessionKey ?? null;

        // Workspace context
        (session.user as any).workspaceId = t.workspaceId ?? null;
        (session.user as any).workspaceRole = t.workspaceRole ?? null;

        // Workspace billing snapshot
        (session.user as any).workspaceType = t.workspaceType ?? null;
        (session.user as any).accessLevel = t.accessLevel ?? null;
        (session.user as any).plan = t.plan ?? null;
        (session.user as any).subscriptionStatus = t.subscriptionStatus ?? null;
        (session.user as any).seatLimit = t.seatLimit ?? null;
        (session.user as any).includedSeats = t.includedSeats ?? null;

        // Normalize email
        if ((session.user as any).email) {
          (session.user as any).email = normalizeEmail((session.user as any).email);
        } else if (t.email) {
          (session.user as any).email = normalizeEmail(t.email);
        }
      }

      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

/* ----------------------------------------
 * Helpers
 * ------------------------------------- */

export async function getUser() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) return null;

  return prisma.user.findUnique({
    where: { id: sessionUser.id },
  });
}