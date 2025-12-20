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
};

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
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.passwordHash) {
          throw new Error("Invalid login");
        }

        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) {
          throw new Error("Invalid login");
        }

        return user as unknown as AdapterUser;
      },
    }),
  ],

  /**
   * ✅ Ensures first-time Google OAuth users default to paywalled state,
   * even though NextAuth/PrismaAdapter creates them automatically.
   */
  events: {
    async createUser({ user }) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
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
     * - On initial sign-in, `user` is defined.
     * - On subsequent requests, `user` is undefined, but `token` persists.
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
          },
          select: {
            id: true,
            role: true,
            plan: true,
            accessLevel: true,
            subscriptionStatus: true,
            currentSessionKey: true,
          },
        });

        (token as TokenShape).id = dbUser.id;
        (token as TokenShape).role = String(dbUser.role);
        (token as TokenShape).plan = String(dbUser.plan);
        (token as TokenShape).accessLevel = String(dbUser.accessLevel);
        (token as TokenShape).subscriptionStatus = dbUser.subscriptionStatus
          ? String(dbUser.subscriptionStatus)
          : null;
        (token as TokenShape).sessionKey = dbUser.currentSessionKey ?? null;

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
            },
          });

          if (dbUser) {
            t.role = String(dbUser.role);
            t.plan = String(dbUser.plan);
            t.accessLevel = String(dbUser.accessLevel);
            t.subscriptionStatus = dbUser.subscriptionStatus ? String(dbUser.subscriptionStatus) : null;
            t.sessionKey = dbUser.currentSessionKey ?? t.sessionKey ?? null;
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
            },
          });

          if (dbUser) {
            t.role = String(dbUser.role);
            t.plan = String(dbUser.plan);
            t.accessLevel = String(dbUser.accessLevel);
            t.subscriptionStatus = dbUser.subscriptionStatus ? String(dbUser.subscriptionStatus) : null;
            t.sessionKey = dbUser.currentSessionKey ?? t.sessionKey ?? null;
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
