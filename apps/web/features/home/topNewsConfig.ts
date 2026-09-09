type LocalizedTopNewsTitle = {
  en: string;
  fr: string;
  "zh-CN": string;
};

export type MobileHomeTopNewsItem = {
  href: string;
  id: string;
  image: string;
  title: string;
};

type MobileHomeTopNewsConfigItem = {
  active: boolean;
  href: string;
  id: string;
  image: string;
  order: number;
  title: LocalizedTopNewsTitle;
};

const mobileHomeTopNewsConfig: MobileHomeTopNewsConfigItem[] = [
  {
    active: true,
    href: "/updates/v2_7",
    id: "v2-7-release",
    image: "/brand/v2_1/friemi-og-default-1200x630.png",
    order: 10,
    title: {
      en: "Friemi v2.7 updates",
      fr: "Nouveautes Friemi v2.7",
      "zh-CN": "Friemi v2.7 更新",
    },
  },
  {
    active: true,
    href: "/game-tools/werewolf",
    id: "werewolf-tool",
    image: "/game-tools/werewolf/werewolf.png",
    order: 20,
    title: {
      en: "Werewolf room tool",
      fr: "Outil loup-garou",
      "zh-CN": "狼人杀房间工具",
    },
  },
];

export function getFallbackTopNewsConfigItems() {
  return mobileHomeTopNewsConfig.map((item) => ({
    active: item.active,
    href: item.href,
    id: item.id,
    image: item.image,
    order: item.order,
    title: { ...item.title },
  }));
}

function getLocalizedTopNewsTitle(
  title: LocalizedTopNewsTitle,
  locale: string,
) {
  if (locale === "fr") {
    return title.fr;
  }

  if (locale === "en") {
    return title.en;
  }

  return title["zh-CN"];
}

export function getFallbackMobileHomeTopNewsItems(locale: string) {
  return mobileHomeTopNewsConfig
    .filter((item) => item.active)
    .sort((left, right) => left.order - right.order)
    .map<MobileHomeTopNewsItem>((item) => ({
      href: item.href,
      id: item.id,
      image: item.image,
      title: getLocalizedTopNewsTitle(item.title, locale),
    }));
}

function isVersionReleaseItem(item: MobileHomeTopNewsItem) {
  return (
    item.href.includes("/updates/") ||
    /(?:^|-)v\d+(?:[-_.]\d+)+(?:-release)?$/i.test(item.id)
  );
}

export function prioritizeLatestVersionTopNewsItem(
  items: MobileHomeTopNewsItem[],
  locale: string,
) {
  const latestRelease = getFallbackMobileHomeTopNewsItems(locale).find(
    (item) => item.id === "v2-7-release",
  );

  if (!latestRelease) return items.slice(0, 8);

  const previousRelease = items.find(isVersionReleaseItem);
  const nonReleaseItems = items.filter((item) => !isVersionReleaseItem(item));

  return [
    {
      ...latestRelease,
      image: previousRelease?.image ?? latestRelease.image,
    },
    ...nonReleaseItems,
  ].slice(0, 8);
}
