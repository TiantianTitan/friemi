"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  Check,
  Crown,
  Flag,
  HeartPulse,
  LogOut,
  Monitor,
  Palette,
  Plus,
  QrCode,
  Skull,
  Ticket,
  X,
} from "lucide-react";
import {
  claimWerewolfSeatAction,
  finishWerewolfRoomAction,
  joinWerewolfRoomAction,
  leaveWerewolfSeatAction,
  startWerewolfRoomAction,
  updateWerewolfPlayerLifeAction,
  updateWerewolfReadyAction,
  updateWerewolfSheriffAction,
  type WerewolfRoomActionState,
} from "@/features/game-tools/actions/werewolfRoomActions";
import {
  ACTIVE_GAME_TOOL_ROOM_STORAGE_EVENT,
  ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
  DISMISSED_ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
  type StoredActiveGameToolRoom,
} from "@/features/game-tools/activeGameToolRoomStorage";
import { WerewolfQrCode } from "@/features/game-tools/components/WerewolfQrCode";
import { WerewolfTestBotPanel } from "@/features/game-tools/components/WerewolfTestBotPanel";
import {
  countAliveWerewolfPlayers,
  getWerewolfViewerPrivateToken,
  isWerewolfJudgeViewer,
} from "@/features/game-tools/werewolfJudgeControls";
import {
  defaultWerewolfAtmosphere,
  getWerewolfAtmosphereById,
  getWerewolfRoleCardImage,
  getWerewolfSeatBackImage,
  werewolfAtmospheres,
  werewolfUiAssets,
  type WerewolfAtmosphereId,
} from "@/features/game-tools/werewolfCardAssets";
import { getWerewolfAppJoinUrl } from "@/features/game-tools/werewolfRoomLinks";
import { UserProfilePreviewPopover } from "@/features/profile/components/UserProfilePreviewPopover";
import { withLocale } from "@/lib/routes";

type WerewolfRoomOverviewProps = {
  baseUrl: string;
  isAuthenticated: boolean;
  locale: string;
  notice?: string | null;
  room: {
    code: string;
    currentMember: {
      avatarLabel: string;
      avatarUrl: string | null;
      displayName: string;
      id: string;
      isGuest: boolean;
      memberToken: string | null;
      profileId: string | null;
      readyAt: string | null;
      seatedPrivateToken: string | null;
      seatedSeatId: string | null;
      seatedSeatNumber: number | null;
    } | null;
    events: Array<{
      actorName: string | null;
      createdAt: string;
      id: string;
      type: string;
    }>;
    host: {
      nickname: string;
    };
    id: string;
    isHost: boolean;
    members: Array<{
      avatarLabel: string;
      avatarUrl: string | null;
      displayName: string;
      id: string;
      isCurrentMember: boolean;
      isGuest: boolean;
      lastSeenAt: string;
      readyAt: string | null;
      seatedSeatId: string | null;
      seatedSeatNumber: number | null;
    }>;
    seats: Array<{
      avatarLabel: string;
      avatarUrl: string | null;
      displayName: string;
      id: string;
      isClaimed: boolean;
      isDead: boolean;
      isJudgeSeat: boolean;
      isPlayerSeat: boolean;
      isViewerSeat: boolean;
      privateToken: string | null;
      profileId: string | null;
      readyAt: string | null;
      roleKey: string | null;
      roleLabel: string | null;
      seatNumber: number;
    }>;
    state: {
      phase: string;
      sheriffSeatNumber?: number | null;
      winner?: "GOOD" | "WEREWOLF" | null;
    };
    status: string;
    syncVersion: string;
    title: string;
    variant: {
      label: string;
      playerSeatCount: number;
      totalSeats: number;
    };
  };
  testBotsEnabled?: boolean;
};

type WerewolfSeat = WerewolfRoomOverviewProps["room"]["seats"][number];
type WerewolfRoomView = WerewolfRoomOverviewProps["room"];

const LOCAL_MUTATION_SYNC_GUARD_MS = 1800;
const WEREWOLF_ROOM_BROADCAST_CHANNEL = "friemi:werewolf-room-sync";
const WEREWOLF_ATMOSPHERE_STORAGE_KEY = "friemi:werewolf:atmosphere";
const coreWerewolfRoleKeys = [
  "hunter",
  "idiot",
  "seer",
  "villager",
  "werewolf",
  "witch",
] as const;

type WerewolfRoomSyncPayload = {
  room?: WerewolfRoomView;
  status?: string;
  syncVersion?: string;
};

type WerewolfRoomBroadcastMessage = {
  roomId: string;
  sourceId: string;
  type: "werewolf-room-changed";
};

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

function getWerewolfSyncIntervalMs(status: string) {
  const baseIntervalMs = status === "LOBBY" ? 1800 : 4200;

  if (typeof window === "undefined") {
    return baseIntervalMs;
  }

  const connection = (window.navigator as NavigatorWithConnection).connection;
  const effectiveType = connection?.effectiveType;
  const isSlowConnection =
    connection?.saveData === true ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g";
  const isLowEndDevice =
    typeof window.navigator.hardwareConcurrency === "number" &&
    window.navigator.hardwareConcurrency > 0 &&
    window.navigator.hardwareConcurrency <= 4;

  if (isSlowConnection) {
    return status === "LOBBY" ? 4200 : 8200;
  }

  if (isLowEndDevice) {
    return status === "LOBBY" ? 2800 : 6200;
  }

  return baseIntervalMs;
}

function getWerewolfRoomPreloadAssets({
  atmosphereSrc,
  locale,
}: {
  atmosphereSrc: string;
  locale: string;
}) {
  return Array.from(
    new Set([
      atmosphereSrc,
      "/game-tools/werewolf/werewolf.png",
      ...Array.from({ length: 12 }, (_, index) =>
        getWerewolfSeatBackImage(index + 1),
      ),
      ...coreWerewolfRoleKeys
        .map((roleKey) => getWerewolfRoleCardImage(roleKey, locale))
        .filter((asset): asset is string => Boolean(asset)),
    ]),
  );
}

