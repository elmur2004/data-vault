"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CompanyBadge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowMenu, IconLink } from "@/components/ui/row-menu";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { formatDate } from "@/lib/datetime";
import {
  archiveFormAction,
  saveFormAction,
  type FormActionResult,
} from "@/server/forms/actions";
import { ConfirmArchive } from "@/components/ui/confirm-archive";

export type FormRow = {
  id: string;
  name: string;
  url: string;
  company: "BYTEFORCE" | "BSYSTEMS";
  notes: string | null;
  createdAt: string;
};

export function FormsClient({
  page,
  total,
  isAdmin,
}: {
  page: { rows: FormRow[]; total: number; page: number; perPage: number; pages: number };
  total: number;
  isAdmin: boolean;
}) {
  const t = useTranslations("forms");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const [editing, setEditing] = useState<FormRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<FormRow | null>(null);
  const [, start] = useTransition();

  const columns: Column<FormRow>[] = [
    {
      key: "name",
      header: t("columns.name"),
      width: 230,
      mobile: "title",
      cell: (r) => <span className="text-[14px] font-semibold text-ink">{r.name}</span>,
    },
    {
      key: "company",
      header: tc("company"),
      width: 104,
      mobile: "badge",
      cell: (r) => <CompanyBadge company={r.company} label={tCompany(r.company)} />,
    },
    {
      key: "notes",
      header: t("columns.notes"),
      cell: (r) => <span className="line-clamp-2">{r.notes ?? "—"}</span>,
    },
    {
      key: "createdAt",
      header: t("columns.dateAdded"),
      width: 104,
      cell: (r) => <span className="tabular">{formatDate(r.createdAt)}</span>,
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
        rowKey={(r) => r.id}
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
        actions={(r) => (
          <>
            <IconLink href={r.url} label={t("openInNewTab")} external>
              <ExternalLinkIcon />
            </IconLink>
            {isAdmin ? (
              <RowMenu
                items={[
                  { label: tc("edit"), onSelect: () => setEditing(r) },
                  { label: tc("delete"), onSelect: () => setConfirm(r), danger: true },
                ]}
              />
            ) : null}
          </>
        )}
        mobileActions={(r) => (
          <>
            <Button asChild variant="secondary" size="touch" className="flex-1">
              <a href={r.url} target="_blank" rel="noreferrer noopener">
                {t("openForm")}
              </a>
            </Button>
            {isAdmin ? (
              <RowMenu
                className="size-11 border border-line-strong"
                items={[
                  { label: tc("edit"), onSelect: () => setEditing(r) },
                  { label: tc("delete"), onSelect: () => setConfirm(r), danger: true },
                ]}
              />
            ) : null}
          </>
        )}
      />

      <Pagination
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
      />

      <FormDialog
        key={editing?.id ?? "new"}
        open={adding || Boolean(editing)}
        form={editing}
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
            const res = await archiveFormAction(confirm.id);
            if (res.ok) toast.success(tc("archived", { name: confirm.name }));
            else toast.error(res.message ?? tc("somethingWentWrong"));
            setConfirm(null);
          })
        }
      />
    </div>
  );
}

function FormDialog({
  open,
  form,
  onClose,
}: {
  open: boolean;
  form: FormRow | null;
  onClose: () => void;
}) {
  const t = useTranslations("forms");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const [state, action, pending] = useActionState<FormActionResult | null, FormData>(
    saveFormAction,
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      toast.success(form ? tc("saved") : t("created"));
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldErrors = state && !state.ok && state.kind === "error" ? state.fieldErrors : undefined;
  const duplicate = state && !state.ok && state.kind === "duplicate" ? state : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <DialogContent title={form ? t("edit") : t("add")}>
          <form action={action} className="flex flex-col gap-5">
            {form ? <input type="hidden" name="id" value={form.id} /> : null}
            <input
              type="hidden"
              name="acknowledgeDuplicate"
              value={acknowledged ? "true" : "false"}
            />

            {/* FR-F08 — warn and name the clash; saving again goes through. */}
            {duplicate ? (
              <div className="flex flex-col gap-2 bg-accent-soft px-3 py-[10px]">
                <p className="text-[12.5px] font-semibold text-accent-text">
                  {t("duplicateWarning", { name: duplicate.existingName })}
                </p>
                <button
                  type="submit"
                  onClick={() => setAcknowledged(true)}
                  className="self-start text-[12.5px] font-semibold text-violet-700 underline underline-offset-2"
                >
                  {t("duplicateSaveAnyway")}
                </button>
              </div>
            ) : null}

            <Field id="name" label={t("columns.name")} error={fieldErrors?.name} required>
              <Input id="name" name="name" defaultValue={form?.name ?? ""} required maxLength={160} />
            </Field>

            <Field
              id="url"
              label={t("columns.url")}
              hint={t("urlHint")}
              error={fieldErrors?.url}
              required
            >
              <Input
                id="url"
                name="url"
                defaultValue={form?.url ?? ""}
                required
                placeholder="https://"
                invalid={Boolean(fieldErrors?.url)}
              />
            </Field>

            <Field id="company" label={tc("company")} error={fieldErrors?.company} required>
              <Select id="company" name="company" defaultValue={form?.company ?? "BYTEFORCE"}>
                <option value="BYTEFORCE">{tCompany("BYTEFORCE")}</option>
                <option value="BSYSTEMS">{tCompany("BSYSTEMS")}</option>
              </Select>
            </Field>

            <Field id="notes" label={t("columns.notes")} hint={tc("optional")}>
              <Textarea id="notes" name="notes" defaultValue={form?.notes ?? ""} rows={3} />
            </Field>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="lg">
                  {tc("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
