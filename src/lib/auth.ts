// src/lib/auth.ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions, User } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

type TokenShape = {
  id?: string;
  role?: string;
  plan?: string;
  accessLevel?: string;
  subscriptionStatus?: string | null;
  sessionKey?: string | null;
  email?: string | null;
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

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

      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email);
        const password = String(credentials?.password ?? "");

        if (!email || !password) {
          throw new Error("Missing email or password");
        }

        const user = await prisma.user.findUnique({
          where: { email }, // ✅ normalized (case-insensitive behavior via normalization)
        });

        if (!user || !user.passwordHash) {
          throw new Error("Invalid login");
        }

        const valid = await compare(password, user.passwordHash);
        if (!valid) {
          throw new Error("Invalid login");
        }

        return user as unknown as AdapterUser;
      },
    }),
  ],

  /**
   * ✅ Ensures first-time Google OAuth users default to paywalled state,
   * and normalizes their email so the DB never stores mixed-case emails.
   */
  events: {
    async createUser({ user }) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            // ✅ Normalize OAuth email to keep DB consistent (important for case-insensitive login expectations)
            email: user.email ? normalizeEmail(user.email) : undefined,

            accessLevel: "EXPIRED" as any,
            plan: "STARTER" as any,
            subscriptionStatus: "NONE" as any,
            trialEndsAt: null,
            currentPeriodEnd: null,
          },
        });

        try {
          await prisma.cRMActivity.create({
            data: {
              userId: user.id,
              type: "system",
              summary: "Avillo workspace created.",
              data: { accessLevel: "EXPIRED", source: "oauth_create_user" },
            },
          });
        } catch {
          // ignore
        }
      } catch (e) {
        console.error("[auth.events.createUser] Failed to set defaults:", e);
      }
    },
  },

  callbacks: {
    /**
     * Runs when a JWT is created or updated.
     *
     * ✅ IMPORTANT FIX:
     * When the client calls `useSession().update()`, NextAuth sets `trigger === "update"`.
     * We use that moment to pull fresh plan/accessLevel from DB so middleware stops using stale EXPIRED.
     */
    async jwt({ token, user, trigger }) {
      // On initial sign-in, `user` is defined
      if (user) {
        const dbUser = await prisma.user.update({
          where: { id: (user as User).id },
          data: {
            // Rotate session key on every new login
            currentSessionKey: crypto.randomUUID(),
            lastLoginAt: new Date(),

            // ✅ Keep email normalized (covers edge cases where user.email might be mixed-case)
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
          },
        });

        const t = token as TokenShape;

        t.id = dbUser.id;
        t.role = String(dbUser.role);
        t.plan = String(dbUser.plan);
        t.accessLevel = String(dbUser.accessLevel);
        t.subscriptionStatus = dbUser.subscriptionStatus ? String(dbUser.subscriptionStatus) : null;
        t.sessionKey = dbUser.currentSessionKey ?? null;
        t.email = dbUser.email ? normalizeEmail(dbUser.email) : null;

        return token;
      }

      const t = token as TokenShape;
      if (!t?.id) return token;

      // ✅ If billing page calls `useSession().update()`, resync from DB
      if (trigger === "update") {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: String(t.id) },
            select: {
              role: true,
              plan: true,
              accessLevel: true,
              subscriptionStatus: true,
              currentSessionKey: true,
              email: true,
            },
          });

          if (dbUser) {
            t.role = String(dbUser.role);
            t.plan = String(dbUser.plan);
            t.accessLevel = String(dbUser.accessLevel);
            t.subscriptionStatus = dbUser.subscriptionStatus ? String(dbUser.subscriptionStatus) : null;
            t.sessionKey = dbUser.currentSessionKey ?? t.sessionKey ?? null;
            t.email = dbUser.email ? normalizeEmail(dbUser.email) : t.email ?? null;
          }
        } catch {
          // keep existing token if DB read fails
        }

        return token;
      }

      /**
       * Existing session:
       * Keep token as-is, but make sure accessLevel/subscriptionStatus are present.
       * This protects you if older tokens were created before you added these fields.
       */
      if (!t.accessLevel || !t.plan || !t.role) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: String(t.id) },
            select: {
              id: true,
              role: true,
              plan: true,
              accessLevel: true,
              subscriptionStatus: true,
              currentSessionKey: true,
              email: true,
            },
          });

          if (dbUser) {
            t.role = String(dbUser.role);
            t.plan = String(dbUser.plan);
            t.accessLevel = String(dbUser.accessLevel);
            t.subscriptionStatus = dbUser.subscriptionStatus ? String(dbUser.subscriptionStatus) : null;
            t.sessionKey = dbUser.currentSessionKey ?? t.sessionKey ?? null;
            t.email = dbUser.email ? normalizeEmail(dbUser.email) : t.email ?? null;
          }
        } catch {
          // keep existing token if DB read fails
        }
      }

      return token;
    },

    /**
     * Controls what goes into `session` on the client.
     */
    async session({ session, token }) {
      if (session.user && token) {
        const t = token as TokenShape;

        (session.user as any).id = t.id;
        (session.user as any).role = t.role;
        (session.user as any).plan = t.plan;
        (session.user as any).accessLevel = t.accessLevel;
        (session.user as any).subscriptionStatus = t.subscriptionStatus ?? null;
        (session.user as any).sessionKey = t.sessionKey ?? null;

        // ✅ Keep session email normalized (optional but keeps consistency everywhere)
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

export async function getUser() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });

  return user;
}