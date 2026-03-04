// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
    ...obsidianmd.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsparser,
            parserOptions: { project: "./tsconfig.json" },
        },

        // You can add your own configuration to override or add rules
        rules: {

        },
    },
    {
        // 忽略檢查編譯後嘅檔案
        ignores: ["main.js", "node_modules/**", "dist/**", "*.mjs", "*.js"]
    }
]);