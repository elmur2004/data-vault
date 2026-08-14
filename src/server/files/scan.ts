import "server-only";
import { Readable } from "node:stream";
import type { ScanStatus } from "@prisma/client";

/**
 * Malware scanning hook (§10.3, S-08).
 *
 * §10.3 requires scanning "before a file becomes retrievable". That ordering is
 * enforced by the download path, which serves only `CLEAN` files — this module just
 * decides the verdict.
 *
 * `MALWARE_SCAN=off` (development) marks everything CLEAN immediately.
 *
 * **Deploy note (R-10):** shipping to production with `off` means §10.3 is not
 * actually satisfied. Wiring a real scanner is a release-blocking task. The clamav
 * branch loads its driver through a non-literal specifier so the package is only
 * required where it is actually used, and any failure to reach it holds the file at
 * PENDING — an unreachable scanner must never become an open door.
 */

type ClamScanner = {
  scanStream: (s: Readable) => Promise<{ isInfected: boolean | null }>;
};
type ClamModule = {
  default: new () => { init: (cfg: unknown) => Promise<ClamScanner> };
};

export async function scanBuffer(buf: Buffer): Promise<ScanStatus> {
  const mode = (process.env.MALWARE_SCAN ?? "off").toLowerCase();

  if (mode === "off") return "CLEAN";

  if (mode === "clamav") {
    try {
      const specifier = process.env.CLAMAV_MODULE ?? "clamscan";
      const mod = (await import(/* @vite-ignore */ specifier)) as unknown as ClamModule;
      const clam = await new mod.default().init({
        clamdscan: {
          host: process.env.CLAMD_HOST ?? "127.0.0.1",
          port: Number(process.env.CLAMD_PORT ?? 3310),
        },
      });
      const { isInfected } = await clam.scanStream(Readable.from(buf));
      return isInfected ? "REJECTED" : "CLEAN";
    } catch (e) {
      console.error("[scan] clamav unavailable; holding file at PENDING:", e);
      return "PENDING";
    }
  }

  console.warn(`[scan] unknown MALWARE_SCAN=${mode}; holding file at PENDING`);
  return "PENDING";
}
