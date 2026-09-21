import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ──────────────────────────────────────────────────────────────────
    // FINAL-009 (#163): re-enabled rules. Each is set to "warn" so that
    // existing CI gates that fail only on `error` continue to pass while
    // the codebase is being cleaned up. New code should aim for zero
    // warnings. Violations are fixed in this same PR.
    // ──────────────────────────────────────────────────────────────────
    // Unused imports/variables. `argsIgnorePattern: "^_"` lets callers
    // keep intentionally-unused positional params (e.g. a callback that
    // must match a fixed signature) by prefixing them with `_`.
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // Allow `console.warn` and `console.error` for defense-in-depth in
    // catch blocks (and inside the logger itself). All other
    // `console.log` calls should be replaced with `logger.info`/`debug`
    // from `@/lib/aurevia/logger`.
    "no-console": ["warn", { allow: ["warn", "error"] }],
    // Surface missing effect dependencies without breaking the build.
    "react-hooks/exhaustive-deps": "warn",

    // ──────────────────────────────────────────────────────────────────
    // Remaining intentionally-disabled rules. These are kept off because
    // fixing them would require a dedicated PR (large `any` surface,
    // effect-set-state patterns, etc.).
    // ──────────────────────────────────────────────────────────────────
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",

    // React rules
    "react-hooks/purity": "off",
    // The new `set-state-in-effect` rule (eslint-config-next 16) flags every
    // synchronous setState inside an effect body. Several Aurevia patterns
    // legitimately need this: state restoration from localStorage on mount
    // (onboarding page), loading-state transitions before async fetches, and
    // first-tick derived state. Disable globally — same posture as
    // `exhaustive-deps` and `purity`.
    "react-hooks/set-state-in-effect": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "mini-services/**"]
}];

export default eslintConfig;
