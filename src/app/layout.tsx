import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import "./globals.css";

/**
 * Lama Sans is the only typeface (skills/ui-design). Weights 400 and 600 ship;
 * 700 maps to SemiBold until a licensed Bold exists. Self-hosted from the copied
 * brand assets — never hotlinked.
 */
const lama = localFont({
  src: [
    { path: "./fonts/LamaSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/LamaSans-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/LamaSans-SemiBold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-lama",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#53449B",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="en" className={lama.variable}>
      <body className="min-h-dvh bg-surface text-ink antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
