import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "h-10 w-full rounded-xs border bg-white px-3 text-sm text-ink placeholder:text-ink-30",
      "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-60",
      invalid ? "border-accent-text" : "border-line-strong focus:border-brand",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "min-h-20 w-full rounded-xs border bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-30",
      invalid ? "border-accent-text" : "border-line-strong focus:border-brand",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "h-10 w-full rounded-xs border bg-white px-3 text-sm text-ink",
      invalid ? "border-accent-text" : "border-line-strong focus:border-brand",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

/**
 * Label, control and error as one unit. Errors are field-level and specific
 * (AC-02 tone: say what is wrong and how to fix it), and wired with
 * aria-describedby so screen readers get them too (NFR-11).
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? (
          <span aria-hidden className="ms-1 text-accent-text">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-60">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-semibold text-accent-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
