import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { updateRedundantPatterns } from '../decorators';
import { AIDS_DIR, ensureFolderExists, replaceEntireDocument } from '../utils';
import { CleanDraftModal } from '../modals';

export class WritingManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(newSettings: NovelSmithSettings) {
        this.settings = newSettings;
    }

    private triggerEditorUpdate() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) {
                // @ts-ignore
                const cm = leaf.view.editor.cm;
                if (cm) cm.dispatch({ effects: [] });
            }
        });
    }


    // 修改路徑為常數：
    private getAidsFolderPath() {
        return `${this.settings.bookFolderPath}/${AIDS_DIR}`;
    }

    // =================================================================
    // 📄 智能生成器：贅字清單與正字名單
    // =================================================================
    public async ensureRedundantListExists(forceShowNotice: boolean = false) {
        const configPath = `${this.getAidsFolderPath()}/RedundantList.md`;
        // ... 下方將 this.settings.redundantListPath 替換成 configPath
        let configFile = this.app.vault.getAbstractFileByPath(configPath);
        if (!configFile) {
            // 🔥 錯誤修復：只傳入資料夾路徑，不要傳入包含 .md 的完整路徑！
            await ensureFolderExists(this.app, this.getAidsFolderPath());
            try {
                await this.app.vault.create(configPath, `// 預設贅字清單\n其實, 基本上, 彷彿`);
                if (forceShowNotice) new Notice(`✅ 成功生成贅字清單：${configPath}`);
            } catch (e) {
                if (forceShowNotice) new Notice(`❌ 建立失敗，請檢查路徑`);
            }
        } else {
            if (forceShowNotice) new Notice(`⚠️ 檔案已存在 (${configPath})，停止生成。`);
        }
    }

    public async ensureFixListExists(forceShowNotice: boolean = false) {
        const configPath = `${this.getAidsFolderPath()}/FixList.md`;
        // ... 同樣替換邏輯，將 this.settings.fixListPath 替換成 configPath
        let configFile = this.app.vault.getAbstractFileByPath(configPath);
        if (!configFile) {
            // 🔥 錯誤修復：只傳入資料夾路徑，不要傳入包含 .md 的完整路徑！
            await ensureFolderExists(this.app, this.getAidsFolderPath());
            try {
                await this.app.vault.create(configPath, `// 正字名單\n主角名 | 錯字1`);
                if (forceShowNotice) new Notice(`✅ 成功生成正字名單：${configPath}`);
            } catch (e) {
                if (forceShowNotice) new Notice(`❌ 建立失敗，請檢查路徑`);
            }
        } else {
            if (forceShowNotice) new Notice(`⚠️ 檔案已存在 (${configPath})，停止生成。`);
        }
    }

    // =================================================================
    // 🔍 贅字模式
    // =================================================================
    async toggleRedundantMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-redundant');

        if (isModeOn) {
            document.body.classList.remove('mode-redundant');
            updateRedundantPatterns(null);
            this.triggerEditorUpdate();
            new Notice("⚪️ 已關閉：贅字模式");
        } else {
            document.body.classList.remove('mode-dialogue');

            await this.ensureRedundantListExists(false); // 確保檔案存在
            const configPath = `${this.getAidsFolderPath()}/RedundantList.md`;
            let configFile = this.app.vault.getAbstractFileByPath(configPath);

            if (configFile instanceof TFile) {
                const configContent = await this.app.vault.read(configFile);
                const badWords = configContent.split(/[,，、\n]+/)
                    .map(w => w.trim())
                    .filter(w => w.length > 0 && !w.startsWith("//"));

                if (badWords.length === 0) { new Notice("⚠️ 有效贅字清單為空"); return; }

                const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                badWords.sort((a, b) => b.length - a.length);

                // 🔥 大師級修復：中英雙語兼容的 Regex 構建器
                const patternString = badWords.map(w => {
                    const escaped = escapeRegExp(w);
                    // 判斷：如果這個詞的頭尾都是英文字母或數字，就加上 \b (單詞邊界)
                    const isEnglishWord = /^[a-zA-Z0-9].*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(w);
                    if (isEnglishWord) {
                        return `\\b${escaped}\\b`;
                    }
                    return escaped; // 中文或其他符號保持原樣
                }).join("|");

                const combinedRegex = new RegExp(`(${patternString})`, 'g');


                updateRedundantPatterns(combinedRegex);
                document.body.classList.add('mode-redundant');
                this.triggerEditorUpdate();
                new Notice(`🔍 贅字模式：監控中 (${badWords.length} 詞)`);
            }
        }
    }

    // =================================================================
    // 💬 對話模式
    // =================================================================
    async toggleDialogueMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-dialogue');

        if (isModeOn) {
            document.body.classList.remove('mode-dialogue');
            this.triggerEditorUpdate();
            new Notice("⚪️ 已關閉：對話模式");
        } else {
            document.body.classList.remove('mode-redundant');
            document.body.classList.add('mode-dialogue');
            this.triggerEditorUpdate();
            new Notice("💬 對話模式：聚焦中");
        }
    }

    // =================================================================
    // ✍️ 正字刑警
    // =================================================================
    async correctNames(view: MarkdownView) {
        await this.ensureFixListExists(false); // 確保檔案存在
        const dataFileName = `${this.getAidsFolderPath()}/FixList.md`;
        let fileObj = this.app.vault.getAbstractFileByPath(dataFileName);

        if (!(fileObj instanceof TFile)) return;
        const rawList = await this.app.vault.read(fileObj);

        const fixList: Record<string, string[]> = {};
        const linesList = rawList.trim().split('\n');
        let lastCorrectName = "";

        for (let line of linesList) {
            line = line.trim();
            if (!line || line.startsWith("//")) continue;
            const parts = line.split(/[|｜]/).map(p => p.trim());
            let correctName = "";
            let wrongNames: string[] = [];
            if (parts[0] !== "") {
                correctName = parts[0];
                wrongNames = parts.slice(1).filter(p => p);
                lastCorrectName = correctName;
            } else {
                if (lastCorrectName !== "") {
                    correctName = lastCorrectName;
                    wrongNames = parts.slice(1).filter(p => p);
                } else continue;
            }
            if (fixList[correctName]) {
                fixList[correctName] = [...new Set([...fixList[correctName], ...wrongNames])];
            } else {
                fixList[correctName] = wrongNames;
            }
        }



        let allReplacements: { wrong: string, correct: string, regex?: RegExp }[] = [];
        for (const [correctName, wrongNames] of Object.entries(fixList)) {
            wrongNames.forEach(wrong => {
                if (wrong !== correctName) {
                    allReplacements.push({ wrong: wrong, correct: correctName });
                }
            });
        }
        allReplacements.sort((a, b) => b.wrong.length - a.wrong.length);

        // 🔥 效能大躍進：預先編譯所有 Regex！加上英文單詞邊界防護！
        const compiledReplacements = allReplacements.map(item => {
            const escapedWrong = item.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 🔥 防誤傷機制 1：如果錯字係全英文，強制加上單詞邊界 \b
            const isEnglishWord = /^[a-zA-Z0-9].*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(item.wrong);
            let pattern = isEnglishWord ? `\\b${escapedWrong}\\b` : escapedWrong;

            // 處理正確名稱包含了錯誤名稱的情況 (例如：錯: 小明 -> 正: 王小明)
            if (item.correct.startsWith(item.wrong)) {
                const suffix = item.correct.slice(item.wrong.length);
                if (suffix) {
                    const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    pattern += `(?!${escapedSuffix})`;
                }
            }
            return {
                ...item,
                regex: new RegExp(pattern, 'g') // 預先造好引擎
            };
        });

        let content = view.editor.getValue();
        let totalCount = 0;
        let changesLog: string[] = [];
        const lines = content.split("\n");
        let inCodeBlock = false;
        let inYaml = false;

        const processedLines = lines.map((line, index) => {
            // ==========================================
            // 🛡️ 絕對結界 1：大區塊防護 (YAML 與 Code Block)
            // ==========================================
            // 1. 跳過 YAML 區塊 (通常在檔案最頂部)
            if (index === 0 && line.trim() === "---") { inYaml = true; return line; }
            if (inYaml) { if (line.trim() === "---") inYaml = false; return line; }

            // 2. 跳過 Markdown 程式碼區塊 (```)
            if (line.trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
                return line;
            }
            if (inCodeBlock) return line;

            // 3. 略過系統標籤與屬性行
            if (line.includes("<small>++ FILE_ID") || line.includes("++ FILE_ID:")) return line;
            if (line.trim().startsWith(">") && line.includes("::")) return line;

            let newLine = line;

            // ==========================================
            // 🎭 絕對結界 2：「遮罩魔法」(保護同行內的網址/代碼)
            // ==========================================
            const masks: { token: string, original: string }[] = [];
            let maskCounter = 0;

            // 遮蓋網址 (http / https)
            newLine = newLine.replace(/https?:\/\/[^\s\)]+/g, (match) => {
                const token = `__NS_MASK_${maskCounter++}__`;
                masks.push({ token, original: match });
                return token;
            });

            // 遮蓋行內代碼 (`code`)
            newLine = newLine.replace(/`[^`]+`/g, (match) => {
                const token = `__NS_MASK_${maskCounter++}__`;
                masks.push({ token, original: match });
                return token;
            });

            // ==========================================
            // ✍️ 執行正字替換
            // ==========================================
            compiledReplacements.forEach(item => {
                if (item.regex) {
                    item.regex.lastIndex = 0; // 保險起見重置指標
                    newLine = newLine.replace(item.regex, () => {
                        totalCount++; // 順便計數
                        if (!changesLog.some(log => log.includes(`"${item.wrong}" -> "${item.correct}"`))) {
                            changesLog.push(`"${item.wrong}" -> "${item.correct}"`); // 順便寫 Log
                        }
                        return item.correct; // 返回正確字眼進行替換
                    });
                }
            });

            // ==========================================
            // 🪄 解除遮罩：將網址同行內代碼還原！
            // ==========================================
            masks.forEach(mask => {
                newLine = newLine.replace(mask.token, mask.original);
            });

            return newLine;
        });

        if (totalCount > 0) {
            const finalContent = processedLines.join("\n");
            if (finalContent !== content) {
                // 🔥 P2 優化：呼叫全域無痕替換
                replaceEntireDocument(view.editor, finalContent);

                new Notice(`✅ 修正了 ${totalCount} 個錯處。\n` + changesLog.slice(0, 3).join("\n") + (changesLog.length > 3 ? "\n..." : ""), 5000);
            }
        } else {
            new Notice("🎉 完美！沒有發現錯別字。");
        }
    }

    // =================================================================
    // 🧹 一鍵定稿 (升級版：支援選項與內部連結)
    // =================================================================
    async cleanDraft(view: MarkdownView) {
        new CleanDraftModal(this.app, (options) => {
            let content = view.editor.getValue();
            const originalContent = content;

            // 根據用家的選擇執行清除
            if (options.removeComments) content = content.replace(/%%[\s\S]*?%%/g, "");
            if (options.removeStrikethrough) content = content.replace(/~~[\s\S]*?~~/g, "");
            if (options.removeHighlights) content = content.replace(/==/g, "");

            // 🔥 新增：移除內部連結 (保留顯示文字，例如 [[Alias|Display]] 變成 Display)
            if (options.removeInternalLinks) content = content.replace(/\[\[(?:[^\]]*\|)?([^\]]+)\]\]/g, "$1");

            if (content !== originalContent) {
                // 🔥 P2 優化：呼叫全域無痕替換
                replaceEntireDocument(view.editor, content);

                new Notice("🧹 一鍵定稿完成！選定的標記已清除。");
            } else {
                new Notice("👌 沒有發現需要清除的標記。");
            }
        }).open();
    }
}

