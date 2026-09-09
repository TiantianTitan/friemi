"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import jsQR from "jsqr";
import {
  ArrowRight,
  ChevronLeft,
  Clock3,
  Hash,
  ScanLine,
  Sparkles,
  X,
  UsersRound,
} from "lucide-react";
import {
  createWerewolfRoomAction,
  type WerewolfRoomActionState,
} from "@/features/game-tools/actions/werewolfRoomActions";
import {
  defaultWerewolfVariantKey,
  getWerewolfRoleLabel,
  getWerewolfVariantLabel,
  getWerewolfDefaultRoomTitle,
  werewolfVariants,
  type WerewolfRoleKey,
  type WerewolfVariant,
} from "@/features/game-tools/werewolfConfig";
import {
  getWerewolfRoleCardImage,
  werewolfUiAssets,
} from "@/features/game-tools/werewolfCardAssets";
import {
  canUseNativeAndroidQrScanner,
  getWerewolfRoomCodeFromScan,
  parseAndroidQrScanPayload,
} from "@/features/scan/globalQrScanner";
import { getWerewolfAllRolesShopPath } from "@/features/charm/profileShopProducts";
import { withLocale } from "@/lib/routes";

type WerewolfCreateRoomPanelProps = {
  locale: string;
};

type Copy = {
  boundary: string;
  chips: string[];
  create: string;
  customCreate: string;
  customInvalid: string;
  customSubtitle: string;
  customTitle: string;
  decrease: string;
  duration: string;
  eyebrow: string;
  helper: string;
  increase: string;
  joinCodeAction: string;
  joinCodeError: string;
  joinCodeHelper: string;
  joinCodeLabel: string;
  joinCodePlaceholder: string;
  joinCodeTitle: string;
  judge: string;
  openingRoom: string;
  unlockAllRoles: string;
  players: string;
  preview: string;
  roleCount: string;
  scanCodeAction: string;
  scannerClose: string;
  scannerHelper: string;
  scannerPermission: string;
  scannerSearching: string;
  scannerTitle: string;
  scannerUnsupported: string;
  selectMode: string;
  title: string;
  titleLabel: string;
  titlePlaceholder: string;
  variants: string;
};

