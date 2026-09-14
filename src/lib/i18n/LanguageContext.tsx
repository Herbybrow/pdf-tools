"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { TRANSLATIONS, type Language, type TranslationKey } from "./translations";

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

// useSyncExternalStore, not useState+effect: it's the primitive React provides for
// exactly this case (a value that lives outside React, e.g. localStorage, and can
// legitimately differ between the server-rendered snapshot and the client's real
// value). getServerSnapshot always returns "en" so SSR/hydration agree; getSnapshot
// then reads the real stored value, and React reconciles the difference for us --
// no manual effect+setState (and the cascading extra render that comes with it).
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Language {
  return window.localStorage.getItem("language") === "sw" ? "sw" : "en";
}

function getServerSnapshot(): Language {
  return "en";
}

function persistLanguage(lang: Language) {
  window.localStorage.setItem("language", lang);
  listeners.forEach((listener) => listener());
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    persistLanguage(lang);
  }, []);

  const t = useCallback((key: TranslationKey) => TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key], [language]);

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
