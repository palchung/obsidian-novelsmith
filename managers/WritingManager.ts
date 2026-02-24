import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
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

    private triggerEditorUpdate() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) {
                // @ts-ignore
                const cm = leaf.view.editor.cm;
                if (cm) cm.dispatch({ effects: [] });
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
    // 📄 智能生成器：贅字清單與正字名單
    // =================================================================
    public async ensureRedundantListExists(forceShowNotice: boolean = false) {
        const configPath = this.settings.redundantListPath;
        if (!configPath) { if (forceShowNotice) new Notice("❌ 請先設定贅字清單路徑！"); return; }

        let configFile = this.app.vault.getAbstractFileByPath(configPath);
        if (!configFile) {
            await this.ensureFolderExists(configPath);
            try {
                await this.app.vault.create(configPath, `// 預設贅字清單\n其實, 基本上, 彷彿`);
                if (forceShowNotice) new Notice(`✅ 成功生成贅字清單：${configPath}`);
            } catch (e) {
                if (forceShowNotice) new Notice(`❌ 建立失敗，請檢查路徑`);
            }
        } else {
            if (forceShowNotice) new Notice(`⚠️ 檔案已存在 (${configPath})，停止生成以免覆蓋設定。`);
        }
    }

    public async ensureFixListExists(forceShowNotice: boolean = false) {
        const configPath = this.settings.fixListPath;
        if (!configPath) { if (forceShowNotice) new Notice("❌ 請先設定正字名單路徑！"); return; }

        let configFile = this.app.vault.getAbstractFileByPath(configPath);
        if (!configFile) {
            await this.ensureFolderExists(configPath);
            try {
                await this.app.vault.create(configPath, `// 正字名單\n主角名 | 錯字1`);
                if (forceShowNotice) new Notice(`✅ 成功生成正字名單：${configPath}`);
            } catch (e) {
                if (forceShowNotice) new Notice(`❌ 建立失敗，請檢查路徑`);
            }
        } else {
            if (forceShowNotice) new Notice(`⚠️ 檔案已存在 (${configPath})，停止生成以免覆蓋設定。`);
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
            const configPath = this.settings.redundantListPath;
            let configFile = this.app.vault.getAbstractFileByPath(configPath);

            if (configFile instanceof TFile) {
                const configContent = await this.app.vault.read(configFile);
                const badWords = configContent.split(/[,，、\n]+/)
                    .map(w => w.trim())
                    .filter(w => w.length > 0 && !w.startsWith("//"));

                if (badWords.length === 0) { new Notice("⚠️ 有效贅字清單為空"); return; }

                const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                badWords.sort((a, b) => b.length - a.length);

                const patternString = `(${badWords.map(escapeRegExp).join("|")})`;
                const combinedRegex = new RegExp(patternString, 'g');

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
        const dataFileName = this.settings.fixListPath;
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

    async cleanDraft(view: MarkdownView) {
        let content = view.editor.getValue();
        content = content.replace(/%%[\s\S]*?%%/g, "");
        content = content.replace(/~~[\s\S]*?~~/g, "");
        content = content.replace(/==[\s\S]*?==/g, "");
        content = content.replace(/\*\*(.*?)\*\*/g, "$1");
        view.editor.setValue(content);
        new Notice("🧹 稿件已清理");
    }
}