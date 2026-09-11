import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
    staleTimes: {
      dynamic: 3600,
      static: 3600,
    },
  },
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@chill-club/shared", "@chill-club/ui"],
};

export default withNextIntl(nextConfig);
