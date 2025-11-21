// src/types/next-auth.d.ts

import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
      brokerage: string | null;
    };
  }

  interface User {
    brokerage?: string | null;
  }
}