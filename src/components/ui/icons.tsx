/**
 * The design's own icon set, inlined. Small, single-stroke, no library — these are
 * the exact paths from the handoff so weights match the rest of the interface.
 */

export function ExternalLinkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path
        d="M7.5 2h4.5v4.5M12 2 L6.5 7.5M10 8.5V12H2V4h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

export function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M7 1.5v7.5M4 6.5 L7 9.5 L10 6.5M2 11.5h10" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M1 7s2.2-3.8 6-3.8S13 7 13 7s-2.2 3.8-6 3.8S1 7 1 7Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <span className="inline-flex items-center gap-[2px]" aria-hidden>
      <span className="size-[2.5px] bg-current" />
      <span className="size-[2.5px] bg-current" />
      <span className="size-[2.5px] bg-current" />
    </span>
  );
}

export function CheckIcon({ size = 12, stroke = "currentColor" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={(size * 10) / 12} viewBox="0 0 12 10" aria-hidden>
      <path d="M1 5.2 L4.2 8.4 L11 1.4" fill="none" stroke={stroke} strokeWidth="1.7" />
    </svg>
  );
}

export function ChevronIcon({ dir = "down", size = 10 }: { dir?: "down" | "up"; size?: number }) {
  return (
    <svg width={size} height={(size * 6) / 10} viewBox="0 0 10 6" aria-hidden>
      <path
        d={dir === "down" ? "M1 1 L5 5 L9 1" : "M1 5 L5 1 L9 5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M2 2 L12 12M12 2 L2 12" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function AlertIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.2v3.4M7 9.4v.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function FileIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 16) / 14} viewBox="0 0 14 16" aria-hidden className="shrink-0">
      <path d="M2 1h6l4 4v10H2V1Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1v4h4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
