"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, QrCode, Share2, X } from "lucide-react";

export function AaLedgerShareTools({
  locale,
  title,
  triggerLabel,
}: {
  locale: string;
  title: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const copy =
    locale === "fr"
      ? {
          copied: "Copié",
          copy: "Copier",
          hint: "Seuls les participants autorisés peuvent ouvrir les montants.",
          share: "Partager le compte",
          title: "Accès au compte AA",
        }
      : locale === "en"
        ? {
            copied: "Copied",
            copy: "Copy",
            hint: "Only authorized participants can open ledger amounts.",
            share: "Share ledger",
            title: "AA ledger access",
          }
        : {
            copied: "已复制",
            copy: "复制链接",
            hint: "只有已获得聚吧权限的参与者才能打开并查看金额。",
            share: "分享核算入口",
            title: "AA 核算入口",
          };

  useEffect(() => {
    const current = window.location.href.split("?")[0]!;
    setUrl(current);
    QRCode.toDataURL(current, {
      color: { dark: "#156240", light: "#FFFFFF" },
      margin: 1,
      width: 220,
    }).then(setQr);
  }, []);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <button
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#D6D5B2] text-xs font-bold text-[#156240]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Share2 className="h-3.5 w-3.5" />
        {triggerLabel ?? copy.share}
      </button>
      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center"
          role="dialog"
        >
          <section className="w-full max-w-sm rounded-[1.5rem] bg-white p-5 shadow-2xl">
            <header className="flex items-center gap-3">
              <QrCode className="h-5 w-5 text-[#156240]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-ink">{copy.title}</h2>
                <p className="truncate text-xs font-semibold text-[#7C827A]">
                  {title}
                </p>
              </div>
              <button
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F2EC] text-[#66736A]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="AA ledger QR code"
                className="mx-auto mt-5 h-48 w-48 rounded-2xl p-2 ring-1 ring-[#D8E8DC]"
                src={qr}
              />
            ) : null}
            <p className="mt-4 text-center text-xs font-semibold leading-5 text-[#66736A]">
              {copy.hint}
            </p>
            <button
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#156240] text-xs font-bold text-white"
              onClick={copyUrl}
              type="button"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? copy.copied : copy.copy}
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
