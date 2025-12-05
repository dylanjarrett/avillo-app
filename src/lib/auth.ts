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
  callbacks: {
    // Runs when a new JWT is created or updated.
    async jwt({ token, user }) {
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
            currentSessionKey: true,
          },
        });

        token.id = dbUser.id;
        (token as any).role = dbUser.role;
        (token as any).plan = dbUser.plan;
        (token as any).sessionKey = dbUser.currentSessionKey;

        return token;
      }

      // For existing sessions, just keep current token as-is
      return token;
    },

    // Controls what goes into `session` on the client
    async session({ session, token }) {
      if (session.user && token) {
        (session.user as any).id = token.id;
        (session.user as any).role = (token as any).role;
        (session.user as any).plan = (token as any).plan;
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