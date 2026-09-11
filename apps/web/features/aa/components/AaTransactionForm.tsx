"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Calculator,
  Camera,
  CarFront,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  Images,
  Loader2,
  RefreshCw,
  ReceiptText,
  ShoppingBag,
  Ticket,
  Utensils,
  UsersRound,
} from "lucide-react";
import {
  createAaTransactionAction,
  type CreateAaTransactionState,
} from "../actions/aaTransactionActions";
import { evaluateMoneyExpression } from "../domain/calculator";
import { cn } from "@/lib/utils";

type Participant = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  isViewer: boolean;
};

type Category = { id: string; name: string };

type AaTransactionFormProps = {
  activityId: string;
  baseCurrency: string;
  canManage: boolean;
  categories: Category[];
  clientMutationId: string;
  defaultDate: string;
  initialAmount?: string;
  initialFromId?: string;
  initialToId?: string;
  initialType?: "EXPENSE" | "INCOME" | "TRANSFER";
  locale: string;
  participants: Participant[];
  transferOnly?: boolean;
  viewerParticipantId: string;
};

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      amount: "Montant",
      category: "Catégorie",
      custom: "Montants",
      date: "Date",
      equal: "À parts égales",
      expense: "Dépense",
      from: "Qui paie ?",
      income: "Revenu",
      note: "Note (facultatif)",
      paidBy: "Payé / reçu par",
      percent: "Pourcentages",
      save: "Enregistrer",
      saving: "Enregistrement…",
      share: "Répartir entre",
      splitMode: "Mode de répartition",
      title: "Libellé",
      titlePlaceholder: "Ex. Dîner",
      to: "Qui reçoit ?",
      transfer: "Paiement",
      weight: "Parts",
      review: "Votre dépense sera envoyée à l'organisateur pour validation.",
      rate: "Taux vers la devise du groupe",
      rateHint: "1 unité de la devise saisie = combien en devise du groupe",
      future:
        "Confirmez que cette opération future doit affecter le solde dès maintenant.",
      calculator: "Calculatrice",
      calculate: "Utiliser le résultat",
      calculatorHint: "Ex. 12,50 + 8 × 2",
      multiPayer: "Avancé : plusieurs payeurs",
      multiPayerHint: "Le total payé doit être égal au montant de l'opération.",
      all: "Tout le monde",
      withoutMe: "Sans moi",
      onlyMe: "Moi uniquement",
      receipt: "Reçu (facultatif)",
      receiptHint:
        "Image privée, visible uniquement par les participants autorisés.",
      online: "À jour",
      offline: "Hors ligne : la saisie sera gardée sur cet appareil",
      queued:
        "Enregistré hors ligne. Synchronisation automatique au retour du réseau ; le reçu devra être ajouté ensuite.",
      syncing: "Synchronisation des saisies hors ligne…",
      syncFailed: "Certaines saisies attendent encore la synchronisation.",
      fxLoading: "Recherche du taux quotidien…",
      fxLive: "Taux quotidien proposé par Frankfurter",
      fxCached: "Taux hors ligne de moins de 72 h",
      fxManual: "Taux automatique indisponible : saisissez un taux manuel.",
      advanced: "Détails facultatifs",
      backStep: "Revenir à la dépense",
      confirmSplit: "Confirmer la répartition",
      gallery: "Choisir dans la galerie",
      next: "Continuer vers la répartition",
      perPerson: "Part moyenne",
      photo: "Photographier le reçu",
      selected: "participants",
      splitTitle: "Confirmer la répartition",
      total: "Total réparti",
      uploadHint: "Ajoutez un reçu ou saisissez la dépense à la main.",
      uploadTitle: "Ajouter une dépense",
    };
  }

  if (locale === "en") {
    return {
      amount: "Amount",
      category: "Category",
      custom: "Exact amounts",
      date: "Date",
      equal: "Split equally",
      expense: "Expense",
      from: "Who pays?",
      income: "Income",
      note: "Note (optional)",
      paidBy: "Paid / received by",
      percent: "Percentages",
      save: "Save entry",
      saving: "Saving…",
      share: "Split between",
      splitMode: "Split method",
      title: "What was it?",
      titlePlaceholder: "e.g. Dinner",
      to: "Who receives?",
      transfer: "Payment",
      weight: "Shares",
      review: "Your entry will be sent to the host for review.",
      rate: "Rate to group currency",
      rateHint:
        "How much 1 unit of this currency is worth in the group currency",
      future: "Confirm this future entry should affect the balance now.",
      calculator: "Calculator",
      calculate: "Use result",
      calculatorHint: "e.g. 12.50 + 8 × 2",
      multiPayer: "Advanced: multiple payers",
      multiPayerHint: "Amounts paid must add up to the entry total.",
      all: "Everyone",
      withoutMe: "Everyone but me",
      onlyMe: "Only me",
      receipt: "Receipt (optional)",
      receiptHint: "Private image, visible only to authorized participants.",
      online: "Up to date",
      offline: "Offline: this entry will stay on this device",
      queued:
        "Saved offline. It will sync automatically when back online; add the receipt afterward.",
      syncing: "Syncing offline entries…",
      syncFailed: "Some entries are still waiting to sync.",
      fxLoading: "Looking up the daily rate…",
      fxLive: "Daily rate suggested by Frankfurter",
      fxCached: "Offline rate cached within 72 hours",
      fxManual: "Automatic rate unavailable. Enter a manual rate.",
      advanced: "Optional details",
      backStep: "Back to expense",
      confirmSplit: "Confirm split",
      gallery: "Choose from gallery",
      next: "Continue to split",
      perPerson: "Average share",
      photo: "Take receipt photo",
      selected: "people included",
      splitTitle: "Confirm split",
      total: "Split total",
      uploadHint: "Add a receipt or enter the expense manually.",
      uploadTitle: "Upload expense",
    };
  }

  return {
    amount: "金额",
    category: "分类",
    custom: "自定义金额",
    date: "发生日期",
    equal: "平均分摊",
    expense: "支出",
    from: "付款人",
    income: "收入",
    note: "备注（选填）",
    paidBy: "付款 / 收款人",
    percent: "按百分比",
    save: "保存记录",
    saving: "正在保存…",
    share: "参与分摊",
    splitMode: "分摊方式",
    title: "这笔是什么",
    titlePlaceholder: "例如：聚餐晚饭",
    to: "收款人",
    transfer: "转账",
    weight: "按份数",
    review: "你提交后将由主理人或协管审核，审核通过才会影响余额。",
    rate: "换算为账本币种的汇率",
    rateHint: "1 单位当前币种等于多少账本币种",
    future: "确认这笔未来日期记录现在就计入余额。",
    calculator: "金额计算器",
    calculate: "使用计算结果",
    calculatorHint: "例如：12.5 + 8 × 2",
    multiPayer: "高级：多人付款",
    multiPayerHint: "各付款金额之和必须等于本笔总额。",
    all: "全部参与者",
    withoutMe: "除我以外",
    onlyMe: "仅我",
    receipt: "消费凭证（选填）",
    receiptHint: "私密图片，仅本账本有权限的参与者可查看。",
    online: "数据已同步",
    offline: "当前离线，本笔会先保存在此设备",
    queued: "已离线保存，网络恢复后将自动同步；消费凭证需联网后补传。",
    syncing: "正在同步离线记录…",
    syncFailed: "仍有记录等待同步，请保持页面联网后重试。",
    fxLoading: "正在获取每日参考汇率…",
    fxLive: "Frankfurter 每日参考汇率",
    fxCached: "72 小时内的离线缓存汇率",
    fxManual: "自动汇率不可用，请手动输入。",
    advanced: "选填详情",
    backStep: "返回修改开支",
    confirmSplit: "确认分摊",
    gallery: "相册选择",
    next: "下一步，确认分摊",
    perPerson: "人均金额",
    photo: "拍照上传",
    selected: "人参与",
    splitTitle: "确认分摊",
    total: "分摊结果",
    uploadHint: "拍照上传小票，或直接手动输入金额。",
    uploadTitle: "上传开支",
  };
}

