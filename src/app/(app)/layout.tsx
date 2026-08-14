import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { getShellUser } from "@/server/auth/shell-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getShellUser();
  return (
    <AppShell user={user}>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </AppShell>
  );
}
