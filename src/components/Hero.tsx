"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

/** Just the heading -- a bold, one-line introduction above the tool grid instead of
 * dropping straight into it. Deliberately just this: no subtitle copy or badges, which
 * read as explaining the product to itself rather than helping someone use it. */
export default function Hero() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-2 pt-10 text-center sm:px-6 sm:pt-14 lg:px-8">
      <h1 className="text-3xl font-black tracking-tight text-gray-900 sm:text-4xl dark:text-white">
        <span className="bg-linear-to-r from-maroon to-maroon/70 bg-clip-text text-transparent">{t("home.titleAccent")}</span>{" "}
        {t("home.title")}
      </h1>
    </section>
  );
}
