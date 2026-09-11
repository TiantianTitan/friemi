"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Share2 } from "lucide-react";

export function AaPaymentRequestShare({
  locale,
  message,
}: {
  locale: string;
  message: string;
}) {
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const copy =
    locale === "fr"
      ? { copied: "Copié", copy: "Copier le lien", share: "Partager" }
      : locale === "en"
        ? { copied: "Copied", copy: "Copy link", share: "Share" }
        : { copied: "已复制", copy: "复制链接", share: "分享付款请求" };

  useEffect(() => {
    const currentUrl = window.location.href;
    setUrl(currentUrl);
    QRCode.toDataURL(currentUrl, {
      color: { dark: "#156240", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
    }).then(setQr);
  }, []);

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${message}\n${url}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ text: message, url });
      return;
    }
    await copyLink();
  };

  return (
    <div className="grid gap-4">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="Payment request QR code"
          className="mx-auto h-44 w-44 rounded-2xl bg-white p-2 ring-1 ring-[#D8E8DC]"
          src={qr}
        />
      ) : (
        <div className="mx-auto h-44 w-44 animate-pulse rounded-2xl bg-[#EEF3EC]" />
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#8AB68E] text-xs font-bold text-[#156240]"
          onClick={copyLink}
          type="button"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? copy.copied : copy.copy}
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#156240] text-xs font-bold text-white"
          onClick={share}
          type="button"
        >
          <Share2 className="h-4 w-4" />
          {copy.share}
        </button>
      </div>
    </div>
  );
}
