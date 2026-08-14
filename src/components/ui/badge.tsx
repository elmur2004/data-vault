import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * skills/ui-design semantic mapping:
 *   ByteForce  → orange tint    B-Systems → violet tint
 *   type badges → Mist (quiet — a type is metadata, not a signal)
 *   overdue / late → orange-600 (the only place orange means anything)
 *
 * Contrast: #F15C24 fails AA on white for body text, so small text uses the darker
 * --color-accent-text (#D94E18) or sits on the orange-100 tint.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-xs px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        byteforce: "bg-accent-soft text-accent-text",
        bsystems: "bg-brand-soft text-violet-700",
        quiet: "bg-mist text-ink-80",
        late: "bg-accent-soft text-accent-text",
        ok: "bg-mist text-ink-60",
        outline: "border border-line-strong text-ink-60",
      },
    },
    defaultVariants: { variant: "quiet" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function CompanyBadge({ company, label }: { company: "BYTEFORCE" | "BSYSTEMS"; label: string }) {
  return <Badge variant={company === "BYTEFORCE" ? "byteforce" : "bsystems"}>{label}</Badge>;
}
