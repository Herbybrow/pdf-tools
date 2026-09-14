"use client";

import { useState } from "react";
import { getCatalogTools } from "@/components/header";
import ToolPageHeader from "@/components/tools/ToolPageHeader";
import FileDropzone from "@/components/tools/FileDropzone";
import PasswordPromptModal from "@/components/tools/PasswordPromptModal";
import { ApiError, EncryptedPdfRequiredError, postForJson } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type PageDiff = {
  page: number;
  textDiff: string[];
  hasTextChanges: boolean;
  imageA: string | null;
  imageB: string | null;
  diffImage: string | null;
};

type CompareResult = { pageCountA: number; pageCountB: number; pages: PageDiff[] };
type ViewMode = "side-by-side" | "diff" | "text";
type Status = "idle" | "loading" | "error" | "success";

export default function ComparePdfPage({ slug }: { slug: string }) {
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const { t } = useLanguage();
  const [fileA, setFileA] = useState<File[]>([]);
  const [fileB, setFileB] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [passwordPrompt, setPasswordPrompt] = useState<{ wrongPassword: boolean } | null>(null);

  const handleCompare = async (password?: string) => {
    if (!fileA[0] || !fileB[0]) return;
    setStatus("loading");
    setError("");
    try {
      const formData = new FormData();
      formData.append("fileA", fileA[0]);
      formData.append("fileB", fileB[0]);
      if (password) formData.append("password", password);
      const data = await postForJson<CompareResult>("/api/v1/security/compare", formData);
      setResult(data);
      setActivePage(0);
      setPasswordPrompt(null);
      setStatus("success");
    } catch (err) {
      if (err instanceof EncryptedPdfRequiredError) {
        setPasswordPrompt({ wrongPassword: err.wrongPassword });
        setStatus("idle");
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.unexpectedError"));
      setStatus("error");
    }
  };

  const reset = () => {
    setStatus("idle");
    setError("");
    setResult(null);
    setFileA([]);
    setFileB([]);
    setActivePage(0);
  };

  const currentPage = result?.pages[activePage];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("compare.title")} description={t("compare.description")} />

      {status !== "success" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">{t("compare.original")}</p>
            <FileDropzone accept=".pdf,application/pdf" multiple={false} files={fileA} onChange={setFileA} />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">{t("compare.revised")}</p>
            <FileDropzone accept=".pdf,application/pdf" multiple={false} files={fileB} onChange={setFileB} />
          </div>
        </div>
      )}

      {status !== "success" && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => handleCompare()}
            disabled={!fileA[0] || !fileB[0] || status === "loading"}
            className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "loading" ? t("compare.comparing") : t("compare.compareButton")}
          </button>
          {status === "error" && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}

      {status === "success" && result && currentPage && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={activePage === 0}
                onClick={() => setActivePage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
              >
                {t("compare.prev")}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {t("compare.pageOf").replace("{n}", String(activePage + 1)).replace("{total}", String(result.pages.length))}
                {currentPage.hasTextChanges && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    {t("compare.changed")}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={activePage === result.pages.length - 1}
                onClick={() => setActivePage((p) => Math.min(result.pages.length - 1, p + 1))}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
              >
                {t("compare.next")}
              </button>
            </div>

            <div className="flex gap-2">
              {(["side-by-side", "diff", "text"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    viewMode === mode ? "bg-maroon text-white" : "border border-gray-300 text-gray-600 dark:border-slate-700 dark:text-gray-300"
                  }`}
                >
                  {mode === "side-by-side" ? t("compare.sideBySide") : mode === "diff" ? t("compare.visualDiff") : t("compare.textDiff")}
                </button>
              ))}
              <button type="button" onClick={reset} className="rounded-lg px-3 py-1.5 text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400">
                {t("compare.compareDifferent")}
              </button>
            </div>
          </div>

          <div className="mt-4">
            {viewMode === "side-by-side" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  {currentPage.imageA ? (
                    // eslint-disable-next-line @next/next/no-img-element -- server-rendered page snapshot
                    <img src={`data:image/png;base64,${currentPage.imageA}`} alt={t("compare.original")} className="w-full rounded border border-gray-200 dark:border-slate-700" />
                  ) : (
                    <p className="text-sm text-gray-400">{t("compare.noPageHere")}</p>
                  )}
                </div>
                <div>
                  {currentPage.imageB ? (
                    // eslint-disable-next-line @next/next/no-img-element -- server-rendered page snapshot
                    <img src={`data:image/png;base64,${currentPage.imageB}`} alt={t("compare.revised")} className="w-full rounded border border-gray-200 dark:border-slate-700" />
                  ) : (
                    <p className="text-sm text-gray-400">{t("compare.noPageHere")}</p>
                  )}
                </div>
              </div>
            )}

            {viewMode === "diff" &&
              (currentPage.diffImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- server-rendered pixel-diff image
                <img src={`data:image/png;base64,${currentPage.diffImage}`} alt={t("compare.visualDiff")} className="w-full max-w-2xl rounded border border-gray-200 dark:border-slate-700" />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("compare.noDiffAvailable")}</p>
              ))}

            {viewMode === "text" && (
              <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs dark:border-slate-700 dark:bg-slate-900">
                {currentPage.textDiff.length === 0
                  ? t("compare.noTextChanges")
                  : currentPage.textDiff.map((line, i) => (
                      <div key={i} className={line.startsWith("+") ? "text-emerald-600 dark:text-emerald-400" : line.startsWith("-") ? "text-red-600 dark:text-red-400" : "text-gray-500"}>
                        {line}
                      </div>
                    ))}
              </pre>
            )}
          </div>
        </div>
      )}

      {passwordPrompt && (
        <PasswordPromptModal
          wrongPassword={passwordPrompt.wrongPassword}
          onCancel={() => setPasswordPrompt(null)}
          onSubmit={(password) => handleCompare(password)}
        />
      )}
    </main>
  );
}
