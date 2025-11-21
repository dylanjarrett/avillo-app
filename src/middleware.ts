// src/middleware.ts

import { NextResponse } from "next/server";
import { getUserRole } from "@/enterprise/auth/rbac/user-role";

export function middleware(req: Request) {
  // Get role from our stub (later: from session / token)
  const role = getUserRole(req);

  // If you ever want to protect routes, you can add checks here.
  // For now, just allow everything through if role exists.
  if (!role) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}