"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type FileDropzoneProps = {
  accept: string;
  multiple: boolean;
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export default function FileDropzone({ accept, multiple, files, onChange, label }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { t } = useLanguage();

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;
      const incomingArray = Array.from(incoming);
      onChange(multiple ? [...files, ...incomingArray] : [incomingArray[0]]);
    },
    [files, multiple, onChange],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index));

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200",
          isDragging
            ? "scale-[1.01] border-maroon bg-maroon/5 shadow-inner dark:bg-maroon/10"
            : "border-gray-300 hover:border-maroon/50 hover:bg-maroon/2 dark:border-slate-700 dark:hover:border-maroon/50",
        )}
      >
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-200 group-hover:-translate-y-0.5",
            isDragging ? "bg-maroon text-white shadow-md" : "bg-maroon/10 text-maroon group-hover:bg-maroon group-hover:text-white group-hover:shadow-md",
          )}
        >
          <UploadCloud className="h-8 w-8" />
        </div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {label ?? t(multiple ? "dropzone.multiple" : "dropzone.single")}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("dropzone.accepted")}: {accept || "any"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="truncate pr-2 text-gray-700 dark:text-gray-200">{file.name}</span>
              <span className="flex items-center gap-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                {formatBytes(file.size)}
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label={`Remove ${file.name}`}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