function WerewolfAvatar({
  avatarLabel,
  avatarUrl,
  className,
}: {
  avatarLabel: string;
  avatarUrl: string | null;
  className: string;
}) {
  return (
    <span
      className={`${className} relative grid place-items-center overflow-hidden rounded-full bg-[#111512] text-white shadow-sm`}
    >
      {avatarUrl ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          src={avatarUrl}
        />
      ) : (
        <span className="relative font-bold">{avatarLabel}</span>
      )}
    </span>
  );
}

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      back: "Tous les outils",
      atmosphere: "Ambiance",
      atmosphereDescription: "Changez la nappe visible dans la salle.",
      atmosphereTitle: "Ambiance de table",
      boundary:
        "Scannez, choisissez une place, puis lancez les rôles quand tout le monde est prêt.",
      changeSeat: "Changer",
      claimError: "Impossible de modifier la place.",
      code: "Code",
      copied: "Copié",
      copyInvite: "Copier le lien",
      currentMember: "Vous",
      dead: "Mort",
      deathConfirmCancel: "Annuler",
      deathConfirmDescription:
        "Le joueur sera marqué comme éliminé pour toute la table.",
      deathConfirmSubmit: "Confirmer la sortie",
      deathConfirmTitle: "Éliminer ce joueur ?",
      empty: "Libre",
      enterMember: "Entrer",
      events: "Dernières actions",
      exitGame: "Quitter",
      exitGameDescription:
        "Partir garde le raccourci de la salle. Quitter vous retire de cette partie.",
      exitGameTitle: "Quitter la partie ?",
      finished: "Partie terminée",
      finishGame: "Terminer",
      finishGameDescription:
        "Choisissez le résultat final. Une partie interrompue ne compte pas dans les statistiques.",
      finishGameTitle: "Terminer la partie ?",
      finishGood: "Victoire du village",
      finishWerewolf: "Victoire des loups",
      foundation: "Loups-garous",
      host: "Hôte",
      manageConfirmRefresh: "Remplacer le lien privé de cette place ?",
      manageConfirmRelease: "Libérer cette place ?",
      manageNamePlaceholder: "Nom de table",
      manageRefresh: "Nouveau lien",
      manageRelease: "Libérer",
      manageRename: "Renommer",
      markDead: "Éliminer",
      joinFirst: "Entrez un nom d'abord",
      joinName: "Nom",
      judge: "Maître",
      judgeControls: "Commandes du maître",
      leaveRoom: "Quitter la table",
      leaveRoomConfirm: "Quitter cette partie en cours ?",
      leaveSeat: "Quitter",
      lobby: "Avant la partie",
      locked: "La partie a commencé.",
      members: "À placer",
      noMembers: "Personne en attente.",
      noticeJoined: "Vous êtes dans la table.",
      noticeLeft: "Place quittée.",
      noticeReady: "Vous êtes prêt.",
      noticeSeatChanged: "Place changée.",
      noticeSeatClaimed: "Place prise.",
      noticeSeatManaged: "Place mise à jour.",
      noticeUnready: "Prêt annulé.",
      offline: "Connexion perdue. Réessayez quand le réseau revient.",
      openSeat: "Voir rôle",
      playerSeats: "Places",
      playerUnit: "joueurs",
      publicScreen: "Écran public",
      qrUnavailable: "QR indisponible. Utilisez le code.",
      ready: "Prêt",
      readyAction: "Prêt",
      removeSheriff: "Retirer le capitaine",
      resultDialogClose: "Fermer",
      resultDialogDescription:
        "Les rôles de tous les joueurs sont maintenant visibles.",
      resultDialogTitle: "Résultat de la partie",
      allRoles: "Rôles de la table",
      revive: "Réanimer",
      roleUnknown: "Non attribué",
      alive: "Vivant",
      recap: "Récap",
      running: "En cours",
      seatedAt: "Place",
      selectSeat: "Choisir",
      scanJoin: "Scanner pour entrer",
      share: "Invitation",
      setSheriff: "Nommer capitaine",
      sheriffConfirmRemoveDescription:
        "Le capitaine actuel sera retiré pour toute la table.",
      sheriffConfirmRemoveTitle: "Retirer ce capitaine ?",
      sheriffConfirmSetDescription:
        "Ce joueur deviendra capitaine pour toute la table.",
      sheriffConfirmSetTitle: "Nommer ce joueur capitaine ?",
      stayGame: "Rester",
      start: "Lancer",
      startConfirm: "Distribuer les rôles et verrouiller les places ?",
      startWaiting: "Attendez que toute la table soit prête.",
      status: "Statut",
      systemActor: "Table",
      unready: "Pas prêt",
      unreadyAction: "Annuler",
      temporaryLeave: "Partir",
      terminateGame: "Interrompre sans résultat",
      gameTerminated: "Partie interrompue",
      waitingMember: "Entrez un nom, puis choisissez une place.",
      winnerGood: "Village gagnant",
      winnerWerewolf: "Loups gagnants",
    };
  }

  if (locale === "en") {
    return {
      back: "All tools",
      atmosphere: "Atmosphere",
      atmosphereDescription: "Change the tablecloth shown in the room.",
      atmosphereTitle: "Table atmosphere",
      boundary: "Scan in, pick seats, then deal roles when the table is ready.",
      changeSeat: "Switch",
      claimError: "Could not update the seat.",
      code: "Code",
      copied: "Copied",
      copyInvite: "Copy invite",
      currentMember: "You",
      dead: "Dead",
      deathConfirmCancel: "Cancel",
      deathConfirmDescription:
        "This player will be marked dead for everyone in the room.",
      deathConfirmSubmit: "Confirm death",
      deathConfirmTitle: "Mark this player dead?",
      empty: "Open",
      enterMember: "Enter",
      events: "Latest moves",
      exitGame: "Exit game",
      exitGameDescription:
        "Step away keeps the room shortcut. Exit removes you from this game.",
      exitGameTitle: "Exit game?",
      finished: "Game finished",
      finishGame: "End game",
      finishGameDescription:
        "Choose the final result. A terminated game will not count toward player records.",
      finishGameTitle: "End this game?",
      finishGood: "Good team wins",
      finishWerewolf: "Werewolf team wins",
      foundation: "Werewolf",
      host: "Host",
      manageConfirmRefresh: "Replace this seat's private link?",
      manageConfirmRelease: "Release this seat?",
      manageNamePlaceholder: "Table name",
      manageRefresh: "New link",
      manageRelease: "Release",
      manageRename: "Rename",
      markDead: "Mark dead",
      joinFirst: "Enter a name first",
      joinName: "Name",
      judge: "Judge",
      judgeControls: "Judge controls",
      leaveRoom: "Leave room",
      leaveRoomConfirm: "Leave this running game?",
      leaveSeat: "Leave",
      lobby: "Before game",
      locked: "The game has started.",
      members: "Waiting to sit",
      noMembers: "No one is waiting.",
      noticeJoined: "You are in the table.",
      noticeLeft: "Seat left.",
      noticeReady: "You are ready.",
      noticeSeatChanged: "Seat switched.",
      noticeSeatClaimed: "Seat claimed.",
      noticeSeatManaged: "Seat updated.",
      noticeUnready: "Ready cancelled.",
      offline: "You are offline. Try again after the network comes back.",
      openSeat: "View role",
      playerSeats: "Player seats",
      playerUnit: "players",
      publicScreen: "Public screen",
      qrUnavailable: "QR unavailable. Use the code.",
      ready: "Ready",
      readyAction: "Ready",
      removeSheriff: "Remove sheriff",
      resultDialogClose: "Close",
      resultDialogDescription: "Every player's role is now visible.",
      resultDialogTitle: "Game result",
      allRoles: "Player roles",
      revive: "Revive",
      roleUnknown: "Unassigned",
      alive: "Alive",
      recap: "Recap",
      running: "In progress",
      seatedAt: "Seat",
      selectSeat: "Choose",
      scanJoin: "Scan to join",
      share: "Invite link",
      setSheriff: "Set sheriff",
      sheriffConfirmRemoveDescription:
        "The current sheriff will be removed for everyone in the room.",
      sheriffConfirmRemoveTitle: "Remove this sheriff?",
      sheriffConfirmSetDescription:
        "This player will become sheriff for everyone in the room.",
      sheriffConfirmSetTitle: "Set this player as sheriff?",
      stayGame: "Stay",
      start: "Start game",
      startConfirm: "Deal roles and lock seats?",
      startWaiting: "Wait until the full table is ready.",
      status: "Status",
      systemActor: "Table",
      unready: "Not ready",
      unreadyAction: "Cancel",
      temporaryLeave: "Step away",
      terminateGame: "Terminate without result",
      gameTerminated: "Game terminated",
      waitingMember: "Enter a name, then choose a seat.",
      winnerGood: "Good team wins",
      winnerWerewolf: "Werewolf team wins",
    };
  }

  return {
    back: "全部工具",
    atmosphere: "氛围",
    atmosphereDescription: "切换房间里的桌布氛围。",
    atmosphereTitle: "桌布氛围",
    boundary: "扫码入座，人齐发身份。现场照常聊、投票、走夜晚。",
    changeSeat: "换座",
    claimError: "座位操作失败。",
    code: "房号",
    copied: "已复制",
    copyInvite: "复制邀请链接",
    currentMember: "我",
    dead: "出局",
    deathConfirmCancel: "取消",
    deathConfirmDescription: "确认后，该玩家会在全房间标记为出局。",
    deathConfirmSubmit: "确认出局",
    deathConfirmTitle: "确认该玩家出局？",
    empty: "空位",
    enterMember: "进入房间",
    events: "最近记录",
    exitGame: "退出游戏",
    exitGameDescription: "暂离会保留房间入口，退出游戏会离开本局。",
    exitGameTitle: "退出提醒",
    finished: "本局已结束",
    finishGame: "结束游戏",
    finishGameDescription: "请选择本局结果。终止游戏不会计入玩家胜负记录。",
    finishGameTitle: "确认结束本局？",
    finishGood: "平民胜利",
    finishWerewolf: "狼人胜利",
    foundation: "狼人杀",
    host: "房主",
    manageConfirmRefresh: "刷新后旧身份链接会失效，确定继续？",
    manageConfirmRelease: "确定清空这个座位？",
    manageNamePlaceholder: "桌上昵称",
    manageRefresh: "换链接",
    manageRelease: "清座",
    manageRename: "改名",
    markDead: "标记出局",
    joinFirst: "先输入昵称",
    joinName: "昵称",
    judge: "法官",
    judgeControls: "法官操作",
    leaveRoom: "退出房间",
    leaveRoomConfirm: "退出这局进行中的房间？",
    leaveSeat: "离座",
    lobby: "开局前",
    locked: "本局已经开始。",
    members: "待入座",
    noMembers: "没人等座。",
    noticeJoined: "已进入房间。",
    noticeLeft: "已离座。",
    noticeReady: "已准备。",
    noticeSeatChanged: "已换座。",
    noticeSeatClaimed: "已入座。",
    noticeSeatManaged: "座位已更新。",
    noticeUnready: "已取消准备。",
    offline: "当前网络已断开，恢复后再操作。",
    openSeat: "查看身份",
    playerSeats: "座位",
    playerUnit: "玩家",
    publicScreen: "公共屏",
    qrUnavailable: "二维码没生成，先用房号。",
    ready: "已准备",
    readyAction: "准备",
    removeSheriff: "取消警长",
    resultDialogClose: "知道了",
    resultDialogDescription: "本局所有玩家身份现已公开。",
    resultDialogTitle: "本局结果",
    allRoles: "全员身份",
    revive: "取消出局",
    roleUnknown: "未分配",
    alive: "存活",
    recap: "复盘",
    running: "游戏中",
    seatedAt: "座位",
    selectSeat: "入座",
    scanJoin: "扫码进入房间",
    share: "邀请链接",
    setSheriff: "设为警长",
    sheriffConfirmRemoveDescription: "确认后，全房间将取消该玩家的警长身份。",
    sheriffConfirmRemoveTitle: "确认取消该警长？",
    sheriffConfirmSetDescription: "确认后，该玩家将在全房间显示为警长。",
    sheriffConfirmSetTitle: "确认选择该玩家为警长？",
    stayGame: "继续游戏",
    start: "开始游戏",
    startConfirm: "发身份后座位会锁定，确定开局？",
    startWaiting: "等所有人准备。",
    status: "进度",
    systemActor: "房间",
    unready: "未准备",
    unreadyAction: "取消准备",
    temporaryLeave: "暂离",
    terminateGame: "终止游戏",
    gameTerminated: "本局已终止",
    waitingMember: "取个昵称入房。",
    winnerGood: "好人阵营获胜",
    winnerWerewolf: "狼人阵营获胜",
  };
}

const initialState: WerewolfRoomActionState = {};

function SubmitButton({
  className,
  disabled = false,
  label,
}: {
  className?: string;
  disabled?: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={
        className ??
        "inline-flex h-9 items-center justify-center rounded-full bg-[#7A1F2B] px-3 text-xs font-semibold text-white transition hover:bg-[#9B2D3C] disabled:cursor-not-allowed disabled:opacity-55"
      }
      disabled={pending || disabled}
      type="submit"
    >
      {label}
    </button>
  );
}

function JudgeLifeButton({
  isDead,
  label,
  onClick,
  type = "submit",
}: {
  isDead: boolean;
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const { pending } = useFormStatus();
  const Icon = isDead ? HeartPulse : Skull;

  return (
    <button
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.16)] transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 ${
        isDead
          ? "bg-[#D8F0DF] text-[#176B45] hover:bg-white"
          : "bg-[#7A1F2B] text-white hover:bg-[#9B2D3C]"
      }`}
      disabled={pending}
      onClick={onClick}
      title={label}
      type={type}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function JudgeSheriffButton({
  isSheriff,
  label,
  onClick,
  type = "submit",
}: {
  isSheriff: boolean;
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.16)] transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 ${
        isSheriff
          ? "bg-[#F1F2E3] text-[#153B31] ring-1 ring-white/70"
          : "bg-white/18 text-[#F1F2E3] ring-1 ring-white/35 hover:bg-white/28"
      }`}
      disabled={pending}
      onClick={onClick}
      title={label}
      type={type}
    >
      <Crown className="h-4 w-4" />
    </button>
  );
}

