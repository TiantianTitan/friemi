"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Landmark,
  Mail,
  MessageCircleMore,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Method = {
  key: string;
  label: string;
  value: string;
  available: boolean;
  icon: typeof Landmark;
};

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      copied: "Copié",
      direct:
        "Le paiement va directement au participant. Friemi ne conserve jamais votre argent.",
      missing: "À confirmer avec le bénéficiaire",
      title: "Modes de paiement du bénéficiaire",
    };
  }
  if (locale === "en") {
    return {
      copied: "Copied",
      direct: "Pay the participant directly. Friemi never holds your money.",
      missing: "Confirm with the recipient",
      title: "Recipient payment methods",
    };
  }
  return {
    copied: "已复制",
    direct: "请直接向参与者付款，Friemi 不经手也不保管资金。",
    missing: "请与收款人确认",
    title: "你的收款方式",
  };
}

export function AaPaymentMethods({
  contactEmail,
  locale,
  payeeName,
  wechatId,
}: {
  contactEmail: string | null;
  locale: string;
  payeeName: string;
  wechatId: string | null;
}) {
  const copy = getCopy(locale);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fallback = `${copy.missing} · ${payeeName}`;
  const methods: Method[] = [
    {
      available: false,
      icon: Landmark,
      key: "iban",
      label: "IBAN",
      value: fallback,
    },
    {
      available: false,
      icon: Smartphone,
      key: "revolut",
      label: "Revolut",
      value: fallback,
    },
    {
      available: Boolean(contactEmail),
      icon: Mail,
      key: "paypal",
      label: "PayPal",
      value: contactEmail ?? fallback,
    },
    {
      available: Boolean(wechatId),
      icon: MessageCircleMore,
      key: "other",
      label: locale === "fr" ? "Autre" : locale === "en" ? "Other" : "其他方式",
      value: wechatId ? `微信 ${wechatId}` : fallback,
    },
  ];

  const copyValue = async (method: Method) => {
    if (!method.available) return;
    await navigator.clipboard.writeText(method.value);
    setCopiedKey(method.key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  };

  return (
    <section>
      <h2 className="text-[12px] font-black text-[#1D1D1B]">{copy.title}</h2>
      <div className="mt-3 overflow-hidden rounded-[14px] border border-[#E7E1CE] bg-[#FEFFF9]">
        {methods.map((method, index) => {
          const Icon = method.icon;
          const copied = copiedKey === method.key;

          return (
            <button
              className={cn(
                "flex min-h-[58px] w-full items-center gap-3 px-4 text-left transition",
                index > 0 && "border-t border-[#EEEBDD]",
                method.available
                  ? "hover:bg-[#F5F8F2] active:bg-[#EEF5EC]"
                  : "cursor-default",
              )}
              disabled={!method.available}
              key={method.key}
              onClick={() => copyValue(method)}
              type="button"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#156240] ring-1 ring-[#DCE5D8]">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-black text-[#1D1D1B]">
                  {method.label}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-[10px] font-semibold",
                    method.available ? "text-[#777F78]" : "text-[#AAA79E]",
                  )}
                >
                  {method.value}
                </span>
              </span>
              {method.available ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#369758]">
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied
                    ? copy.copied
                    : locale === "fr"
                      ? "Copier"
                      : locale === "en"
                        ? "Copy"
                        : "复制"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-3 rounded-[12px] bg-[#FFF7E8] px-3 py-2.5 text-[10px] font-semibold leading-5 text-[#806B3D]">
        {copy.direct}
      </p>
    </section>
  );
}
