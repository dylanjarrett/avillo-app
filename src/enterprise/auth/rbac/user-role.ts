// src/enterprise/auth/rbac/user-role.ts

// Very simple stub for now – later you can wire this to NextAuth / JWT / cookies
export function getUserRole(_req: any): string {
  // TEMP: always treat as logged-in agent
  return "agent";
}
