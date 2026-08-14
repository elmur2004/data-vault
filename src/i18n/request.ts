import { getRequestConfig } from "next-intl/server";

/**
 * NFR-10: interface strings are externalised from day one. English only in v1
 * (SPEC §15 puts a second language out of scope) but every string lives in the
 * catalog, so adding one is a translation job, not a refactor.
 */
export default getRequestConfig(async () => ({
  locale: "en",
  timeZone: process.env.DISPLAY_TZ ?? "Africa/Cairo",
  messages: (await import("../../messages/en.json")).default,
}));