function FinishOutcomeButton({
  className,
  label,
  value,
}: {
  className: string;
  label: string;
  value: "GOOD" | "TERMINATED" | "WEREWOLF";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={pending}
      name="winner"
      type="submit"
      value={value}
    >
      {label}
    </button>
  );
}

function getStoredWerewolfAtmosphereId(): WerewolfAtmosphereId {
  const fallbackId = defaultWerewolfAtmosphere.id;

  if (typeof window === "undefined") {
    return fallbackId;
  }

  try {
    return getWerewolfAtmosphereById(
      window.localStorage.getItem(WEREWOLF_ATMOSPHERE_STORAGE_KEY),
    ).id;
  } catch {
    return fallbackId;
  }
}

function WerewolfAtmospherePicker({
  locale,
  onCycle,
  selectedId,
}: {
  locale: string;
  onCycle: () => void;
  selectedId: WerewolfAtmosphereId;
}) {
  const [showHint, setShowHint] = useState(false);
  const hintTimerRef = useRef<number | null>(null);
  const t = getCopy(locale);
  const selectedAtmosphere = getWerewolfAtmosphereById(selectedId);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  const cycleAtmosphere = () => {
    onCycle();
    setShowHint(true);

    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
    }

    hintTimerRef.current = window.setTimeout(() => {
      setShowHint(false);
      hintTimerRef.current = null;
    }, 1300);
  };

  return (
    <div className="relative">
      <button
        aria-label={`${t.atmosphere}: ${selectedAtmosphere.name}`}
        className="relative grid h-10 w-10 place-items-center rounded-full bg-[#07372F] text-[#F1F2E3] shadow-[0_8px_20px_rgba(0,0,0,0.22)] ring-1 ring-[#F1F2E3]/36 transition hover:bg-[#0D493F] active:scale-95"
        onClick={cycleAtmosphere}
        title={selectedAtmosphere.name}
        type="button"
      >
        <Palette className="h-4 w-4" />
      </button>

      {showHint ? (
        <div className="pointer-events-none absolute right-0 top-[calc(100%+0.55rem)] z-50 max-w-[12rem] rounded-full bg-[#062A24]/94 px-3 py-1.5 text-right text-[11px] font-semibold text-[#F1F2E3] shadow-[0_12px_30px_rgba(0,0,0,0.26)]">
          <span className="block truncate">{selectedAtmosphere.name}</span>
        </div>
      ) : null}
    </div>
  );
}

