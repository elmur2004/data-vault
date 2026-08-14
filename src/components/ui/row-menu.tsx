"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MoreIcon } from "./icons";

/** The row overflow: edit and archive live here, per the design's table pattern. */
export function RowMenu({
  items,
  className,
}: {
  items: { label: string; onSelect: () => void; danger?: boolean }[];
  className?: string;
}) {
  const t = useTranslations("common");
  if (items.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-xs border border-transparent text-ink-60 hover:border-line-strong hover:text-ink",
          className,
        )}
        aria-label={t("actions")}
        title={t("actions")}
      >
        <MoreIcon />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-44 border border-line-strong bg-white p-1 shadow-md"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              onSelect={item.onSelect}
              className={cn(
                "cursor-pointer px-2 py-2 text-[13px] outline-none data-highlighted:bg-ground",
                item.danger ? "text-accent-text" : "text-ink-80 data-highlighted:text-ink",
              )}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** An anchor styled as an icon button — never a <button> wrapping an <a>. */
export function IconLink({
  href,
  label,
  children,
  external,
  className,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-xs border border-transparent text-ink-60 hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {children}
    </a>
  );
}
