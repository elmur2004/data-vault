import { NextResponse, type NextRequest } from "next/server";
import { sendDeadlineReminders } from "@/server/tasks/notify";

/**
 * FR-T15's deadline-day half (DF-02 / R-11).
 *
 * Next has no scheduler, so this is invoked by the host's cron — Vercel Cron, a systemd
 * timer, a GitHub Action, whatever the deployment provides — with a bearer token:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/deadline-reminders
 *
 * Idempotent per task per day, so firing twice sends one email. This is a **deployment
 * dependency**: without a scheduler wired up, task-creation mail still works and the
 * deadline-day reminder simply never fires.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  // No secret configured means the endpoint is closed, not open.
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const result = await sendDeadlineReminders();
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