function WerewolfRoomQrDialog({
  joinUrl,
  roomCode,
  t,
}: {
  joinUrl: string;
  roomCode: string;
  t: ReturnType<typeof getCopy>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label={t.scanJoin}
        className="grid h-10 w-10 place-items-center rounded-full bg-[#07372F] text-[#F1F2E3] shadow-[0_8px_20px_rgba(0,0,0,0.22)] ring-1 ring-[#F1F2E3]/36 transition hover:bg-[#0D493F] active:scale-95"
        onClick={() => setOpen(true)}
        title={t.scanJoin}
        type="button"
      >
        <QrCode className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[95] grid place-items-center bg-[#031F1B]/76 px-4 py-[calc(env(safe-area-inset-top)+1rem)]"
          role="presentation"
        >
          <section
            aria-label={t.scanJoin}
            aria-modal="true"
            className="w-full max-w-[19rem] overflow-hidden rounded-[1.35rem] bg-[#FFFDF7] p-4 text-[#153B31] shadow-[0_24px_70px_rgba(0,0,0,0.36)]"
            role="dialog"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-bold">{t.scanJoin}</p>
              <button
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EDF3EA] text-[#153B31] transition active:scale-95"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <WerewolfQrCode
              codeLabel={t.code}
              copiedLabel={t.copied}
              copyLabel={t.copyInvite}
              label={t.scanJoin}
              qrValue={getWerewolfAppJoinUrl(roomCode)}
              roomCode={roomCode}
              unavailableLabel={t.qrUnavailable}
              value={joinUrl}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}

function getNoticeLabel(
  notice: string | null | undefined,
  t: ReturnType<typeof getCopy>,
) {
  switch (notice) {
    case "joined":
      return t.noticeJoined;
    case "left":
      return t.noticeLeft;
    case "ready":
      return t.noticeReady;
    case "seat_changed":
      return t.noticeSeatChanged;
    case "seat_claimed":
      return t.noticeSeatClaimed;
    case "seat_managed":
      return t.noticeSeatManaged;
    case "unready":
      return t.noticeUnready;
    default:
      return null;
  }
}

export function WerewolfRoomOverview({
  baseUrl,
  isAuthenticated,
  locale,
  notice,
  room: initialRoom,
  testBotsEnabled = false,
}: WerewolfRoomOverviewProps) {
  const router = useRouter();
  const [room, setRoom] = useState(initialRoom);
  const [, startRefreshTransition] = useTransition();
  const lastOptimisticMutationAtRef = useRef(0);
  const lastSyncRefreshAtRef = useRef(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const broadcastClientIdRef = useRef(
    `werewolf-room-${Math.random().toString(36).slice(2)}`,
  );
  const previousRoomStatusRef = useRef(initialRoom.status);
  const syncProbeInFlightRef = useRef(false);
  const syncVersionRef = useRef(initialRoom.syncVersion);
  const [localFormError, setLocalFormError] = useState<string | null>(null);
  const [joinState, joinAction] = useActionState(
    joinWerewolfRoomAction,
    initialState,
  );
  const [seatState, seatAction] = useActionState(
    claimWerewolfSeatAction,
    initialState,
  );
  const [leaveState, leaveAction] = useActionState(
    leaveWerewolfSeatAction,
    initialState,
  );
  const [readyState, readyAction] = useActionState(
    updateWerewolfReadyAction,
    initialState,
  );
  const [startState, startAction] = useActionState(
    startWerewolfRoomAction,
    initialState,
  );
  const [lifeState, lifeAction] = useActionState(
    updateWerewolfPlayerLifeAction,
    initialState,
  );
  const [sheriffState, sheriffAction] = useActionState(
    updateWerewolfSheriffAction,
    initialState,
  );
  const [finishState, finishAction] = useActionState(
    finishWerewolfRoomAction,
    initialState,
  );
  const [selectedAtmosphereId, setSelectedAtmosphereId] =
    useState<WerewolfAtmosphereId>(defaultWerewolfAtmosphere.id);
  const [atmospherePreferenceReady, setAtmospherePreferenceReady] =
    useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [pendingDeathSeatNumber, setPendingDeathSeatNumber] = useState<
    number | null
  >(null);
  const [pendingSheriffSeatNumber, setPendingSheriffSeatNumber] = useState<
    number | null
  >(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const t = getCopy(locale);
  const selectedAtmosphere = getWerewolfAtmosphereById(selectedAtmosphereId);
  const werewolfHomeHref = withLocale(locale, "/game-tools/werewolf");
  const joinUrl = `${baseUrl}${withLocale(
    locale,
    `/game-tools/werewolf/join/${room.code}`,
  )}`;
  const screenHref = withLocale(
    locale,
    `/game-tools/werewolf/rooms/${room.id}/screen`,
  );
  const isLobby = room.status === "LOBBY";
  const playerSeats = useMemo(
    () => room.seats.filter((seat) => seat.isPlayerSeat),
    [room.seats],
  );
  const judgeSeat = room.seats.find((seat) => seat.isJudgeSeat);
  const allSeatsReady =
    room.seats.length === room.variant.totalSeats &&
    room.seats.every((seat) => seat.isClaimed && Boolean(seat.readyAt));
  const currentMemberToken = room.currentMember?.memberToken ?? "";
  const currentSeatPrivateToken = getWerewolfViewerPrivateToken({
    currentMemberPrivateToken: room.currentMember?.seatedPrivateToken,
    viewerSeat: room.seats.find((seat) => seat.isViewerSeat),
  });
  const canChooseSeat = Boolean(room.currentMember) && isLobby;
  const winnerLabel =
    room.state.winner === "GOOD"
      ? t.winnerGood
      : room.state.winner === "WEREWOLF"
        ? t.winnerWerewolf
        : null;
  const noticeLabel = getNoticeLabel(notice, t);
  const canExitRoom = Boolean(currentSeatPrivateToken || room.currentMember);

  useEffect(() => {
    setSelectedAtmosphereId(getStoredWerewolfAtmosphereId());
    setAtmospherePreferenceReady(true);
  }, []);

  useEffect(() => {
    if (!atmospherePreferenceReady) {
      return;
    }

    try {
      window.localStorage.setItem(
        WEREWOLF_ATMOSPHERE_STORAGE_KEY,
        selectedAtmosphereId,
      );
    } catch {
      // Local preference storage can be unavailable in private browsing.
    }
  }, [atmospherePreferenceReady, selectedAtmosphereId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const preloadedImages = getWerewolfRoomPreloadAssets({
      atmosphereSrc: selectedAtmosphere.src,
      locale,
    }).map((assetSrc) => {
      const image = new window.Image();
      image.decoding = "async";
      image.src = assetSrc;

      return image;
    });

    return () => {
      preloadedImages.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [locale, selectedAtmosphere.src]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const roomHrefParams = new URLSearchParams();

    if (currentMemberToken) {
      roomHrefParams.set("memberToken", currentMemberToken);
    }

    const roomHrefSuffix = roomHrefParams.toString()
      ? `?${roomHrefParams.toString()}`
      : "";

    if (room.status === "IN_PROGRESS" && room.currentMember) {
      try {
        window.sessionStorage.removeItem(
          DISMISSED_ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
        );
        window.localStorage.setItem(
          ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
          JSON.stringify({
            code: room.code,
            href: `${withLocale(locale, `/game-tools/werewolf/rooms/${room.id}`)}${roomHrefSuffix}`,
            id: room.id,
            kind: "WEREWOLF",
            locale,
            privateSeatHref: currentSeatPrivateToken
              ? withLocale(
                  locale,
                  `/game-tools/werewolf/seats/${currentSeatPrivateToken}`,
                )
              : null,
            seatNumber: room.currentMember.seatedSeatNumber,
            title: room.title,
          } satisfies StoredActiveGameToolRoom),
        );
        window.dispatchEvent(new Event(ACTIVE_GAME_TOOL_ROOM_STORAGE_EVENT));
      } catch {
        // This shortcut is local-only; room actions still work without it.
      }

      return;
    }

    if (room.status === "FINISHED") {
      try {
        const storedValue = window.localStorage.getItem(
          ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
        );
        const storedRoom = storedValue
          ? (JSON.parse(storedValue) as Partial<StoredActiveGameToolRoom>)
          : null;

        if (storedRoom?.id === room.id) {
          window.localStorage.removeItem(ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY);
          window.sessionStorage.setItem(
            DISMISSED_ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
            room.id,
          );
          window.dispatchEvent(new Event(ACTIVE_GAME_TOOL_ROOM_STORAGE_EVENT));
        }
      } catch {
        // Ignore local shortcut cleanup failures.
      }
    }
  }, [
    currentMemberToken,
    currentSeatPrivateToken,
    locale,
    room.code,
    room.currentMember,
    room.id,
    room.status,
    room.title,
  ]);

  const canSubmitOnline = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (typeof window !== "undefined" && !window.navigator.onLine) {
        event.preventDefault();
        setLocalFormError(t.offline);
        return false;
      }

      setLocalFormError(null);
      return true;
    },
    [t.offline],
  );

  const clearActiveRoomClientState = useCallback(() => {
    try {
      window.localStorage.removeItem(ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY);
      window.sessionStorage.setItem(
        DISMISSED_ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
        room.id,
      );
      window.dispatchEvent(new Event(ACTIVE_GAME_TOOL_ROOM_STORAGE_EVENT));
    } catch {
      // The server action still removes the player from the game.
    }
  }, [room.id]);

  const handleTemporaryLeave = useCallback(() => {
    setExitDialogOpen(false);
    router.push(werewolfHomeHref);
  }, [router, werewolfHomeHref]);

  const broadcastRoomChange = useCallback(() => {
    broadcastChannelRef.current?.postMessage({
      roomId: room.id,
      sourceId: broadcastClientIdRef.current,
      type: "werewolf-room-changed",
    } satisfies WerewolfRoomBroadcastMessage);
  }, [room.id]);

  useEffect(() => {
    const mutationAge = Date.now() - lastOptimisticMutationAtRef.current;

    if (mutationAge < LOCAL_MUTATION_SYNC_GUARD_MS) {
      return;
    }

    syncVersionRef.current = initialRoom.syncVersion;
    setRoom(initialRoom);
  }, [initialRoom]);

  const refreshRoom = useCallback(
    async (options?: { force?: boolean }) => {
      if (typeof window !== "undefined" && !window.navigator.onLine) {
        return;
      }

      const mutationAge = Date.now() - lastOptimisticMutationAtRef.current;

      if (!options?.force && mutationAge < LOCAL_MUTATION_SYNC_GUARD_MS) {
        return;
      }

      try {
        const params = new URLSearchParams({
          include: "room",
          locale,
        });

        if (currentMemberToken) {
          params.set("memberToken", currentMemberToken);
        }

        const response = await fetch(
          `/api/game-tools/werewolf/rooms/${room.id}/sync?${params.toString()}`,
          {
            cache: "no-store",
          },
        );

        if (response.ok) {
          const payload = (await response.json()) as WerewolfRoomSyncPayload;

          if (payload.room) {
            syncVersionRef.current =
              payload.room.syncVersion ??
              payload.syncVersion ??
              syncVersionRef.current;
            setRoom(payload.room);
            return;
          }
        }
      } catch {
        // Fall through to a server component refresh as a compatibility backup.
      }

      startRefreshTransition(() => {
        router.refresh();
      });
    },
    [currentMemberToken, locale, room.id, router, startRefreshTransition],
  );

  const pollRoomSync = useCallback(
    async (options?: { force?: boolean }) => {
      if (typeof window !== "undefined" && !window.navigator.onLine) {
        return;
      }

      if (syncProbeInFlightRef.current) {
        return;
      }

      const mutationAge = Date.now() - lastOptimisticMutationAtRef.current;

      if (!options?.force && mutationAge < LOCAL_MUTATION_SYNC_GUARD_MS) {
        return;
      }

      syncProbeInFlightRef.current = true;

      try {
        const response = await fetch(
          `/api/game-tools/werewolf/rooms/${room.id}/sync`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          syncVersion?: string;
        };

        if (
          payload.syncVersion &&
          payload.syncVersion !== syncVersionRef.current
        ) {
          const now = Date.now();

          if (now - lastSyncRefreshAtRef.current > 1500) {
            lastSyncRefreshAtRef.current = now;
            void refreshRoom({ force: true });
          }
        }
      } catch {
        // Keep sync silent. The next focus or interval will retry.
      } finally {
        syncProbeInFlightRef.current = false;
      }
    },
    [refreshRoom, room.id],
  );

  useEffect(() => {
    if (room.status === "FINISHED") {
      return;
    }

    const intervalMs =
      getWerewolfSyncIntervalMs(room.status) + Math.floor(Math.random() * 900);
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void pollRoomSync();
      }
    }, intervalMs);
    const handleFocus = () => void pollRoomSync({ force: true });
    const handleOnline = () => void pollRoomSync({ force: true });
    const handleVisibility = () => {
      if (!document.hidden) {
        void pollRoomSync({ force: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pollRoomSync, room.status]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    const channel = new BroadcastChannel(WEREWOLF_ROOM_BROADCAST_CHANNEL);
    broadcastChannelRef.current = channel;

    channel.onmessage = (event: MessageEvent<WerewolfRoomBroadcastMessage>) => {
      const message = event.data;

      if (
        message?.type !== "werewolf-room-changed" ||
        message.roomId !== room.id ||
        message.sourceId === broadcastClientIdRef.current
      ) {
        return;
      }

      void pollRoomSync({ force: true });
    };

    return () => {
      if (broadcastChannelRef.current === channel) {
        broadcastChannelRef.current = null;
      }

      channel.close();
    };
  }, [pollRoomSync, room.id]);

  useEffect(() => {
    if (
      seatState.formError ||
      leaveState.formError ||
      readyState.formError ||
      startState.formError ||
      lifeState.formError ||
      sheriffState.formError ||
      finishState.formError
    ) {
      lastOptimisticMutationAtRef.current = 0;
      void refreshRoom({ force: true });
    }
  }, [
    leaveState.formError,
    finishState.formError,
    lifeState.formError,
    readyState.formError,
    refreshRoom,
    sheriffState.formError,
    seatState.formError,
    startState.formError,
  ]);

  useEffect(() => {
    if (
      seatState.formNotice ||
      readyState.formNotice ||
      sheriffState.formNotice ||
      finishState.formNotice
    ) {
      lastOptimisticMutationAtRef.current = 0;
      broadcastRoomChange();
      void refreshRoom({ force: true });
    }
  }, [
    broadcastRoomChange,
    finishState.formNotice,
    readyState.formNotice,
    refreshRoom,
    sheriffState.formNotice,
    seatState.formNotice,
  ]);

  useEffect(() => {
    if (!lifeState.formNotice) {
      return;
    }

    // The seat is already updated optimistically. Avoid blocking the judge UI
    // on an immediate full-room fetch; regular sync reconciles the snapshot.
    broadcastRoomChange();
  }, [broadcastRoomChange, lifeState.formNotice]);

  useEffect(() => {
    if (!leaveState.formNotice) {
      return;
    }

    if (leaveState.formNotice === "exited") {
      clearActiveRoomClientState();
      setExitDialogOpen(false);
      router.replace(werewolfHomeHref);
      return;
    }

    lastOptimisticMutationAtRef.current = 0;
    broadcastRoomChange();
    void refreshRoom({ force: true });
  }, [
    broadcastRoomChange,
    clearActiveRoomClientState,
    leaveState.formNotice,
    refreshRoom,
    router,
    werewolfHomeHref,
  ]);

  useEffect(() => {
    if (sheriffState.formNotice) {
      setPendingSheriffSeatNumber(null);
    }
  }, [sheriffState.formNotice]);

  useEffect(() => {
    if (finishState.formError) {
      setFinishDialogOpen(true);
    }

    if (finishState.formNotice) {
      setFinishDialogOpen(false);
    }
  }, [finishState.formError, finishState.formNotice]);

  useEffect(() => {
    const previousStatus = previousRoomStatusRef.current;

    if (previousStatus !== "FINISHED" && room.status === "FINISHED") {
      setFinishDialogOpen(false);
      setPendingDeathSeatNumber(null);
      setPendingSheriffSeatNumber(null);
      setResultDialogOpen(true);
    }

    previousRoomStatusRef.current = room.status;
  }, [room.status]);

  const applyOptimisticSeatClaim = useCallback(
    (seatNumber: number) => {
      lastOptimisticMutationAtRef.current = Date.now();

      setRoom((previousRoom): WerewolfRoomView => {
        if (!previousRoom.currentMember || previousRoom.status !== "LOBBY") {
          return previousRoom;
        }

        const targetSeat = previousRoom.seats.find(
          (seat) => seat.seatNumber === seatNumber,
        );

        if (!targetSeat || (targetSeat.isClaimed && !targetSeat.isViewerSeat)) {
          return previousRoom;
        }

        const previousSeatId = previousRoom.currentMember.seatedSeatId;
        const nextCurrentMember = {
          ...previousRoom.currentMember,
          readyAt: null,
          seatedPrivateToken: targetSeat.privateToken,
          seatedSeatId: targetSeat.id,
          seatedSeatNumber: targetSeat.seatNumber,
        };

        return {
          ...previousRoom,
          currentMember: nextCurrentMember,
          members: previousRoom.members.map((member) =>
            member.id === nextCurrentMember.id
              ? {
                  ...member,
                  readyAt: null,
                  seatedSeatId: targetSeat.id,
                  seatedSeatNumber: targetSeat.seatNumber,
                }
              : member,
          ),
          seats: previousRoom.seats.map((seat) => {
            if (seat.id === targetSeat.id) {
              return {
                ...seat,
                avatarLabel: nextCurrentMember.avatarLabel,
                avatarUrl: nextCurrentMember.avatarUrl,
                displayName: nextCurrentMember.displayName,
                isClaimed: true,
                isViewerSeat: true,
                profileId: nextCurrentMember.profileId,
                readyAt: null,
              };
            }

            if (seat.id === previousSeatId) {
              return {
                ...seat,
                avatarLabel: "",
                avatarUrl: null,
                displayName: t.empty,
                isClaimed: false,
                isViewerSeat: false,
                profileId: null,
                readyAt: null,
              };
            }

            return {
              ...seat,
              isViewerSeat: false,
            };
          }),
        };
      });
    },
    [t.empty],
  );

  const applyOptimisticReady = useCallback((ready: boolean) => {
    lastOptimisticMutationAtRef.current = Date.now();

    setRoom((previousRoom): WerewolfRoomView => {
      const currentMember = previousRoom.currentMember;

      if (!currentMember?.seatedSeatId || previousRoom.status !== "LOBBY") {
        return previousRoom;
      }

      const readyAt = ready ? new Date().toISOString() : null;

      return {
        ...previousRoom,
        currentMember: {
          ...currentMember,
          readyAt,
        },
        members: previousRoom.members.map((member) =>
          member.id === currentMember.id ? { ...member, readyAt } : member,
        ),
        seats: previousRoom.seats.map((seat) =>
          seat.id === currentMember.seatedSeatId ? { ...seat, readyAt } : seat,
        ),
      };
    });
  }, []);

  const applyOptimisticPlayerLife = useCallback(
    (seatNumber: number, isDead: boolean) => {
      lastOptimisticMutationAtRef.current = Date.now();

      setRoom(
        (previousRoom): WerewolfRoomView => ({
          ...previousRoom,
          seats: previousRoom.seats.map((seat) =>
            seat.seatNumber === seatNumber ? { ...seat, isDead } : seat,
          ),
        }),
      );
    },
    [],
  );

  const applyOptimisticLeaveSeat = useCallback(() => {
    lastOptimisticMutationAtRef.current = Date.now();

    setRoom((previousRoom): WerewolfRoomView => {
      const currentMember = previousRoom.currentMember;

      if (!currentMember?.seatedSeatId || previousRoom.status !== "LOBBY") {
        return previousRoom;
      }

      const previousSeatId = currentMember.seatedSeatId;

      return {
        ...previousRoom,
        currentMember: {
          ...currentMember,
          readyAt: null,
          seatedPrivateToken: null,
          seatedSeatId: null,
          seatedSeatNumber: null,
        },
        members: previousRoom.members.map((member) =>
          member.id === currentMember.id
            ? {
                ...member,
                readyAt: null,
                seatedSeatId: null,
                seatedSeatNumber: null,
              }
            : member,
        ),
        seats: previousRoom.seats.map((seat) =>
          seat.id === previousSeatId
            ? {
                ...seat,
                avatarLabel: "",
                avatarUrl: null,
                displayName: t.empty,
                isClaimed: false,
                isViewerSeat: false,
                profileId: null,
                readyAt: null,
              }
            : seat,
        ),
      };
    });
  }, [t.empty]);

  const currentViewerSeat =
    room.seats.find(
      (seat) =>
        seat.isViewerSeat ||
        room.currentMember?.seatedSeatNumber === seat.seatNumber,
    ) ?? null;
  const judgeIsViewer = isWerewolfJudgeViewer({
    currentMemberSeatNumber: room.currentMember?.seatedSeatNumber,
    judgeSeat,
  });
  const readySeatCount = room.seats.filter(
    (seat) => seat.isClaimed && seat.readyAt,
  ).length;
  const alivePlayerCount = countAliveWerewolfPlayers(playerSeats);
  const judgePrivateToken = judgeIsViewer
    ? (judgeSeat?.privateToken ?? null)
    : null;
  const canJudgeControlPlayers = Boolean(
    judgePrivateToken && room.status === "IN_PROGRESS",
  );
  const pendingDeathSeat =
    pendingDeathSeatNumber === null
      ? null
      : (playerSeats.find(
          (seat) =>
            seat.seatNumber === pendingDeathSeatNumber &&
            seat.isClaimed &&
            !seat.isDead,
        ) ?? null);
  const pendingSheriffSeat =
    pendingSheriffSeatNumber === null
      ? null
      : (playerSeats.find(
          (seat) =>
            seat.seatNumber === pendingSheriffSeatNumber && seat.isClaimed,
        ) ?? null);
  const pendingSheriffIsCurrent = Boolean(
    pendingSheriffSeat &&
    room.state.sheriffSeatNumber === pendingSheriffSeat.seatNumber,
  );
  const revealedPlayerSeats = playerSeats.filter((seat) => seat.isClaimed);
  const centerTitle =
    room.status === "FINISHED"
      ? (winnerLabel ?? t.finished)
      : room.status === "IN_PROGRESS"
        ? t.running
        : t.lobby;
  const centerSubtitle =
    room.status === "LOBBY"
      ? `${readySeatCount}/${room.seats.length} ${t.ready}`
      : room.status === "IN_PROGRESS"
        ? `${alivePlayerCount}/${playerSeats.length} ${t.alive}`
        : room.variant.label;

  const renderClaimedSeatAvatar = (seat: WerewolfSeat, className: string) => {
    const avatar = (
      <WerewolfAvatar
        avatarLabel={seat.avatarLabel}
        avatarUrl={seat.avatarUrl}
        className={className}
      />
    );

    if (!seat.profileId || seat.isViewerSeat) {
      return avatar;
    }

    return (
      <UserProfilePreviewPopover
        avatarUrl={seat.avatarUrl}
        giftSourceContextId={room.id}
        giftSourceSurface="OTHER"
        isAuthenticated={isAuthenticated}
        locale={locale}
        nickname={seat.displayName}
        profileId={seat.profileId}
        triggerClassName="relative rounded-full transition active:scale-95"
      >
        {avatar}
      </UserProfilePreviewPopover>
    );
  };

  const renderSeatNode = (seat: WerewolfSeat) => {
    const isCurrentSeat =
      seat.isViewerSeat ||
      room.currentMember?.seatedSeatNumber === seat.seatNumber;
    const emptySeatActionLabel = room.currentMember?.seatedSeatNumber
      ? t.changeSeat
      : t.selectSeat;
    const isSheriff = room.state.sheriffSeatNumber === seat.seatNumber;
    const showRoleIdentity =
      !isLobby &&
      seat.isPlayerSeat &&
      seat.isClaimed &&
      (judgeIsViewer || room.status === "FINISHED");
    const judgeSeatControls =
      judgeIsViewer &&
      seat.isPlayerSeat &&
      seat.isClaimed &&
      canJudgeControlPlayers &&
      judgePrivateToken ? (
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {seat.isDead ? (
            <form
              action={lifeAction}
              onSubmit={(event) => {
                if (!canSubmitOnline(event)) {
                  return;
                }

                applyOptimisticPlayerLife(seat.seatNumber, false);
              }}
            >
              <input name="locale" type="hidden" value={locale} />
              {currentMemberToken ? (
                <input
                  name="memberToken"
                  type="hidden"
                  value={currentMemberToken}
                />
              ) : null}
              <input
                name="privateToken"
                type="hidden"
                value={judgePrivateToken}
              />
              <input name="seatNumber" type="hidden" value={seat.seatNumber} />
              <input name="operation" type="hidden" value="revive" />
              <input name="responseMode" type="hidden" value="inline" />
              <JudgeLifeButton
                isDead
                label={`${t.judgeControls}: ${seat.displayName} · ${t.revive}`}
              />
            </form>
          ) : (
            <JudgeLifeButton
              isDead={false}
              label={`${t.judgeControls}: ${seat.displayName} · ${t.markDead}`}
              onClick={() => setPendingDeathSeatNumber(seat.seatNumber)}
              type="button"
            />
          )}
          <JudgeSheriffButton
            isSheriff={isSheriff}
            label={`${t.judgeControls}: ${seat.displayName} · ${
              isSheriff ? t.removeSheriff : t.setSheriff
            }`}
            onClick={() => setPendingSheriffSeatNumber(seat.seatNumber)}
            type="button"
          />
        </div>
      ) : null;

    if (!seat.isClaimed && isLobby && canChooseSeat) {
      return (
        <form
          action={seatAction}
          className="relative z-20"
          key={seat.id}
          onSubmit={(event) => {
            if (!canSubmitOnline(event)) {
              return;
            }

            applyOptimisticSeatClaim(seat.seatNumber);
          }}
        >
          <input name="locale" type="hidden" value={locale} />
          <input name="roomId" type="hidden" value={room.id} />
          <input name="memberToken" type="hidden" value={currentMemberToken} />
          <input name="seatNumber" type="hidden" value={seat.seatNumber} />
          <input name="responseMode" type="hidden" value="inline" />
          <button
            aria-label={`${emptySeatActionLabel} ${seat.seatNumber}`}
            className="group flex min-h-[4.5rem] w-full items-center gap-3 px-3 py-2.5 text-left text-white transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-55"
            type="submit"
          >
            <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-white/10 px-1 text-[11px] font-bold text-[#F1F2E3] ring-1 ring-white/20 friemi-tabular">
              {seat.seatNumber}
            </span>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-[#F1F2E3]/55 bg-[#062A24]/70 text-[#F1F2E3]">
              <Plus className="h-4 w-4 transition group-hover:scale-110" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">
                {t.empty}
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-white/58">
                {emptySeatActionLabel}
              </span>
            </span>
          </button>
        </form>
      );
    }

    return (
      <div
        className={`relative z-20 flex min-h-[4.5rem] items-center gap-3 px-3 py-2.5 transition ${
          isCurrentSeat ? "bg-[#F1F2E3]/10" : ""
        }`}
        key={seat.id}
      >
        <span
          className={`grid h-7 min-w-7 shrink-0 place-items-center rounded-full px-1 text-[11px] font-bold ring-1 friemi-tabular ${
            isCurrentSeat
              ? "bg-[#F1F2E3] text-[#153B31] ring-white/55"
              : "bg-white/10 text-[#F1F2E3] ring-white/20"
          }`}
        >
          {seat.seatNumber}
        </span>
        <div
          className={`relative shrink-0 rounded-full ${
            seat.isDead ? "grayscale opacity-55" : ""
          } ${
            isCurrentSeat
              ? "ring-2 ring-[#F1F2E3] ring-offset-2 ring-offset-[#082E28]"
              : ""
          }`}
        >
          {seat.isClaimed ? (
            renderClaimedSeatAvatar(
              seat,
              "h-11 w-11 border border-[#F1F2E3]/34 text-sm",
            )
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#102F29] text-xs font-bold text-[#F1F2E3] ring-1 ring-white/16 friemi-tabular">
              {seat.seatNumber}
            </span>
          )}
          {isSheriff ? (
            <span
              aria-label={t.setSheriff}
              className="absolute -right-1 -top-1 z-30 grid h-5 w-5 place-items-center rounded-full bg-[#F1F2E3] text-[#153B31] shadow-md ring-1 ring-white/75"
              title={t.setSheriff}
            >
              <Crown className="h-3 w-3" />
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-bold ${
              seat.isDead
                ? "text-white/45"
                : isCurrentSeat
                  ? "text-[#F1F2E3]"
                  : "text-white"
            }`}
          >
            {seat.isClaimed ? seat.displayName : t.empty}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {showRoleIdentity ? (
              <span className="max-w-full truncate rounded-full bg-[#F1F2E3] px-2 py-0.5 text-[10px] font-bold text-[#153B31]">
                {seat.roleLabel ?? t.roleUnknown}
              </span>
            ) : null}
            {seat.isDead ? (
              <span className="rounded-full bg-[#7A1F2B] px-2 py-0.5 text-[10px] font-bold text-white">
                {t.dead}
              </span>
            ) : null}
            {isLobby && seat.isClaimed ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  seat.readyAt
                    ? "bg-[#38A96D] text-white"
                    : "bg-white/10 text-white/60"
                }`}
              >
                {seat.readyAt ? t.ready : t.unready}
              </span>
            ) : null}
            {isCurrentSeat ? (
              <span className="text-[10px] font-bold text-[#F1F2E3]">
                {t.currentMember}
              </span>
            ) : null}
          </div>
        </div>
        {judgeSeatControls}
      </div>
    );
  };

  const renderJudgeSeatNode = (seat: WerewolfSeat) => {
    const isCurrentSeat =
      seat.isViewerSeat ||
      room.currentMember?.seatedSeatNumber === seat.seatNumber;

    if (!seat.isClaimed && isLobby && canChooseSeat) {
      return (
        <form
          action={seatAction}
          key={seat.id}
          onSubmit={(event) => {
            if (!canSubmitOnline(event)) {
              return;
            }

            applyOptimisticSeatClaim(seat.seatNumber);
          }}
        >
          <input name="locale" type="hidden" value={locale} />
          <input name="roomId" type="hidden" value={room.id} />
          <input name="memberToken" type="hidden" value={currentMemberToken} />
          <input name="seatNumber" type="hidden" value={seat.seatNumber} />
          <input name="responseMode" type="hidden" value="inline" />
          <button
            className="group flex min-h-[4.75rem] w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
            type="submit"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F1F2E3] text-[#153B31] shadow-sm">
              <Crown className="h-4 w-4" />
            </span>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-[#F1F2E3]/55 bg-[#062A24]/70 text-[#F1F2E3]">
              <Plus className="h-4 w-4 transition group-hover:scale-110" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#F1F2E3]">
                {t.judge}
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-white/58">
                {t.selectSeat}
              </span>
            </span>
          </button>
        </form>
      );
    }

    return (
      <div
        className={`flex min-h-[4.75rem] items-center gap-3 px-3 py-2.5 ${
          isCurrentSeat ? "bg-[#F1F2E3]/10" : ""
        }`}
        key={seat.id}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F1F2E3] text-[#153B31] shadow-sm">
          <Crown className="h-4 w-4" />
        </span>
        <div
          className={`shrink-0 rounded-full ${
            isCurrentSeat
              ? "ring-2 ring-[#F1F2E3] ring-offset-2 ring-offset-[#082E28]"
              : ""
          }`}
        >
          {seat.isClaimed ? (
            renderClaimedSeatAvatar(
              seat,
              "h-11 w-11 border border-[#F1F2E3]/34 text-sm",
            )
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#102F29] text-xs font-bold text-[#F1F2E3] ring-1 ring-white/16">
              {t.empty}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[#F1F2E3]">
            {seat.isClaimed ? seat.displayName : t.empty}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#F1F2E3]/14 px-2 py-0.5 text-[10px] font-bold text-[#F1F2E3]">
              {t.judge}
            </span>
            {isLobby && seat.isClaimed ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  seat.readyAt
                    ? "bg-[#38A96D] text-white"
                    : "bg-white/10 text-white/60"
                }`}
              >
                {seat.readyAt ? t.ready : t.unready}
              </span>
            ) : null}
            {isCurrentSeat ? (
              <span className="text-[10px] font-bold text-[#F1F2E3]">
                {t.currentMember}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 w-full overflow-hidden bg-[#062A24] md:min-h-[32rem]">
      <section className="h-full min-h-0 md:mx-auto md:h-[calc(100svh-1.5rem)] md:max-w-[28rem]">
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#062A24] px-3 pb-[calc(var(--app-bottom-safe-area)+0.75rem)] pt-[calc(var(--app-top-safe-area)+0.75rem)] text-white md:rounded-[1.4rem] md:p-2.5">
          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-[1.04] object-cover object-[center_62%] brightness-[0.72] contrast-[1.05] saturate-[0.9]"
            draggable={false}
            key={selectedAtmosphere.id}
            src={selectedAtmosphere.src}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/56 via-black/18 to-black/42" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[calc(var(--app-top-safe-area)+4.35rem)] bg-[#052A24]" />
          <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--app-top-safe-area)+4.35rem)] z-10 h-px bg-[#F1F2E3]/24" />
          <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--app-top-safe-area)+4.38rem)] z-10 h-8 bg-gradient-to-b from-[#052A24]/58 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-[var(--app-bottom-safe-area)] h-28 bg-gradient-to-t from-[#031F1B]/46 to-transparent" />

          <div className="relative z-20 grid h-10 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2">
            <button
              aria-label={t.back}
              className="grid h-10 w-10 place-items-center rounded-full bg-[#07372F] text-[#F1F2E3] shadow-[0_8px_20px_rgba(0,0,0,0.22)] ring-1 ring-[#F1F2E3]/36 transition hover:bg-[#0D493F]"
              onClick={() => {
                if (canExitRoom) {
                  setExitDialogOpen(true);
                  return;
                }

                router.push(werewolfHomeHref);
              }}
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="min-w-0 px-1 text-center">
              <p className="truncate text-sm font-bold tracking-normal text-[#F1F2E3] [text-shadow:0_1px_1px_rgba(0,0,0,0.7)]">
                {room.variant.label}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-white/88 [text-shadow:0_1px_1px_rgba(0,0,0,0.62)]">
                {t.code} ·{" "}
                <span className="friemi-tabular tracking-[0.18em] text-[#F1F2E3]">
                  {room.code}
                </span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <WerewolfAtmospherePicker
                locale={locale}
                onCycle={() => {
                  setSelectedAtmosphereId((currentId) => {
                    const currentIndex = werewolfAtmospheres.findIndex(
                      (atmosphere) => atmosphere.id === currentId,
                    );
                    const nextAtmosphere =
                      werewolfAtmospheres[
                        (currentIndex + 1) % werewolfAtmospheres.length
                      ] ?? defaultWerewolfAtmosphere;

                    return nextAtmosphere.id;
                  });
                }}
                selectedId={selectedAtmosphere.id}
              />
              <WerewolfRoomQrDialog
                joinUrl={joinUrl}
                roomCode={room.code}
                t={t}
              />
              <Link
                aria-label={t.publicScreen}
                className="grid h-10 w-10 place-items-center rounded-full bg-[#07372F] text-[#F1F2E3] shadow-[0_8px_20px_rgba(0,0,0,0.22)] ring-1 ring-[#F1F2E3]/36 transition hover:bg-[#0D493F]"
                href={screenHref}
                target="_blank"
              >
                <Monitor className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {exitDialogOpen ? (
            <div
              className="fixed inset-0 z-[95] grid place-items-end bg-black/52 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] md:place-items-center"
              role="presentation"
            >
              <section
                aria-modal="true"
                className="w-full max-w-[22rem] rounded-[1.35rem] border border-[#F1F2E3]/32 bg-[#FFFDF7] p-4 text-[#153B31] shadow-[0_24px_70px_rgba(0,0,0,0.38)]"
                role="dialog"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FCE7E2] text-[#B5301F]">
                    <LogOut className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold leading-6">
                      {t.exitGameTitle}
                    </h2>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[#153B31]/66">
                      {t.exitGameDescription}
                    </p>
                  </div>
                  <button
                    aria-label="Close"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#153B31]/58 transition hover:bg-[#EDF3EA] active:scale-95"
                    onClick={() => setExitDialogOpen(false)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div
                  className={`mt-4 grid gap-2 ${
                    room.status === "FINISHED" ? "grid-cols-1" : "grid-cols-2"
                  }`}
                >
                  {room.status !== "FINISHED" ? (
                    <button
                      className="inline-flex h-11 items-center justify-center rounded-full border border-[#D6D5B2] bg-white px-4 text-sm font-semibold text-[#153B31] transition hover:bg-[#F7FAF4] active:scale-[0.98]"
                      onClick={handleTemporaryLeave}
                      type="button"
                    >
                      {t.temporaryLeave}
                    </button>
                  ) : null}
                  <form
                    action={leaveAction}
                    onSubmit={(event) => {
                      canSubmitOnline(event);
                    }}
                  >
                    <input name="intent" type="hidden" value="exit_room" />
                    <input name="locale" type="hidden" value={locale} />
                    <input name="responseMode" type="hidden" value="inline" />
                    {currentSeatPrivateToken ? (
                      <input
                        name="privateToken"
                        type="hidden"
                        value={currentSeatPrivateToken}
                      />
                    ) : (
                      <>
                        <input name="roomId" type="hidden" value={room.id} />
                        <input
                          name="memberToken"
                          type="hidden"
                          value={currentMemberToken}
                        />
                      </>
                    )}
                    <SubmitButton
                      className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#B5301F] px-4 text-sm font-semibold text-white transition hover:bg-[#9F281B] disabled:cursor-not-allowed disabled:opacity-55"
                      disabled={!canExitRoom}
                      label={t.exitGame}
                    />
                  </form>
                </div>

                <button
                  className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold text-[#153B31]/62 transition hover:bg-[#EDF3EA]"
                  onClick={() => setExitDialogOpen(false)}
                  type="button"
                >
                  {t.stayGame}
                </button>
              </section>
            </div>
          ) : null}

          {noticeLabel ? (
            <div className="relative z-10 mt-3 flex items-center gap-2 rounded-2xl border border-[#F1F2E3]/28 bg-[#F1F2E3]/12 px-3 py-2 text-xs font-semibold text-[#F1F2E3]">
              <Check className="h-4 w-4" />
              {noticeLabel}
            </div>
          ) : null}

          <div className="relative z-10 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="relative px-2 py-2">
              <div className="flex items-center gap-3 rounded-2xl border border-[#F1F2E3]/22 bg-[#031F1B]/68 px-3 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#062A24] ring-1 ring-white/20">
                  <img
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover opacity-75"
                    draggable={false}
                    src="/game-tools/werewolf/werewolf.png"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-[#F1F2E3]">
                    {centerTitle}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-white/68">
                    {centerSubtitle}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/78 friemi-tabular">
                  {playerSeats.filter((seat) => seat.isClaimed).length}/
                  {playerSeats.length}
                </span>
              </div>

              <div className="mt-3 divide-y divide-white/10 overflow-hidden rounded-2xl border border-[#F1F2E3]/22 bg-[#031F1B]/68 shadow-[0_16px_38px_rgba(0,0,0,0.2)] backdrop-blur-sm">
                {judgeSeat ? renderJudgeSeatNode(judgeSeat) : null}
                {playerSeats.map((seat) => renderSeatNode(seat))}
              </div>
            </div>

            {testBotsEnabled && room.isHost ? (
              <div className="relative z-30 px-2 pb-3">
                <WerewolfTestBotPanel locale={locale} room={room} />
              </div>
            ) : null}
          </div>

          <div className="relative z-10 mt-2 shrink-0 space-y-2">
            {!room.currentMember && isLobby ? (
              <form
                action={joinAction}
                className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2"
              >
                <input name="locale" type="hidden" value={locale} />
                <input name="roomId" type="hidden" value={room.id} />
                <input
                  className="h-12 min-w-0 rounded-full border border-[#F1F2E3]/45 bg-[#F1F2E3]/95 px-4 text-sm font-semibold text-[#153B31] outline-none placeholder:text-[#153B31]/45 focus:border-[#F1F2E3]"
                  maxLength={40}
                  name="displayName"
                  placeholder={t.joinName}
                />
                <SubmitButton
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[#F1F2E3] px-4 text-sm font-semibold text-[#153B31] transition hover:bg-[#F1F2E3] disabled:cursor-not-allowed disabled:opacity-55"
                  label={t.enterMember}
                />
                {joinState.formError ? (
                  <p className="col-span-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                    {joinState.formError}
                  </p>
                ) : null}
              </form>
            ) : null}

            {canExitRoom && currentViewerSeat ? (
              <div className="grid gap-2">
                {isLobby ? (
                  <div className="grid grid-cols-2 gap-2">
                    <form
                      action={readyAction}
                      onSubmit={(event) => {
                        if (!canSubmitOnline(event)) {
                          return;
                        }

                        applyOptimisticReady(!currentViewerSeat.readyAt);
                      }}
                    >
                      <input name="locale" type="hidden" value={locale} />
                      <input name="roomId" type="hidden" value={room.id} />
                      {currentMemberToken ? (
                        <input
                          name="memberToken"
                          type="hidden"
                          value={currentMemberToken}
                        />
                      ) : null}
                      {currentViewerSeat.privateToken ? (
                        <input
                          name="privateToken"
                          type="hidden"
                          value={currentViewerSeat.privateToken}
                        />
                      ) : null}
                      <input
                        name="operation"
                        type="hidden"
                        value={currentViewerSeat.readyAt ? "unready" : "ready"}
                      />
                      <input name="responseMode" type="hidden" value="inline" />
                      <SubmitButton
                        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#F1F2E3] px-5 text-sm font-semibold text-[#153B31] transition hover:bg-[#F1F2E3] disabled:cursor-not-allowed disabled:opacity-55"
                        label={
                          currentViewerSeat.readyAt
                            ? t.unreadyAction
                            : t.readyAction
                        }
                      />
                    </form>
                    <form
                      action={leaveAction}
                      onSubmit={(event) => {
                        if (!canSubmitOnline(event)) {
                          return;
                        }

                        applyOptimisticLeaveSeat();
                      }}
                    >
                      <input name="locale" type="hidden" value={locale} />
                      <input name="roomId" type="hidden" value={room.id} />
                      {currentMemberToken ? (
                        <input
                          name="memberToken"
                          type="hidden"
                          value={currentMemberToken}
                        />
                      ) : null}
                      {currentViewerSeat.privateToken ? (
                        <input
                          name="privateToken"
                          type="hidden"
                          value={currentViewerSeat.privateToken}
                        />
                      ) : null}
                      <input name="responseMode" type="hidden" value="inline" />
                      <SubmitButton
                        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#F1F2E3] px-5 text-sm font-semibold text-[#153B31] transition hover:bg-[#F1F2E3] disabled:cursor-not-allowed disabled:opacity-55"
                        label={t.leaveSeat}
                      />
                    </form>
                  </div>
                ) : currentViewerSeat.privateToken ? (
                  <div
                    className={`grid gap-2 ${
                      judgeIsViewer && room.status === "FINISHED"
                        ? "grid-cols-1"
                        : "grid-cols-2"
                    }`}
                  >
                    {judgeIsViewer && room.status === "IN_PROGRESS" ? (
                      <button
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#F1F2E3] px-5 text-sm font-semibold text-[#153B31] transition hover:bg-[#F1F2E3] active:scale-[0.98]"
                        onClick={() => setFinishDialogOpen(true)}
                        type="button"
                      >
                        <Flag className="h-4 w-4" />
                        {t.finishGame}
                      </button>
                    ) : !judgeIsViewer ? (
                      <Link
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#F1F2E3] px-5 text-sm font-semibold text-[#153B31] transition hover:bg-[#F1F2E3]"
                        href={withLocale(
                          locale,
                          `/game-tools/werewolf/seats/${currentViewerSeat.privateToken}`,
                        )}
                      >
                        <Ticket className="h-4 w-4" />
                        {t.openSeat}
                      </Link>
                    ) : null}
                    <button
                      className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#F1F2E3]/55 bg-transparent px-5 text-sm font-semibold text-[#F1F2E3] transition hover:bg-[#F1F2E3]/10 active:scale-[0.98]"
                      onClick={() => setExitDialogOpen(true)}
                      type="button"
                    >
                      {t.exitGame}
                    </button>
                  </div>
                ) : null}

                {judgeIsViewer && judgeSeat?.privateToken && isLobby ? (
                  <form
                    action={startAction}
                    className="grid gap-1.5"
                    onSubmit={(event) => {
                      if (!canSubmitOnline(event)) {
                        return;
                      }

                      if (!window.confirm(t.startConfirm)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input name="locale" type="hidden" value={locale} />
                    <input
                      name="privateToken"
                      type="hidden"
                      value={judgeSeat.privateToken}
                    />
                    <SubmitButton
                      className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#F1F2E3] px-5 text-sm font-semibold text-[#153B31] transition hover:bg-[#F1F2E3] disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!allSeatsReady}
                      label={t.start}
                    />
                    {!allSeatsReady ? (
                      <p className="text-center text-[11px] font-bold text-white/58">
                        {t.startWaiting}
                      </p>
                    ) : null}
                  </form>
                ) : null}
              </div>
            ) : null}

            {!canExitRoom && !isLobby ? (
              <p className="rounded-2xl border border-[#F1F2E3]/25 bg-[#F1F2E3]/10 px-3 py-2 text-center text-xs font-bold text-[#F1F2E3]">
                {t.locked}
              </p>
            ) : null}

            {localFormError ||
            seatState.formError ||
            leaveState.formError ||
            readyState.formError ||
            startState.formError ||
            lifeState.formError ||
            sheriffState.formError ||
            finishState.formError ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {localFormError ||
                  seatState.formError ||
                  leaveState.formError ||
                  readyState.formError ||
                  startState.formError ||
                  lifeState.formError ||
                  sheriffState.formError ||
                  finishState.formError ||
                  t.claimError}
              </p>
            ) : null}
          </div>
        </div>
      </section>
      {pendingDeathSeat && judgePrivateToken && canJudgeControlPlayers ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/55 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur-sm"
          onMouseDown={() => setPendingDeathSeatNumber(null)}
          role="presentation"
        >
          <form
            action={lifeAction}
            aria-describedby="werewolf-death-confirm-description"
            aria-labelledby="werewolf-death-confirm-title"
            aria-modal="true"
            className="w-full max-w-[20rem] rounded-[1.2rem] border border-[#F1F2E3]/45 bg-white p-5 text-[#18221F] shadow-[0_24px_70px_rgba(0,0,0,0.34)]"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              if (!canSubmitOnline(event)) {
                return;
              }

              applyOptimisticPlayerLife(pendingDeathSeat.seatNumber, true);
              setPendingDeathSeatNumber(null);
            }}
            role="alertdialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#7A1F2B]">
                  {t.judgeControls}
                </p>
                <h2
                  className="mt-1 text-lg font-bold"
                  id="werewolf-death-confirm-title"
                >
                  {t.deathConfirmTitle}
                </h2>
              </div>
              <button
                aria-label={t.deathConfirmCancel}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#D6D5B2] text-[#59635F] transition hover:bg-[#F4F4EF]"
                onClick={() => setPendingDeathSeatNumber(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 border-y border-[#E7E4D8] py-3">
              <WerewolfAvatar
                avatarLabel={pendingDeathSeat.avatarLabel}
                avatarUrl={pendingDeathSeat.avatarUrl}
                className="h-12 w-12 shrink-0 text-sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {pendingDeathSeat.seatNumber}. {pendingDeathSeat.displayName}
                </p>
                <p className="mt-1 text-xs font-bold text-[#7A1F2B]">
                  {pendingDeathSeat.roleLabel ?? t.roleUnknown}
                </p>
              </div>
            </div>

            <p
              className="mt-4 text-sm leading-6 text-[#66706C]"
              id="werewolf-death-confirm-description"
            >
              {t.deathConfirmDescription}
            </p>

            <input name="locale" type="hidden" value={locale} />
            {currentMemberToken ? (
              <input
                name="memberToken"
                type="hidden"
                value={currentMemberToken}
              />
            ) : null}
            <input
              name="privateToken"
              type="hidden"
              value={judgePrivateToken}
            />
            <input
              name="seatNumber"
              type="hidden"
              value={pendingDeathSeat.seatNumber}
            />
            <input name="operation" type="hidden" value="mark_dead" />
            <input name="responseMode" type="hidden" value="inline" />

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="h-11 rounded-full border border-[#D6D5B2] bg-white text-sm font-bold text-[#315D4A] transition hover:bg-[#F4F4EF]"
                onClick={() => setPendingDeathSeatNumber(null)}
                type="button"
              >
                {t.deathConfirmCancel}
              </button>
              <SubmitButton
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#9B2433] px-4 text-sm font-bold text-white transition hover:bg-[#7A1F2B] disabled:cursor-not-allowed disabled:opacity-55"
                label={t.deathConfirmSubmit}
              />
            </div>
          </form>
        </div>
      ) : null}
      {pendingSheriffSeat && judgePrivateToken && canJudgeControlPlayers ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/55 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur-sm"
          onMouseDown={() => setPendingSheriffSeatNumber(null)}
          role="presentation"
        >
          <form
            action={sheriffAction}
            aria-describedby="werewolf-sheriff-confirm-description"
            aria-labelledby="werewolf-sheriff-confirm-title"
            aria-modal="true"
            className="w-full max-w-[20rem] rounded-[1.2rem] border border-[#F1F2E3]/45 bg-white p-5 text-[#18221F] shadow-[0_24px_70px_rgba(0,0,0,0.34)]"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={canSubmitOnline}
            role="alertdialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[#153B31]">
                  <Crown className="h-3.5 w-3.5" />
                  {pendingSheriffIsCurrent ? t.removeSheriff : t.setSheriff}
                </p>
                <h2
                  className="mt-1 text-lg font-bold"
                  id="werewolf-sheriff-confirm-title"
                >
                  {pendingSheriffIsCurrent
                    ? t.sheriffConfirmRemoveTitle
                    : t.sheriffConfirmSetTitle}
                </h2>
              </div>
              <button
                aria-label={t.deathConfirmCancel}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#D6D5B2] text-[#59635F] transition hover:bg-[#F4F4EF]"
                onClick={() => setPendingSheriffSeatNumber(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 border-y border-[#E7E4D8] py-3">
              <WerewolfAvatar
                avatarLabel={pendingSheriffSeat.avatarLabel}
                avatarUrl={pendingSheriffSeat.avatarUrl}
                className="h-12 w-12 shrink-0 text-sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {pendingSheriffSeat.seatNumber}.{" "}
                  {pendingSheriffSeat.displayName}
                </p>
                <p className="mt-1 text-xs font-bold text-[#153B31]">
                  {pendingSheriffSeat.roleLabel ?? t.roleUnknown}
                </p>
              </div>
            </div>

            <p
              className="mt-4 text-sm leading-6 text-[#66706C]"
              id="werewolf-sheriff-confirm-description"
            >
              {pendingSheriffIsCurrent
                ? t.sheriffConfirmRemoveDescription
                : t.sheriffConfirmSetDescription}
            </p>

            {sheriffState.formError ? (
              <p className="mt-3 text-sm font-bold text-[#9B2433]">
                {sheriffState.formError}
              </p>
            ) : null}

            <input name="locale" type="hidden" value={locale} />
            {currentMemberToken ? (
              <input
                name="memberToken"
                type="hidden"
                value={currentMemberToken}
              />
            ) : null}
            <input
              name="privateToken"
              type="hidden"
              value={judgePrivateToken}
            />
            <input
              name="seatNumber"
              type="hidden"
              value={pendingSheriffSeat.seatNumber}
            />
            <input
              name="operation"
              type="hidden"
              value={pendingSheriffIsCurrent ? "clear" : "set"}
            />
            <input name="responseMode" type="hidden" value="inline" />

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="h-11 rounded-full border border-[#D6D5B2] bg-white text-sm font-bold text-[#315D4A] transition hover:bg-[#F4F4EF]"
                onClick={() => setPendingSheriffSeatNumber(null)}
                type="button"
              >
                {t.deathConfirmCancel}
              </button>
              <SubmitButton
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#F1F2E3] px-4 text-sm font-bold text-[#153B31] ring-1 ring-[#D6D5B2] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
                label={pendingSheriffIsCurrent ? t.removeSheriff : t.setSheriff}
              />
            </div>
          </form>
        </div>
      ) : null}
      {finishDialogOpen && judgePrivateToken && canJudgeControlPlayers ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur-sm"
          onMouseDown={() => setFinishDialogOpen(false)}
          role="presentation"
        >
          <form
            action={finishAction}
            aria-describedby="werewolf-finish-description"
            aria-labelledby="werewolf-finish-title"
            aria-modal="true"
            className="w-full max-w-[21rem] overflow-hidden rounded-[1.25rem] border border-[#F1F2E3]/45 bg-white text-[#18221F] shadow-[0_24px_70px_rgba(0,0,0,0.38)]"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={canSubmitOnline}
            role="alertdialog"
          >
            <div className="bg-[#153B31] px-5 pb-5 pt-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F1F2E3]">
                    <Flag className="h-3.5 w-3.5" />
                    {t.finishGame}
                  </p>
                  <h2
                    className="mt-1 text-xl font-bold"
                    id="werewolf-finish-title"
                  >
                    {t.finishGameTitle}
                  </h2>
                </div>
                <button
                  aria-label={t.deathConfirmCancel}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                  onClick={() => setFinishDialogOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p
                className="mt-3 text-sm leading-6 text-white/72"
                id="werewolf-finish-description"
              >
                {t.finishGameDescription}
              </p>
            </div>

            <input name="locale" type="hidden" value={locale} />
            {currentMemberToken ? (
              <input
                name="memberToken"
                type="hidden"
                value={currentMemberToken}
              />
            ) : null}
            <input
              name="privateToken"
              type="hidden"
              value={judgePrivateToken}
            />
            <input name="responseMode" type="hidden" value="inline" />

            <div className="grid gap-2 p-4">
              <FinishOutcomeButton
                className="h-12 rounded-full bg-[#176B45] px-4 text-sm font-bold text-white transition hover:bg-[#125739] disabled:cursor-not-allowed disabled:opacity-55"
                label={t.finishGood}
                value="GOOD"
              />
              <FinishOutcomeButton
                className="h-12 rounded-full bg-[#9B2433] px-4 text-sm font-bold text-white transition hover:bg-[#7A1F2B] disabled:cursor-not-allowed disabled:opacity-55"
                label={t.finishWerewolf}
                value="WEREWOLF"
              />
              <FinishOutcomeButton
                className="h-11 rounded-full border border-[#C9C9BB] bg-white px-4 text-sm font-bold text-[#59635F] transition hover:bg-[#F4F4EF] disabled:cursor-not-allowed disabled:opacity-55"
                label={t.terminateGame}
                value="TERMINATED"
              />
              {finishState.formError ? (
                <p className="pt-1 text-center text-sm font-bold text-[#9B2433]">
                  {finishState.formError}
                </p>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
      {resultDialogOpen && room.status === "FINISHED" ? (
        <div
          className="fixed inset-0 z-[92] grid place-items-center bg-black/64 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur-sm"
          onMouseDown={() => setResultDialogOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="werewolf-result-title"
            aria-modal="true"
            className="flex max-h-[82dvh] w-full max-w-[22rem] flex-col overflow-hidden rounded-[1.25rem] border border-[#F1F2E3]/45 bg-[#FFFDF7] text-[#18221F] shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="bg-[#153B31] px-5 pb-5 pt-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[#F1F2E3]">
                    {t.resultDialogTitle}
                  </p>
                  <h2
                    className="mt-1 text-2xl font-bold"
                    id="werewolf-result-title"
                  >
                    {winnerLabel ?? t.gameTerminated}
                  </h2>
                </div>
                <button
                  aria-label={t.resultDialogClose}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                  onClick={() => setResultDialogOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/72">
                {t.resultDialogDescription}
              </p>
            </div>

            <div className="min-h-0 overflow-y-auto px-4 py-4">
              <p className="mb-3 text-xs font-bold text-[#315D4A]">
                {t.allRoles}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {revealedPlayerSeats.map((seat) => (
                  <div
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-[#E3DFCE] bg-white px-2.5 py-2"
                    key={seat.id}
                  >
                    <WerewolfAvatar
                      avatarLabel={seat.avatarLabel}
                      avatarUrl={seat.avatarUrl}
                      className={`h-9 w-9 shrink-0 text-xs ${
                        seat.isDead ? "grayscale opacity-55" : ""
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">
                        {seat.seatNumber}. {seat.displayName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-bold text-[#7A1F2B]">
                        {seat.roleLabel ?? t.roleUnknown}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[#E3DFCE] p-4">
              <button
                className="h-11 w-full rounded-full bg-[#176B45] text-sm font-bold text-white transition hover:bg-[#125739]"
                onClick={() => {
                  setResultDialogOpen(false);
                  if (canExitRoom) {
                    setExitDialogOpen(true);
                  } else {
                    router.push(werewolfHomeHref);
                  }
                }}
                type="button"
              >
                {canExitRoom ? t.exitGame : t.resultDialogClose}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