const copies: Record<string, Copy> = {
  "zh-CN": {
    boundary: "手机发身份、记生死和结算，桌上照常发言、投票、走夜晚。",
    chips: ["扫码入座", "私密身份", "法官记生死"],
    create: "开一局",
    customCreate: "创建自定义",
    customInvalid: "至少 5 名玩家，且需要狼人和好人。",
    customSubtitle: "按你们桌上的规则配置",
    customTitle: "自定义板子",
    decrease: "减少",
    duration: "30-40分钟",
    eyebrow: "狼人杀",
    helper: "选版型，朋友扫码入座。",
    increase: "增加",
    joinCodeAction: "加入",
    joinCodeError: "输入房号再加入。",
    joinCodeHelper: "朋友发来房号时，可以直接进房。",
    joinCodeLabel: "房号",
    joinCodePlaceholder: "例如 C2E848",
    joinCodeTitle: "加入已有房间",
    judge: "含 1 位法官",
    openingRoom: "正在进入房间...",
    unlockAllRoles: "解锁全部角色",
    players: "席",
    preview: "卡牌预览",
    roleCount: "角色",
    scanCodeAction: "扫码加入",
    scannerClose: "关闭",
    scannerHelper: "对准房间二维码，识别后自动进入。",
    scannerPermission: "无法打开相机。请检查浏览器权限，或手动输入房号。",
    scannerSearching: "正在识别二维码",
    scannerTitle: "扫码加入房间",
    scannerUnsupported: "当前浏览器不支持相机扫码，请手动输入房号。",
    selectMode: "选择模式",
    title: "今晚开狼人杀",
    titleLabel: "这局叫什么",
    titlePlaceholder: "今晚的狼人杀",
    variants: "选版型",
  },
  en: {
    boundary:
      "Use phones for seats, private roles, deaths, and results. Keep speeches, votes, and night calls at the table.",
    chips: ["Scan seats", "Private roles", "Judge notes"],
    create: "Start a table",
    customCreate: "Create custom",
    customInvalid: "Use at least 5 players, with werewolves and good roles.",
    customSubtitle: "Build your table rules",
    customTitle: "Custom setup",
    decrease: "Decrease",
    duration: "30-40 min",
    eyebrow: "Werewolf",
    helper: "Pick a setup. Friends scan in.",
    increase: "Increase",
    joinCodeAction: "Join",
    joinCodeError: "Enter a room code first.",
    joinCodeHelper: "Got a code from a friend? Enter the room here.",
    joinCodeLabel: "Room code",
    joinCodePlaceholder: "e.g. C2E848",
    joinCodeTitle: "Join a room",
    judge: "includes 1 judge",
    openingRoom: "Opening room...",
    unlockAllRoles: "Unlock all roles",
    players: "Seats",
    preview: "Card preview",
    roleCount: "Roles",
    scanCodeAction: "Scan",
    scannerClose: "Close",
    scannerHelper: "Point at the room QR code. You'll enter once it is read.",
    scannerPermission:
      "Could not open the camera. Check browser permission or enter the code.",
    scannerSearching: "Looking for a QR code",
    scannerTitle: "Scan room QR",
    scannerUnsupported:
      "This browser cannot scan with the camera. Enter the code instead.",
    selectMode: "Choose setup",
    title: "Start tonight's Werewolf table",
    titleLabel: "Table name",
    titlePlaceholder: "Tonight's Werewolf",
    variants: "Setup",
  },
  fr: {
    boundary:
      "Le téléphone garde les places, rôles, morts et résultats. La parole, les votes et la nuit restent autour de la table.",
    chips: ["Places par QR", "Rôles privés", "Notes du maître"],
    create: "Ouvrir la table",
    customCreate: "Créer",
    customInvalid:
      "Ajoutez au moins 5 joueurs, avec des loups et des villageois.",
    customSubtitle: "Configurez les règles de table",
    customTitle: "Configuration libre",
    decrease: "Retirer",
    duration: "30-40 min",
    eyebrow: "Loups-garous",
    helper: "Choisissez une configuration. Les amis scannent.",
    increase: "Ajouter",
    joinCodeAction: "Entrer",
    joinCodeError: "Entrez d'abord un code.",
    joinCodeHelper: "Vous avez reçu un code ? Entrez dans la table ici.",
    joinCodeLabel: "Code",
    joinCodePlaceholder: "ex. C2E848",
    joinCodeTitle: "Entrer dans une table",
    judge: "inclut 1 maître",
    openingRoom: "Ouverture...",
    unlockAllRoles: "Débloquer tous les rôles",
    players: "Places",
    preview: "Aperçu cartes",
    roleCount: "Rôles",
    scanCodeAction: "Scanner",
    scannerClose: "Fermer",
    scannerHelper: "Visez le QR de la table. L'entrée se fait automatiquement.",
    scannerPermission:
      "Impossible d'ouvrir la caméra. Vérifiez l'autorisation ou entrez le code.",
    scannerSearching: "Recherche du QR code",
    scannerTitle: "Scanner le QR",
    scannerUnsupported:
      "Ce navigateur ne peut pas scanner avec la caméra. Entrez le code.",
    selectMode: "Choisir le mode",
    title: "Lancez la table Loups-garous de ce soir",
    titleLabel: "Nom de table",
    titlePlaceholder: "Loups-garous de ce soir",
    variants: "Configuration",
  },
};

const initialState: WerewolfRoomActionState = {};

