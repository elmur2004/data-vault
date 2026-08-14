"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckIcon, ChevronIcon } from "@/components/ui/icons";
import { RowMenu } from "@/components/ui/row-menu";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { formatDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { reopenTaskAction, saveTaskAction, type TaskActionResult } from "@/server/tasks/actions";
import { ResultPanel } from "./result-panel";

export type EmployeeCard = {
  id: string;
  fullName: string;
  jobTitle: string | null;
  openCount: number;
  overdueCount: number;
  completedCount: number;
};

export type TaskRow = {
  id: string;
  name: string;
  description: string | null;
  status: "OPEN" | "COMPLETED";
  deadline: string;
  createdAt: string;
  completedAt: string | null;
  wasLate: boolean | null;
  daysLate: number | null;
  resultText: string | null;
  fileCount: number;
  linkCount: number;
  isOverdue: boolean;
  employeeId: string;
  employeeName: string;
};

/**
 * §9.1–9.2 — a grid of employee cards, one expanded at a time in place. The open card
 * gains a violet border and a violet-100 head so the page still says whose work you
 * are inside.
 */
export function TasksClient({
  cards,
  openId,
  tasks,
  isAdmin,
}: {
  cards: EmployeeCard[];
  openId: string | null;
  tasks: TaskRow[];
  isAdmin: boolean;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const [panelTask, setPanelTask] = useState<TaskRow | null>(null);
  const [reopening, setReopening] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [, start] = useTransition();

  const toggle = (id: string) => {
    const next = new URLSearchParams(params.toString());
    if (openId === id) next.delete("employee");
    else next.set("employee", id);
    router.push(`/tasks?${next.toString()}`);
  };

  if (cards.length === 0) {
    return (
      <EmptyState
        title={isAdmin ? t("empty.title") : t("emptyEmployee.title")}
        body={isAdmin ? t("empty.body") : t("emptyEmployee.body")}
        action={
          isAdmin ? (
            <Button asChild size="lg">
              <a href="/employees">{t("empty.action")}</a>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const open = cards.find((c) => c.id === openId) ?? null;
  const collapsed = cards.filter((c) => c.id !== openId);

  return (
    <div className="flex flex-col gap-4">
      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild>
            <a href="/employees">{t("addEmployee")}</a>
          </Button>
          <Button onClick={() => setCreating(true)}>{t("addTask")}</Button>
          <span className="flex-1" />
          <a
            href="/overdue"
            className="text-[12.5px] font-semibold text-violet-700 hover:text-brand"
          >
            {t("seeAllOverdue")}
          </a>
        </div>
      ) : null}

      {creating ? (
        <TaskDialog
          employees={cards}
          onClose={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}

      {open ? (
        <ExpandedCard
          card={open}
          tasks={tasks}
          isAdmin={isAdmin}
          onCollapse={() => toggle(open.id)}
          onAddResult={setPanelTask}
          onReopen={setReopening}
        />
      ) : null}

      {collapsed.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {collapsed.map((c) => (
            <CollapsedCard key={c.id} card={c} onExpand={() => toggle(c.id)} />
          ))}
        </div>
      ) : null}

      {panelTask ? (
        <ResultPanel task={panelTask} onClose={() => setPanelTask(null)} />
      ) : null}

      <Dialog open={Boolean(reopening)} onOpenChange={(o) => !o && setReopening(null)}>
        {reopening ? (
          <DialogContent
            title={t("reopenConfirmTitle", { name: reopening.name })}
            description={t("reopenConfirmBody")}
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" size="lg">
                  {tc("cancel")}
                </Button>
              </DialogClose>
              <Button
                size="lg"
                onClick={() =>
                  start(async () => {
                    const res = await reopenTaskAction(reopening.id);
                    if (res.ok) toast.success(t("reopened", { name: reopening.name }));
                    else toast.error(res.message);
                    setReopening(null);
                    router.refresh();
                  })
                }
              >
                {t("reopen")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/** FR-T02 — create a task: name, assignee, deadline, optional description. Admin only. */
function TaskDialog({
  employees,
  onClose,
}: {
  employees: EmployeeCard[];
  onClose: () => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const tCompany = useTranslations("company");
  const [state, action, pending] = useActionState<TaskActionResult | null, FormData>(
    saveTaskAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(t("created"));
      onClose();
    } else if (state && !state.ok && !state.fieldErrors) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t("addTask")}>
        <form action={action} className="flex flex-col gap-5">
          <Field id="task-name" label={t("name")} error={errors?.name} required>
            <Input id="task-name" name="name" required maxLength={200} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="task-employee" label={t("assignee")} error={errors?.employeeId} required>
              <Select id="task-employee" name="employeeId" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            {/* D-06 — a date, with no time of day, deliberately. */}
            <Field id="task-deadline" label={t("deadline")} error={errors?.deadline} required>
              <Input id="task-deadline" name="deadline" type="date" required />
            </Field>
          </div>

          {/* D-05 — optional: some internal work belongs to neither company. */}
          <Field id="task-company" label={tc("company")} hint={tc("optional")}>
            <Select id="task-company" name="company" defaultValue="">
              <option value="">{tCompany("both")}</option>
              <option value="BYTEFORCE">{tCompany("BYTEFORCE")}</option>
              <option value="BSYSTEMS">{tCompany("BSYSTEMS")}</option>
            </Select>
          </Field>

          <Field id="task-description" label={t("description")} hint={tc("optional")}>
            <Textarea id="task-description" name="description" rows={3} />
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
    </Dialog>
  );
}

/** The card counts. Overdue only becomes a chip when it is above zero (§9.1). */
function Counts({ card, size = "sm" }: { card: EmployeeCard; size?: "sm" | "lg" }) {
  const t = useTranslations("tasks.counts");
  const num = size === "lg" ? "text-[17px]" : "text-[16px]";
  const lab = size === "lg" ? "text-[10px]" : "text-[9.5px]";

  return (
    <div className="flex items-end gap-[14px]">
      <span>
        <span className={cn("tabular block leading-none font-semibold text-ink", num)}>
          {card.openCount}
        </span>
        <span className={cn("mt-[3px] block font-semibold tracking-[.08em] text-ink-60 uppercase", lab)}>
          {t("open")}
        </span>
      </span>

      {card.overdueCount > 0 ? (
        <span className="rounded-xs bg-accent-soft px-[7px] py-[3px]">
          <span className={cn("tabular block leading-none font-semibold text-accent-text", num)}>
            {card.overdueCount}
          </span>
          <span
            className={cn(
              "mt-[3px] block font-semibold tracking-[.08em] text-accent-text uppercase",
              lab,
            )}
          >
            {t("overdue")}
          </span>
        </span>
      ) : (
        <span>
          <span className={cn("tabular block leading-none font-semibold text-ink-30", num)}>
            {0}
          </span>
          <span
            className={cn("mt-[3px] block font-semibold tracking-[.08em] text-ink-60 uppercase", lab)}
          >
            {t("overdue")}
          </span>
        </span>
      )}

      <span>
        <span className={cn("tabular block leading-none font-semibold text-ink-60", num)}>
          {card.completedCount}
        </span>
        <span className={cn("mt-[3px] block font-semibold tracking-[.08em] text-ink-60 uppercase", lab)}>
          {t("completed")}
        </span>
      </span>
    </div>
  );
}

function CollapsedCard({ card, onExpand }: { card: EmployeeCard; onExpand: () => void }) {
  const t = useTranslations("tasks");
  return (
    <div className="rounded-md border border-line-strong bg-white p-[14px] hover:border-ink-30">
      <div className="flex items-start gap-[10px]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-ink">{card.fullName}</span>
          {card.jobTitle ? (
            <span className="mt-0.5 block truncate text-[11.5px] text-ink-60">{card.jobTitle}</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onExpand}
          aria-label={t("expand")}
          title={t("expand")}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-xs border border-line-strong bg-white text-ink-60 hover:border-ink-30 hover:text-ink"
        >
          <ChevronIcon dir="down" />
        </button>
      </div>
      <div className="mt-[14px] border-t border-line-strong pt-3">
        <Counts card={card} />
      </div>
    </div>
  );
}

function ExpandedCard({
  card,
  tasks,
  isAdmin,
  onCollapse,
  onAddResult,
  onReopen,
}: {
  card: EmployeeCard;
  tasks: TaskRow[];
  isAdmin: boolean;
  onCollapse: () => void;
  onAddResult: (task: TaskRow) => void;
  onReopen: (task: TaskRow) => void;
}) {
  const t = useTranslations("tasks");

  return (
    <div className="overflow-hidden rounded-md border border-brand bg-white">
      <div className="flex items-center gap-4 border-b border-brand bg-brand-soft px-4 py-[14px]">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xs bg-white text-[12.5px] font-semibold text-violet-700">
          {initials(card.fullName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-violet-700">
            {card.fullName}
          </span>
          {card.jobTitle ? (
            <span className="mt-0.5 block truncate text-[12px] text-ink-80">{card.jobTitle}</span>
          ) : null}
        </span>
        <span className="flex-1" />
        <div className="hidden sm:block">
          <Counts card={card} size="lg" />
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t("collapse")}
          title={t("collapse")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-xs border border-brand bg-white text-violet-700"
        >
          <ChevronIcon dir="up" />
        </button>
      </div>

      <div className="sm:hidden">
        <div className="border-b border-line-strong bg-brand-soft px-4 pb-3">
          <Counts card={card} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="p-8 text-center text-[13px] text-ink-60">
          {isAdmin ? t("noTasksAdmin") : t("noTasks")}
        </p>
      ) : (
        <>
          <TaskTable tasks={tasks} isAdmin={isAdmin} onAddResult={onAddResult} onReopen={onReopen} />
          <TaskCards tasks={tasks} isAdmin={isAdmin} onAddResult={onAddResult} onReopen={onReopen} />
        </>
      )}
    </div>
  );
}

/** §9.2 desktop table — the columns, in the spec's order. */
function TaskTable({
  tasks,
  isAdmin,
  onAddResult,
  onReopen,
}: {
  tasks: TaskRow[];
  isAdmin: boolean;
  onAddResult: (t: TaskRow) => void;
  onReopen: (t: TaskRow) => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");

  return (
    <div className="hidden md:block">
      <div className="flex h-9 items-center gap-3 border-b border-line-strong bg-ground px-4">
        <span className="w-[30px] shrink-0" />
        <span className="label-caps w-[160px] text-[10.5px]">{t("columns.task")}</span>
        <span className="label-caps w-[78px] text-[10.5px]">{t("columns.created")}</span>
        <span className="label-caps w-[148px] text-[10.5px]">{t("columns.description")}</span>
        <span className="label-caps flex-1 text-[10.5px]">{t("columns.result")}</span>
        <span className="label-caps w-[96px] text-[10.5px]">{t("columns.deadline")}</span>
        <span className="label-caps w-[88px] text-[10.5px]">{t("columns.completedOn")}</span>
        <span className="label-caps w-[88px] text-[10.5px]">{t("columns.late")}</span>
        {isAdmin ? <span className="w-8 shrink-0" /> : null}
      </div>

      {tasks.map((task, i) => {
        const done = task.status === "COMPLETED";
        return (
          <div
            key={task.id}
            className={cn(
              "flex min-h-[54px] items-center gap-3 px-4",
              i < tasks.length - 1 && "border-b border-line-strong",
              done ? "bg-wash" : "hover:bg-ground",
            )}
          >
            <span className="w-[30px] shrink-0">
              <TaskCheckbox task={task} onAddResult={onAddResult} />
            </span>
            <span
              className={cn(
                "w-[160px] text-[13px] leading-[1.35] font-semibold",
                done ? "text-ink-60 line-through" : "text-ink",
              )}
            >
              {task.name}
            </span>
            <span className="tabular w-[78px] text-[12px] text-ink-60">
              {formatDate(task.createdAt)}
            </span>
            <span
              className={cn(
                "line-clamp-2 w-[148px] text-[12px] leading-[1.4]",
                done ? "text-ink-60" : "text-ink-80",
              )}
            >
              {task.description ?? "—"}
            </span>
            <span className="min-w-0 flex-1 text-[12px] leading-[1.4]">
              <ResultCell task={task} />
            </span>
            <span className="w-[96px]">
              <DeadlineCell task={task} />
            </span>
            <span className="tabular w-[88px] text-[12.5px] text-ink-60">
              {task.completedAt ? formatDate(task.completedAt) : <span className="text-ink-30">—</span>}
            </span>
            <span className="w-[88px] text-[12.5px]">
              <LateCell task={task} />
            </span>
            {isAdmin ? (
              <RowMenu
                items={[
                  ...(done ? [{ label: t("reopen"), onSelect: () => onReopen(task) }] : []),
                  { label: tc("edit"), onSelect: () => onAddResult(task), danger: false },
                ].filter(Boolean)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** §9.2 at 375px — deadline leads, because that is why anyone opens this on a phone. */
function TaskCards({
  tasks,
  isAdmin,
  onAddResult,
  onReopen,
}: {
  tasks: TaskRow[];
  isAdmin: boolean;
  onAddResult: (t: TaskRow) => void;
  onReopen: (t: TaskRow) => void;
}) {
  const t = useTranslations("tasks");

  return (
    <div className="flex flex-col gap-[10px] bg-ground p-3 md:hidden">
      {tasks.map((task) => {
        const done = task.status === "COMPLETED";
        return (
          <div
            key={task.id}
            className={cn("border border-line-strong p-3", done ? "bg-wash" : "bg-white")}
          >
            <div className="flex items-start gap-[10px]">
              <TaskCheckbox task={task} onAddResult={onAddResult} large />
              <span
                className={cn(
                  "text-[14.5px] leading-[1.3] font-semibold",
                  done ? "text-ink-60 line-through" : "text-ink",
                )}
              >
                {task.name}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <Pair label={t("columns.deadline")}>
                <DeadlineCell task={task} />
              </Pair>
              <Pair label={t("columns.created")}>
                <span className="tabular text-[13px] text-ink-80">{formatDate(task.createdAt)}</span>
              </Pair>
              {done ? (
                <>
                  <Pair label={t("columns.completedOn")}>
                    <span className="tabular text-[13px] text-ink-60">
                      {formatDate(task.completedAt)}
                    </span>
                  </Pair>
                  <Pair label={t("columns.late")}>
                    <LateCell task={task} />
                  </Pair>
                </>
              ) : null}
              {task.description ? (
                <Pair label={t("columns.description")}>
                  <span className="text-[13px] leading-[1.45] text-ink-80">{task.description}</span>
                </Pair>
              ) : null}
              <Pair label={t("columns.result")}>
                <ResultCell task={task} />
              </Pair>
            </div>

            {!done ? (
              <Button
                variant={task.isOverdue ? "soft" : "secondary"}
                size="touch"
                className="mt-3 w-full"
                onClick={() => onAddResult(task)}
              >
                {t("addResultAndComplete")}
              </Button>
            ) : isAdmin ? (
              <Button
                variant="secondary"
                size="touch"
                className="mt-3 w-full"
                onClick={() => onReopen(task)}
              >
                {t("reopen")}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-[10px]">
      <span className="w-[84px] shrink-0 pt-0.5 text-[10.5px] font-semibold tracking-[.06em] text-ink-60 uppercase">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/**
 * FR-T06 / AC-07 — the checkbox is the way in. On a task with no result it opens the
 * result panel; it never shows an error, because the panel *is* the next step.
 */
function TaskCheckbox({
  task,
  onAddResult,
  large,
}: {
  task: TaskRow;
  onAddResult: (t: TaskRow) => void;
  large?: boolean;
}) {
  const t = useTranslations("tasks");
  const done = task.status === "COMPLETED";
  const size = large ? "size-[22px]" : "size-[18px]";

  if (done) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-xs border-[1.5px] border-brand bg-brand text-white",
          size,
        )}
        aria-label={t("statusCompleted")}
      >
        <CheckIcon size={large ? 12 : 10} stroke="#fff" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onAddResult(task)}
      aria-label={t("completeTask")}
      title={t("completeTask")}
      className={cn(
        "block shrink-0 rounded-xs border-[1.5px] border-ink-30 bg-white hover:border-brand",
        size,
      )}
    />
  );
}

/** Result is a one-line preview plus honest counts (design annotation 14). */
function ResultCell({ task }: { task: TaskRow }) {
  const t = useTranslations("tasks");
  const has = Boolean(task.resultText?.trim()) || task.fileCount > 0 || task.linkCount > 0;
  if (!has) return <span className="text-[12px] text-ink-30">{t("noResultYet")}</span>;

  return (
    <span className="block">
      {task.resultText ? (
        <span className="line-clamp-2 text-[12px] text-ink-80">{task.resultText}</span>
      ) : null}
      {task.fileCount > 0 || task.linkCount > 0 ? (
        <span className="mt-1 flex gap-[5px]">
          {task.fileCount > 0 ? (
            <span className="tabular rounded-xs bg-mist px-[6px] py-[2px] text-[10px] font-semibold text-ink-80">
              {t("fileCount", { count: task.fileCount })}
            </span>
          ) : null}
          {task.linkCount > 0 ? (
            <span className="tabular rounded-xs bg-mist px-[6px] py-[2px] text-[10px] font-semibold text-ink-80">
              {t("linkCount", { count: task.linkCount })}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * FR-T09 — a passed deadline on an open task gets an orange chip, not a colour wash,
 * so a table of overdue rows does not turn orange (design annotation 10).
 */
function DeadlineCell({ task }: { task: TaskRow }) {
  if (task.isOverdue) {
    return (
      <span className="tabular inline-block rounded-xs bg-accent-soft px-[7px] py-[3px] text-[12.5px] font-semibold text-accent-text">
        {formatDate(task.deadline)}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "tabular ps-[7px] text-[12.5px]",
        task.status === "COMPLETED" ? "text-ink-60" : "text-ink-80",
      )}
    >
      {formatDate(task.deadline)}
    </span>
  );
}

/**
 * BR-07 — Late is blank while a task is open. It is written once at completion and
 * stored, so it will not change if an admin edits the deadline afterwards (AC-12).
 */
function LateCell({ task }: { task: TaskRow }) {
  const t = useTranslations("tasks");
  if (task.status !== "COMPLETED") return null;

  if (task.wasLate) {
    return (
      <span className="font-semibold text-accent-text">
        {t("lateByDays", { days: task.daysLate ?? 0 })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[5px] text-ink-60">
      <CheckIcon size={11} />
      {t("onTime")}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
