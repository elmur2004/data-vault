"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge, CompanyBadge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/datetime";
import {
  createEmployeeAction,
  reinviteEmployeeAction,
  setEmployeeActiveAction,
  updateEmployeeAction,
  type ActionResult,
} from "@/server/employees/actions";

export type EmployeeRow = {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
  company: "BYTEFORCE" | "BSYSTEMS" | null;
  isActive: boolean;
  hasAccount: boolean;
  pendingInvitationUntil: string | null;
};

export function EmployeesClient({
  employees,
  includeInactive,
}: {
  employees: EmployeeRow[];
  includeInactive: boolean;
}) {
  const t = useTranslations("employees");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmOff, setConfirmOff] = useState<EmployeeRow | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ActionResult>, values?: Record<string, string>) {
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(t(res.message, { ...values, ...res.values }));
      else toast.error(t.has(res.error) ? t(res.error) : res.error);
      setConfirmOff(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={includeInactive ? "/employees" : "/employees?inactive=1"}
          className="text-sm font-semibold text-violet-700 underline underline-offset-4"
        >
          {includeInactive ? t("hideInactive") : t("showInactive")}
        </Link>
        <Button onClick={() => setAdding(true)}>{t("add")}</Button>
      </div>

      {employees.length === 0 ? (
        <EmptyState
          title={includeInactive ? t("emptyInactive.title") : t("empty.title")}
          body={includeInactive ? t("emptyInactive.body") : t("empty.body")}
          action={
            includeInactive ? undefined : (
              <Button onClick={() => setAdding(true)}>{t("empty.action")}</Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((e) => (
            <li
              key={e.id}
              className={`flex flex-col gap-3 border border-line bg-white p-4 ${e.isActive ? "" : "opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-ink">{e.fullName}</span>
                  {e.jobTitle ? (
                    <span className="truncate text-sm text-ink-60">{e.jobTitle}</span>
                  ) : null}
                  <span className="truncate text-xs text-ink-60">{e.email}</span>
                </div>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    className="inline-flex size-8 shrink-0 items-center justify-center text-ink-60 hover:bg-surface-2 hover:text-ink"
                    aria-label={tc("actions")}
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={4}
                      className="z-50 min-w-52 border border-line bg-white p-1 shadow-md"
                    >
                      <Item onSelect={() => setEditing(e)}>{t("edit")}</Item>
                      <Item
                        onSelect={() =>
                          run(() => reinviteEmployeeAction(e.id, "ACTIVATION"), { email: e.email })
                        }
                      >
                        {t("resendInvitation")}
                      </Item>
                      {e.hasAccount ? (
                        <Item
                          onSelect={() =>
                            run(() => reinviteEmployeeAction(e.id, "PASSWORD_RESET"), {
                              email: e.email,
                            })
                          }
                        >
                          {t("sendPasswordReset")}
                        </Item>
                      ) : null}
                      <DropdownMenu.Separator className="my-1 h-px bg-line" />
                      {e.isActive ? (
                        <Item danger onSelect={() => setConfirmOff(e)}>
                          {t("deactivate")}
                        </Item>
                      ) : (
                        <Item onSelect={() => run(() => setEmployeeActiveAction(e.id, true))}>
                          {t("reactivate")}
                        </Item>
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {e.company ? (
                  <CompanyBadge company={e.company} label={tCompany(e.company)} />
                ) : (
                  <Badge variant="quiet">{t("companyBoth")}</Badge>
                )}
                {!e.isActive ? <Badge variant="outline">{t("inactive")}</Badge> : null}
                {e.isActive && e.hasAccount ? <Badge variant="ok">{t("activeAccount")}</Badge> : null}
                {e.isActive && !e.hasAccount ? (
                  <Badge variant="quiet">
                    {e.pendingInvitationUntil
                      ? t("invitedUntil", { date: formatDate(e.pendingInvitationUntil) })
                      : t("pending")}
                  </Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <EmployeeDialog
        key={editing?.id ?? "new"}
        open={adding || Boolean(editing)}
        employee={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />

      <Dialog open={Boolean(confirmOff)} onOpenChange={(o) => !o && setConfirmOff(null)}>
        {confirmOff ? (
          <DialogContent
            title={t("deactivateConfirmTitle", { name: confirmOff.fullName })}
            description={t("deactivateConfirmBody")}
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">{tc("cancel")}</Button>
              </DialogClose>
              <Button
                variant="archive"
                disabled={pending}
                onClick={() => run(() => setEmployeeActiveAction(confirmOff.id, false))}
              >
                {t("deactivate")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function Item({
  children,
  onSelect,
  danger,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`cursor-pointer px-2 py-2 text-sm outline-none data-highlighted:bg-surface-2 ${
        danger ? "text-accent-text" : "text-ink-80 data-highlighted:text-ink"
      }`}
    >
      {children}
    </DropdownMenu.Item>
  );
}

function EmployeeDialog({
  open,
  employee,
  onClose,
}: {
  open: boolean;
  employee: EmployeeRow | null;
  onClose: () => void;
}) {
  const t = useTranslations("employees");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    employee ? updateEmployeeAction : createEmployeeAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(t(state.message, state.values));
      onClose();
    } else if (state && !state.ok && !state.fieldErrors) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <DialogContent title={employee ? t("edit") : t("add")}>
          <form action={action} className="flex flex-col gap-4">
            {employee ? <input type="hidden" name="id" value={employee.id} /> : null}

            <Field
              id="fullName"
              label={t("fullName")}
              error={state && !state.ok ? state.fieldErrors?.fullName : undefined}
              required
            >
              <Input
                id="fullName"
                name="fullName"
                defaultValue={employee?.fullName ?? ""}
                required
                maxLength={120}
              />
            </Field>

            <Field
              id="employee-email"
              label={t("email")}
              error={state && !state.ok ? state.fieldErrors?.email : undefined}
              required
            >
              <Input
                id="employee-email"
                name="email"
                type="email"
                defaultValue={employee?.email ?? ""}
                required
                maxLength={160}
              />
            </Field>

            <Field id="jobTitle" label={t("jobTitle")} hint={tc("optional")}>
              <Input
                id="jobTitle"
                name="jobTitle"
                defaultValue={employee?.jobTitle ?? ""}
                maxLength={120}
              />
            </Field>

            <Field id="company" label={t("company")} hint={tc("optional")}>
              <Select id="company" name="company" defaultValue={employee?.company ?? ""}>
                <option value="">{t("companyBoth")}</option>
                <option value="BYTEFORCE">{tCompany("BYTEFORCE")}</option>
                <option value="BSYSTEMS">{tCompany("BSYSTEMS")}</option>
              </Select>
            </Field>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {tc("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
