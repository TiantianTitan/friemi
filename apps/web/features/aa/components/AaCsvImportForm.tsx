"use client";

import { useActionState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import {
  importAaCsvAction,
  type AaCsvImportState,
} from "../actions/aaImportActions";

const initialState: AaCsvImportState = {};

export function AaCsvImportForm({
  activityId,
  locale,
}: {
  activityId: string;
  locale: string;
}) {
  const [state, action, pending] = useActionState(
    importAaCsvAction,
    initialState,
  );
  const copy =
    locale === "fr"
      ? {
          hint: "Réimportez un export Friemi AA. Les identifiants déjà importés sont ignorés.",
          label: "Importer un CSV",
          submit: "Importer",
          success: (count: number, skipped: number) =>
            `${count} importées, ${skipped} déjà présentes.`,
        }
      : locale === "en"
        ? {
            hint: "Re-import a Friemi AA export. Previously imported IDs are skipped.",
            label: "Import CSV",
            submit: "Import",
            success: (count: number, skipped: number) =>
              `${count} imported, ${skipped} already present.`,
          }
        : {
            hint: "可直接回导 Friemi AA 导出文件；已经导入过的记录 ID 会自动跳过。",
            label: "导入 CSV",
            submit: "开始导入",
            success: (count: number, skipped: number) =>
              `已导入 ${count} 笔，跳过 ${skipped} 笔重复记录。`,
          };

  return (
    <form action={action} className="grid gap-3">
      <input name="activityId" type="hidden" value={activityId} />
      <input name="locale" type="hidden" value={locale} />
      <label className="block">
        <span className="text-xs font-bold text-[#66736A]">{copy.label}</span>
        <input
          accept=".csv,text/csv"
          className="mt-2 block w-full text-xs font-semibold text-[#66736A] file:mr-3 file:min-h-9 file:rounded-full file:border-0 file:bg-[#ECF5EF] file:px-4 file:text-xs file:font-bold file:text-[#156240]"
          name="csv"
          required
          type="file"
        />
      </label>
      <p className="text-[11px] font-semibold leading-5 text-[#7C827A]">
        {copy.hint}
      </p>
      {state.error ? (
        <p className="rounded-xl bg-[#FFF0F2] px-3 py-2 text-xs font-bold text-[#A53C50]">
          {state.error}
        </p>
      ) : null}
      {state.importedCount !== undefined ? (
        <p className="rounded-xl bg-[#ECF5EF] px-3 py-2 text-xs font-bold text-[#156240]">
          {copy.success(state.importedCount, state.skippedCount ?? 0)}
        </p>
      ) : null}
      <button
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#8AB68E] text-xs font-bold text-[#156240] disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileUp className="h-3.5 w-3.5" />
        )}
        {copy.submit}
      </button>
    </form>
  );
}
