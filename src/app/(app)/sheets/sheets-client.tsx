"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge, CompanyBadge } from "@/components/ui/badge";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowMenu, IconLink } from "@/components/ui/row-menu";
import { ConfirmArchive } from "@/components/ui/confirm-archive";
import { DownloadIcon, ExternalLinkIcon } from "@/components/ui/icons";
import { formatDate, toDateInputValue } from "@/lib/datetime";
import {
  archiveSheetAction,
  saveSheetAction,
  uploadSheetFileAction,
  type SheetActionResult,
} from "@/server/sheets/actions";

type SheetType = "LEADS" | "EMPLOYEES" | "DATA" | "CAMPAIGN_LEADS";

export type SheetRow = {
  id: string;
  name: string;
  storageMode: "LINK" | "FILE";
  url: string | null;
  fileId: string | null;
  fileName: string | null;
  dateCreated: string;
  company: "BYTEFORCE" | "BSYSTEMS";
  type: SheetType;
  lastRecordCount: number | null;
  lastRecordCountAsOf: string | null;
  notes: string | null;
};

const TYPES: SheetType[] = ["LEADS", "EMPLOYEES", "DATA", "CAMPAIGN_LEADS"];

export function SheetsClient({
  page,
  total,
  isAdmin,
}: {
  page: { rows: SheetRow[]; total: number; page: number; perPage: number; pages: number };
  total: number;
  isAdmin: boolean;
}) {
  const t = useTranslations("sheets");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const tType = useTranslations("sheets.types");
  const [editing, setEditing] = useState<SheetRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<SheetRow | null>(null);
  const [, start] = useTransition();

  /** §6.3.1 — the number is meaningless without its date, so they render together. */
  const records = (s: SheetRow) =>
    s.lastRecordCount == null || !s.lastRecordCountAsOf ? (
      <span className="text-ink-30">{t("recordsUnknown")}</span>
    ) : (
      <span className="tabular">
        <span className="text-[15px] font-semibold text-ink">
          {s.lastRecordCount.toLocaleString("en")}
        </span>
        <span className="ms-1 text-[12px] text-ink-60">
          {t("asOf", { date: formatDate(s.lastRecordCountAsOf) })}
        </span>
      </span>
    );

  const columns: Column<SheetRow>[] = [
    {
      key: "name",
      header: t("columns.name"),
      width: 190,
      mobile: "title",
      cell: (s) => <span className="text-[14px] font-semibold text-ink">{s.name}</span>,
    },
    {
      key: "type",
      header: t("columns.type"),
      width: 112,
      cell: (s) => <Badge variant="quiet">{tType(s.type)}</Badge>,
    },
    {
      key: "company",
      header: tc("company"),
      width: 100,
      mobile: "badge",
      cell: (s) => <CompanyBadge company={s.company} label={tCompany(s.company)} />,
    },
    {
      key: "dateCreated",
      header: t("columns.created"),
      width: 96,
      cell: (s) => <span className="tabular">{formatDate(s.dateCreated)}</span>,
    },
    { key: "records", header: t("columns.records"), width: 158, cell: records },
    {
      key: "notes",
      header: t("columns.notes"),
      cell: (s) => <span className="line-clamp-2">{s.notes ?? "—"}</span>,
    },
  ];

  const openControl = (s: SheetRow) =>
    s.storageMode === "LINK" && s.url ? (
      <IconLink href={s.url} label={t("openSheet")} external>
        <ExternalLinkIcon />
      </IconLink>
    ) : s.fileId ? (
      <IconLink href={`/api/files/${s.fileId}`} label={t("downloadSheet")}>
        <DownloadIcon />
      </IconLink>
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar
            searchPlaceholder={t("searchPlaceholder")}
            total={total}
            filtered={page.total}
            countLabel={(shown, all) => tc("countOf", { shown, total: all, unit: t("unit") })}
            selects={[
              {
                name: "company",
                label: tc("allCompanies"),
                options: [
                  { value: "BYTEFORCE", label: tCompany("BYTEFORCE") },
                  { value: "BSYSTEMS", label: tCompany("BSYSTEMS") },
                ],
              },
              {
                name: "type",
                label: tc("allTypes"),
                options: TYPES.map((v) => ({ value: v, label: tType(v) })),
              },
            ]}
          />
        </div>
        {isAdmin ? (
          <Button className="mb-3" onClick={() => setAdding(true)}>
            {t("add")}
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={page.rows}
        rowKey={(s) => s.id}
        emptyState={
          <EmptyState
            title={t("empty.title")}
            body={t("empty.body")}
            note={isAdmin ? undefined : t("empty.employeeNote")}
            action={
              isAdmin ? (
                <Button size="lg" onClick={() => setAdding(true)}>
                  {t("empty.action")}
                </Button>
              ) : undefined
            }
          />
        }
        actions={(s) => (
          <>
            {openControl(s)}
            {isAdmin ? (
              <RowMenu
                items={[
                  { label: tc("edit"), onSelect: () => setEditing(s) },
                  { label: tc("delete"), onSelect: () => setConfirm(s), danger: true },
                ]}
              />
            ) : null}
          </>
        )}
        mobileActions={(s) => (
          <>
            <Button asChild variant="secondary" size="touch" className="flex-1">
              <a
                href={s.storageMode === "LINK" ? (s.url ?? "#") : `/api/files/${s.fileId}`}
                {...(s.storageMode === "LINK" ? { target: "_blank", rel: "noreferrer noopener" } : {})}
              >
                {s.storageMode === "LINK" ? t("openSheet") : t("downloadSheet")}
              </a>
            </Button>
            {isAdmin ? (
              <RowMenu
                className="size-11 border border-line-strong"
                items={[
                  { label: tc("edit"), onSelect: () => setEditing(s) },
                  { label: tc("delete"), onSelect: () => setConfirm(s), danger: true },
                ]}
              />
            ) : null}
          </>
        )}
      />

      <Pagination page={page.page} pages={page.pages} total={page.total} perPage={page.perPage} />

      <SheetDialog
        key={editing?.id ?? "new"}
        open={adding || Boolean(editing)}
        sheet={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />

      <ConfirmArchive
        open={Boolean(confirm)}
        name={confirm?.name ?? ""}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          start(async () => {
            if (!confirm) return;
            const res = await archiveSheetAction(confirm.id);
            if (res.ok) toast.success(tc("archived", { name: confirm.name }));
            else toast.error(res.message ?? tc("somethingWentWrong"));
            setConfirm(null);
          })
        }
      />
    </div>
  );
}

/**
 * BR-02 made visible: the storage mode is a two-option radio, and choosing one hides
 * the other's field entirely. The invalid states are unreachable in the UI, and
 * refused again by the server and the database if anything else tries.
 */
function SheetDialog({
  open,
  sheet,
  onClose,
}: {
  open: boolean;
  sheet: SheetRow | null;
  onClose: () => void;
}) {
  const t = useTranslations("sheets");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const tType = useTranslations("sheets.types");

  const [state, action, pending] = useActionState<SheetActionResult | null, FormData>(
    saveSheetAction,
    null,
  );
  const [mode, setMode] = useState<"LINK" | "FILE">(sheet?.storageMode ?? "LINK");
  const [upload, setUpload] = useState<{
    fileId: string;
    filename: string;
    count: number | null;
    asOf: string | null;
    headerDetected: boolean;
    countable: boolean;
  } | null>(
    sheet?.fileId
      ? {
          fileId: sheet.fileId,
          filename: sheet.fileName ?? "",
          count: sheet.lastRecordCount,
          asOf: sheet.lastRecordCountAsOf,
          headerDetected: false,
          countable: sheet.lastRecordCount != null,
        }
      : null,
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(sheet ? tc("saved") : t("created"));
      onClose();
    } else if (state && !state.ok && !state.fieldErrors) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state && !state.ok ? state.fieldErrors : undefined;

  async function onFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (sheet?.fileId) fd.set("previousFileId", sheet.fileId);
      const res = await uploadSheetFileAction(fd);
      if (res.ok) {
        setUpload({
          fileId: res.fileId,
          filename: res.filename,
          count: res.count,
          asOf: res.asOf,
          headerDetected: res.headerDetected,
          countable: res.countable,
        });
      } else {
        toast.error(res.message);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <DialogContent title={sheet ? t("edit") : t("add")}>
          <form action={action} className="flex flex-col gap-5">
            {sheet ? <input type="hidden" name="id" value={sheet.id} /> : null}
            <input type="hidden" name="storageMode" value={mode} />
            {mode === "FILE" && upload ? (
              <>
                <input type="hidden" name="fileId" value={upload.fileId} />
                <input type="hidden" name="computedCount" value={upload.count ?? ""} />
                <input type="hidden" name="computedAsOf" value={upload.asOf ?? ""} />
              </>
            ) : null}

            <Field id="sheet-name" label={t("columns.name")} error={errors?.name} required>
              <Input id="sheet-name" name="name" defaultValue={sheet?.name ?? ""} required maxLength={160} />
            </Field>

            {/* BR-02 — exactly one of the two. */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-ink">{t("storageMode")}</legend>
              <p className="text-xs text-ink-60">{t("modeHint")}</p>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                {(["LINK", "FILE"] as const).map((m) => (
                  <label
                    key={m}
                    className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xs border px-3 py-2 text-[13px] ${
                      mode === m
                        ? "border-brand bg-brand-soft font-semibold text-violet-700"
                        : "border-line-strong bg-white text-ink-80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="storageModeChoice"
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      className="accent-[#53449B]"
                    />
                    {m === "LINK" ? t("modeLink") : t("modeFile")}
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === "LINK" ? (
              <>
                <Field id="sheet-url" label={t("url")} error={errors?.url} required>
                  <Input
                    id="sheet-url"
                    name="url"
                    defaultValue={sheet?.url ?? ""}
                    placeholder="https://"
                    invalid={Boolean(errors?.url)}
                  />
                </Field>
                {/* BR-03 — a manual count cannot be saved without its as-of date. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="count" label={t("recordCount")} hint={tc("optional")}>
                    <Input
                      id="count"
                      name="lastRecordCount"
                      type="number"
                      min={0}
                      defaultValue={sheet?.lastRecordCount ?? ""}
                    />
                  </Field>
                  <Field
                    id="asof"
                    label={t("recordCountAsOf")}
                    hint={t("recordCountHint")}
                    error={errors?.lastRecordCountAsOf}
                  >
                    <Input
                      id="asof"
                      name="lastRecordCountAsOf"
                      type="date"
                      defaultValue={toDateInputValue(sheet?.lastRecordCountAsOf)}
                      invalid={Boolean(errors?.lastRecordCountAsOf)}
                    />
                  </Field>
                </div>
              </>
            ) : (
              <Field id="sheet-file" label={t("file")} hint={t("fileHint")} error={errors?.fileId}>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    id="sheet-file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="text-[13px] file:me-3 file:rounded-xs file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink-80"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onFile(f);
                    }}
                  />
                  {uploading ? <p className="text-xs text-ink-60">{tc("loading")}</p> : null}
                  {upload ? (
                    <div className="flex flex-col gap-1 bg-ground px-3 py-2">
                      <span className="text-[13px] font-semibold text-ink">{upload.filename}</span>
                      {upload.countable && upload.count != null ? (
                        <span className="text-[12px] text-ink-60">
                          {t("computedNote", {
                            count: upload.count,
                            header: upload.headerDetected
                              ? t("headerExcluded")
                              : t("headerIncluded"),
                          })}
                        </span>
                      ) : (
                        <span className="text-[12px] text-accent-text">{t("xlsNotCounted")}</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="dateCreated"
                label={t("dateCreated")}
                hint={t("dateCreatedHint")}
                error={errors?.dateCreated}
                required
              >
                <Input
                  id="dateCreated"
                  name="dateCreated"
                  type="date"
                  required
                  defaultValue={toDateInputValue(sheet?.dateCreated) || toDateInputValue(new Date())}
                />
              </Field>
              <Field id="sheet-type" label={t("columns.type")} required>
                <Select id="sheet-type" name="type" defaultValue={sheet?.type ?? "LEADS"}>
                  {TYPES.map((v) => (
                    <option key={v} value={v}>
                      {tType(v)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field id="sheet-company" label={tc("company")} required>
              <Select id="sheet-company" name="company" defaultValue={sheet?.company ?? "BYTEFORCE"}>
                <option value="BYTEFORCE">{tCompany("BYTEFORCE")}</option>
                <option value="BSYSTEMS">{tCompany("BSYSTEMS")}</option>
              </Select>
            </Field>

            <Field id="sheet-notes" label={t("columns.notes")} hint={tc("optional")}>
              <Textarea id="sheet-notes" name="notes" defaultValue={sheet?.notes ?? ""} rows={3} />
            </Field>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="lg">
                  {tc("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" size="lg" disabled={pending || uploading}>
                {pending ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
