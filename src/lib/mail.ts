import "server-only";
import nodemailer from "nodemailer";

/**
 * Outbound email (S-07). Mailpit in development — read what was sent at
 * http://127.0.0.1:8025. Any SMTP host in production.
 *
 * Used for invitations and password resets (§5.2) and, from M6, task notifications
 * (FR-T15). Sending never blocks the transaction that triggered it: a failed email
 * must not roll back a created employee.
 */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "127.0.0.1",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
  // Mailpit accepts unauthenticated local mail; production sets real credentials.
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
    : {}),
});

export type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(mail: Mail): Promise<{ sent: boolean; error?: string }> {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "Vault <no-reply@local.test>",
      ...mail,
    });
    return { sent: true };
  } catch (e) {
    // Surfaced to the admin as "created, but the invitation email failed" rather than
    // failing the whole action — the invitation row exists and can be re-sent.
    const error = e instanceof Error ? e.message : "unknown error";
    console.error("[mail] send failed:", error);
    return { sent: false, error };
  }
}

/** Plain, quiet, no marketing furniture — this is an internal tool. */
export function invitationEmail(opts: {
  fullName: string;
  url: string;
  days: number;
  purpose: "ACTIVATION" | "PASSWORD_RESET";
}): Omit<Mail, "to"> {
  const activation = opts.purpose === "ACTIVATION";
  const subject = activation ? "Set up your Vault account" : "Reset your Vault password";
  const lead = activation
    ? `An account has been created for you on Vault, the internal registry for ByteForce and B-Systems.`
    : `A password reset was requested for your Vault account.`;
  const cta = activation ? "Set your password" : "Choose a new password";

  const text = [
    `Hello ${opts.fullName},`,
    "",
    lead,
    "",
    `${cta}: ${opts.url}`,
    "",
    `This link works once and expires in ${opts.days} days.`,
    activation ? "" : "If you did not request this, you can ignore this email.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#231F20;line-height:1.5">
<p>Hello ${escapeHtml(opts.fullName)},</p>
<p>${lead}</p>
<p><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#53449B;color:#fff;padding:10px 16px;text-decoration:none;font-weight:600">${cta}</a></p>
<p style="color:#231F20;opacity:.6;font-size:14px">This link works once and expires in ${opts.days} days.</p>
${activation ? "" : `<p style="color:#231F20;opacity:.6;font-size:14px">If you did not request this, you can ignore this email.</p>`}
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
