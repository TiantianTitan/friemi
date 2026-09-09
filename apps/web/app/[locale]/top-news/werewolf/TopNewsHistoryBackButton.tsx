"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

type TopNewsHistoryBackButtonProps = {
  fallbackHref: string;
  label: string;
};

export function TopNewsHistoryBackButton({
  fallbackHref,
  label,
}: TopNewsHistoryBackButtonProps) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.replace(fallbackHref);
  }

  return (
    <button
      aria-label={label}
      className="fixed left-[calc(var(--app-left-safe-area)+0.75rem)] top-[calc(var(--app-top-safe-area)+0.75rem)] z-[60] grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-[#071F1C]/72 text-white shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-md transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      onClick={goBack}
      title={label}
      type="button"
    >
      <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.4} />
    </button>
  );
}
