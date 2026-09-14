import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python backend (its own venv, incl. vendored JS from Playwright's browser driver)
    "backend/**",
    // Vendored/minified library asset copied into public/ for self-hosting, not source
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
