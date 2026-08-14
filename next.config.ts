import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev overlay badge sits on top of the sidebar user menu and pollutes
  // milestone screenshots. It has no effect on the production build.
  devIndicators: false,
  // exceljs and file-type do their own binary work; keep them out of the bundler (M2, BR-04).
  serverExternalPackages: ["exceljs", "@node-rs/argon2"],
  eslint: {
    // Lint is a separate, mandatory gate (`npm run lint`) — see AGENTS.md definition of done.
    ignoreDuringBuilds: true,
  },
};

export default withNextIntl(nextConfig);
