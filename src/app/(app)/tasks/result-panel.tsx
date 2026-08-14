"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Textarea, Input } from "@/components/ui/field";
import { AlertIcon, CloseIcon, FileIcon } from "@/components/ui/icons";
import { formatDate } from "@/lib/datetime";
import { completeTaskAction, uploadAttachmentAction } from "@/server/tasks/actions";
import type { TaskRow } from "./tasks-client";

type PendingFile = { fileId: string; filename: string; sizeBytes: number };
type PendingLink = { url: string; label: string };

/**
 * §9.3 / FR-T04–T08 — the result panel.
 *
 * Three equal-weight ways in — text, files, links — and **one** save that records the
 * result and completes the task. There is no second confirm and no separate complete
 * control, because the whole point of the gate is to make one action out of two.
 *
 * The button is disabled only while all three are empty; the server re-checks anyway
 * and returns 422 if anything gets past (BR-05, AC-08).
 */
export function ResultPanel({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const t = useTranslations("tasks.result");
  const tc = useTranslations("common");
  const router = useRouter();

  const [text, setText] = useState(task.resultText ?? "");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [links, setLinks] = useState<PendingLink[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();

  const hasExisting = task.fileCount > 0 || task.linkCount > 0;
  const canSave =
    Boolean(text.trim()) || files.length > 0 || links.some((l) => l.url.trim()) || hasExisting;

  /**
   * The panel quotes the figure that will actually be stored, so nobody is surprised
   * by the number afterwards (design annotation 17).
   */
  const daysLate = useMemo(() => {
    if (task.status !== "OPEN") return 0;
    const deadline = new Date(task.deadline);
    const today = new Date();
    const d = Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate());
    const n = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(0, Math.round((n - d) / 86400000));
  }, [task.deadline, task.status]);

  async function onChooseFiles(list: FileList) {
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await uploadAttachmentAction(fd);
        if (res.ok) {
          setFiles((f) => [
            ...f,
            { fileId: res.fileId, filename: res.filename, sizeBytes: res.sizeBytes },
          ]);
        } else {
          toast.error(res.message);
        }
      }
    } finally {
      setUploading(false);
    }
  }

  function save() {
    start(async () => {
      const res = await completeTaskAction(task.id, {
        resultText: text.trim() ? text.trim() : null,
        fileIds: files.map((f) => f.fileId),
        links: links
          .filter((l) => l.url.trim())
          .map((l) => ({ url: l.url.trim(), label: l.label.trim() || null })),
      });

      if (res.ok) {
        toast.success(t("completed"));
        onClose();
        router.refresh();
      } else if (res.code === "RESULT_REQUIRED") {
        // The server's answer, surfaced as guidance rather than a bare error.
        toast.error(t("needSomething"));
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t("title")}
        className="sm:w-[min(640px,calc(100vw-2rem))]"
        headerExtra={
          <>
            <p className="mt-[7px] text-[13.5px] font-semibold text-ink">{task.name}</p>
            <p className="tabular mt-1 text-[12px] text-ink-60">
              {t("meta", {
                name: task.employeeName,
                created: formatDate(task.createdAt),
                deadline: formatDate(task.deadline),
              })}
            </p>
          </>
        }
      >
        {/* States a consequence, not a scolding. */}
        {daysLate > 0 ? (
          <div className="-mx-5 flex items-center gap-[10px] bg-accent-soft px-5 py-[10px] text-accent-text sm:-mx-6 sm:px-6">
            <AlertIcon />
            <span className="text-[12.5px] leading-[1.4] font-semibold">
              {t("lateWarning", { days: daysLate })}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="result-text" className="label-caps">
              {t("whatHappened")}
            </label>
            <Textarea
              id="result-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <span className="text-[11.5px] text-ink-60">{t("anyOneIsEnough")}</span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label-caps">{t("files")}</span>
            {files.map((f) => (
              <div
                key={f.fileId}
                className="flex items-center gap-[10px] rounded-xs border border-line-strong px-3 py-[10px]"
              >
                <span className="text-ink-60">
                  <FileIcon />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{f.filename}</span>
                <span className="tabular text-[11.5px] text-ink-60">
                  {t("fileSize", { kb: Math.max(1, Math.round(f.sizeBytes / 1024)) })}
                </span>
                <button
                  type="button"
                  aria-label={t("removeFile")}
                  title={t("removeFile")}
                  onClick={() => setFiles((all) => all.filter((x) => x.fileId !== f.fileId))}
                  className="inline-flex size-7 items-center justify-center rounded-xs border border-transparent text-ink-60 hover:border-line-strong hover:text-accent-text"
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            ))}
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xs border border-dashed border-ink-30 p-[14px]">
              <span className="text-[12.5px] text-ink-60">{t("dropFiles")}</span>
              <span className="inline-flex h-8 shrink-0 items-center rounded-xs border border-line-strong bg-white px-3 text-[12.5px] font-semibold text-ink-80">
                {uploading ? t("uploading") : t("chooseFiles")}
              </span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) void onChooseFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label-caps">{t("links")}</span>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={l.url}
                  aria-label={t("linkAddress")}
                  placeholder="https://"
                  onChange={(e) =>
                    setLinks((all) => all.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                  }
                  className="min-w-0 flex-1"
                />
                <Input
                  value={l.label}
                  aria-label={t("linkLabel")}
                  onChange={(e) =>
                    setLinks((all) =>
                      all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  className="w-[150px] shrink-0"
                />
                <button
                  type="button"
                  aria-label={t("removeLink")}
                  title={t("removeLink")}
                  onClick={() => setLinks((all) => all.filter((_, j) => j !== i))}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xs border border-line-strong text-ink-60 hover:text-accent-text"
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLinks((all) => [...all, { url: "", label: "" }])}
              className="self-start text-[12.5px] font-semibold text-violet-700 hover:text-brand"
            >
              {t("addAnotherLink")}
            </button>
          </div>
        </div>

        <DialogFooter className="-mx-5 mt-2 items-center border-t border-line-strong bg-ground px-5 py-4 sm:-mx-6 sm:px-6">
          <span className="flex-1 text-[11.5px] leading-[1.5] text-ink-60">{t("footnote")}</span>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="lg">
              {tc("cancel")}
            </Button>
          </DialogClose>
          <Button
            type="button"
            size="lg"
            onClick={save}
            disabled={pending || uploading || !canSave}
            title={canSave ? undefined : t("needSomething")}
          >
            {pending ? tc("saving") : t("saveAndComplete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
