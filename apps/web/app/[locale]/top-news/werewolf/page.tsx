import Image from "next/image";
import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { withLocale } from "@/lib/routes";
import {
  buildPageShareMetadata,
  getCanonicalMetadataBaseUrl,
} from "@/lib/share-metadata";
import { TopNewsHistoryBackButton } from "./TopNewsHistoryBackButton";

type WerewolfTopNewsPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

const werewolfTopNewsImage = "/game-tools/werewolf/home/topnew.png";

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      back: "Retour",
      description:
        "Découvrez comment lancer une partie de Loups-garous avec les outils Friemi.",
      title: "Guide de lancement Loups-garous",
    };
  }

  if (locale === "en") {
    return {
      back: "Back",
      description:
        "See how to start an in-person Werewolf game with Friemi tools.",
      title: "Werewolf game setup guide",
    };
  }

  return {
    back: "返回",
    description: "了解如何使用 Friemi 工具快速开始一局线下狼人杀。",
    title: "狼人杀线下开局指南",
  };
}

export async function generateMetadata({
  params,
}: WerewolfTopNewsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const copy = getCopy(locale);

  return buildPageShareMetadata({
    baseUrl: getCanonicalMetadataBaseUrl(),
    description: copy.description,
    path: withLocale(locale, "/top-news/werewolf"),
    title: `${copy.title} · ${brand.name}`,
  });
}

export default async function WerewolfTopNewsPage({
  params,
}: WerewolfTopNewsPageProps) {
  const { locale } = await params;
  const copy = getCopy(locale);

  return (
    <main className="top-news-story-page min-h-svh bg-[#071F1C] pb-[var(--app-bottom-safe-area)] pt-[var(--app-top-safe-area)]">
      <TopNewsHistoryBackButton
        fallbackHref={withLocale(locale, "/mobile-home")}
        label={copy.back}
      />
      <div className="mx-auto w-full max-w-[836px]">
        <Image
          alt={copy.title}
          className="block h-auto w-full"
          height={1882}
          priority
          sizes="(max-width: 836px) 100vw, 836px"
          src={werewolfTopNewsImage}
          width={836}
        />
      </div>
    </main>
  );
}
