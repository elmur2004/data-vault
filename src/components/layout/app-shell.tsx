import { getTranslations } from "next-intl/server";
import { BrandMark } from "./brand-mark";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { GlobalSearch } from "./global-search";
import { UserMenu, type ShellUser } from "./user-menu";

/**
 * The frame (SPEC §4): 240px sidebar, 56px header, content on the ground colour.
 * Below `md` the sidebar becomes a drawer and the header collapses to
 * hamburger + mark + search + avatar (NFR-03).
 */
export async function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="flex min-h-dvh bg-ground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        {t("skipToContent")}
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-line-strong bg-white md:flex">
        <div className="px-4 pt-4 pb-[18px]">
          <BrandMark />
        </div>
        <NavLinks isAdmin={isAdmin} />
        <div className="mt-auto">
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line-strong bg-white px-2 md:px-5">
          <MobileNav isAdmin={isAdmin} />
          <div className="md:hidden">
            <BrandMark variant="mark" />
          </div>
          <GlobalSearch />
          <div className="md:hidden">
            <UserMenu user={user} compact />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 bg-ground p-4 md:px-6 md:py-5">
          {children}
        </main>
      </div>
    </div>
  );
}
