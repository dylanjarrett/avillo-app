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

type TokenShape = {
  id?: string;

  // Platform (Avillo staff) role
  role?: string;

  // Billing / access
  plan?: string;
  accessLevel?: string;
  subscriptionStatus?: string | null;

  sessionKey?: string | null;
  email?: string | null;

  // Workspace context (tenant/team layer)
  workspaceId?: string | null;
  workspaceRole?: string | null; // OWNER | ADMIN | AGENT
};

/* ----------------------------------------
 * Utils
 * ------------------------------------- */

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Ensures a user has at least one workspace membership.
 * Returns the workspace context (workspaceId + workspaceRole).
 *
 * - If membership exists, returns the first one.
 * - Else creates a workspace and OWNER membership.
 */
async function ensureWorkspaceForUser(userId: string, name?: string | null) {
  const existing = await prisma.workspaceUser.findFirst({
    where: { userId },
    select: { workspaceId: true, role: true },
  });

  if (existing?.workspaceId) {
    return {
      workspaceId: existing.workspaceId,
      workspaceRole: String(existing.role),
    };
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: name ? `${name}'s Workspace` : "My Workspace",
      ownerId: userId,
    },
    select: { id: true },
  });

  const membership = await prisma.workspaceUser.create({
    data: {
      workspaceId: workspace.id,
      userId,
      role: "OWNER" as any,
    },
    select: { role: true },
  });

  // Optional: timeline/audit
  try {
    await prisma.cRMActivity.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: userId,
        type: "system",
        summary: "Workspace created.",
        data: { source: "ensureWorkspaceForUser" },
      },
    });
  } catch {
    // ignore
  }

  return {
    workspaceId: workspace.id,
    workspaceRole: String(membership.role),
  };
}

/**
 * Pull fresh user + workspace context for token hydration/refresh.
 */
async function loadUserContext(userId: string) {
  const [dbUser, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        plan: true,
        accessLevel: true,
        subscriptionStatus: true,
        currentSessionKey: true,
        email: true,
        name: true,
      },
    }),
    prisma.workspaceUser.findFirst({
      where: { userId },
      select: { workspaceId: true, role: true },
    }),
  ]);

  return { dbUser, membership };
}

/* ----------------------------------------
 * NextAuth Config
 * ------------------------------------- */

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,

  session: {
    strategy: "jwt",
  },

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

      /**
       * IMPORTANT:
       * Return a minimal user object (id/email/name) — do NOT return the full Prisma user model.
       * This avoids NextAuth serialization errors after schema changes.
       */
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

  /**
   * Runs when NextAuth creates a new user via OAuth (Google).
   * We normalize email + set billing defaults + ensure workspace membership.
   */
  events: {
    async createUser({ user }) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            email: user.email ? normalizeEmail(user.email) : undefined,

            accessLevel: "EXPIRED" as any,
            plan: "STARTER" as any,
            subscriptionStatus: "NONE" as any,
            trialEndsAt: null,
            currentPeriodEnd: null,
          },
        });

        await ensureWorkspaceForUser(user.id, (user as any)?.name ?? null);
      } catch (e) {
        console.error("[auth.events.createUser] Failed:", e);
      }
    },
  },

  /* ----------------------------------------
   * Callbacks
   * ------------------------------------- */

  callbacks: {
    /**
     * JWT lifecycle
     */
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
            plan: true,
            accessLevel: true,
            subscriptionStatus: true,
            currentSessionKey: true,
            email: true,
            name: true,
          },
        });

        const ws = await ensureWorkspaceForUser(dbUser.id, dbUser.name ?? null);

        t.id = dbUser.id;
        t.role = String(dbUser.role);
        t.plan = String(dbUser.plan);
        t.accessLevel = String(dbUser.accessLevel);
        t.subscriptionStatus = dbUser.subscriptionStatus ? String(dbUser.subscriptionStatus) : null;
        t.sessionKey = dbUser.currentSessionKey ?? null;
        t.email = dbUser.email ? normalizeEmail(dbUser.email) : null;

        t.workspaceId = ws.workspaceId;
        t.workspaceRole = ws.workspaceRole;

        return token;
      }

      if (!t?.id) return token;

      // Client called useSession().update()
      if (trigger === "update") {
        try {
          const { dbUser, membership } = await loadUserContext(String(t.id));

          if (dbUser) {
            t.role = String(dbUser.role);
            t.plan = String(dbUser.plan);
            t.accessLevel = String(dbUser.accessLevel);
            t.subscriptionStatus = dbUser.subscriptionStatus ? String(dbUser.subscriptionStatus) : null;
            t.sessionKey = dbUser.currentSessionKey ?? t.sessionKey ?? null;
            t.email = dbUser.email ? normalizeEmail(dbUser.email) : t.email ?? null;

            t.workspaceId = membership?.workspaceId ?? t.workspaceId ?? null;
            t.workspaceRole = membership?.role ? String(membership.role) : t.workspaceRole ?? null;
          }
        } catch {
          // keep token
        }

        return token;
      }

      // Safety net for older tokens or missing workspace context
      if (!t.role || !t.plan || !t.accessLevel || !t.workspaceId || !t.workspaceRole) {
        try {
          const { dbUser, membership } = await loadUserContext(String(t.id));
          if (dbUser) {
            t.role = String(dbUser.role);
            t.plan = String(dbUser.plan);
            t.accessLevel = String(dbUser.accessLevel);
            t.subscriptionStatus = dbUser.subscriptionStatus ? String(dbUser.subscriptionStatus) : null;
            t.sessionKey = dbUser.currentSessionKey ?? t.sessionKey ?? null;
            t.email = dbUser.email ? normalizeEmail(dbUser.email) : t.email ?? null;

            t.workspaceId = membership?.workspaceId ?? null;
            t.workspaceRole = membership?.role ? String(membership.role) : null;
          }
        } catch {
          // ignore
        }
      }

      return token;
    },

    /**
     * Client-visible session shape
     */
    async session({ session, token }) {
      if (session.user && token) {
        const t = token as TokenShape;

        (session.user as any).id = t.id;
        (session.user as any).role = t.role; // platform role (Avillo staff layer)

        (session.user as any).plan = t.plan;
        (session.user as any).accessLevel = t.accessLevel;
        (session.user as any).subscriptionStatus = t.subscriptionStatus ?? null;
        (session.user as any).sessionKey = t.sessionKey ?? null;

        (session.user as any).workspaceId = t.workspaceId ?? null;
        (session.user as any).workspaceRole = t.workspaceRole ?? null; // team layer

        // Keep email normalized
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