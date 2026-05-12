export type DashboardNavItem = { label: string; href: string };

/** High-level IA from product brief — routes are scaffolding until domains land. */
export const dashboardNavItems: DashboardNavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Release planning", href: "/dashboard/release-planning" },
  { label: "Calendar", href: "/dashboard/calendar" },
  { label: "Validations", href: "/dashboard/validations" },
  { label: "Deployments", href: "/dashboard/deployments" },
  { label: "Approvals", href: "/dashboard/approvals" },
  { label: "Support assistant", href: "/dashboard/support" },
  { label: "Knowledge base", href: "/dashboard/knowledge" },
  { label: "Reports", href: "/dashboard/reports" },
  { label: "Automations", href: "/dashboard/automations" },
  { label: "Settings", href: "/dashboard/settings" },
];
