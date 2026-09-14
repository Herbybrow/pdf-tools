import { useMemo, useState } from "react";
import type { ToolDefinition } from "@/lib/toolDefinitions";
import { ApiError, EncryptedPdfRequiredError, postForFile } from "@/lib/apiClient";

export type FieldValue = string | number | boolean;
export type Status = "idle" | "loading" | "error" | "success";

function initialValues(definition: ToolDefinition): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of definition.fields) {
    if ("defaultValue" in field && field.defaultValue !== undefined) {
      values[field.name] = field.defaultValue;
    }
  }
  return values;
}

/** All the state and submit/retry/reset behavior shared by every config-driven tool
 * page, regardless of how it's laid out on screen (stacked single column in
 * GenericToolPage, or side-by-side in WorkspaceToolPage). Extracted so both layouts
 * behave identically -- password retry, encrypted-PDF handling, "process another"
 * fully clearing state -- without duplicating that logic (and its edge cases) twice. */
export function useToolSubmission(definition: ToolDefinition) {
  const [files, setFiles] = useState<File[]>([]);
  const [secondaryFile, setSecondaryFile] = useState<File[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>(() => initialValues(definition));
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{ wrongPassword: boolean } | null>(null);

  const secondaryFileVisible =
    !!definition.secondaryFile &&
    (!definition.secondaryFile.showIf || String(values[definition.secondaryFile.showIf.field]) === definition.secondaryFile.showIf.equals);

  const canSubmit = useMemo(() => {
    if (definition.requiresFile && files.length < definition.minFiles) return false;
    if (secondaryFileVisible && secondaryFile.length === 0) return false;
    return true;
  }, [definition, files, secondaryFile, secondaryFileVisible]);

  const handleChange = (name: string, value: FieldValue) => setValues((prev) => ({ ...prev, [name]: value }));

  // Used by the error state's "try again" -- deliberately keeps the selected file(s)
  // and options so the user can retry the same request without re-uploading.
  const reset = () => {
    setStatus("idle");
    setError("");
    setResult(null);
    setPasswordPrompt(null);
  };

  // Used by the success state's "process another" -- clears everything so the tool
  // is genuinely blank for a new file, instead of still showing the last one.
  const processAnother = () => {
    reset();
    setFiles([]);
    setSecondaryFile([]);
    setValues(initialValues(definition));
  };

  const buildFormData = (sourcePassword?: string): FormData => {
    const formData = new FormData();
    if (definition.requiresFile) {
      if (definition.multiple) {
        files.forEach((file) => formData.append(definition.fileFieldName, file));
      } else if (files[0]) {
        formData.append(definition.fileFieldName, files[0]);
      }
    }
    if (definition.secondaryFile && secondaryFile[0]) {
      formData.append(definition.secondaryFile.name, secondaryFile[0]);
    }
    for (const field of definition.fields) {
      const value = values[field.name];
      if (value === undefined || value === "") continue;
      formData.append(field.name, String(value));
    }
    if (sourcePassword) formData.append("password", sourcePassword);
    return formData;
  };

  const submitWith = async (sourcePassword?: string) => {
    setStatus("loading");
    setError("");
    try {
      const { blob, filename } = await postForFile(definition.endpoint, buildFormData(sourcePassword), definition.resultFilename);
      setResult({ blob, filename });
      setPasswordPrompt(null);
      setStatus("success");
    } catch (err) {
      if (err instanceof EncryptedPdfRequiredError) {
        setPasswordPrompt({ wrongPassword: err.wrongPassword });
        setStatus("idle");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unexpected error. Please try again.");
      setStatus("error");
    }
  };

  // For the handful of tools that can produce a preview identical to the real result
  // ahead of time (Word/PowerPoint/Excel to PDF's auto-generated source preview, which
  // runs the exact same LibreOffice conversion) -- jumps straight to the success state
  // with that already-in-hand blob instead of re-running a conversion that can take
  // 15+ seconds, just to get back the same bytes a second time.
  const submitFromCache = (blob: Blob, filename: string) => {
    setError("");
    setResult({ blob, filename });
    setPasswordPrompt(null);
    setStatus("success");
  };

  return {
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
    reset,
    processAnother,
    submitWith,
    submitFromCache,
  };
}
