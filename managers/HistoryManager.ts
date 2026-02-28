import { App, Notice, TFile, MarkdownView, moment } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { InputModal, GenericSuggester } from '../modals';
import { parseUniversalScenes, HISTORY_DIR, ensureFolderExists, extractSceneId, cleanSceneTitle } from '../utils';

export class HistoryManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(newSettings: NovelSmithSettings) {
        this.settings = newSettings;
    }

    public getSceneInfoAtCursor(editor: CodeMirror.Editor | any) {
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        // 🔥 P2 架構重構：全域雷達一秒搞定基礎資料
        const parsedScenes = parseUniversalScenes(editor.getValue());
        const currentScene = [...parsedScenes].reverse().find(s => s.lineIndex <= cursor.line);

        if (!currentScene) return null;

        // 依然需要向下尋找此情節的結尾位置 (遇到下個標記或檔案結尾)
        let endLineIndex = lineCount;
        for (let i = currentScene.lineIndex + 1; i < lineCount; i++) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######") || line.includes("++ FILE_ID")) {
                endLineIndex = i;
                break;
            }
        }

        return {
            id: currentScene.id,
            title: currentScene.title,
            startLine: currentScene.lineIndex,
            endLine: endLineIndex,
            headerRaw: currentScene.rawHeader
        };
    }

    async saveVersion(view: MarkdownView, onComplete?: () => void) {
        const editor = view.editor;
        const scene = this.getSceneInfoAtCursor(editor);

        if (!scene) { new Notice("⚠️ 請將游標放在 ###### 情節範圍內"); return; }
        if (!scene.id) { new Notice("🚫 此情節尚未有 ID！請先執行智能儲存。"); return; }

        const rawRange = editor.getRange({ line: scene.startLine + 1, ch: 0 }, { line: scene.endLine, ch: 0 });
        const lines = rawRange.split("\n");
        let bodyLines = [];
        let isMeta = true;

        // 🔥 終極修復：精準識別 Callout，保護正文的 Blockquote！
        for (const line of lines) {
            if (isMeta) {
                const trimLine = line.trim();
                if (trimLine.startsWith("> [!NSmith") || trimLine.startsWith("> [!info") || trimLine.startsWith("> -") || trimLine === ">") continue;
                if (trimLine === "") continue;
                isMeta = false;
            }
            bodyLines.push(line);
        }

        const cleanContent = bodyLines.join("\n").trim();
        if (!cleanContent) { new Notice("⚠️ 情節內文是空的，無法存檔。"); return; }

        new InputModal(this.app, `備份：${scene.title}`, async (verName) => {
            if (!verName) return;


            // 🔥 升級 4：消毒處理！強制將所有換行符號 (Enter) 轉換為空格，防止破壞 Markdown 格式
            const sanitizedVerName = verName.replace(/[\r\n]+/g, " ").trim();
            const finalVerName = sanitizedVerName === "" ? "自動備份" : sanitizedVerName;


            await this.executeSave(scene.id!, scene.title, cleanContent, finalVerName);
            if (onComplete) onComplete();
        }).open();
    }

    async executeSave(id: string, title: string, content: string, verName: string) {
        // 🔥 修改：直接使用合併後的路徑
        const historyFolder = `${this.settings.bookFolderPath}/${HISTORY_DIR}`;
        const targetFilePath = `${historyFolder}/${id}.md`;

        await ensureFolderExists(this.app, historyFolder);

        let historyFile = this.app.vault.getAbstractFileByPath(targetFilePath);
        const timestamp = moment().format("YYYY-MM-DD HH:mm");

        if (!(historyFile instanceof TFile)) {
            // 🔥 YAML 炸彈拆除：安全處理標題中的雙引號，並改用更標準的列表格式
            const safeTitle = title.replace(/"/g, '\\"');

            const fileHeader = `---\naliases:\n  - "${safeTitle}"\ncreated: ${timestamp}\nscene_id: ${id}\n---\n# 📜 歷史紀錄：${title}\n> [!info] 系統提示\n> 此檔案以 ID 命名，即使原稿改名，紀錄依然存在。\n\n`;

            historyFile = await this.app.vault.create(targetFilePath, fileHeader);
        }

        const calloutBody = content.split("\n").map(l => "> " + l).join("\n");
        const versionBlock = `\n> [!save]- 💾 Ver: ${timestamp} - ${verName}\n${calloutBody}\n`;

        if (historyFile instanceof TFile) {
            await this.app.vault.append(historyFile, versionBlock);
            new Notice(`✅ 原子備份成功！\n(ID: ${id})`);
        }
    }

    public async getSceneVersions(sceneId: string) {
        // 🔥 修改：直接使用合併後的路徑
        const historyPath = `${this.settings.bookFolderPath}/${HISTORY_DIR}/${sceneId}.md`;
        const historyFile = this.app.vault.getAbstractFileByPath(historyPath);

        if (!(historyFile instanceof TFile)) return [];

        const hContent = await this.app.vault.read(historyFile);
        const verRegex = /> \[!save\]- 💾 Ver: (.*?)\n((?:> .*\n?)*)/g;
        let verMatches;
        const versions = [];

        while ((verMatches = verRegex.exec(hContent)) !== null) {
            let cleanBody = verMatches[2]
                .split("\n")
                .map(l => l.replace(/^> ?/, ""))
                .join("\n")
                .trim();
            versions.push({ label: verMatches[1], content: cleanBody });
        }
        return versions.reverse();
    }

    public performRestore(editor: CodeMirror.Editor | any, scene: any, newContent: string) {
        const currentRangeText = editor.getRange({ line: scene.startLine + 1, ch: 0 }, { line: scene.endLine, ch: 0 });
        const currentLines = currentRangeText.split("\n");
        let metaBuffer = [];

        // 🔥 終極修復：還原時同樣精準識別，不破壞正文
        for (const line of currentLines) {
            const trimLine = line.trim();
            if (trimLine.startsWith("> [!NSmith") || trimLine.startsWith("> [!info") || trimLine.startsWith("> -") || trimLine === ">") {
                metaBuffer.push(line);
            } else if (trimLine === "" && metaBuffer.length > 0) {
                metaBuffer.push(line);
            } else break;
        }

        const finalBlock = metaBuffer.join("\n").trim() + "\n\n" + newContent + "\n";
        editor.replaceRange(finalBlock, { line: scene.startLine + 1, ch: 0 }, { line: scene.endLine, ch: 0 });
        new Notice("✅ 版本已還原！");
    }

    public async showPreview(title: string, verLabel: string, content: string) {
        // 🔥 修改：直接使用合併後的路徑
        const previewPath = `${this.settings.bookFolderPath}/${HISTORY_DIR}/preview_Temp.md`;
        let previewFile = this.app.vault.getAbstractFileByPath(previewPath);

        const previewText = `# 👀 預覽：${title}\n> 📅 版本：${verLabel}\n\n---\n\n${content}`;

        if (!(previewFile instanceof TFile)) {
            await this.app.vault.create(previewPath, previewText);
            previewFile = this.app.vault.getAbstractFileByPath(previewPath);
        } else {
            if (previewFile instanceof TFile) await this.app.vault.modify(previewFile, previewText);
        }

        let leaf = this.app.workspace.getLeavesOfType("markdown").find(l => l.view.file && l.view.file.path === previewPath);
        if (!leaf) leaf = this.app.workspace.getLeaf('split', 'vertical');
        if (previewFile instanceof TFile) await leaf.openFile(previewFile);
        new Notice("👀 預覽已開啟 (右側)");
    }

    async restoreVersion(view: MarkdownView) {
        const editor = view.editor;
        const scene = this.getSceneInfoAtCursor(editor);

        if (!scene || !scene.id) { new Notice("⚠️ 無法還原：請確保游標在有 ID 的情節內。"); return; }

        const versions = await this.getSceneVersions(scene.id);
        if (versions.length === 0) { new Notice("⚠️ 找不到任何版本紀錄。"); return; }

        new GenericSuggester(this.app, versions, (item) => item.label, (selectedVersion) => {
            const actions = [
                { label: "👀 預覽內容 (Preview)", id: "preview" },
                { label: "⏪ 確認還原 (Restore)", id: "restore" }
            ];
            new GenericSuggester(this.app, actions, (action) => action.label, async (selectedAction) => {
                if (selectedAction.id === "preview") {
                    this.showPreview(scene.title, selectedVersion.label, selectedVersion.content);
                } else {
                    this.performRestore(editor, scene, selectedVersion.content);
                }
            }).open();
        }).open();
    }


}