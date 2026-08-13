import type { AuthRole } from "@/integrations/auth/types";
import type { RoleCategory } from "@/lib/reports-messages/types";

/** Role categories visible in the hub — admins see all. */
export function canAccessRoleCategory(
  authRole: AuthRole | null | undefined,
  roleCategory: RoleCategory,
): boolean {
  if (!authRole) return false;
  if (authRole === "admin") return true;
  return (
    roleCategory === "veterinary" ||
    roleCategory === "assistant" ||
    roleCategory === "secretary" ||
    roleCategory === "equipment_chief"
  );
}

export function accessibleRoleCategories(authRole: AuthRole | null | undefined): RoleCategory[] {
  const all: RoleCategory[] = ["veterinary", "assistant", "secretary", "equipment_chief"];
  return all.filter((category) => canAccessRoleCategory(authRole, category));
}

export function roleCategoryPath(category: RoleCategory): string {
  switch (category) {
    case "veterinary":
      return "/reports-messages/veterinary";
    case "assistant":
      return "/reports-messages/assistant";
    case "secretary":
      return "/reports-messages/secretary";
    case "equipment_chief":
      return "/reports-messages/equipment-chief";
  }
}
