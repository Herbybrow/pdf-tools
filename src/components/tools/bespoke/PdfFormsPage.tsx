"use client";

import { useState } from "react";
import { getCatalogTools } from "@/components/header";
import ToolPageHeader from "@/components/tools/ToolPageHeader";
import FileDropzone from "@/components/tools/FileDropzone";
import PasswordPromptModal from "@/components/tools/PasswordPromptModal";
import PreviewModal from "@/components/tools/PreviewModal";
import ToolResultPanel from "@/components/tools/ToolResultPanel";
import { ApiError, EncryptedPdfRequiredError, postForFile, postForJson, triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isPreviewableBlob } from "@/lib/previewable";

type FormField = {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown";
  page: number;
  value: string | boolean | null;
  options: string[] | null;
};

type Status = "idle" | "loading" | "error" | "success";

export default function PdfFormsPage({ slug }: { slug: string }) {
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const { t } = useLanguage();
  const [file, setFile] = useState<File[]>([]);
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [flatten, setFlatten] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filePassword, setFilePassword] = useState<string | undefined>(undefined);
  const [passwordPrompt, setPasswordPrompt] = useState<{ wrongPassword: boolean } | null>(null);

  const loadFile = async (files: File[], password?: string) => {
    setFile(files);
    const picked = files[0];
    if (!picked) return;
    setDetecting(true);
    setDetectError("");
    setFields(null);
    try {
      const formData = new FormData();
      formData.append("file", picked);
      if (password) formData.append("password", password);
      const response = await postForJson<{ fields: FormField[] }>("/api/v1/edit/forms/detect", formData);
      setFields(response.fields);
      const initial: Record<string, string> = {};
      for (const field of response.fields) {
        initial[field.name] = field.value ? String(field.value) : "";
      }
      setValues(initial);
      if (password) setFilePassword(password);
    } catch (err) {
      if (err instanceof EncryptedPdfRequiredError) {
        setPasswordPrompt({ wrongPassword: err.wrongPassword });
        return;
      }
      setDetectError(err instanceof ApiError ? err.message : t("forms.couldNotRead"));
    } finally {
      setDetecting(false);
    }
  };

  const handlePasswordSubmit = (password: string) => {
    setPasswordPrompt(null);
    void loadFile(file, password);
  };

  const reset = () => {
    setStatus("idle");
    setError("");
    setResult(null);
    setPreviewOpen(false);
  };

  const processAnother = () => {
    reset();
    setFile([]);
    setFields(null);
    setValues({});
    setFlatten(true);
    setFilePassword(undefined);
    setDetectError("");
  };

  const handleSubmit = async () => {
    if (!file[0]) return;
    setStatus("loading");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file[0]);
      formData.append("values", JSON.stringify(values));
      formData.append("flatten", String(flatten));
      if (filePassword) formData.append("password", filePassword);
      const { blob, filename } = await postForFile("/api/v1/edit/forms/fill", formData, "filled.pdf");
      setResult({ blob, filename });
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

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("forms.title")} description={t("forms.description")} />

      {!fields && (
        <div className="mt-6">
          <FileDropzone accept=".pdf,application/pdf" multiple={false} files={file} onChange={loadFile} />
          {detecting && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t("forms.readingFields")}</p>}
          {detectError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{detectError}</p>}
        </div>
      )}

      {fields && fields.length === 0 && <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">{t("forms.noFields")}</p>}

      {fields && fields.length > 0 && (
        <div className="mt-6 space-y-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {field.name} <span className="text-xs text-gray-400">({t("common.page")} {field.page + 1})</span>
              </label>
              {field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={values[field.name] === "Yes" || values[field.name] === "On"}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.checked ? "Yes" : "Off" }))}
                  className="h-4 w-4 rounded text-maroon"
                />
              ) : field.type === "dropdown" && field.options ? (
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100"
                  value={values[field.name] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                >
                  <option value="" />
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100"
                  value={values[field.name] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                />
              )}
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} className="h-4 w-4 rounded text-maroon" />
            {t("forms.flattenLabel")}
          </label>

          <div className="pt-2">
            {status === "idle" && (
              <button type="button" onClick={handleSubmit} className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon/90">
                {t("forms.fillButton")}
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
        </div>
      )}

      {passwordPrompt && (
        <PasswordPromptModal
          wrongPassword={passwordPrompt.wrongPassword}
          onCancel={() => setPasswordPrompt(null)}
          onSubmit={handlePasswordSubmit}
        />
      )}

      {previewOpen && result && (
        <PreviewModal blob={result.blob} filename={result.filename} onClose={() => setPreviewOpen(false)} />
      )}
    </main>
  );
}
