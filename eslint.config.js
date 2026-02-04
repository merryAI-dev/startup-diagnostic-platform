import js from "@eslint/js"
import prettierConfig from "eslint-config-prettier"
import prettier from "eslint-plugin-prettier"
import react from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig } from "eslint/config"
import tseslint from "typescript-eslint"

export default defineConfig([
    {
        ignores: ["dist", "node_modules"],
    },

    // JS 기본 추천 규칙 (TS만 써도 필요)
    js.configs.recommended,

    // TypeScript 추천 규칙
    ...tseslint.configs.recommended,

    // Prettier와 충돌하는 ESLint 규칙 비활성화
    prettierConfig,

    {
        files: ["**/*.{ts,tsx}"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
        },

        plugins: {
            react,
            "react-hooks": reactHooks,
            prettier,
        },

        settings: {
            react: {
                version: "detect",
            },
        },

        rules: {
            /* React */
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",

            /* Hooks */
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",

            /* TypeScript */
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/explicit-module-boundary-types": "off",

            /* Code quality */
            "prefer-const": "error",

            /* Prettier */
            "prettier/prettier": [
                "warn",
                {
                    endOfLine: "auto",
                },
            ],
        },
    },
])
