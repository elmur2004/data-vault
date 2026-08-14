import "server-only";
import { db } from "@/lib/db";
import type { ArchivableType } from "./service";

/**
 * §10.2 / AC-15 — one place to see everything that was "deleted", and put it back.
 *
 * Archived rows are excluded from every other view and every count; this is the only
 * screen that shows them, and it is admin-only.
 */
export type ArchivedRecord = {
  id: string;
  section: ArchivableType;
  name: string;
  archivedAt: string;
  detail: string | null;
};

export async function listArchived(term?: string): Promise<ArchivedRecord[]> {
  const like = term?.trim()
    ? { contains: term.trim(), mode: "insensitive" as const }
    : undefined;

  const [forms, sheets, documents, tasks] = await Promise.all([
    db.form.findMany({
      where: { isArchived: true, ...(like ? { name: like } : {}) },
      select: { id: true, name: true, updatedAt: true, company: true },
    }),
    db.sheet.findMany({
      where: { isArchived: true, ...(like ? { name: like } : {}) },
      select: { id: true, name: true, updatedAt: true, type: true },
    }),
    db.document.findMany({
      where: { isArchived: true, ...(like ? { name: like } : {}) },
      select: { id: true, name: true, updatedAt: true, type: true },
    }),
    db.task.findMany({
      where: { isArchived: true, ...(like ? { name: like } : {}) },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        employee: { select: { fullName: true } },
      },
    }),
  ]);

  const rows: ArchivedRecord[] = [
    ...forms.map((f) => ({
      id: f.id,
      section: "form" as const,
      name: f.name,
      archivedAt: f.updatedAt.toISOString(),
      detail: f.company,
    })),
    ...sheets.map((s) => ({
      id: s.id,
      section: "sheet" as const,
      name: s.name,
      archivedAt: s.updatedAt.toISOString(),
      detail: s.type,
    })),
    ...documents.map((d) => ({
      id: d.id,
      section: "document" as const,
      name: d.name,
      archivedAt: d.updatedAt.toISOString(),
      detail: d.type,
    })),
    ...tasks.map((t) => ({
      id: t.id,
      section: "task" as const,
      name: t.name,
      archivedAt: t.updatedAt.toISOString(),
      detail: t.employee.fullName,
    })),
  ];

  return rows.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}
