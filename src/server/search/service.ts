import "server-only";
import { db } from "@/lib/db";
import { NOT_ARCHIVED } from "@/server/archive/service";
import { scopeTasks, type SessionUser } from "@/server/auth/guards";

/**
 * Global search (SPEC §10.1, AC-17).
 *
 * "Without it this app stops working at about two hundred rows, which is roughly six
 * months in." A Must, not a nicety — so it searches every section and returns results
 * grouped, matching on names, notes and descriptions.
 *
 * **R-2:** this is the second surface where employee scoping can leak. Tasks are
 * filtered with the same `scopeTasks` helper the Tasks module uses, never a
 * re-implementation, so AC-13 holds here too. §15 keeps file *contents* out of scope —
 * this is metadata only.
 */

export type SearchHit = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type SearchResults = {
  term: string;
  total: number;
  groups: {
    forms: SearchHit[];
    sheets: SearchHit[];
    documents: SearchHit[];
    tasks: SearchHit[];
  };
};

const PER_GROUP = 5;

export async function search(
  user: SessionUser,
  term: string,
  perGroup = PER_GROUP,
): Promise<SearchResults> {
  const q = term.trim();
  if (q.length < 2) {
    return { term: q, total: 0, groups: { forms: [], sheets: [], documents: [], tasks: [] } };
  }

  const like = { contains: q, mode: "insensitive" as const };

  const [forms, sheets, documents, tasks] = await Promise.all([
    db.form.findMany({
      where: { ...NOT_ARCHIVED, OR: [{ name: like }, { notes: like }] },
      select: { id: true, name: true, company: true, notes: true },
      take: perGroup,
      orderBy: { updatedAt: "desc" },
    }),
    db.sheet.findMany({
      where: { ...NOT_ARCHIVED, OR: [{ name: like }, { notes: like }] },
      select: { id: true, name: true, type: true, company: true },
      take: perGroup,
      orderBy: { updatedAt: "desc" },
    }),
    db.document.findMany({
      where: { ...NOT_ARCHIVED, OR: [{ name: like }, { description: like }] },
      select: { id: true, name: true, type: true, description: true },
      take: perGroup,
      orderBy: { updatedAt: "desc" },
    }),
    db.task.findMany({
      // Same scoping helper as the Tasks module — an employee's search never surfaces
      // someone else's work (BR-09, AC-13).
      where: {
        ...NOT_ARCHIVED,
        ...scopeTasks(user),
        OR: [{ name: like }, { description: like }],
      },
      select: {
        id: true,
        name: true,
        status: true,
        employee: { select: { fullName: true } },
      },
      take: perGroup,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const groups = {
    forms: forms.map((f) => ({
      id: f.id,
      title: f.name,
      subtitle: f.notes ?? null,
      href: `/forms?highlight=${f.id}`,
    })),
    sheets: sheets.map((s) => ({
      id: s.id,
      title: s.name,
      subtitle: s.type,
      href: `/sheets?highlight=${s.id}`,
    })),
    documents: documents.map((d) => ({
      id: d.id,
      title: d.name,
      subtitle: d.description ?? d.type,
      href: `/documents?highlight=${d.id}`,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.name,
      subtitle: t.employee.fullName,
      href: `/tasks?highlight=${t.id}`,
    })),
  };

  const total =
    groups.forms.length + groups.sheets.length + groups.documents.length + groups.tasks.length;

  return { term: q, total, groups };
}
