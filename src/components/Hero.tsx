"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function Hero() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-0 pt-4 text-center sm:px-6 sm:pt-4 lg:px-8">
      <h1 className="text-3xl font-black tracking-tight text-gray-900 sm:text-4xl dark:text-white">
        <span className="bg-linear-to-r from-maroon to-maroon/70 bg-clip-text text-transparent">
          {t("home.titleAccent" as any)}
        </span>{" "}
        {t("home.title" as any)}
      </h1>
    </section>
  );
}