"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, FileText, Loader2, Trash2 } from "lucide-react";
import { getCatalogTools } from "@/components/header";
import DocumentPreview from "@/components/tools/DocumentPreview";
import ToolPageHeader from "@/components/tools/ToolPageHeader";
import FileDropzone from "@/components/tools/FileDropzone";
import PageArrangerField, { type PageLayoutEntry } from "@/components/tools/PageArrangerField";
import PasswordPromptModal from "@/components/tools/PasswordPromptModal";
import PreviewModal from "@/components/tools/PreviewModal";
import ToolOptionsForm from "@/components/tools/ToolOptionsForm";
import ToolResultPanel from "@/components/tools/ToolResultPanel";
import WatermarkPreviewOverlay from "@/components/tools/WatermarkPreviewOverlay";
import { ApiError, EncryptedPdfRequiredError, postForFile, triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isPreviewableBlob } from "@/lib/previewable";
import { WORKFLOW_STEPS, getWorkflowStepDef, type WorkflowStepType } from "@/lib/workflowSteps";

type FieldValue = string | number | boolean;
type PipelineStep = { id: string; type: WorkflowStepType; values: Record<string, FieldValue> };
type Status = "idle" | "loading" | "error" | "success";

// Every pipeline step corresponds to an existing standalone tool -- reusing that tool's
// own icon here (rather than inventing separate ones) means a step reads at a glance as
// "the same OCR you already know", keeping the pipeline builder visually anchored to the
// rest of the app instead of feeling like a bare abstract list of dropdowns.
const STEP_TOOL_SLUG: Record<WorkflowStepType, string> = {
  merge: "merge-pdf",
  ocr: "ocr-pdf",
  watermark: "add-watermark",
  compress: "compress-pdf",
  "convert-pdfa": "pdf-to-pdfa",
  rotate: "rotate-pdf",
  crop: "crop-pdf",
  "add-page-numbers": "add-page-numbers",
  "remove-pages": "remove-pages",
  "extract-pages": "extract-pages",
  repair: "repair-pdf",
  protect: "protect-pdf",
};

function defaultValuesFor(type: WorkflowStepType): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of getWorkflowStepDef(type).fields) {
    if ("defaultValue" in field && field.defaultValue !== undefined) values[field.name] = field.defaultValue;
  }
  return values;
}

