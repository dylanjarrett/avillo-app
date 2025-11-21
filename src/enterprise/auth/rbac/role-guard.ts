export function requireRole(role, required){
  return role === required || role === "admin";
}