function getVariantHeroRole(variant: WerewolfVariant): WerewolfRoleKey {
  if (variant.key === "seven_player_basic") {
    return "seer";
  }

  if (variant.key === "eight_player_basic") {
    return "witch";
  }

  if (variant.key === "nine_player_basic") {
    return "hunter";
  }

  if (variant.key === "twelve_player_idiot") {
    return "idiot";
  }

  return "werewolf";
}

function getVariantCoreRoleLabels(locale: string, variant: WerewolfVariant) {
  const preferredOrder: WerewolfRoleKey[] = [
    "seer",
    "witch",
    "hunter",
    "idiot",
    "werewolf",
    "villager",
  ];
  const roles = new Set(variant.roles);

  return preferredOrder
    .filter((role) => roles.has(role))
    .map((role) => getWerewolfRoleLabel(locale, role))
    .filter(Boolean)
    .slice(0, 4)
    .join(" · ");
}

function RoleSeatDots({ roles }: { roles: WerewolfRoleKey[] }) {
  return (
    <div aria-hidden="true" className="mt-2 flex max-w-[9rem] flex-wrap gap-1">
      {roles.map((role, index) => (
        <span
          className={`h-1.5 w-3 rounded-full ${
            role === "werewolf"
              ? "bg-[#7D2B24]"
              : role === "villager"
                ? "bg-[#F1F2E3]/55"
                : "bg-[#F1F2E3]"
          }`}
          key={`${role}-${index}`}
        />
      ))}
      <span className="h-1.5 w-3 rounded-full bg-[#171313]" />
    </div>
  );
}

function VariantSeatDots({ variant }: { variant: WerewolfVariant }) {
  return <RoleSeatDots roles={variant.roles} />;
}

function VariantSubmitOverlay({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-label={label}
      className="absolute inset-0 z-20 grid place-items-center rounded-[1.15rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F1F2E3]/70 disabled:cursor-wait"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <span className="rounded-full bg-[#06231F]/94 px-4 py-2 text-xs font-bold text-[#F1F2E3] shadow-lg">
          {pendingLabel}
        </span>
      ) : null}
    </button>
  );
}

function WerewolfVariantModeCard({
  formAction,
  locale,
  t,
  variant,
}: {
  formAction: (formData: FormData) => void;
  locale: string;
  t: Copy;
  variant: WerewolfVariant;
}) {
  const heroRole = getVariantHeroRole(variant);
  const heroImage =
    getWerewolfRoleCardImage(heroRole, locale) ??
    "/game-tools/werewolf/werewolf.png";
  const title = getWerewolfVariantLabel(locale, variant);
  const coreRoles = getVariantCoreRoleLabels(locale, variant);

  return (
    <form
      action={formAction}
      className="group relative min-h-[8.1rem] cursor-pointer overflow-hidden rounded-[1.15rem] border border-[#F1F2E3]/55 bg-[#083C34]/88 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(241,242,227,0.08),0_16px_34px_rgba(0,0,0,0.23)] transition hover:-translate-y-0.5 hover:border-[#F1F2E3]/70"
    >
      <input name="locale" type="hidden" value={locale} />
      <input
        name="title"
        type="hidden"
        value={`${getWerewolfDefaultRoomTitle(locale)} · ${title}`}
      />
      <input name="variantKey" type="hidden" value={variant.key} />
      <VariantSubmitOverlay
        label={`${title} ${t.create}`}
        pendingLabel={t.openingRoom}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(241,242,227,0.18),transparent_25%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_42%)]" />
      <div
        aria-hidden="true"
        className="absolute inset-x-4 top-3 h-px bg-gradient-to-r from-transparent via-[#F1F2E3]/45 to-transparent"
      />
      <Image
        alt=""
        className="absolute bottom-0 -left-3 top-0 h-full w-[7.25rem] object-contain object-top opacity-95 drop-shadow-[0_18px_18px_rgba(0,0,0,0.38)] transition duration-300 group-hover:scale-[1.03]"
        height={360}
        src={heroImage}
        width={252}
      />
      <div className="relative ml-[5.4rem] grid min-h-[6.5rem] content-center justify-items-center gap-1.5 text-center">
        <span className="inline-flex h-11 min-w-[8.4rem] items-center justify-center rounded-xl border border-[#F1F2E3]/75 bg-[#EAF5FF] px-4 text-center text-sm font-bold leading-tight text-[#173346] shadow-[0_8px_0_rgba(8,22,28,0.45),0_0_18px_rgba(234,245,255,0.25)] transition group-hover:bg-white">
          {title}
        </span>
        <p className="max-w-[10.5rem] truncate text-[11px] font-semibold text-[#F1F2E3]/82">
          {coreRoles}
        </p>
        <VariantSeatDots variant={variant} />
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-0.5 text-[10px] font-semibold text-[#F1F2E3]/76">
          <span className="inline-flex items-center gap-1">
            <UsersRound className="h-3 w-3 text-[#F1F2E3]" />
            {variant.totalSeats}
            {locale === "zh-CN" ? "人" : ""}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3 text-[#F1F2E3]" />
            {t.duration}
          </span>
        </div>
      </div>
    </form>
  );
}

