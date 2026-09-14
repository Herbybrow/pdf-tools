"use client";

import type { OptionField } from "@/lib/toolDefinitions";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import PagePickerField from "./PagePickerField";

type FieldValue = string | number | boolean;

type ToolOptionsFormProps = {
  fields: OptionField[];
  values: Record<string, FieldValue>;
  onChange: (name: string, value: FieldValue) => void;
  /** Needed only by "page-picker" fields, to render page thumbnails. */
  file?: File | null;
};

function isVisible(field: OptionField, values: Record<string, FieldValue>): boolean {
  if (!field.showIf) return true;
  return String(values[field.showIf.field]) === field.showIf.equals;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100";

export default function ToolOptionsForm({ fields, values, onChange, file }: ToolOptionsFormProps) {
  const { language } = useLanguage();
  const isSw = language === "sw";
  const visibleFields = fields.filter((field) => isVisible(field, values));
  if (visibleFields.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visibleFields.map((field) => {
        const value = values[field.name];
        const label = (isSw && field.labelSw) || field.label;
        const help = (isSw && field.helpSw) || field.help;
        const placeholder =
          field.type !== "select" && field.type !== "number" && field.type !== "checkbox" && field.type !== "page-picker"
            ? (isSw && field.placeholderSw) || field.placeholder
            : undefined;

        if (field.type === "page-picker") {
          if (!file) return null;
          return (
            <PagePickerField
              key={`${field.name}:${file.name}:${file.size}`}
              file={file}
              mode={field.pickerMode}
              label={label}
              value={String(value ?? "")}
              onChange={(next) => onChange(field.name, next)}
            />
          );
        }

        if (field.type === "checkbox") {
          return (
            <label key={field.name} className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={Boolean(value ?? field.defaultValue ?? false)}
                onChange={(e) => onChange(field.name, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-maroon focus:ring-maroon"
              />
              {label}
            </label>
          );
        }

        return (
          <div key={field.name} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
            <label htmlFor={field.name} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              {label}
            </label>

            {field.type === "select" && (
              <select
                id={field.name}
                className={inputClass}
                value={String(value ?? field.defaultValue ?? "")}
                onChange={(e) => onChange(field.name, e.target.value)}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {(isSw && option.labelSw) || option.label}
                  </option>
                ))}
              </select>
            )}

            {field.type === "number" && (
              <input
                id={field.name}
                type="number"
                className={inputClass}
                value={value === undefined ? (field.defaultValue ?? 0) : Number(value)}
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                onChange={(e) => onChange(field.name, e.target.valueAsNumber)}
              />
            )}

            {(field.type === "text" || field.type === "page-range") && (
              <input
                id={field.name}
                type="text"
                className={inputClass}
                placeholder={placeholder}
                value={String(value ?? (field.type === "text" ? field.defaultValue : undefined) ?? "")}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            )}

            {field.type === "password" && (
              <input
                id={field.name}
                type="password"
                className={inputClass}
                placeholder={placeholder}
                value={String(value ?? "")}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            )}

            {field.type === "textarea" && (
              <textarea
                id={field.name}
                rows={8}
                className={`${inputClass} font-mono`}
                placeholder={placeholder}
                value={String(value ?? field.defaultValue ?? "")}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            )}

            {help && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>}
          </div>
        );
      })}
    </div>
  );
}
