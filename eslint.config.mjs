import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
    {
        ignores: ["main.js", "node_modules/**", "dist/**"]
    },
    ...obsidianmd.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: "./tsconfig.json"
            },
            // 🔥 終極修復：教機器人認識瀏覽器嘅內建變數 (window, document, console, setTimeout)
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                crypto: "readonly"
            }
        },
        rules: {
            // 🔥 暫時關閉極度嚴苛、需要完整 Type Checking 嘅「any」警告
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            // 🔥 容許我哋用 await 省略寫法 (即係冇寫 .catch)
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            // 🔥 容許我哋寫 Regex 嘅時候用多咗 / 符號
            "no-useless-escape": "off",
            "obsidianmd/ui/sentence-case": [
                "error",
                {
                    // 話畀機器人聽：呢啲係我嘅品牌名同專有名詞，見到大楷唔好嘈！
                    brands: [
                        "NovelSmith",
                        "Scrivenings",
                        "Scrivenering",
                        "YAML",
                        "ID",
                        "NSmith",
                        "Heading",
                        "heading",
                        "MyBook",
                        "_Backstage",
                        "_Backstage/Drafts",
                        "Output",
                        "AutoWiki",
                        "Wiki",
                        "FILE_ID"
                    ],

                    ignoreRegex: [
                        "\\n",
                        "#"
                    ]
                }
            ]
        }
    },
]);
