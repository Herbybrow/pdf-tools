"use client";

import { useState } from "react";
import { Lock, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type PasswordPromptModalProps = {
  wrongPassword: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
};

export default function PasswordPromptModal({ wrongPassword, onSubmit, onCancel }: PasswordPromptModalProps) {
  const [password, setPassword] = useState("");
  const { t } = useLanguage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) onSubmit(password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-maroon" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t("password.title")}</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label={t("common.cancel")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t("password.description")}</p>

        {wrongPassword && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{t("password.incorrect")}</p>}

        <form onSubmit={handleSubmit} className="mt-4">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("password.placeholder")}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-700"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!password}
              className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("password.unlock")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
