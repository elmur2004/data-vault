"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
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
import { IconLink, RowMenu } from "@/components/ui/row-menu";
import { ConfirmArchive } from "@/components/ui/confirm-archive";
import { DownloadIcon, EyeIcon } from "@/components/ui/icons";
import { formatDate } from "@/lib/datetime";
import {
  archiveDocumentAction,
  saveDocumentAction,
  uploadDocumentFileAction,
  type DocumentActionResult,
} from "@/server/documents/actions";

type DocType =
  | "CONTRACT"
  | "PROPOSAL"
  | "INVOICE"
  | "REPORT"
  | "PRESENTATION"
  | "BRAND_ASSET"
  | "LEGAL"
  | "HR"
  | "OTHER";

const TYPES: DocType[] = [
  "CONTRACT",
  "PROPOSAL",
  "INVOICE",
  "REPORT",
  "PRESENTATION",
  "BRAND_ASSET",
  "LEGAL",
  "HR",
  "OTHER",
];

export type DocumentRow = {
  id: string;
  name: string;
  description: string | null;
  company: "BYTEFORCE" | "BSYSTEMS";
  type: DocType;
  fileId: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
};

export function DocumentsClient({
  page,
  total,
  isAdmin,
}: {
  page: { rows: DocumentRow[]; total: number; page: number; perPage: number; pages: number };
  total: number;
  isAdmin: boolean;
}) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const tType = useTranslations("documents.types");
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<DocumentRow | null>(null);
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const [, start] = useTransition();

  const columns: Column<DocumentRow>[] = [
    {
      key: "name",
      header: t("columns.name"),
      width: 230,
      mobile: "title",
      cell: (d) => <span className="text-[14px] font-semibold text-ink">{d.name}</span>,
    },
    {
      key: "type",
      header: t("columns.type"),
      width: 120,
      cell: (d) => <Badge variant="quiet">{tType(d.type)}</Badge>,
    },
    {
      key: "company",
      header: tc("company"),
      width: 100,
      mobile: "badge",
      cell: (d) => <CompanyBadge company={d.company} label={tCompany(d.company)} />,
    },
    {
      key: "description",
      header: t("columns.description"),
      cell: (d) => <span className="line-clamp-2">{d.description ?? "—"}</span>,
    },
    {
      key: "createdAt",
      header: t("columns.dateAdded"),
      width: 104,
      cell: (d) => <span className="tabular">{formatDate(d.createdAt)}</span>,
    },
  ];

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
        rowKey={(d) => d.id}
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
        actions={(d) => (
          <>
            {/* FR-D05 — PDFs preview in the browser; everything else downloads. */}
            {d.mimeType === "application/pdf" ? (
              <button
                type="button"
                onClick={() => setPreview(d)}
                aria-label={t("previewDocument")}
                title={t("previewDocument")}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-xs border border-transparent text-ink-60 hover:border-line-strong hover:text-ink"
              >
                <EyeIcon />
              </button>
            ) : null}
            <IconLink href={`/api/files/${d.fileId}`} label={t("downloadDocument")}>
              <DownloadIcon />
            </IconLink>
            {isAdmin ? (
              <RowMenu
                items={[
                  { label: tc("edit"), onSelect: () => setEditing(d) },
                  { label: tc("delete"), onSelect: () => setConfirm(d), danger: true },
                ]}
              />
            ) : null}
          </>
        )}
        mobileActions={(d) => (
          <>
            <Button asChild variant="secondary" size="touch" className="flex-1">
              <a href={`/api/files/${d.fileId}`}>{t("downloadDocument")}</a>
            </Button>
            {isAdmin ? (
              <RowMenu
                className="size-11 border border-line-strong"
                items={[
                  { label: tc("edit"), onSelect: () => setEditing(d) },
                  { label: tc("delete"), onSelect: () => setConfirm(d), danger: true },
                ]}
              />
            ) : null}
          </>
        )}
      />

      <Pagination page={page.page} pages={page.pages} total={page.total} perPage={page.perPage} />

      {/* FR-D05 — inline preview, served by a fresh signed URL each time it opens. */}
      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        {preview ? (
          <DialogContent title={preview.name} className="sm:w-[min(900px,calc(100vw-2rem))]">
            <iframe
              key={preview.id}
              src={`/api/files/${preview.fileId}?disposition=inline`}
              title={preview.name}
              className="h-[70dvh] w-full border border-line-strong bg-ground"
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <DocumentDialog
        key={editing?.id ?? "new"}
        open={adding || Boolean(editing)}
        document={editing}
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
            const res = await archiveDocumentAction(confirm.id);
            if (res.ok) toast.success(tc("archived", { name: confirm.name }));
            else toast.error(res.message ?? tc("somethingWentWrong"));
            setConfirm(null);
          })
        }
      />
    </div>
  );
}

