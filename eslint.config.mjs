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
    // Generated output — not ours to lint.
    "coverage/**",
    "src/generated/**",
    // The imported design and its logic script are a reference artifact, kept
    // verbatim so it can be diffed against. Not our code to lint.
    "design/**",
  ]),
]);

export default eslintConfig;
