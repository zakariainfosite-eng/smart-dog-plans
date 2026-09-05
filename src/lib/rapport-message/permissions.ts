import type { AuthRole, AuthUser } from "@/integrations/auth/types";
import type { RapportMessage } from "@/lib/rapport-message/types";

/** Any signed-in role may open the page. The route already requires authentication. */
export function canAccessRapportMessagePage(role: AuthRole | null | undefined): boolean {
  return role === "admin" || role === "user";
}

export function canViewRapportMessage(
  document: RapportMessage,
  user: AuthUser | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(document.createdByUserId) && document.createdByUserId === user.id;
}

export function visibleRapportMessages(
  documents: RapportMessage[],
  user: AuthUser | null | undefined,
): RapportMessage[] {
  return documents.filter((document) => canViewRapportMessage(document, user));
}
