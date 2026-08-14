import "server-only";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { formatDate, todayInCairo } from "@/lib/datetime";

/**
 * FR-T15 — email the assignee when a task is created, and again on the deadline day.
 *
 * **DF-02 / R-11:** Next has no scheduler, so the deadline-day mail is driven by an
 * external cron hitting /api/cron/deadline-reminders with the shared secret. That is a
 * deployment dependency, documented as such, not an in-app daemon.
 *
 * Sending never blocks the transaction that triggered it: a mail server outage must not
 * roll back a created task.
 */

const appUrl = () => process.env.APP_URL ?? "http://localhost:3001";

export async function notifyTaskAssigned(taskId: string) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { employee: { select: { fullName: true, email: true, isActive: true } } },
  });
  if (!task || !task.employee.isActive) return { sent: false };

  const when = formatDate(task.deadline);
  return sendMail({
    to: task.employee.email,
    subject: `New task: ${task.name}`,
    text: [
      `Hello ${task.employee.fullName},`,
      "",
      `A task has been assigned to you in Vault.`,
      "",
      `  ${task.name}`,
      `  Due ${when}`,
      task.description ? `\n${task.description}` : "",
      "",
      `Open Vault: ${appUrl()}/tasks`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#231F20;line-height:1.5">
<p>Hello ${esc(task.employee.fullName)},</p>
<p>A task has been assigned to you in Vault.</p>
<p style="border-left:3px solid #53449B;padding-left:12px">
  <strong>${esc(task.name)}</strong><br>
  Due ${esc(when)}
</p>
${task.description ? `<p>${esc(task.description)}</p>` : ""}
<p><a href="${appUrl()}/tasks" style="color:#3F3479">Open Vault</a></p>
</body></html>`,
  });
}

/**
 * Everything due today, in Cairo, still open. Idempotent per (task, day): the cron may
 * fire more than once and each task is only mailed once, tracked in the activity log.
 */
export async function sendDeadlineReminders() {
  const today = todayInCairo();
  const tasks = await db.task.findMany({
    where: { isArchived: false, status: "OPEN", deadline: today },
    include: { employee: { select: { fullName: true, email: true, isActive: true } } },
  });

  let sent = 0;
  let skipped = 0;

  for (const task of tasks) {
    if (!task.employee.isActive) {
      skipped++;
      continue;
    }

    const marker = `reminder:${today.toISOString().slice(0, 10)}`;
    const already = await db.activityLog.findFirst({
      where: {
        entityType: "task",
        entityId: task.id,
        action: "update",
        meta: { path: ["reminder"], equals: marker },
      },
    });
    if (already) {
      skipped++;
      continue;
    }

    const result = await sendMail({
      to: task.employee.email,
      subject: `Due today: ${task.name}`,
      text: [
        `Hello ${task.employee.fullName},`,
        "",
        `This task is due today.`,
        "",
        `  ${task.name}`,
        "",
        `Open Vault: ${appUrl()}/tasks`,
      ].join("\n"),
      html: `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#231F20;line-height:1.5">
<p>Hello ${esc(task.employee.fullName)},</p>
<p>This task is due today.</p>
<p style="border-left:3px solid #D94E18;padding-left:12px"><strong>${esc(task.name)}</strong></p>
<p><a href="${appUrl()}/tasks" style="color:#3F3479">Open Vault</a></p>
</body></html>`,
    });

    if (result.sent) {
      sent++;
      await db.activityLog.create({
        data: {
          actorId: "system",
          entityType: "task",
          entityId: task.id,
          action: "update",
          meta: { reminder: marker },
        },
      });
    }
  }

  return { due: tasks.length, sent, skipped };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
