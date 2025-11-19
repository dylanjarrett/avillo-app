// src/app/api/[...nextauth]/route.ts

import NextAuth, { type NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  providers: [
    // ================================
    // Credentials Login
    // ================================
    CredentialsProvider({
      name: "Email + Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        // Lookup user
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.passwordHash) return null;

        // Validate password
        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        // Return minimal user object
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
        };
      },
    }),

    // ================================
    // Google OAuth
    // ================================
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),

    // ================================
    // Apple OAuth
    // ================================
    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID ?? "",
      clientSecret: process.env.APPLE_CLIENT_SECRET ?? "",
    }),
  ],

  // ================================
  // JWT & Session Callbacks
  // ================================
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User | null }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },

    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }) {
      if (session.user && token.id) {
        session.user.id = token.id;
      }
      return session;
    },
  },
};

// Export handlers for Next.js App Router
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };