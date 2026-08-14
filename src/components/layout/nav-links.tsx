"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/forms", key: "forms" },
  { href: "/sheets", key: "sheets" },
  { href: "/documents", key: "documents" },
  { href: "/tasks", key: "tasks" },
];

const ADMIN = [
  { href: "/employees", key: "employees" },
  { href: "/archive", key: "archive" },
];

/**
 * SPEC §4. Rows are 40px with 13px inline padding and a 3px inline-start bar that is
 * transparent until active, so the active item shifts nothing — it just fills in.
 *
 * `isAdmin` controls rendering only. The server enforces on every request regardless
 * (NFR-07); a hidden link is decoration, never protection.
 */
export function NavLinks({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const item = (href: string, key: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center border-s-[3px] ps-[10px] pe-[13px] text-[13.5px] transition-[color,background-color] duration-150",
          active
            ? "border-s-brand bg-brand-soft font-semibold text-violet-700"
            : "border-s-transparent text-ink-80 hover:bg-ground",
        )}
      >
        {t(key)}
      </Link>
    );
  };

  return (
    <>
      <nav className="flex flex-col" aria-label={t("sectionsLabel")}>
        {SECTIONS.map((s) => item(s.href, s.key))}
      </nav>
      {isAdmin ? (
        <>
          <div className="owner-line mx-4 mt-[22px] mb-2">{t("adminLabel")}</div>
          <nav className="flex flex-col" aria-label={t("adminLabel")}>
            {ADMIN.map((s) => item(s.href, s.key))}
          </nav>
        </>
      ) : null}
    </>
  );
}
