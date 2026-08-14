import Image from "next/image";
import { getTranslations } from "next-intl/server";

/**
 * Signed-out frame: login and activation. No app shell — there is no navigation to
 * offer someone who is not signed in.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/brand/logo-mark.svg" alt="" aria-hidden width={32} height={24} priority />
          <div className="flex flex-col leading-none">
            <span className="display text-xl text-violet-700">{t("name")}</span>
            <span className="label-caps mt-1 text-[10px]">{t("owner")}</span>
          </div>
        </div>
        <div className="border border-line bg-white p-6 shadow-xs">{children}</div>
      </div>
    </div>
  );
}
