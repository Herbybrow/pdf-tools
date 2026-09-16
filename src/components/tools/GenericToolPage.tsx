"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { getCatalogTools } from "@/components/header";
import type { ToolDefinition } from "@/lib/toolDefinitions";
import { triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isPreviewableBlob } from "@/lib/previewable";
import { useToolSubmission } from "@/lib/useToolSubmission";
import FileDropzone from "./FileDropzone";
import ToolOptionsForm from "./ToolOptionsForm";
import ToolPageHeader from "./ToolPageHeader";
import ToolResultPanel from "./ToolResultPanel";

// Dynamic imports for conditionally rendered modals
const PasswordPromptModal = dynamic(() => import("./PasswordPromptModal"), { ssr: false });
const PreviewModal = dynamic(() => import("./PreviewModal"), { ssr: false });

type GenericToolPageProps = {
  definition: ToolDefinition;
  title: string;
  titleSw?: string;
  description?: string;
  descriptionSw?: string;
};

export default function GenericToolPage({ definition, title, titleSw, description, descriptionSw }: GenericToolPageProps) {
  const { language } = useLanguage();
  const isSw = language === "sw";
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${definition.slug}`);
  const displayTitle = (isSw && titleSw) || title;
  const displayDescription = (isSw && descriptionSw) || description;
  const displaySubmitLabel = (isSw && definition.submitLabelSw) || definition.submitLabel;
  const displayHelperNote = (isSw && definition.helperNoteSw) || definition.helperNote;
  const [previewOpen, setPreviewOpen] = useState(false);

  const {
    files,
    setFiles,
    secondaryFile,
    setSecondaryFile,
    values,
    handleChange,
    secondaryFileVisible,
    canSubmit,
    status,
    error,
    result,
    passwordPrompt,
    setPasswordPrompt,
    reset: resetSubmission,
    processAnother: processAnotherSubmission,
    submitWith,
  } = useToolSubmission(definition);

  const reset = () => {
    resetSubmission();
    setPreviewOpen(false);
  };
  const processAnother = () => {
    processAnotherSubmission();
    setPreviewOpen(false);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={displayTitle} description={displayDescription} />
      {displayHelperNote && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
          {displayHelperNote}
        </p>
      )}

      <div className="mt-6 space-y-6">
        {definition.requiresFile && (
          <FileDropzone accept={definition.accept} multiple={definition.multiple} files={files} onChange={setFiles} />
        )}

        {secondaryFileVisible && definition.secondaryFile && (
          <FileDropzone
            accept={definition.secondaryFile.accept}
            multiple={false}
            files={secondaryFile}
            onChange={setSecondaryFile}
            label={(isSw && definition.secondaryFile.labelSw) || definition.secondaryFile.label}
          />
        )}

        <ToolOptionsForm fields={definition.fields} values={values} onChange={handleChange} file={files[0] ?? null} />

        {status === "idle" && (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => submitWith()}
            className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:bg-maroon/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {displaySubmitLabel ?? "Run"}
          </button>
        )}

        {status !== "idle" && (
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

      {passwordPrompt && (
        <PasswordPromptModal
          wrongPassword={passwordPrompt.wrongPassword}
          onCancel={() => setPasswordPrompt(null)}
          onSubmit={(password) => submitWith(password)}
        />
      )}

      {previewOpen && result && (
        <PreviewModal blob={result.blob} filename={result.filename} onClose={() => setPreviewOpen(false)} />
      )}
    </main>
  );
}