const customRoleOptions: WerewolfRoleKey[] = [
  "werewolf",
  "seer",
  "witch",
  "hunter",
  "idiot",
  "villager",
];

const defaultCustomRoleCounts: Record<WerewolfRoleKey, number> = {
  hunter: 1,
  idiot: 0,
  seer: 1,
  villager: 3,
  werewolf: 3,
  witch: 1,
};

function buildCustomRoleDeck(counts: Record<WerewolfRoleKey, number>) {
  return customRoleOptions.flatMap((role) =>
    Array.from({ length: counts[role] }, () => role),
  );
}

function CustomSubmitButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 min-w-[8.4rem] items-center justify-center rounded-xl bg-[#EAF5FF] px-4 text-sm font-semibold text-[#173346] shadow-[0_8px_0_rgba(8,22,28,0.38)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled || pending}
      type="submit"
    >
      {label}
    </button>
  );
}

function CustomModeCard({
  formAction,
  locale,
  t,
}: {
  formAction: (formData: FormData) => void;
  locale: string;
  t: Copy;
}) {
  const [open, setOpen] = useState(false);
  const [roleCounts, setRoleCounts] = useState(defaultCustomRoleCounts);
  const roleDeck = buildCustomRoleDeck(roleCounts);
  const hasWerewolf = roleCounts.werewolf > 0;
  const hasGood = roleDeck.some((role) => role !== "werewolf");
  const isValid =
    roleDeck.length >= 5 && roleDeck.length <= 15 && hasWerewolf && hasGood;

  function updateRoleCount(role: WerewolfRoleKey, nextValue: number) {
    setRoleCounts((current) => ({
      ...current,
      [role]: Math.max(0, Math.min(9, nextValue)),
    }));
  }

  if (!open) {
    return (
      <button
        className="group relative min-h-[8.1rem] cursor-pointer overflow-hidden rounded-[1.15rem] border border-[#F1F2E3]/55 bg-[#083C34]/88 px-4 py-3 text-left shadow-[inset_0_0_0_1px_rgba(241,242,227,0.08),0_16px_34px_rgba(0,0,0,0.23)] transition hover:-translate-y-0.5 hover:border-[#F1F2E3]/70"
        onClick={() => setOpen(true)}
        type="button"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(241,242,227,0.18),transparent_25%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_42%)]" />
        <div
          aria-hidden="true"
          className="absolute inset-x-4 top-3 h-px bg-gradient-to-r from-transparent via-[#F1F2E3]/45 to-transparent"
        />
        <Image
          alt=""
          className="pointer-events-none absolute bottom-0 -left-3 top-0 h-full w-[7.25rem] object-contain object-top opacity-95 drop-shadow-[0_18px_18px_rgba(0,0,0,0.38)] transition duration-300 group-hover:scale-[1.03]"
          height={360}
          src="/game-tools/werewolf/recto/villager_en.png"
          width={252}
        />
        <div className="relative ml-[5.4rem] grid min-h-[6.5rem] content-center justify-items-center gap-1.5 text-center">
          <span className="inline-flex h-11 min-w-[8.4rem] items-center justify-center rounded-xl border border-[#F1F2E3]/75 bg-[#EAF5FF] px-4 text-center text-sm font-bold leading-tight text-[#173346] shadow-[0_8px_0_rgba(8,22,28,0.45),0_0_18px_rgba(234,245,255,0.25)] transition group-hover:bg-white">
            {t.customTitle}
          </span>
          <p className="max-w-[10.5rem] truncate text-[11px] font-semibold text-[#F1F2E3]/82">
            {t.customSubtitle}
          </p>
          <RoleSeatDots roles={roleDeck} />
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-0.5 text-[10px] font-semibold text-[#F1F2E3]/76">
            <span className="inline-flex items-center gap-1">
              <UsersRound className="h-3 w-3 text-[#F1F2E3]" />
              {roleDeck.length}
              {locale === "zh-CN" ? "人" : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3 text-[#F1F2E3]" />
              {t.duration}
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="relative overflow-hidden rounded-[1.15rem] border border-[#F1F2E3]/55 bg-[#083C34]/88 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(241,242,227,0.08),0_16px_34px_rgba(0,0,0,0.23)]"
    >
      <input name="locale" type="hidden" value={locale} />
      <input
        name="title"
        type="hidden"
        value={`${getWerewolfDefaultRoomTitle(locale)} · ${t.customTitle}`}
      />
      <input name="variantKey" type="hidden" value="custom" />
      <input
        name="customRoleDeck"
        type="hidden"
        value={JSON.stringify(roleDeck)}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(241,242,227,0.13),transparent_25%),linear-gradient(135deg,rgba(255,255,255,0.035),transparent_42%)]" />
      <div
        aria-hidden="true"
        className="absolute inset-x-4 top-3 h-px bg-gradient-to-r from-transparent via-[#F1F2E3]/45 to-transparent"
      />
      <div className="relative flex items-start justify-between gap-3 pt-1">
        <div>
          <h3 className="text-lg font-bold text-[#F1F2E3]">{t.customTitle}</h3>
          <p className="text-xs font-bold text-[#F1F2E3]/68">
            {roleDeck.length}
            {locale === "zh-CN" ? "人" : ` ${t.roleCount}`}
          </p>
        </div>
        <button
          aria-label={locale === "zh-CN" ? "收起" : "Close"}
          className="grid h-9 w-9 place-items-center rounded-full border border-[#F1F2E3]/55 bg-[#08231F] text-[#F1F2E3] transition hover:bg-[#0A3A32]"
          onClick={() => setOpen(false)}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2">
        {customRoleOptions.map((role) => (
          <div
            className="rounded-2xl border border-[#F1F2E3]/28 bg-[#F1F2E3]/8 p-2"
            key={role}
          >
            <p className="truncate text-[11px] font-semibold text-[#F1F2E3]">
              {getWerewolfRoleLabel(locale, role)}
            </p>
            <div className="mt-2 grid grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1">
              <button
                aria-label={`${t.decrease} ${getWerewolfRoleLabel(locale, role)}`}
                className="grid h-7 w-7 place-items-center rounded-full border border-[#F1F2E3]/36 bg-[#061E1B] text-sm font-bold text-[#F1F2E3] disabled:opacity-35 friemi-tabular"
                disabled={roleCounts[role] <= 0}
                onClick={() => updateRoleCount(role, roleCounts[role] - 1)}
                type="button"
              >
                -
              </button>
              <span className="text-center text-sm font-bold text-[#F1F2E3] friemi-tabular">
                {roleCounts[role]}
              </span>
              <button
                aria-label={`${t.increase} ${getWerewolfRoleLabel(locale, role)}`}
                className="grid h-7 w-7 place-items-center rounded-full border border-[#F1F2E3]/36 bg-[#061E1B] text-sm font-bold text-[#F1F2E3] disabled:opacity-35 friemi-tabular"
                disabled={roleDeck.length >= 15}
                onClick={() => updateRoleCount(role, roleCounts[role] + 1)}
                type="button"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {!isValid ? (
        <p className="relative mt-3 rounded-xl border border-red-200/20 bg-red-500/12 px-3 py-2 text-xs font-bold text-red-100">
          {t.customInvalid}
        </p>
      ) : null}

      <div className="relative mt-4 flex justify-end">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#F1F2E3]/55 bg-[#08231F] px-4 text-sm font-semibold text-[#F1F2E3] transition hover:bg-[#0A3A32]"
            href={withLocale(locale, getWerewolfAllRolesShopPath())}
          >
            {t.unlockAllRoles}
          </Link>
          <CustomSubmitButton disabled={!isValid} label={t.customCreate} />
        </div>
      </div>
    </form>
  );
}

export function WerewolfCreateRoomPanel({
  locale,
}: WerewolfCreateRoomPanelProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    createWerewolfRoomAction,
    initialState,
  );
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeError, setJoinCodeError] = useState("");
  const [scannerError, setScannerError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeScanPendingRef = useRef(false);
  const scanHandledRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const t = copies[locale] ?? copies.en;
  const normalizedJoinCode = getWerewolfRoomCodeFromScan(joinCode);
  const featuredVariants = [
    "seven_player_basic",
    defaultWerewolfVariantKey,
    "twelve_player_idiot",
    "nine_player_basic",
    "eight_player_basic",
  ]
    .map((key) => werewolfVariants.find((variant) => variant.key === key))
    .filter((variant): variant is WerewolfVariant => Boolean(variant));

  useEffect(() => {
    if (state.redirectHref) {
      router.push(state.redirectHref);
    }
  }, [router, state.redirectHref]);

  const goToJoinCode = useCallback(
    (code: string) => {
      router.push(
        withLocale(
          locale,
          `/game-tools/werewolf/join/${encodeURIComponent(code)}`,
        ),
      );
    },
    [locale, router],
  );

  useEffect(() => {
    function handleAndroidQrScan(event: Event) {
      if (!nativeScanPendingRef.current) {
        return;
      }

      nativeScanPendingRef.current = false;
      const payload = parseAndroidQrScanPayload(
        (event as CustomEvent<unknown>).detail,
      );

      if (!payload?.ok || !payload.rawValue) {
        return;
      }

      const scannedCode = getWerewolfRoomCodeFromScan(payload.rawValue);

      if (scannedCode) {
        setJoinCode(scannedCode);
        goToJoinCode(scannedCode);
        return;
      }

      setScannerOpen(true);
    }

    window.addEventListener("friemi:android-qr-scan", handleAndroidQrScan);

    return () => {
      window.removeEventListener("friemi:android-qr-scan", handleAndroidQrScan);
    };
  }, [goToJoinCode]);

  useEffect(() => {
    if (!scannerOpen) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError(t.scannerUnsupported);
      return;
    }

    let animationFrameId = 0;
    let stopped = false;
    let stream: MediaStream | null = null;

    async function startScanner() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        });

        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;

        if (!video) {
          return;
        }

        video.srcObject = stream;
        await video.play();

        const scanFrame = () => {
          if (stopped || scanHandledRef.current) {
            return;
          }

          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d", {
            willReadFrequently: true,
          });

          if (
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            canvas &&
            context &&
            video.videoWidth &&
            video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const result = jsQR(
              imageData.data,
              imageData.width,
              imageData.height,
            );
            const scannedCode = result
              ? getWerewolfRoomCodeFromScan(result.data)
              : "";

            if (scannedCode) {
              scanHandledRef.current = true;
              setJoinCode(scannedCode);
              setScannerOpen(false);
              goToJoinCode(scannedCode);
              return;
            }
          }

          animationFrameId = window.requestAnimationFrame(scanFrame);
        };

        animationFrameId = window.requestAnimationFrame(scanFrame);
      } catch {
        setScannerError(t.scannerPermission);
      }
    }

    scanHandledRef.current = false;
    setScannerError("");
    void startScanner();

    return () => {
      stopped = true;
      window.cancelAnimationFrame(animationFrameId);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [goToJoinCode, scannerOpen, t.scannerPermission, t.scannerUnsupported]);

  function handleScanButtonClick() {
    if (!canUseNativeAndroidQrScanner()) {
      setScannerOpen(true);
      return;
    }

    nativeScanPendingRef.current = true;
    setScannerOpen(false);

    try {
      const payload = parseAndroidQrScanPayload(
        window.FriemiAndroid?.scanQrCode?.(),
      );

      if (payload?.supported === false || payload?.ok === false) {
        nativeScanPendingRef.current = false;
        setScannerOpen(true);
      }
    } catch {
      nativeScanPendingRef.current = false;
      setScannerOpen(true);
    }
  }

  function handleJoinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!normalizedJoinCode) {
      setJoinCodeError(t.joinCodeError);
      return;
    }

    setJoinCodeError("");
    goToJoinCode(normalizedJoinCode);
  }

  return (
    <section className="mx-auto w-full">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-[#F1F2E3]/45 bg-[#042F2C] px-3.5 pb-5 pt-3 text-[#F1F2E3] shadow-[0_28px_80px_rgba(4,47,44,0.26)] sm:px-5 sm:pb-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(241,242,227,0.22),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(81,167,130,0.16),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.32))]" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-28 rounded-b-full border-b border-[#F1F2E3]/20 bg-[#F1F2E3]/5 blur-[1px]" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <button
              aria-label={locale === "zh-CN" ? "返回" : "Back"}
              className="grid h-9 w-9 place-items-center rounded-full border border-[#F1F2E3]/65 bg-[#06231F]/72 text-[#F1F2E3] shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:bg-[#0A3A32]"
              onClick={() => {
                router.push(withLocale(locale, "/game-tools"));
              }}
              type="button"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <Link
              aria-label={t.preview}
              className="grid h-9 w-9 place-items-center rounded-full border border-[#F1F2E3]/65 bg-[#06231F]/72 text-[#F1F2E3] shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:bg-[#0A3A32]"
              href={withLocale(locale, "/game-tools/werewolf/card-preview")}
            >
              <img
                alt=""
                aria-hidden="true"
                className="h-5 w-5"
                draggable={false}
                src={werewolfUiAssets.actionRevealCard}
              />
            </Link>
          </div>

          <div className="mt-1 text-center">
            <div className="flex items-center justify-center gap-2 text-[#F1F2E3]">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#F1F2E3]/75" />
              <Sparkles className="h-3.5 w-3.5" />
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#F1F2E3]/75" />
            </div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-normal text-[#F1F2E3]/90">
              {locale === "zh-CN" ? "WEREWOLF" : t.eyebrow}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-normal text-[#F1F2E3]">
              {t.eyebrow}
            </h1>
          </div>

          <form
            className="mx-auto mt-3 max-w-[21rem] rounded-[1rem] border border-[#F1F2E3]/36 bg-[#061E1B]/72 p-2.5 shadow-[inset_0_0_0_1px_rgba(241,242,227,0.05)]"
            onSubmit={handleJoinByCode}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_2.55rem_4.6rem] gap-1.5">
              <label className="relative">
                <Hash className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#F1F2E3]/78" />
                <span className="sr-only">{t.joinCodeLabel}</span>
                <input
                  autoCapitalize="characters"
                  className="h-10 w-full rounded-xl border border-[#F1F2E3]/42 bg-[#F1F2E3] pl-8 pr-2 text-xs font-semibold uppercase tracking-normal text-[#10332D] outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-[#10332D]/42 focus:border-[#F1F2E3] focus:ring-2 focus:ring-[#F1F2E3]/20"
                  inputMode="text"
                  maxLength={12}
                  onChange={(event) => {
                    setJoinCode(event.target.value.toUpperCase());
                    if (joinCodeError) {
                      setJoinCodeError("");
                    }
                  }}
                  placeholder={t.joinCodePlaceholder}
                  spellCheck={false}
                  value={joinCode}
                />
              </label>
              <button
                aria-label={t.scanCodeAction}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#F1F2E3]/42 bg-[#F1F2E3] text-[#10332D] transition hover:bg-white"
                onClick={handleScanButtonClick}
                title={t.scanCodeAction}
                type="button"
              >
                <ScanLine className="h-4 w-4" />
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-[#EAF5FF] px-2 text-[11px] font-semibold text-[#173346] shadow-[0_6px_0_rgba(8,22,28,0.35)] transition hover:bg-white"
                type="submit"
              >
                {t.joinCodeAction}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {joinCodeError ? (
              <p className="mt-2 rounded-xl border border-red-200/20 bg-red-500/12 px-3 py-2 text-xs font-bold text-red-100">
                {joinCodeError}
              </p>
            ) : null}
          </form>

          <div className="mx-auto mt-3 flex max-w-[17rem] items-center gap-2">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#F1F2E3]/65" />
            <span className="rounded-full border border-[#F1F2E3]/50 bg-[#F1F2E3] px-8 py-2 text-sm font-bold text-[#3B2317] shadow-[0_8px_0_rgba(8,22,28,0.36)]">
              {t.selectMode}
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#F1F2E3]/65" />
          </div>

          {state.formError ? (
            <p className="mt-3 rounded-2xl border border-red-200/20 bg-red-500/12 px-3 py-2 text-sm font-bold text-red-100">
              {state.formError}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3">
            {featuredVariants.map((variant) => (
              <WerewolfVariantModeCard
                formAction={formAction}
                key={variant.key}
                locale={locale}
                t={t}
                variant={variant}
              />
            ))}
            <CustomModeCard formAction={formAction} locale={locale} t={t} />
          </div>
        </div>
      </div>

      {scannerOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[#1E1718]/78 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-[1.5rem] border border-white/16 bg-[#141820] text-white shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-start justify-between gap-3 p-4">
              <div>
                <h2 className="text-base font-bold">{t.scannerTitle}</h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-white/62">
                  {t.scannerHelper}
                </p>
              </div>
              <button
                aria-label={t.scannerClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/16 bg-white/10 text-white transition hover:bg-white/18"
                onClick={() => setScannerOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mx-4 aspect-square overflow-hidden rounded-[1.15rem] border border-[#F1F2E3]/32 bg-black">
              <video
                className="h-full w-full object-cover"
                muted
                playsInline
                ref={videoRef}
              />
              <canvas className="hidden" ref={canvasRef} />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-[72%] w-[72%] rounded-[1rem] border border-[#F1F2E3] shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
              </div>
              <div className="pointer-events-none absolute inset-x-[18%] top-1/2 h-px bg-[#F1F2E3]/90 shadow-[0_0_18px_rgba(241,242,227,0.85)]" />
            </div>
            <div className="p-4">
              {scannerError ? (
                <p className="rounded-2xl border border-red-200/20 bg-red-500/12 px-3 py-2 text-sm font-bold text-red-100">
                  {scannerError}
                </p>
              ) : (
                <p className="text-center text-xs font-semibold uppercase tracking-normal text-[#F1F2E3]">
                  {t.scannerSearching}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
