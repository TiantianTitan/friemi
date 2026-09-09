"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { LoaderCircle, UserPlus } from "lucide-react";
import { Button, Input, Textarea } from "@chill-club/ui";
import { trackClientAnalyticsEvent } from "@/features/analytics/client";
import {
  joinActivityAsGuestAction,
  type GuestJoinActivityState,
} from "@/features/guest-participants/actions/joinAsGuest";
import { getSignInHref } from "@/lib/auth-redirect";
import { getCopy } from "@/lib/copy";
import {
  joinActivityAction,
  type JoinActivityState,
} from "../actions/joinActivity";
import { getActivityDetailPath } from "../utils/activityRoutes";
import { CancelParticipationForm } from "./CancelParticipationForm";
import { useTeamDetailMobileCtaSheetClose } from "./TeamDetailMobileCtaSheet";

type ViewerParticipationStatus =
  | "JOINED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | null;

type JoinActivityFormProps = {
  activityId: string;
  activityTitle: string;
  accessToken?: string | null;
  canAddGuest?: boolean;
  closeOnSuccess?: boolean;
  formInstanceId?: string;
  hideMessageHint?: boolean;
  locale: string;
  requiresApproval: boolean;
  isFull: boolean;
  isClosed: boolean;
  isOrganizer: boolean;
  isAuthenticated: boolean;
  viewerParticipationStatus: ViewerParticipationStatus;
};

const initialState: JoinActivityState = {};
const initialGuestState: GuestJoinActivityState = {};

function getGuestJoinCopy(locale: string) {
  if (locale === "fr") {
    return {
      addAnother: "Ajouter un autre invité",
      adminEntry: "Ajouter un invité",
      title: "Ajouter un invité",
      description:
        "Réservé aux administrateurs Friemi. L'invité est ajouté directement à la liste des participants.",
      displayNameLabel: "Nom ou pseudo",
      displayNamePlaceholder: "Votre nom affiché",
      phoneLabel: "Téléphone",
      phonePlaceholder: "Téléphone, optionnel",
      emailLabel: "E-mail",
      emailPlaceholder: "E-mail, optionnel",
      wechatLabel: "WeChat",
      wechatPlaceholder: "Identifiant WeChat, optionnel",
      contactHint:
        "Les coordonnées sont facultatives et peuvent servir à rattacher cette participation à un compte plus tard.",
      messageLabel: "Message",
      submit: "Ajouter l'invité",
      submitting: "Envoi...",
      loginJoin: "Se connecter pour s'inscrire",
      loginRequired:
        "La consultation reste libre, mais un compte est obligatoire pour s'inscrire et assurer le suivi des participations.",
      successTitle: "Invité ajouté",
      successDescription:
        "L'invité figure maintenant dans la liste des participants.",
    };
  }

  if (locale === "en") {
    return {
      addAnother: "Add another guest",
      adminEntry: "Add guest",
      title: "Add guest",
      description:
        "Friemi admins only. The guest is added directly to the participant list.",
      displayNameLabel: "Name or nickname",
      displayNamePlaceholder: "Name shown to the organizer",
      phoneLabel: "Phone",
      phonePlaceholder: "Phone, optional",
      emailLabel: "Email",
      emailPlaceholder: "Email, optional",
      wechatLabel: "WeChat",
      wechatPlaceholder: "WeChat ID, optional",
      contactHint:
        "Contact details are optional and can link this participation to an account later.",
      messageLabel: "Message",
      submit: "Add guest",
      submitting: "Submitting...",
      loginJoin: "Sign in to join",
      loginRequired:
        "Anyone can browse, but joining requires an account so attendance and no-shows can be tracked.",
      successTitle: "Guest added",
      successDescription: "The guest is now included in the participant list.",
    };
  }

  return {
    addAnother: "继续添加游客",
    adminEntry: "添加游客",
    title: "管理员添加游客",
    description: "仅网站管理员可操作。游客会直接加入报名名单。",
    displayNameLabel: "名字/昵称",
    displayNamePlaceholder: "活动中展示的名字",
    phoneLabel: "电话",
    phonePlaceholder: "电话，可选",
    emailLabel: "邮箱",
    emailPlaceholder: "邮箱，可选",
    wechatLabel: "微信",
    wechatPlaceholder: "微信号，可选",
    contactHint: "联系方式可选，之后可用于将这条参与记录关联到账号。",
    messageLabel: "报名留言",
    submit: "添加游客",
    submitting: "提交中...",
    loginJoin: "登录后报名",
    loginRequired:
      "游客可以浏览聚吧内容，但报名必须登录，以便记录参与和爽约情况。",
    successTitle: "游客已添加",
    successDescription: "该游客已进入报名名单。",
  };
}

