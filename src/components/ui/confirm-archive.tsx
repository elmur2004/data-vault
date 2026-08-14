"use client";

import { useTranslations } from "next-intl";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "./dialog";

/**
 * BR-11 / AC-15 — the interface may say Delete, but the behaviour is archival, and the
 * confirm says so plainly rather than implying destruction.
 */
export function ConfirmArchive({
  open,
  name,
  onCancel,
  onConfirm,
  pending,
}: {
  open: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const t = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      {open ? (
        <DialogContent
          title={t("archiveConfirmTitle", { name })}
          description={t("archiveConfirmBody")}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="lg">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="button" variant="archive" size="lg" disabled={pending} onClick={onConfirm}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
