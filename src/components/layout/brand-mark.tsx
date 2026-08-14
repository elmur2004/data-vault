import { useTranslations } from "next-intl";

/** The mark, inline so it can be sized and never recoloured by accident. */
export function LogoMark({ width = 22 }: { width?: number }) {
  return (
    <svg
      viewBox="0 0 475 360"
      style={{ width, height: "auto" }}
      className="block shrink-0"
      aria-hidden
    >
      <g fill="#F15C24">
        <rect x="0" y="0" width="42" height="256" />
        <rect x="0" y="214" width="475" height="42" />
        <polygon points="170,256 260,256 260,270 170,359" />
      </g>
    </svg>
  );
}

/**
 * Sidebar identity: mark + VAULT at 15/600 with .16em tracking, and the owner line
 * at 9/600 with .14em beneath it. `variant="mark"` is the mobile header, where the
 * search field needs the width.
 */
export function BrandMark({ variant = "full" }: { variant?: "full" | "mark" }) {
  const t = useTranslations("app");
  if (variant === "mark") return <LogoMark width={20} />;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-[9px]">
        <LogoMark width={22} />
        <span className="wordmark text-[15px] text-violet-700">{t("name")}</span>
      </div>
      <div className="owner-line mt-[7px]">{t("owner")}</div>
    </div>
  );
}