function categoryIcon(name: string) {
  if (/餐|食|饭|酒|饮|dinner|food/i.test(name)) return Utensils;
  if (/交通|车|taxi|transport/i.test(name)) return CarFront;
  if (/住宿|酒店|hotel|stay/i.test(name)) return BedDouble;
  if (/票|ticket/i.test(name)) return Ticket;
  if (/购物|shop/i.test(name)) return ShoppingBag;
  return ReceiptText;
}

const initialState: CreateAaTransactionState = {};

function Initial({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ECF5EF] text-[11px] font-bold text-[#156240] ring-1 ring-[#C7DCCB]">
      {Array.from(name.trim())[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function AaTransactionForm({
  activityId,
  baseCurrency,
  canManage,
  categories,
  clientMutationId,
  defaultDate,
  initialAmount,
  initialFromId,
  initialToId,
  initialType = "EXPENSE",
  locale,
  participants,
  transferOnly = false,
  viewerParticipantId,
}: AaTransactionFormProps) {
  const router = useRouter();
  const copy = getCopy(locale);
  const formRef = useRef<HTMLFormElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const activeParticipants = useMemo(
    () => participants.filter((participant) => participant.status === "ACTIVE"),
    [participants],
  );
  const [type, setType] = useState(initialType);
  const [currency, setCurrency] = useState(baseCurrency);
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [receiptName, setReceiptName] = useState("");
  const [step, setStep] = useState<"DETAILS" | "SPLIT">("DETAILS");
  const [calculatorExpression, setCalculatorExpression] = useState("");
  const [calculatorError, setCalculatorError] = useState(false);
  const [occurredOn, setOccurredOn] = useState(defaultDate);
  const [clientOperationId, setClientOperationId] = useState(clientMutationId);
  const [selectedShareIds, setSelectedShareIds] = useState(
    () => new Set(activeParticipants.map((participant) => participant.id)),
  );
  const [syncState, setSyncState] = useState<
    "ONLINE" | "OFFLINE" | "QUEUED" | "SYNCING" | "FAILED"
  >("ONLINE");
  const [queuedCount, setQueuedCount] = useState(0);
  const [fxRate, setFxRate] = useState("1");
  const [fxSource, setFxSource] = useState("LEDGER_BASE");
  const [fxDate, setFxDate] = useState("");
  const [fxState, setFxState] = useState<
    "IDLE" | "LOADING" | "LIVE" | "CACHED" | "MANUAL"
  >("IDLE");
  const [splitMode, setSplitMode] = useState<
    "EQUAL" | "WEIGHT" | "PERCENT" | "CUSTOM"
  >("EQUAL");
  const [state, formAction, pending] = useActionState(
    createAaTransactionAction,
    initialState,
  );

  const queueKey = `friemi:aa:offline:${activityId}`;
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const isFuture = occurredOn > todayValue;

  useEffect(() => {
    const readQueue = () => {
      try {
        const parsed = JSON.parse(
          localStorage.getItem(queueKey) ?? "[]",
        ) as unknown[];
        setQueuedCount(Array.isArray(parsed) ? parsed.length : 0);
      } catch {
        setQueuedCount(0);
      }
    };

    const flushQueue = async () => {
      if (!navigator.onLine) {
        setSyncState("OFFLINE");
        readQueue();
        return;
      }

      let queue: Array<{ entries: Array<[string, string]> }> = [];
      try {
        queue = JSON.parse(localStorage.getItem(queueKey) ?? "[]");
      } catch {
        localStorage.removeItem(queueKey);
      }

      if (queue.length === 0) {
        setSyncState("ONLINE");
        setQueuedCount(0);
        return;
      }

      setSyncState("SYNCING");
      const remaining = [...queue];

      while (remaining.length > 0) {
        const response = await fetch("/api/aa/sync", {
          body: JSON.stringify(remaining[0]),
          headers: { "content-type": "application/json" },
          method: "POST",
        }).catch(() => null);

        if (!response?.ok) break;
        remaining.shift();
        localStorage.setItem(queueKey, JSON.stringify(remaining));
        setQueuedCount(remaining.length);
      }

      if (remaining.length === 0) {
        setSyncState("ONLINE");
        router.refresh();
      } else {
        setSyncState("FAILED");
      }
    };

    readQueue();
    setSyncState(navigator.onLine ? "ONLINE" : "OFFLINE");
    void flushQueue();
    window.addEventListener("online", flushQueue);
    window.addEventListener("offline", flushQueue);
    return () => {
      window.removeEventListener("online", flushQueue);
      window.removeEventListener("offline", flushQueue);
    };
  }, [queueKey, router]);

  useEffect(() => {
    if (currency === baseCurrency) {
      setFxRate("1");
      setFxSource("LEDGER_BASE");
      setFxDate("");
      setFxState("IDLE");
      return;
    }

    const controller = new AbortController();
    const cacheKey = `friemi:aa:fx:${currency}:${baseCurrency}`;
    setFxState("LOADING");

    fetch(
      `/api/aa/fx?base=${encodeURIComponent(currency)}&quote=${encodeURIComponent(baseCurrency)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("FX_UNAVAILABLE");
        return (await response.json()) as {
          date: string;
          rate: number;
          source: string;
        };
      })
      .then((result) => {
        setFxRate(String(result.rate));
        setFxSource(result.source);
        setFxDate(result.date);
        setFxState("LIVE");
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ ...result, cachedAt: Date.now() }),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        try {
          const cached = JSON.parse(
            localStorage.getItem(cacheKey) ?? "null",
          ) as {
            cachedAt?: number;
            date?: string;
            rate?: number;
            source?: string;
          } | null;
          if (
            cached?.rate &&
            cached.cachedAt &&
            Date.now() - cached.cachedAt <= 72 * 60 * 60 * 1000
          ) {
            setFxRate(String(cached.rate));
            setFxSource(`${cached.source ?? "FRANKFURTER"}_CACHE`);
            setFxDate(cached.date ?? "");
            setFxState("CACHED");
            return;
          }
        } catch {
          localStorage.removeItem(cacheKey);
        }

        setFxRate("");
        setFxSource("MANUAL");
        setFxDate("");
        setFxState("MANUAL");
      });

    return () => controller.abort();
  }, [baseCurrency, currency]);

  const applyCalculator = () => {
    try {
      const result = evaluateMoneyExpression(
        calculatorExpression.replaceAll("×", "*").replaceAll("÷", "/"),
      );
      setAmount(result);
      setCalculatorError(false);
    } catch {
      setCalculatorError(true);
    }
  };

  const setSharePreset = (preset: "ALL" | "WITHOUT_ME" | "ONLY_ME") => {
    setSelectedShareIds(
      new Set(
        activeParticipants
          .filter((participant) =>
            preset === "ALL"
              ? true
              : preset === "ONLY_ME"
                ? participant.id === viewerParticipantId
                : participant.id !== viewerParticipantId,
          )
          .map((participant) => participant.id),
      ),
    );
  };

  const handleSubmitCapture = (event: React.FormEvent<HTMLFormElement>) => {
    if (navigator.onLine) return;

    event.preventDefault();
    event.stopPropagation();
    const formData = new FormData(event.currentTarget);
    const entries = Array.from(formData.entries())
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .map(([key, value]) => [key, value] as [string, string]);

    try {
      const queue = JSON.parse(
        localStorage.getItem(queueKey) ?? "[]",
      ) as Array<{ entries: Array<[string, string]> }>;
      queue.push({ entries });
      localStorage.setItem(queueKey, JSON.stringify(queue));
      setQueuedCount(queue.length);
      setSyncState("QUEUED");
      setClientOperationId(crypto.randomUUID());
    } catch {
      setSyncState("FAILED");
    }
  };

  const selectedParticipants = activeParticipants.filter((participant) =>
    selectedShareIds.has(participant.id),
  );
  const parsedAmount = Number.parseFloat(amount.replace(",", "."));
  const amountIsValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const equalShare =
    amountIsValid && selectedParticipants.length > 0
      ? parsedAmount / selectedParticipants.length
      : 0;
  const formatPreviewAmount = (value: number) =>
    new Intl.NumberFormat(locale, {
      currency,
      currencyDisplay: "narrowSymbol",
      style: "currency",
    }).format(value);
  const openReceiptPicker = (camera: boolean) => {
    const input = receiptInputRef.current;
    if (!input) return;
    if (camera) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
  };
  const continueToSplit = () => {
    if (!formRef.current?.reportValidity()) return;
    setStep("SPLIT");
    window.scrollTo({ behavior: "smooth", top: 0 });
  };

  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmitCapture={handleSubmitCapture}
      ref={formRef}
    >
      <input name="activityId" type="hidden" value={activityId} />
      <input name="locale" type="hidden" value={locale} />
      <input name="clientMutationId" type="hidden" value={clientOperationId} />
      <input name="type" type="hidden" value={type} />
      <input
        accept="image/*,.heic,.heif"
        className="sr-only"
        name="receipt"
        onChange={(event) =>
          setReceiptName(event.target.files?.[0]?.name ?? "")
        }
        ref={receiptInputRef}
        type="file"
      />
      {type === "TRANSFER" ? (
        <input name="splitMode" type="hidden" value="EQUAL" />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-[15px] font-black text-[#1D1D1B]",
              step === "DETAILS" && "sr-only",
            )}
          >
            {step === "DETAILS" ? copy.uploadTitle : copy.splitTitle}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-[#8E8383]">
            {step === "DETAILS"
              ? copy.uploadHint
              : `${selectedParticipants.length} ${copy.selected}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#369758] text-[9px] font-black text-white">
            1
          </span>
          <span className="h-px w-5 bg-[#D6D5B2]" />
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black",
              step === "SPLIT"
                ? "bg-[#369758] text-white"
                : "bg-[#F1F2E3] text-[#8E8383]",
            )}
          >
            2
          </span>
        </div>
      </div>

      <div
        className={cn(
          "min-h-9 items-center gap-2 rounded-[12px] px-3 text-[10px] font-bold",
          step === "DETAILS" ? "flex" : "hidden",
          syncState === "ONLINE"
            ? "bg-[#ECF5EF] text-[#156240]"
            : syncState === "FAILED"
              ? "bg-[#FFF0F2] text-[#A53C50]"
              : "bg-[#FFF8E9] text-[#725C28]",
        )}
        role="status"
      >
        {syncState === "ONLINE" ? (
          <Cloud className="h-4 w-4" />
        ) : syncState === "SYNCING" ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <CloudOff className="h-4 w-4" />
        )}
        <span>
          {syncState === "ONLINE"
            ? copy.online
            : syncState === "OFFLINE"
              ? copy.offline
              : syncState === "QUEUED"
                ? copy.queued
                : syncState === "SYNCING"
                  ? copy.syncing
                  : copy.syncFailed}
          {queuedCount > 0 ? ` (${queuedCount})` : ""}
        </span>
      </div>

      <div
        className={cn(
          "gap-1 rounded-full bg-[#EEF3EC] p-1",
          step === "DETAILS" ? "grid" : "hidden",
          transferOnly ? "grid-cols-1" : "grid-cols-3",
        )}
      >
        {(transferOnly
          ? ([["TRANSFER", copy.transfer]] as const)
          : ([
              ["EXPENSE", copy.expense],
              ["INCOME", copy.income],
              ["TRANSFER", copy.transfer],
            ] as const)
        ).map(([value, label]) => (
          <button
            className={cn(
              "min-h-10 rounded-full px-2 text-sm font-bold transition",
              type === value
                ? "bg-white text-[#156240] shadow-sm ring-1 ring-[#D8E8DC]"
                : "text-[#66736A]",
            )}
            key={value}
            onClick={() => setType(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {type !== "TRANSFER" ? (
        <div
          className={cn(
            "grid grid-cols-2 gap-3",
            step !== "DETAILS" && "hidden",
          )}
        >
          <button
            className="flex min-h-[112px] flex-col items-center justify-center gap-3 rounded-[14px] border border-[#E7E1CE] bg-white text-[#156240] transition hover:border-[#8AB68E] active:bg-[#F4F8F1]"
            onClick={() => openReceiptPicker(true)}
            type="button"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#F2F7F0]">
              <Camera className="h-5 w-5" strokeWidth={1.7} />
            </span>
            <span className="text-[11px] font-black">{copy.photo}</span>
          </button>
          <button
            className="flex min-h-[112px] flex-col items-center justify-center gap-3 rounded-[14px] border border-[#E7E1CE] bg-white text-[#156240] transition hover:border-[#8AB68E] active:bg-[#F4F8F1]"
            onClick={() => openReceiptPicker(false)}
            type="button"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#F2F7F0]">
              <Images className="h-5 w-5" strokeWidth={1.7} />
            </span>
            <span className="text-[11px] font-black">{copy.gallery}</span>
          </button>
          {receiptName ? (
            <p className="col-span-2 truncate rounded-[10px] bg-[#ECF5EF] px-3 py-2 text-[10px] font-bold text-[#156240]">
              <Check className="mr-1.5 inline h-3.5 w-3.5" />
              {receiptName}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2",
          step !== "DETAILS" && "hidden",
        )}
      >
        <label className="block">
          <span className="text-sm font-bold text-ink">{copy.amount}</span>
          <input
            className="mt-2 h-14 w-full rounded-2xl border border-[#D6D5B2] bg-white px-4 text-2xl font-black tabular-nums text-ink outline-none transition focus:border-[#369758] focus:ring-2 focus:ring-[#369758]/15"
            inputMode="decimal"
            min="0.01"
            name="amount"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-ink">&nbsp;</span>
          <select
            className="mt-2 h-14 w-full rounded-2xl border border-[#D6D5B2] bg-white px-3 text-sm font-bold text-[#156240] outline-none focus:border-[#369758]"
            name="currency"
            onChange={(event) => setCurrency(event.target.value)}
            value={currency}
          >
            {[baseCurrency, "EUR", "CNY", "USD", "GBP"]
              .filter((value, index, values) => values.indexOf(value) === index)
              .map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
        </label>
      </div>

      {type !== "TRANSFER" ? (
        <fieldset className={cn(step !== "DETAILS" && "hidden")}>
          <legend className="text-sm font-bold text-ink">
            {copy.category}
          </legend>
          <input name="categoryId" type="hidden" value={categoryId} />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {categories.slice(0, 8).map((category) => {
              const Icon = categoryIcon(category.name);
              const selected = category.id === categoryId;
              return (
                <button
                  className={cn(
                    "flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[12px] border text-[9px] font-bold transition",
                    selected
                      ? "border-[#8AB68E] bg-[#EEF6EC] text-[#156240]"
                      : "border-[#E7E1CE] bg-white text-[#68736B]",
                  )}
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                  type="button"
                >
                  <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
                  <span className="max-w-full truncate px-1">
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <label className={cn("block", step !== "DETAILS" && "hidden")}>
        <span className="text-sm font-bold text-ink">{copy.title}</span>
        <input
          className="mt-2 h-12 w-full rounded-2xl border border-[#D6D5B2] bg-white px-4 text-base font-semibold text-ink outline-none transition focus:border-[#369758] focus:ring-2 focus:ring-[#369758]/15"
          maxLength={120}
          name="title"
          placeholder={copy.titlePlaceholder}
          required
        />
      </label>

      <details
        className={cn(
          "group rounded-[14px] border border-[#E7E1CE] bg-white px-4 py-3",
          step !== "DETAILS" && "hidden",
        )}
      >
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
          <Calculator className="h-4 w-4" />
          {copy.calculator}
          <span className="ml-auto text-xs text-[#8A9188]">＋ × ÷</span>
        </summary>
        <div className="mt-3 flex gap-2 border-t border-[#EEEBDD] pt-3">
          <input
            aria-label={copy.calculator}
            className={cn(
              "h-11 min-w-0 flex-1 rounded-xl border bg-white px-3 font-semibold tabular-nums outline-none",
              calculatorError ? "border-[#D67A8B]" : "border-[#D6D5B2]",
            )}
            onChange={(event) => {
              setCalculatorExpression(event.target.value);
              setCalculatorError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyCalculator();
              }
            }}
            placeholder={copy.calculatorHint}
            value={calculatorExpression}
          />
          <button
            className="min-h-11 shrink-0 rounded-full bg-[#ECF5EF] px-4 text-xs font-bold text-[#156240]"
            onClick={applyCalculator}
            type="button"
          >
            {copy.calculate}
          </button>
        </div>
      </details>

      {currency !== baseCurrency ? (
        <label
          className={cn(
            "block rounded-[14px] bg-[#FFF8E9] p-3 ring-1 ring-[#E8D9B4]",
            step !== "DETAILS" && "hidden",
          )}
        >
          <span className="text-sm font-bold text-ink">{copy.rate}</span>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-[#D6D5B2] bg-white px-3 text-base font-semibold tabular-nums outline-none focus:border-[#369758]"
            inputMode="decimal"
            min="0.000001"
            name="fxRate"
            onChange={(event) => {
              setFxRate(event.target.value);
              setFxSource("MANUAL");
              setFxState("MANUAL");
            }}
            required
            step="0.000001"
            type="number"
            value={fxRate}
          />
          <span className="mt-1 block text-[11px] font-semibold text-[#6F756D]">
            {copy.rateHint} ({baseCurrency})
          </span>
          <span className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-[#725C28]">
            {fxState === "LOADING" ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : null}
            {fxState === "LOADING"
              ? copy.fxLoading
              : fxState === "LIVE"
                ? `${copy.fxLive}${fxDate ? ` · ${fxDate}` : ""}`
                : fxState === "CACHED"
                  ? `${copy.fxCached}${fxDate ? ` · ${fxDate}` : ""}`
                  : copy.fxManual}
          </span>
          <input name="fxRateSource" type="hidden" value={fxSource} />
          <input name="fxRateDate" type="hidden" value={fxDate} />
        </label>
      ) : (
        <>
          <input name="fxRate" type="hidden" value="1" />
          <input name="fxRateSource" type="hidden" value="LEDGER_BASE" />
        </>
      )}

      {type === "TRANSFER" ? (
        <div
          className={cn(
            "rounded-[14px] border border-[#E7E1CE] bg-white p-4",
            step !== "DETAILS" && "hidden",
          )}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <label className="min-w-0">
              <span className="text-xs font-bold text-[#66736A]">
                {copy.from}
              </span>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-[#D6D5B2] bg-white px-2 text-sm font-semibold outline-none"
                defaultValue={initialFromId ?? viewerParticipantId}
                name="transferFromParticipantId"
              >
                {activeParticipants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.displayName}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight className="mb-3 h-4 w-4 text-[#8AB68E]" />
            <label className="min-w-0">
              <span className="text-xs font-bold text-[#66736A]">
                {copy.to}
              </span>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-[#D6D5B2] bg-white px-2 text-sm font-semibold outline-none"
                defaultValue={
                  initialToId ??
                  activeParticipants.find(
                    (item) => item.id !== viewerParticipantId,
                  )?.id
                }
                name="transferToParticipantId"
              >
                {activeParticipants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              step !== "DETAILS" && "hidden",
            )}
          >
            <label className="block">
              <span className="text-sm font-bold text-ink">{copy.paidBy}</span>
              <select
                className="mt-2 h-12 w-full rounded-2xl border border-[#D6D5B2] bg-white px-3 text-sm font-semibold outline-none focus:border-[#369758]"
                defaultValue={viewerParticipantId}
                name="contributorParticipantId"
              >
                {activeParticipants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <details
            className={cn(
              "group rounded-[14px] border border-[#E7E1CE] bg-white p-4",
              step !== "DETAILS" && "hidden",
            )}
          >
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
              <UsersRound className="h-4 w-4" />
              {copy.multiPayer}
              <span className="ml-auto text-xs text-[#8A9188]">＋</span>
            </summary>
            <p className="mt-2 text-xs font-semibold leading-5 text-[#727970]">
              {copy.multiPayerHint}
            </p>
            <div className="mt-3 grid gap-2 border-t border-[#EEEBDD] pt-3">
              {activeParticipants.map((participant) => (
                <label
                  className="grid grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[#F5F8F2]"
                  key={participant.id}
                >
                  <input
                    className="h-4 w-4 accent-[#156240]"
                    name="contributionParticipantIds"
                    type="checkbox"
                    value={participant.id}
                  />
                  <span className="truncate text-sm font-semibold text-ink">
                    {participant.displayName}
                  </span>
                  <input
                    aria-label={`${participant.displayName} ${copy.amount}`}
                    className="h-9 rounded-xl border border-[#D6D5B2] px-2 text-right text-sm font-semibold tabular-nums outline-none focus:border-[#369758]"
                    inputMode="decimal"
                    min="0"
                    name={`contributionAmount:${participant.id}`}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                  />
                </label>
              ))}
            </div>
          </details>

          <div className={cn("space-y-3", step !== "SPLIT" && "hidden")}>
            <div className="grid grid-cols-4 gap-1 rounded-full bg-[#EEF3EC] p-1">
              {(
                [
                  ["EQUAL", copy.equal],
                  ["WEIGHT", copy.weight],
                  ["PERCENT", copy.percent],
                  ["CUSTOM", copy.custom],
                ] as const
              ).map(([value, label]) => (
                <button
                  className={cn(
                    "min-h-9 rounded-full px-1 text-[9px] font-bold transition",
                    splitMode === value
                      ? "bg-white text-[#156240] shadow-sm"
                      : "text-[#7A817A]",
                  )}
                  key={value}
                  onClick={() => setSplitMode(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <input name="splitMode" type="hidden" value={splitMode} />
          </div>

          <fieldset
            className={cn(
              "rounded-[14px] border border-[#E7E1CE] bg-white p-4",
              step !== "SPLIT" && "hidden",
            )}
          >
            <legend className="px-1 text-sm font-bold text-ink">
              {copy.share}
            </legend>
            <div className="mb-2 mt-1 flex flex-wrap gap-1.5">
              {(
                [
                  ["ALL", copy.all],
                  ["WITHOUT_ME", copy.withoutMe],
                  ["ONLY_ME", copy.onlyMe],
                ] as const
              ).map(([preset, label]) => (
                <button
                  className="min-h-8 rounded-full bg-[#F1F5EE] px-3 text-[11px] font-bold text-[#156240]"
                  key={preset}
                  onClick={() => setSharePreset(preset)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {activeParticipants.map((participant) => (
                <label
                  className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[#F5F8F2]"
                  key={participant.id}
                >
                  <input
                    className="h-4 w-4 accent-[#156240]"
                    checked={selectedShareIds.has(participant.id)}
                    name="shareParticipantIds"
                    onChange={(event) => {
                      setSelectedShareIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(participant.id);
                        else next.delete(participant.id);
                        return next;
                      });
                    }}
                    type="checkbox"
                    value={participant.id}
                  />
                  {participant.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="h-8 w-8 rounded-full object-cover ring-1 ring-[#C7DCCB]"
                      src={participant.avatarUrl}
                    />
                  ) : (
                    <Initial name={participant.displayName} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {participant.displayName}
                  </span>
                  {splitMode !== "EQUAL" ? (
                    <input
                      aria-label={`${participant.displayName} ${copy.splitMode}`}
                      className="h-9 w-20 rounded-xl border border-[#D6D5B2] bg-white px-2 text-right text-sm font-semibold tabular-nums outline-none focus:border-[#369758]"
                      defaultValue={splitMode === "PERCENT" ? undefined : "1"}
                      inputMode="decimal"
                      min="0"
                      name={
                        splitMode === "CUSTOM"
                          ? `shareAmount:${participant.id}`
                          : `shareWeight:${participant.id}`
                      }
                      placeholder={
                        splitMode === "PERCENT"
                          ? "%"
                          : splitMode === "CUSTOM"
                            ? "0.00"
                            : "1"
                      }
                      required
                      step={splitMode === "CUSTOM" ? "0.01" : "0.0001"}
                      type="number"
                    />
                  ) : (
                    <span className="shrink-0 text-[12px] font-black text-[#1D1D1B] friemi-tabular">
                      {selectedShareIds.has(participant.id)
                        ? formatPreviewAmount(equalShare)
                        : locale === "fr"
                          ? "Exclu"
                          : locale === "en"
                            ? "Excluded"
                            : "未参与"}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="hidden">
            <span className="text-sm font-bold text-ink">{copy.splitMode}</span>
            <select
              className="mt-2 h-12 w-full rounded-2xl border border-[#D6D5B2] bg-white px-3 text-sm font-semibold outline-none focus:border-[#369758]"
              onChange={(event) =>
                setSplitMode(event.target.value as typeof splitMode)
              }
              value={splitMode}
            >
              <option value="EQUAL">{copy.equal}</option>
              <option value="WEIGHT">{copy.weight}</option>
              <option value="PERCENT">{copy.percent}</option>
              <option value="CUSTOM">{copy.custom}</option>
            </select>
          </label>
        </>
      )}

      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2",
          step !== "DETAILS" && "hidden",
        )}
      >
        <label className="block">
          <span className="text-sm font-bold text-ink">{copy.date}</span>
          <input
            className="mt-2 h-12 w-full rounded-2xl border border-[#D6D5B2] bg-white px-3 text-sm font-semibold outline-none focus:border-[#369758]"
            name="occurredOn"
            onChange={(event) => setOccurredOn(event.target.value)}
            required
            type="date"
            value={occurredOn}
          />
        </label>
        <label className="block sm:row-span-2">
          <span className="text-sm font-bold text-ink">{copy.note}</span>
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-[#D6D5B2] bg-white px-3 py-3 text-sm font-medium outline-none focus:border-[#369758]"
            maxLength={2000}
            name="note"
          />
        </label>
      </div>

      {isFuture ? (
        <label
          className={cn(
            "items-start gap-3 rounded-[14px] bg-[#FFF8E9] px-4 py-3 text-xs font-semibold leading-5 text-[#725C28] ring-1 ring-[#E8D9B4]",
            step === "DETAILS" ? "flex" : "hidden",
          )}
        >
          <input
            className="mt-0.5 h-4 w-4 accent-[#156240]"
            name="futureConfirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>{copy.future}</span>
        </label>
      ) : null}

      {!canManage && type !== "TRANSFER" ? (
        <p
          className={cn(
            "rounded-[14px] bg-[#FFF8E9] px-4 py-3 text-xs font-semibold leading-5 text-[#725C28] ring-1 ring-[#E8D9B4]",
            step !== "SPLIT" && "hidden",
          )}
        >
          {copy.review}
        </p>
      ) : null}

      {type !== "TRANSFER" ? (
        <div
          className={cn(
            "rounded-[14px] border border-[#E7E1CE] bg-[#FEFFF9] p-4",
            step !== "SPLIT" && "hidden",
          )}
        >
          <div className="grid grid-cols-3 text-center">
            <div>
              <p className="text-[9px] font-bold text-[#8E8383]">
                {copy.total}
              </p>
              <p className="mt-1 text-[13px] font-black text-[#1D1D1B] friemi-tabular">
                {formatPreviewAmount(amountIsValid ? parsedAmount : 0)}
              </p>
            </div>
            <div className="border-x border-[#EEEBDD] px-2">
              <p className="text-[9px] font-bold text-[#8E8383]">
                {locale === "fr"
                  ? "Participants"
                  : locale === "en"
                    ? "People"
                    : "参与人数"}
              </p>
              <p className="mt-1 text-[13px] font-black text-[#1D1D1B]">
                {selectedParticipants.length}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-[#8E8383]">
                {copy.perPerson}
              </p>
              <p className="mt-1 truncate text-[13px] font-black text-[#1D1D1B] friemi-tabular">
                {formatPreviewAmount(equalShare)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {state.formError ? (
        <p
          className="rounded-2xl bg-[#FFF0F2] px-4 py-3 text-sm font-semibold text-[#A53C50]"
          role="alert"
        >
          {state.formError}
        </p>
      ) : null}

      {type !== "TRANSFER" && step === "DETAILS" ? (
        <button
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-[#156240] to-[#369758] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(21,98,64,0.16)] transition active:scale-[0.99]"
          onClick={continueToSplit}
          type="button"
        >
          {copy.next}
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : (
        <div className="grid gap-2">
          {type !== "TRANSFER" ? (
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full text-[11px] font-bold text-[#156240]"
              onClick={() => {
                setStep("DETAILS");
                window.scrollTo({ behavior: "smooth", top: 0 });
              }}
              type="button"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {copy.backStep}
            </button>
          ) : null}
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-[#156240] to-[#369758] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(21,98,64,0.16)] transition active:scale-[0.99] disabled:opacity-60"
            disabled={
              pending ||
              (type !== "TRANSFER" && selectedParticipants.length === 0)
            }
            type="submit"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {pending
              ? copy.saving
              : type === "TRANSFER"
                ? copy.save
                : copy.confirmSplit}
          </button>
        </div>
      )}
    </form>
  );
}
