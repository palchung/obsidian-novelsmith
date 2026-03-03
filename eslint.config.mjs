import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tsparser from '@typescript-eslint/parser';

export default tseslint.config(
    // 1. 載入 Obsidian 官方專屬規則
    ...obsidianmd.configs.recommended,

    {
        // 只檢查 .ts 檔案，避開 js 設定檔
        files: ["**/*.ts"],

        // 2. 載入 TypeScript 官方嘅「需要類型檢查」嚴格規則 (Type-Aware)
        extends: [
            ...tseslint.configs.recommendedTypeChecked,
        ],

        // 🔥 最重要嘅一步：將 ESLint 同 tsconfig.json 連結！(機器人就係靠呢句)
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },

        rules: {
            // 保留你之前設定好嘅合法字眼 (白名單)
            "obsidianmd/ui/sentence-case": [
                "error",
                {
                    // brands: [
                    //     "NovelSmith",
                    //     "Scrivenings",
                    //     "Scrivenering",
                    //     "YAML",
                    //     "ID",
                    //     "NSmith",
                    //     "Heading",
                    //     "heading",
                    //     "MyBook",
                    //     "_Backstage",
                    //     "_Backstage/Drafts",
                    //     "Output",
                    //     "AutoWiki",
                    //     "Wiki",
                    //     "FILE_ID"
                    // ],

                    ignoreRegex: [
                        "\\n",
                        "#"
                    ]
                }
            ],

            // 明確列出官方機器人最鍾意捉嘅 3 大邏輯 Error：
            "@typescript-eslint/require-await": "error",           // 捉 Async 無 Await
            "@typescript-eslint/no-floating-promises": "error",    // 捉漏咗寫 await 或者 .catch()
            "@typescript-eslint/no-misused-promises": "error"      // 捉錯用 Promise 嘅地方
        }
    },
    {
        // 忽略檢查編譯後嘅檔案
        ignores: ["main.js", "node_modules/**", "dist/**", "*.mjs", "*.js"]
    }
);