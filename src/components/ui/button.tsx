import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Controls are 2px-radius rectangles. Violet is brand and primary action; orange is
 * the accent and the overdue signal only, so `archive` is the single orange control
 * and it is outlined rather than filled.
 *
 * Not `transition-colors`: that animates outline-color too, which would make the
 * focus ring fade in through the wrong colour (NFR-11).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xs font-semibold transition-[color,background-color,border-color] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border border-transparent bg-brand text-white hover:bg-brand-hover",
        secondary:
          "border border-line-strong bg-white text-ink-80 hover:border-ink-30 hover:text-ink",
        archive:
          "border border-accent-text bg-white text-accent-text hover:bg-accent-soft",
        soft: "border border-brand bg-brand-soft text-violet-700 hover:bg-violet-100",
        ghost: "border border-transparent text-violet-700 hover:text-brand",
      },
      size: {
        // Filter-row controls
        sm: "h-[34px] px-[10px] text-[13px]",
        // Page and dialog actions
        md: "h-9 px-4 text-[13px]",
        // Dialog footer, empty-state call to action
        lg: "h-[38px] px-[18px] text-[13px]",
        // Mobile: 44px minimum target
        touch: "h-11 px-4 text-[13.5px]",
        icon: "size-8",
        link: "h-auto p-0 text-[12.5px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

/** A square icon button with a required accessible name. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(({ className, label, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    title={label}
    className={cn(
      "inline-flex size-8 shrink-0 items-center justify-center rounded-xs border border-transparent text-ink-60 hover:border-line-strong hover:text-ink",
      className,
    )}
    {...props}
  >
    {children}
  </button>
));
IconButton.displayName = "IconButton";

export { buttonVariants };