function SubmitButton({
  locale,
  requiresApproval,
}: {
  locale: string;
  requiresApproval: boolean;
}) {
  const { pending } = useFormStatus();
  const t = getCopy(locale).join;

  return (
    <Button
      type="submit"
      className="min-h-11 h-auto w-full gap-2 rounded-full border-0 bg-coral px-4 py-2 text-center leading-tight text-white shadow-[0_14px_28px_rgba(240,145,130,0.24)] hover:bg-danger"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      <span className="min-w-0 text-center leading-tight">
        {pending
          ? t.submitting
          : requiresApproval
            ? t.submitApproval
            : t.submit}
      </span>
    </Button>
  );
}

function GuestSubmitButton({ locale }: { locale: string }) {
  const { pending } = useFormStatus();
  const t = getGuestJoinCopy(locale);

  return (
    <Button
      type="submit"
      className="min-h-11 h-auto w-full gap-2 rounded-full border-0 bg-coral px-4 py-2 text-center leading-tight text-white shadow-[0_14px_28px_rgba(240,145,130,0.24)] hover:bg-danger"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      <span className="min-w-0 text-center leading-tight">
        {pending ? t.submitting : t.submit}
      </span>
    </Button>
  );
}

function PendingSubmitNotice({ locale }: { locale: string }) {
  const { pending } = useFormStatus();
  const t = getCopy(locale).join;

  if (!pending) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-moss/20 bg-moss/10 px-3 py-2 text-xs font-medium text-moss"
      aria-live="polite"
    >
      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      <span>{t.submitting}</span>
    </div>
  );
}

function DisabledAction({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 leading-6 text-zinc-500">{description}</p>
    </div>
  );
}

