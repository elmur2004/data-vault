"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CloseIcon } from "./icons";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Sharp-cornered panel, 640px by default. Full screen below `sm` (NFR-03), with the
 * footer sticky so the primary action is always reachable on a phone.
 */
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    title: string;
    description?: string;
    /** Extra identity under the title — the result panel puts the task there. */
    headerExtra?: React.ReactNode;
  }
>(({ className, children, title, description, headerExtra, ...props }, ref) => {
  const t = useTranslations("common");
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/55" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-0 z-50 flex flex-col gap-5 overflow-y-auto bg-white p-5 focus:outline-none",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[88dvh] sm:w-[min(640px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:border-line-strong sm:p-6 sm:shadow-lg",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="display text-[16px] text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-[7px] text-[13px] leading-[1.55] text-ink-60">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
            {headerExtra}
          </div>
          <DialogPrimitive.Close
            className="-me-1 inline-flex size-8 shrink-0 items-center justify-center text-ink-60 hover:text-ink"
            aria-label={t("close")}
          >
            <CloseIcon />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = "DialogContent";

export function DialogFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 mt-auto flex flex-wrap justify-end gap-2 bg-white pt-2 sm:static",
        className,
      )}
    >
      {children}
    </div>
  );
}
