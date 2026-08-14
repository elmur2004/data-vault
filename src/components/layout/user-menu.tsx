"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/server/auth/actions";

export type ShellUser = {
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
};

/**
 * Sidebar foot: 32px violet-100 avatar, name at 12.5/600, role at 10.5 ink-60, and a
 * plain "Sign out" link at 11/600 violet-700. On mobile it collapses to the avatar.
 */
export function UserMenu({ user, compact = false }: { user: ShellUser; compact?: boolean }) {
  const t = useTranslations("common");
  const tRole = useTranslations("roles");

  const avatar = (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xs bg-brand-soft text-[12px] font-semibold text-violet-700">
      {initials(user.name)}
    </span>
  );

  if (compact) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="inline-flex size-11 items-center justify-center"
          aria-label={user.name}
        >
          {avatar}
        </DropdownMenu.Trigger>
        <Content user={user} signOutLabel={t("signOut")} role={tRole(user.role)} />
      </DropdownMenu.Root>
    );
  }

  return (
    <div className="flex items-center gap-[10px] border-t border-line-strong px-[14px] py-3">
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-ink">{user.name}</span>
        <span className="block text-[10.5px] text-ink-60">{tRole(user.role)}</span>
      </span>
      <form action={signOutAction} className="shrink-0">
        <button
          type="submit"
          className="text-[11px] font-semibold text-violet-700 hover:text-brand"
        >
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}

function Content({
  user,
  signOutLabel,
  role,
}: {
  user: ShellUser;
  signOutLabel: string;
  role: string;
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={6}
        align="end"
        className="z-50 min-w-56 border border-line-strong bg-white p-1 shadow-md"
      >
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <span className="truncate text-[12.5px] font-semibold text-ink">{user.name}</span>
          <span className="truncate text-[11px] text-ink-60">{user.email}</span>
          <span className="label-caps text-[9.5px]">{role}</span>
        </div>
        <DropdownMenu.Separator className="my-1 h-px bg-line-strong" />
        <DropdownMenu.Item asChild>
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full cursor-pointer px-2 py-2 text-start text-[13px] font-semibold text-violet-700 outline-none data-highlighted:bg-ground"
            >
              {signOutLabel}
            </button>
          </form>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