function GuestJoinForm({
  activityId,
  formAction,
  locale,
  state,
}: {
  activityId: string;
  formAction: (payload: FormData) => void;
  locale: string;
  state: GuestJoinActivityState;
}) {
  const t = getGuestJoinCopy(locale);

  return (
    <form
      action={formAction}
      className="grid gap-3"
      noValidate
      onSubmit={() => {
        trackClientAnalyticsEvent({
          name: "join_started",
          entityId: activityId,
          entityType: "team",
          sourceSurface: "activity_detail",
          properties: {
            requires_approval: false,
            signup_mode: "admin_guest",
          },
        });
      }}
    >
      <input name="activityId" type="hidden" value={activityId} />
      <input name="locale" type="hidden" value={locale} />

      <div className="rounded-md border border-sand bg-white/70 px-3 py-2.5 text-sm">
        <p className="font-semibold text-ink">{t.title}</p>
        <p className="mt-1 leading-5 text-zinc-500">{t.description}</p>
      </div>

      {state.formError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.formError}
        </div>
      ) : null}

      <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
        {t.displayNameLabel}
        <Input
          name="displayName"
          defaultValue={state.values?.displayName}
          maxLength={24}
          placeholder={t.displayNamePlaceholder}
          className="h-10 bg-white"
        />
        {state.fieldErrors?.displayName?.[0] ? (
          <span className="text-xs font-medium text-red-600">
            {state.fieldErrors.displayName[0]}
          </span>
        ) : null}
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
          {t.phoneLabel}
          <Input
            name="phone"
            defaultValue={state.values?.phone}
            inputMode="tel"
            maxLength={40}
            placeholder={t.phonePlaceholder}
            className="h-10 bg-white"
          />
          {state.fieldErrors?.phone?.[0] ? (
            <span className="text-xs font-medium text-red-600">
              {state.fieldErrors.phone[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
          {t.emailLabel}
          <Input
            name="email"
            defaultValue={state.values?.email}
            inputMode="email"
            maxLength={120}
            placeholder={t.emailPlaceholder}
            className="h-10 bg-white"
            type="email"
          />
          {state.fieldErrors?.email?.[0] ? (
            <span className="text-xs font-medium text-red-600">
              {state.fieldErrors.email[0]}
            </span>
          ) : null}
        </label>
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
        {t.wechatLabel}
        <Input
          name="wechatId"
          defaultValue={state.values?.wechatId}
          maxLength={80}
          placeholder={t.wechatPlaceholder}
          className="h-10 bg-white"
        />
        {state.fieldErrors?.wechatId?.[0] ? (
          <span className="text-xs font-medium text-red-600">
            {state.fieldErrors.wechatId[0]}
          </span>
        ) : null}
      </label>

      <div className="-mt-1 grid gap-1">
        <p className="text-xs leading-5 text-zinc-500">{t.contactHint}</p>
        {state.fieldErrors?.contact?.[0] ? (
          <span className="text-xs font-medium text-red-600">
            {state.fieldErrors.contact[0]}
          </span>
        ) : null}
      </div>

      <label className="grid gap-2 text-sm font-medium text-zinc-700">
        {t.messageLabel}
        <Textarea
          className="min-h-20"
          name="message"
          defaultValue={state.values?.message}
          maxLength={300}
          placeholder={getCopy(locale).join.messagePlaceholder}
        />
        {state.fieldErrors?.message?.[0] ? (
          <span className="text-xs font-medium text-red-600">
            {state.fieldErrors.message[0]}
          </span>
        ) : null}
      </label>

      <PendingSubmitNotice locale={locale} />
      <GuestSubmitButton locale={locale} />
    </form>
  );
}

function getParticipationCopy(
  status: Exclude<ViewerParticipationStatus, null>,
  locale: string,
) {
  const t = getCopy(locale).join;

  if (status === "PENDING") {
    return {
      title: t.pendingTitle,
      description: t.pendingDescription,
    };
  }

  return {
    title: t.joinedTitle,
    description: t.joinedDescription,
  };
}

function ParticipationStatusCard({
  description,
  isPending,
  title,
}: {
  description: string;
  isPending: boolean;
  title: string;
}) {
  return (
    <div
      className={
        isPending
          ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm"
          : "rounded-xl border border-[#D6D5B2] bg-white/90 px-3 py-3 text-sm"
      }
    >
      <p
        className={
          isPending ? "font-medium text-amber-900" : "font-medium text-ink"
        }
      >
        {title}
      </p>
      <p
        className={
          isPending
            ? "mt-1 leading-6 text-amber-800"
            : "mt-1 leading-6 text-zinc-500"
        }
      >
        {description}
      </p>
    </div>
  );
}

function RejoinNotice({
  locale,
  status,
}: {
  locale: string;
  status: "REJECTED";
}) {
  const t = getCopy(locale).join;
  const copy = {
    title: t.rejectedTitle,
    description: t.rejectedDescription,
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <p className="font-medium text-amber-900">{copy.title}</p>
      <p className="mt-1 leading-6 text-amber-800">{copy.description}</p>
    </div>
  );
}

function getSignInReturnPath(activityId: string, accessToken?: string | null) {
  const detailPath = getActivityDetailPath(activityId);

  if (!accessToken) {
    return detailPath;
  }

  const params = new URLSearchParams({ access: accessToken });
  return `${detailPath}?${params.toString()}`;
}

function SignInToJoinEntry({
  accessToken,
  activityId,
  locale,
}: {
  accessToken?: string | null;
  activityId: string;
  locale: string;
}) {
  const t = getGuestJoinCopy(locale);

  return (
    <div className="grid gap-2.5">
      <Link
        className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-full border border-transparent bg-coral px-3 py-2 text-center text-sm font-semibold leading-tight text-white shadow-[0_12px_24px_rgba(240,145,130,0.22)] transition hover:bg-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/35"
        href={getSignInHref(
          locale,
          getSignInReturnPath(activityId, accessToken),
        )}
      >
        <span className="min-w-0 leading-tight">{t.loginJoin}</span>
      </Link>
      <p className="px-1 text-xs font-medium leading-5 text-[#156240]/75">
        {t.loginRequired}
      </p>
    </div>
  );
}

function AdminGuestParticipantControlInstance({
  activityId,
  closeOnSuccess,
  formInstanceId,
  locale,
  onReset,
}: {
  activityId: string;
  closeOnSuccess: boolean;
  formInstanceId?: string;
  locale: string;
  onReset: () => void;
}) {
  const [state, formAction] = useActionState(
    joinActivityAsGuestAction,
    initialGuestState,
  );
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const closeMobileCtaSheet = useTeamDetailMobileCtaSheetClose();
  const t = getGuestJoinCopy(locale);
  const guestFormId = `admin-guest-form-${activityId}${formInstanceId ? `-${formInstanceId}` : ""}`;

  useEffect(() => {
    if (!state.success) {
      return;
    }

    startTransition(() => {
      router.refresh();
    });

    if (closeOnSuccess) {
      closeMobileCtaSheet?.();
    }
  }, [
    closeMobileCtaSheet,
    closeOnSuccess,
    router,
    startTransition,
    state.success,
  ]);

  if (state.success) {
    return (
      <div className="grid gap-2.5 rounded-lg border border-[#8AB68E] bg-[#F6FAF4] p-3 text-sm">
        <div>
          <p className="font-semibold text-[#156240]">{t.successTitle}</p>
          <p className="mt-1 leading-5 text-[#156240]/70">
            {t.successDescription}
          </p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#8AB68E] bg-white px-4 font-semibold text-[#156240]"
          onClick={onReset}
          type="button"
        >
          <UserPlus aria-hidden="true" className="h-4 w-4" />
          {t.addAnother}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <button
        aria-controls={guestFormId}
        aria-expanded={showGuestForm}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#8AB68E] bg-white px-4 text-sm font-semibold text-[#156240] transition hover:bg-[#F6FAF4] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#369758]/25"
        onClick={() => setShowGuestForm((current) => !current)}
        type="button"
      >
        <UserPlus aria-hidden="true" className="h-4 w-4" />
        {t.adminEntry}
      </button>

      {showGuestForm ? (
        <div id={guestFormId}>
          <GuestJoinForm
            activityId={activityId}
            formAction={formAction}
            locale={locale}
            state={state}
          />
        </div>
      ) : null}
    </div>
  );
}

export function AdminGuestParticipantControl({
  activityId,
  closeOnSuccess = false,
  formInstanceId,
  locale,
}: {
  activityId: string;
  closeOnSuccess?: boolean;
  formInstanceId?: string;
  locale: string;
}) {
  const [formVersion, setFormVersion] = useState(0);

  return (
    <AdminGuestParticipantControlInstance
      activityId={activityId}
      closeOnSuccess={closeOnSuccess}
      formInstanceId={formInstanceId}
      key={formVersion}
      locale={locale}
      onReset={() => setFormVersion((current) => current + 1)}
    />
  );
}

export function JoinActivityForm({
  activityId,
  activityTitle,
  accessToken = null,
  canAddGuest = false,
  closeOnSuccess = false,
  formInstanceId,
  hideMessageHint = false,
  locale,
  requiresApproval,
  isFull,
  isClosed,
  isOrganizer,
  isAuthenticated,
  viewerParticipationStatus,
}: JoinActivityFormProps) {
  const [state, formAction] = useActionState(joinActivityAction, initialState);
  const [effectiveParticipationStatus, setEffectiveParticipationStatus] =
    useState<ViewerParticipationStatus>(viewerParticipationStatus);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const t = getCopy(locale).join;
  const closeMobileCtaSheet = useTeamDetailMobileCtaSheetClose();

  useEffect(() => {
    setEffectiveParticipationStatus(viewerParticipationStatus);
  }, [viewerParticipationStatus]);

  useEffect(() => {
    if (!state.success || !state.participantStatus) {
      return;
    }

    if (closeOnSuccess) {
      closeMobileCtaSheet?.();
      startTransition(() => {
        router.refresh();
      });
      return;
    }

    setEffectiveParticipationStatus(state.participantStatus);
    startTransition(() => {
      router.refresh();
    });
  }, [
    closeMobileCtaSheet,
    closeOnSuccess,
    router,
    startTransition,
    state.participantStatus,
    state.success,
  ]);

  if (isClosed) {
    return (
      <DisabledAction title={t.closedTitle} description={t.closedDescription} />
    );
  }

  let participationContent: ReactNode;

  if (
    effectiveParticipationStatus &&
    effectiveParticipationStatus !== "REJECTED" &&
    effectiveParticipationStatus !== "CANCELLED"
  ) {
    const copy = getParticipationCopy(effectiveParticipationStatus, locale);

    participationContent = (
      <div className="grid gap-2.5">
        <ParticipationStatusCard
          description={copy.description}
          isPending={effectiveParticipationStatus === "PENDING"}
          title={copy.title}
        />
        <CancelParticipationForm
          activityId={activityId}
          activityTitle={activityTitle}
          locale={locale}
          onCancelled={() => setEffectiveParticipationStatus(null)}
        />
      </div>
    );
  } else if (isFull) {
    return (
      <DisabledAction title={t.fullTitle} description={t.fullDescription} />
    );
  } else if (!isAuthenticated) {
    participationContent = (
      <SignInToJoinEntry
        accessToken={accessToken}
        activityId={activityId}
        locale={locale}
      />
    );
  } else if (isOrganizer) {
    participationContent = (
      <DisabledAction
        title={t.organizerTitle}
        description={t.organizerDescription}
      />
    );
  } else {
    participationContent = (
      <form
        action={formAction}
        className="grid gap-3"
        noValidate
        onSubmit={() => {
          trackClientAnalyticsEvent({
            name: "join_started",
            entityId: activityId,
            entityType: "team",
            sourceSurface: "activity_detail",
            properties: {
              requires_approval: requiresApproval,
            },
          });
        }}
      >
        <input name="activityId" type="hidden" value={activityId} />
        <input name="locale" type="hidden" value={locale} />
        {accessToken ? (
          <input name="accessToken" type="hidden" value={accessToken} />
        ) : null}

        {effectiveParticipationStatus === "REJECTED" ? (
          <RejoinNotice locale={locale} status={effectiveParticipationStatus} />
        ) : null}

        {state.formError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.formError}
          </div>
        ) : null}

        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          {t.messageLabel}
          <Textarea
            className="min-h-24"
            name="message"
            defaultValue={state.values?.message}
            maxLength={300}
            placeholder={t.messagePlaceholder}
          />
          {hideMessageHint ? null : (
            <span className="text-xs font-normal text-zinc-500">
              {requiresApproval ? t.messageHintApproval : t.messageHint}
            </span>
          )}
          {state.fieldErrors?.message?.[0] ? (
            <span className="text-xs font-medium text-red-600">
              {state.fieldErrors.message[0]}
            </span>
          ) : null}
        </label>

        <PendingSubmitNotice locale={locale} />
        <SubmitButton locale={locale} requiresApproval={requiresApproval} />
      </form>
    );
  }

  return (
    <div className="grid gap-3">
      {participationContent}
      {canAddGuest && isAuthenticated && !isFull ? (
        <AdminGuestParticipantControl
          activityId={activityId}
          closeOnSuccess={closeOnSuccess}
          formInstanceId={formInstanceId}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
