"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Hit = { id: string; title: string; subtitle: string | null; href: string; meta?: string[] };
type Results = {
  term: string;
  total: number;
  groups: { forms: Hit[]; sheets: Hit[]; documents: Hit[]; tasks: Hit[] };
};

const GROUP_ORDER = ["documents", "tasks", "sheets", "forms"] as const;
type GroupKey = (typeof GROUP_ORDER)[number];

const EMPTY: Results = {
  term: "",
  total: 0,
  groups: { forms: [], sheets: [], documents: [], tasks: [] },
};

/**
 * SPEC §10.1 / AC-17 — one search, results grouped by section, driven from the
 * keyboard. Ctrl/⌘ K from anywhere, arrows to move, Enter to open, Esc to close.
 *
 * "Findability is the entire premise" — so the trigger is a visible field, not a
 * hidden shortcut, and the panel opens under it rather than covering the page.
 */
export function GlobalSearch() {
  const t = useTranslations("search");
  const tGroup = useTranslations("search.grouped");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flattened, in the order the panel renders them, so arrow keys are trivial.
  const flat = useMemo(() => {
    const out: { group: GroupKey; hit: Hit }[] = [];
    for (const g of GROUP_ORDER) for (const hit of results.groups[g]) out.push({ group: g, hit });
    return out;
  }, [results]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = term.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    // `stale` guards against an earlier keystroke's response landing after a later
    // one, and guarantees `loading` is cleared on every path — otherwise a cancelled
    // request leaves the panel showing "Searching…" forever.
    let stale = false;
    setLoading(true);

    // Debounce — NFR-02 wants results in under a second, not a request per keystroke.
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then(async (res) => (res.ok ? ((await res.json()) as Results) : EMPTY))
        .catch(() => EMPTY)
        .then((data) => {
          if (stale) return;
          setResults(data);
          setActive(0);
          setLoading(false);
        });
    }, 160);

    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [term, open]);

  const go = useCallback(
    (hit: Hit) => {
      setOpen(false);
      setTerm("");
      router.push(hit.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flat[active];
      if (target) go(target.hit);
    }
  };

  let index = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-xs border border-line-strong px-[10px] text-ink-60 md:w-[420px] md:flex-none"
      >
        <SearchIcon />
        <span className="flex-1 truncate text-start text-[13px] text-ink-30">
          {t("placeholder")}
        </span>
        <kbd className="hidden shrink-0 rounded-xs bg-mist px-[6px] py-[2px] font-mono text-[10px] font-semibold text-ink-60 sm:inline">
          {t("shortcutHint")}
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink/45"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="mx-auto flex h-14 max-w-[1760px] items-center border-b border-line-strong bg-white px-2 md:ps-[260px] md:pe-5">
            <div className="flex h-[34px] w-full items-center gap-2 rounded-xs border border-brand px-[10px] outline-2 outline-brand outline-offset-2 md:w-[560px]">
              <SearchIcon />
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label={t("label")}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-30"
                placeholder={t("placeholder")}
              />
              <kbd className="shrink-0 rounded-xs bg-mist px-[6px] py-[2px] font-mono text-[10px] font-semibold text-ink-60">
                {t("escHint")}
              </kbd>
            </div>
          </div>

          <div className="mx-auto max-w-[1760px] px-2 md:ps-[260px] md:pe-5">
            <div className="w-full border border-line-strong bg-white shadow-lg md:w-[560px]">
              <div className="flex items-center justify-between gap-3 border-b border-line-strong bg-ground px-[14px] py-[10px]">
                <span className="tabular text-[11.5px] text-ink-60">
                  {loading
                    ? t("searching")
                    : term.trim().length < 2
                      ? t("typeToSearch")
                      : t("resultCount", { count: results.total })}
                </span>
                <span className="hidden font-mono text-[10px] tracking-[.06em] text-ink-60 sm:inline">
                  {t("keyHint")}
                </span>
              </div>

              <div className="max-h-[60dvh] overflow-y-auto py-2">
                {results.total === 0 && term.trim().length >= 2 && !loading ? (
                  <div className="px-[14px] py-6">
                    <p className="text-[13px] font-semibold text-ink">
                      {t("noResults", { term: results.term || term })}
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-60">{t("noResultsHint")}</p>
                  </div>
                ) : null}

                {GROUP_ORDER.map((group) => {
                  const hits = results.groups[group];
                  if (hits.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="mt-[6px] border-t border-line-strong px-[14px] pt-3 pb-[6px] text-[10px] font-semibold tracking-[.12em] text-ink-60 uppercase first:mt-0 first:border-t-0 first:pt-2">
                        {tGroup(group)} · {hits.length}
                      </div>
                      {hits.map((hit) => {
                        index += 1;
                        const isActive = index === active;
                        return (
                          <button
                            key={hit.id}
                            type="button"
                            onMouseEnter={() => setActive(flat.findIndex((f) => f.hit.id === hit.id))}
                            onClick={() => go(hit)}
                            className={cn(
                              "flex w-full items-center gap-3 border-s-[3px] px-[14px] py-[9px] text-start",
                              isActive
                                ? "border-s-brand bg-brand-soft"
                                : "border-s-transparent hover:bg-ground",
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "block truncate text-[13.5px] font-semibold",
                                  isActive ? "text-violet-700" : "text-ink",
                                )}
                              >
                                {hit.title}
                              </span>
                              {hit.subtitle ? (
                                <span className="mt-0.5 block truncate text-[11.5px] text-ink-60">
                                  {hit.subtitle}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line x1="9.4" y1="9.4" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