export default function WorkflowPipelinePage({ slug }: { slug: string }) {
  const catalog = getCatalogTools();
  const catalogEntry = catalog.find((tool) => tool.href === `/tools/${slug}`);
  const { t, language } = useLanguage();
  const isSw = language === "sw";
  const [files, setFiles] = useState<File[]>([]);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [addType, setAddType] = useState<WorkflowStepType>("ocr");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ wrongPassword: boolean } | null>(null);
  // Which of the (possibly several) uploaded files the left pane currently shows -- with
  // more than one file uploaded, the preview used to always pin to the first one, so a
  // second/third file was uploaded successfully but never actually visible anywhere.
  const [previewFileIndex, setPreviewFileIndex] = useState(0);
  const [mergeLayout, setMergeLayout] = useState<PageLayoutEntry[]>([]);

  const hasMerge = steps.some((s) => s.type === "merge");
  const availableToAdd = WORKFLOW_STEPS.filter((s) => s.type !== "merge" || (!hasMerge && steps.length === 0));
  const watermarkStep = steps.find((s) => s.type === "watermark");

  const safePreviewIndex = Math.min(previewFileIndex, Math.max(0, files.length - 1));
  const primaryFile = files[safePreviewIndex] ?? null;
  // Same rule as the standard dual-pane tools: prefer the finished result once it exists
  // and can actually be rendered, otherwise fall back to the source so there's always
  // something to look at while building the pipeline.
  const previewSource = useMemo<Blob | File | null>(
    () => (result && isPreviewableBlob(result.blob) ? result.blob : primaryFile),
    [result, primaryFile],
  );

  const addStep = () => {
    setSteps((prev) => [...prev, { id: crypto.randomUUID(), type: addType, values: defaultValuesFor(addType) }]);
  };

  const removeStep = (id: string) => setSteps((prev) => prev.filter((s) => s.id !== id));

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateStepValue = (id: string, name: string, value: FieldValue) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, values: { ...s.values, [name]: value } } : s)));
  };

  const reset = () => {
    setStatus("idle");
    setError("");
    setResult(null);
    setPreviewOpen(false);
  };

  const processAnother = () => {
    reset();
    setFiles([]);
    setSteps([]);
    setPreviewFileIndex(0);
    setMergeLayout([]);
  };

  const handleRun = async (password?: string) => {
    if (files.length === 0 || steps.length === 0) return;
    setStatus("loading");
    setError("");
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      const pipeline = steps.map((step) =>
        step.type === "merge" ? { step: step.type, params: { ...step.values, layout: mergeLayout } } : { step: step.type, params: step.values },
      );
      formData.append("pipeline", JSON.stringify({ pipeline }));
      if (password) formData.append("password", password);
      const { blob, filename } = await postForFile("/api/v1/workflow/execute", formData, "workflow_result.pdf");
      setResult({ blob, filename });
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

  // No files yet: just the dropzone, full width -- matching every other tool's empty
  // state. The preview pane only makes sense once there's something to show inside it,
  // so it doesn't render at all until then (an empty preview box with nothing in it read
  // as a stray leftover element, not a real feature, when a real user hit it).
  if (files.length === 0) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("workflow.title")} description={t("workflow.description")} />
        <div className="mx-auto mt-8 max-w-2xl">
          <FileDropzone accept=".pdf,application/pdf" multiple files={files} onChange={setFiles} label={t("workflow.uploadLabel")} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("workflow.title")} description={t("workflow.description")} />

      <div className="mt-6 flex flex-col items-start gap-6 lg:flex-row">
        <div className="flex w-full flex-1 flex-col gap-2">
          {files.length > 1 && status === "idle" && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <button
                  key={`${file.name}-${index}`}
                  type="button"
                  onClick={() => setPreviewFileIndex(index)}
                  title={file.name}
                  className={`max-w-40 truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    index === safePreviewIndex
                      ? "border-maroon bg-maroon text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-maroon/40 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300"
                  }`}
                >
                  {index + 1}. {file.name}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex h-130 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:h-160">
            {previewSource ? (
              <>
                <DocumentPreview key={safePreviewIndex} blob={previewSource} variant="inline" />
                {watermarkStep && status === "idle" && (
                  <WatermarkPreviewOverlay values={watermarkStep.values} imageFile={null} />
                )}
              </>
            ) : status === "loading" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
                <Loader2 className="h-10 w-10 animate-spin text-maroon" aria-hidden />
                <p className="max-w-xs text-sm">{t("workspace.converting")}</p>
              </div>
            ) : status === "success" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
                <p className="max-w-xs text-sm">{t("workspace.doneNotPreviewable")}</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
                <FileText className="h-12 w-12" aria-hidden />
                <p className="max-w-xs text-sm">{t("workspace.previewUnavailable")}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-6 lg:w-95 lg:shrink-0">
          <FileDropzone accept=".pdf,application/pdf" multiple files={files} onChange={setFiles} label={t("workflow.uploadLabel")} />

          <div className="space-y-3">
            {steps.map((step, index) => {
              const def = getWorkflowStepDef(step.type);
              const StepIcon = catalog.find((tool) => tool.href === `/tools/${STEP_TOOL_SLUG[step.type]}`)?.icon;
              return (
                <div key={step.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-maroon/10 text-maroon dark:bg-maroon/20">
                        {StepIcon ? <StepIcon className="h-4 w-4" aria-hidden /> : index + 1}
                      </span>
                      <span className="truncate">{(isSw && def.labelSw) || def.label}</span>
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-700">
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-700">
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => removeStep(step.id)} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {step.type === "merge" ? (
                    <div className="mt-3">
                      <PageArrangerField files={files} onLayoutChange={setMergeLayout} />
                    </div>
                  ) : (
                    def.fields.length > 0 && (
                      <div className="mt-3">
                        <ToolOptionsForm fields={def.fields} values={step.values} onChange={(name, value) => updateStepValue(step.id, name, value)} />
                      </div>
                    )
                  )}
                </div>
              );
            })}

            <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 p-3 dark:border-slate-600">
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as WorkflowStepType)}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100"
              >
                {availableToAdd.map((s) => (
                  <option key={s.type} value={s.type}>
                    {(isSw && s.labelSw) || s.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addStep} className="shrink-0 rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon/90">
                {t("workflow.addStep")}
              </button>
            </div>
          </div>

          {status === "idle" ? (
            <button
              type="button"
              onClick={() => handleRun()}
              disabled={files.length === 0 || steps.length === 0}
              className="w-full rounded-xl bg-maroon px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-maroon/20 transition-all hover:bg-maroon/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("workflow.runPipeline")}
            </button>
          ) : (
            <ToolResultPanel
              status={status}
              error={error}
              resultFilename={result?.filename}
              onDownload={result ? () => triggerDownload(result.blob, result.filename) : undefined}
              onPreview={result && isPreviewableBlob(result.blob) ? () => setPreviewOpen(true) : undefined}
              onReset={reset}
              onProcessAnother={processAnother}
            />
          )}
        </div>
      </div>

      {passwordPrompt && (
        <PasswordPromptModal
          wrongPassword={passwordPrompt.wrongPassword}
          onCancel={() => setPasswordPrompt(null)}
          onSubmit={(password) => handleRun(password)}
        />
      )}

      {previewOpen && result && (
        <PreviewModal blob={result.blob} filename={result.filename} onClose={() => setPreviewOpen(false)} />
      )}
    </main>
  );
}
