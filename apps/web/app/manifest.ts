import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { brandThemeColors } from "@/lib/brandPalette";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: brandThemeColors.background,
    description: brand.description,
    display: "standalone",
    icons: [
      {
        purpose: "any",
        sizes: "192x192",
        src: brand.manifestIcon192Path,
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "192x192",
        src: brand.manifestIcon192Path,
        type: "image/png",
      },
      {
        purpose: "any",
        sizes: "512x512",
        src: brand.manifestIcon512Path,
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: brand.manifestIcon512Path,
        type: "image/png",
      },
    ],
    name: brand.name,
    short_name: brand.name,
    start_url: "/zh-CN/home",
    theme_color: brandThemeColors.theme,
  };
}
