"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { NavLinks } from "./nav-links";
import { BrandMark } from "./brand-mark";

/** NFR-03: below `md` the sidebar becomes a drawer. The trigger is a 44px target. */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="inline-flex size-11 shrink-0 items-center justify-center text-ink md:hidden"
        aria-label={t("openMenu")}
      >
        <span className="flex flex-col gap-[4px]">
          <span className="h-[1.5px] w-[18px] bg-current" />
          <span className="h-[1.5px] w-[18px] bg-current" />
          <span className="h-[1.5px] w-[18px] bg-current" />
        </span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/45 md:hidden" />
        <Dialog.Content
          className="fixed inset-y-0 start-0 z-50 flex w-[272px] flex-col border-e border-line-strong bg-white focus:outline-none md:hidden"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between px-4 pt-4 pb-[18px]">
            <Dialog.Title asChild>
              <div>
                <BrandMark />
              </div>
            </Dialog.Title>
            <Dialog.Close
              className="-me-2 inline-flex size-11 items-center justify-center text-ink-60"
              aria-label={t("closeMenu")}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path
                  d="M2 2 L12 12M12 2 L2 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
            </Dialog.Close>
          </div>
          <NavLinks isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
