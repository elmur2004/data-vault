/**
 * Prints the database schema Better Auth expects for the *installed* version.
 *
 * The published @better-auth/cli lags the library, so its `generate` output cannot be
 * trusted to match. This asks the library itself, and the Prisma models in
 * prisma/schema.prisma are written to match what it prints.
 *
 *   npx tsx scripts/dump-auth-schema.ts
 */
import { getSchema } from "better-auth/db";
import { auth } from "../src/lib/auth";

const schema = getSchema(auth.options);

for (const [table, def] of Object.entries(schema)) {
  const d = def as { modelName?: string; fields: Record<string, unknown> };
  console.log(`\n== ${table}  (model: ${d.modelName ?? table}) ==`);
  for (const [name, f] of Object.entries(d.fields)) {
    const a = f as {
      type?: string;
      required?: boolean;
      unique?: boolean;
      defaultValue?: unknown;
      fieldName?: string;
      references?: { model?: string; field?: string; onDelete?: string };
    };
    const bits = [
      `type=${a.type}`,
      `required=${a.required !== false}`,
      a.unique ? "unique" : "",
      a.fieldName && a.fieldName !== name ? `column=${a.fieldName}` : "",
      a.references ? `-> ${a.references.model}.${a.references.field} onDelete=${a.references.onDelete ?? "-"}` : "",
      a.defaultValue !== undefined ? `default=${String(typeof a.defaultValue === "function" ? "fn" : a.defaultValue)}` : "",
    ].filter(Boolean);
    console.log(`   ${name.padEnd(22)} ${bits.join("  ")}`);
  }
}
