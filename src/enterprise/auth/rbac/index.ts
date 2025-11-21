// Role-Based Access Control (Enterprise)
export const roles = ["agent", "teamLead", "admin"];

export const permissions = {
  agent: ["viewDashboard", "generateAI"],
  teamLead: ["viewDashboard", "generateAI", "manageTeam"],
  admin: ["viewDashboard", "generateAI", "manageTeam", "manageBilling", "manageSystem"]
};

export function hasPermission(role, action) {
  return permissions[role]?.includes(action);
}
