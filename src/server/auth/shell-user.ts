import "server-only";
import type { ShellUser } from "@/components/layout/user-menu";
import { requireUserPage } from "./guards";

/**
 * The identity the app shell renders (name, role, sign-out).
 *
 * Nothing authorises off this value — every server action and route handler calls
 * requireUser()/requireAdmin() independently (NFR-07, skills/auth-roles). It exists
 * so the shell knows which navigation to draw.
 */
export async function getShellUser(): Promise<ShellUser> {
  const user = await requireUserPage();
  return { name: user.name, email: user.email, role: user.role };
}
