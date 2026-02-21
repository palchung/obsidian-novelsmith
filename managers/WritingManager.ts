import { App, Notice, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { NovelSmithSettings } from '../settings';
// 引入剛剛寫好的工具，用來更新贅字清單
import { updateRedundantPatterns } from '../decorators';

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

    // 輔助：強制刷新編輯器 (讓 Decorator 重新計算)
    private triggerEditorUpdate() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) {
                // 發送一個微小的假更新，強迫 CodeMirror 重繪
                // @ts-ignore
                const cm = leaf.view.editor.cm;
                if (cm) {
                    cm.dispatch({ effects: [] }); // 空的 dispatch 足以觸發 update
                }
            }
        });
    }

    private async ensureFolderExists(path: string) {
        const lastSlashIndex = path.lastIndexOf("/");
        if (lastSlashIndex === -1) return;
        const folderPath = path.substring(0, lastSlashIndex);
        const folders = folderPath.split("/");
        let currentPath = "";
        for (let i = 0; i < folders.length; i++) {
            currentPath += (i === 0 ? "" : "/") + folders[i];
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            if (!folder) await this.app.vault.createFolder(currentPath);
        }
    }



    // =================================================================
    // 🔍 贅字模式 (Update for Decorator Fix)
    // =================================================================
    async toggleRedundantMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-redundant');

        if (isModeOn) {
            // --- 關閉 ---
            document.body.classList.remove('mode-redundant');
            // 傳送 null，通知 Decorator 停止工作
            updateRedundantPatterns(null);
            this.triggerEditorUpdate();
            new Notice("⚪️ 已關閉：贅字模式");
        } else {
            // --- 開啟 ---
            document.body.classList.remove('mode-dialogue');

            const configPath = this.settings.redundantListPath;
            let configFile = this.app.vault.getAbstractFileByPath(configPath);

            if (!(configFile instanceof TFile)) {
                await this.ensureFolderExists(configPath);
                await this.app.vault.create(configPath, `// 預設贅字清單\n其實, 基本上, 彷彿`);
                configFile = this.app.vault.getAbstractFileByPath(configPath);
                new Notice(`🆕 已建立預設清單`);
            }

            if (configFile instanceof TFile) {
                const configContent = await this.app.vault.read(configFile);

                // 1. 提取所有贅字
                const badWords = configContent.split(/[,，、\n]+/)
                    .map(w => w.trim())
                    .filter(w => w.length > 0 && !w.startsWith("//"));

                if (badWords.length === 0) { new Notice("⚠️ 清單是空的"); return; }

                // 2. 🔥【關鍵改動】整合為單一 Regex
                const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                badWords.sort((a, b) => b.length - a.length);

                // 🛑 保險：如果 badWords 過濾後係空的，就 Return
                if (badWords.length === 0) {
                    new Notice("⚠️ 有效贅字清單為空");
                    return;
                }

                const patternString = `(${badWords.map(escapeRegExp).join("|")})`;
                const combinedRegex = new RegExp(patternString, 'g');

                // 3. 發送給 Decorator
                updateRedundantPatterns(combinedRegex);

                document.body.classList.add('mode-redundant');
                this.triggerEditorUpdate();
                new Notice(`🔍 贅字模式：監控中 (${badWords.length} 詞)`);
            }
        }
    }


    // =================================================================
    // 💬 對話模式 (非破壞性版)
    // =================================================================
    async toggleDialogueMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-dialogue');

        if (isModeOn) {
            document.body.classList.remove('mode-dialogue');
            this.triggerEditorUpdate();
            new Notice("⚪️ 已關閉：對話模式");
        } else {
            // 互斥：關閉贅字
            document.body.classList.remove('mode-redundant');

            document.body.classList.add('mode-dialogue');
            this.triggerEditorUpdate();
            new Notice("💬 對話模式：聚焦中");
        }
    }

    // =================================================================
    // ✍️ 正字刑警 (這個必須是物理修改，因為係要改錯字)
    // =================================================================
    async correctNames(view: MarkdownView) {
        // (保持原有的 correctNames 代碼不變，因為這功能本身就是要改檔)
        // ... 請保留之前的代碼 ...
        const dataFileName = this.settings.fixListPath;
        let fileObj = this.app.vault.getAbstractFileByPath(dataFileName);

        if (!fileObj) {
            await this.ensureFolderExists(dataFileName);
            const defaultContent = `// 正字名單\n主角名 | 錯字1`;
            fileObj = await this.app.vault.create(dataFileName, defaultContent);
            new Notice(`🆕 已建立預設名單`);
        }

        if (!(fileObj instanceof TFile)) return;
        const rawList = await this.app.vault.read(fileObj);

        // ... (以下邏輯不變，請保留上次的 correctNames 內容) ...
        // 為節省篇幅，這部分不重複貼上，請確保沒有刪除它
        // 如果需要我完整貼出，請告知。
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
        let allReplacements: { wrong: string, correct: string }[] = [];
        for (const [correctName, wrongNames] of Object.entries(fixList)) {
            wrongNames.forEach(wrong => {
                if (wrong !== correctName) {
                    allReplacements.push({ wrong: wrong, correct: correctName });
                }
            });
        }
        allReplacements.sort((a, b) => b.wrong.length - a.wrong.length);
        let content = view.editor.getValue();
        let totalCount = 0;
        let changesLog: string[] = [];
        const lines = content.split("\n");
        const processedLines = lines.map(line => {
            if (line.includes("<small>++ FILE_ID")) return line;
            if (line.trim().startsWith(">") && line.includes("::")) return line;
            let newLine = line;
            allReplacements.forEach(item => {
                const escapedWrong = item.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                let pattern = escapedWrong;
                if (item.correct.startsWith(item.wrong)) {
                    const suffix = item.correct.slice(item.wrong.length);
                    if (suffix) {
                        const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        pattern += `(?!${escapedSuffix})`;
                    }
                }
                const regex = new RegExp(pattern, 'g');
                if (regex.test(newLine)) {
                    const matches = newLine.match(regex);
                    if (matches) totalCount += matches.length;
                    if (!changesLog.some(log => log.includes(`"${item.wrong}" -> "${item.correct}"`))) {
                        changesLog.push(`"${item.wrong}" -> "${item.correct}"`);
                    }
                    newLine = newLine.replace(regex, item.correct);
                }
            });
            return newLine;
        });
        if (totalCount > 0) {
            const finalContent = processedLines.join("\n");
            if (finalContent !== content) {
                view.editor.setValue(finalContent);
                new Notice(`✅ 修正了 ${totalCount} 個錯處。\n` + changesLog.slice(0, 3).join("\n") + (changesLog.length > 3 ? "\n..." : ""), 5000);
            }
        } else {
            new Notice("🎉 完美！沒有發現錯別字。");
        }
    }

    // =================================================================
    // 🧹 一鍵定稿 (Clean Draft) - 物理移除註釋
    // =================================================================
    async cleanDraft(view: MarkdownView) {
        let content = view.editor.getValue();
        content = content.replace(/%%[\s\S]*?%%/g, "");
        content = content.replace(/~~[\s\S]*?~~/g, "");
        content = content.replace(/\*\*(.*?)\*\*/g, "$1");
        view.editor.setValue(content);
        new Notice("🧹 稿件已清理");
    }
}