function DocumentDialog({
  open,
  document: doc,
  onClose,
}: {
  open: boolean;
  document: DocumentRow | null;
  onClose: () => void;
}) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const tType = useTranslations("documents.types");
  const [state, action, pending] = useActionState<DocumentActionResult | null, FormData>(
    saveDocumentAction,
    null,
  );
  const [file, setFile] = useState<{ fileId: string; filename: string } | null>(
    doc ? { fileId: doc.fileId, filename: doc.fileName } : null,
  );
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      toast.success(doc ? tc("saved") : t("created"));
      onClose();
    } else if (state && !state.ok && !state.fieldErrors) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state && !state.ok ? state.fieldErrors : undefined;

  async function onFile(f: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      if (doc?.fileId) fd.set("previousFileId", doc.fileId);
      const res = await uploadDocumentFileAction(fd);
      if (res.ok) setFile({ fileId: res.fileId, filename: res.filename });
      else toast.error(res.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <DialogContent title={doc ? t("edit") : t("add")}>
          <form action={action} className="flex flex-col gap-5">
            {doc ? <input type="hidden" name="id" value={doc.id} /> : null}
            {file ? <input type="hidden" name="fileId" value={file.fileId} /> : null}

            <Field id="doc-name" label={t("columns.name")} error={errors?.name} required>
              <Input id="doc-name" name="name" defaultValue={doc?.name ?? ""} required maxLength={160} />
            </Field>

            <Field id="doc-file" label={t("file")} hint={t("fileHint")} error={errors?.fileId}>
              <div className="flex flex-col gap-2">
                <input
                  id="doc-file"
                  type="file"
                  accept=".pdf,.docx,.xlsx"
                  className="text-[13px] file:me-3 file:rounded-xs file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink-80"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                  }}
                />
                {uploading ? <p className="text-xs text-ink-60">{tc("loading")}</p> : null}
                {file ? (
                  <p className="bg-ground px-3 py-2 text-[13px] font-semibold text-ink">
                    {file.filename}
                  </p>
                ) : null}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="doc-type" label={t("columns.type")} required>
                <Select id="doc-type" name="type" defaultValue={doc?.type ?? "CONTRACT"}>
                  {TYPES.map((v) => (
                    <option key={v} value={v}>
                      {tType(v)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="doc-company" label={tc("company")} required>
                <Select id="doc-company" name="company" defaultValue={doc?.company ?? "BYTEFORCE"}>
                  <option value="BYTEFORCE">{tCompany("BYTEFORCE")}</option>
                  <option value="BSYSTEMS">{tCompany("BSYSTEMS")}</option>
                </Select>
              </Field>
            </div>

            {/* D-07 — optional, deliberately. A required description produces a column
                of one-word entries. */}
            <Field id="doc-description" label={t("description")} hint={tc("optional")}>
              <Textarea
                id="doc-description"
                name="description"
                defaultValue={doc?.description ?? ""}
                rows={3}
              />
            </Field>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="lg">
                  {tc("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" size="lg" disabled={pending || uploading || !file}>
                {pending ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
