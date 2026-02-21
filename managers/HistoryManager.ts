import { App, Notice, TFile, MarkdownView, moment } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { InputModal, GenericSuggester } from '../modals';
// 引入我們定義好的 Regex，用來精準捉拿 ID
import { RE_SCENE_ID } from '../utils';

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

    // =================================================================
    // 🕵️‍♀️ 輔助：尋找游標所在的情節 (ID 版)
    // =================================================================
    private getSceneInfoAtCursor(editor: CodeMirror.Editor | any) {
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        let headerLineIndex = -1;
        let headerContent = "";
        let sceneId = null;
        let sceneTitle = "";

        // 1. 向上搜尋最近的 ###### 標題
        for (let i = cursor.line; i >= 0; i--) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######")) {
                headerLineIndex = i;
                headerContent = line;
                break;
            }
        }

        if (headerLineIndex === -1) return null;

        // 2. 提取 ID
        const idMatch = headerContent.match(RE_SCENE_ID);
        if (idMatch) {
            sceneId = idMatch[1].trim();
        }

        // 3. 提取標題 (移除 ###### 和 ID tag)
        // 格式： ###### 標題 
        sceneTitle = headerContent
            .replace(/^######\s*/, "")        // 移除 ######
            .replace(RE_SCENE_ID, "")         // 移除 ID 標籤
            .trim();

        // 4. 尋找結束行 (下一個 ###### 或 檔案結尾)
        let endLineIndex = lineCount;
        for (let i = headerLineIndex + 1; i < lineCount; i++) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######") || line.includes("<small>++ FILE_ID")) {
                endLineIndex = i;
                break;
            }
        }

        return {
            id: sceneId,
            title: sceneTitle,
            startLine: headerLineIndex,
            endLine: endLineIndex,
            headerRaw: headerContent
        };
    }

    // =================================================================
    // 💾 原子存檔 (Save)
    // =================================================================
    async saveVersion(view: MarkdownView) {
        const editor = view.editor;

        // 1. 獲取情節資訊
        const scene = this.getSceneInfoAtCursor(editor);

        if (!scene) {
            new Notice("⚠️ 請將游標放在 ###### 情節範圍內");
            return;
        }

        if (!scene.id) {
            new Notice("🚫 此情節尚未有 ID！請先執行『分配身份證』指令。");
            return; // 強制要求有 ID 才能存檔，保證安全
        }

        // 2. 提取內文 (排除 Metadata)
        const rawRange = editor.getRange(
            { line: scene.startLine + 1, ch: 0 },
            { line: scene.endLine, ch: 0 }
        );

        const lines = rawRange.split("\n");
        let bodyLines = [];
        let isMeta = true;

        for (const line of lines) {
            // 跳過開頭的 Metadata 區塊
            if (isMeta && (line.trim().startsWith(">") || line.trim() === "")) {
                continue;
            }
            isMeta = false;
            bodyLines.push(line);
        }

        const cleanContent = bodyLines.join("\n").trim();

        if (!cleanContent) {
            new Notice("⚠️ 情節內文是空的，無法存檔。");
            return;
        }

        // 3. 彈出視窗命名
        new InputModal(this.app, `備份：${scene.title}`, async (verName) => {
            if (!verName) return;
            await this.executeSave(scene.id!, scene.title, cleanContent, verName);
        }).open();
    }

    async executeSave(id: string, title: string, content: string, verName: string) {
        const historyBasePath = this.settings.historyBasePath;
        const scenesSubfolder = this.settings.scenesSubfolder;
        const historyFolder = `${historyBasePath}/${scenesSubfolder}`;

        // 🔥 檔案名稱改用 ID 命名，確保改名唔會斷 Link
        // 例如： _History/Scenes/a1b2c3d4.md
        const targetFilePath = `${historyFolder}/${id}.md`;

        await this.ensureFolderExists(historyFolder);

        let historyFile = this.app.vault.getAbstractFileByPath(targetFilePath);

        // 建構存檔內容
        // 我們會在檔案開頭加 YAML Alias，這樣你用搜尋 (Ctrl+O) 依然可以搜到「標題名」
        const timestamp = moment().format("YYYY-MM-DD HH:mm");

        if (!(historyFile instanceof TFile)) {
            // 新開檔案
            const fileHeader = `---
aliases: [${title}]
created: ${timestamp}
scene_id: ${id}
---
# 📜 歷史紀錄：${title}
> [!info] 系統提示
> 此檔案以 ID 命名，即使原稿改名，紀錄依然存在。

`;
            historyFile = await this.app.vault.create(targetFilePath, fileHeader);
        } else {
            // 如果檔案已存在，順便更新一下 title (以防你剛剛改了名)
            // 這裡不做複雜的 Frontmatter 更新，只追加紀錄
        }

        // 格式化內容 (Callout)
        const calloutBody = content.split("\n").map(l => "> " + l).join("\n");
        const versionBlock = `\n> [!save]- 💾 Ver: ${timestamp} - ${verName}\n${calloutBody}\n`;

        if (historyFile instanceof TFile) {
            await this.app.vault.append(historyFile, versionBlock);
            new Notice(`✅ 原子備份成功！\n(ID: ${id})`);
        }
    }

    // =================================================================
    // ⏪ 原子還原 (Restore)
    // =================================================================
    async restoreVersion(view: MarkdownView) {
        const editor = view.editor;
        const scene = this.getSceneInfoAtCursor(editor);

        if (!scene) { new Notice("⚠️ 請將游標放在情節範圍內"); return; }
        if (!scene.id) { new Notice("🚫 無法還原：此情節沒有 ID。"); return; }

        // 1. 尋找對應的歷史檔案 (By ID)
        const historyPath = `${this.settings.historyBasePath}/${this.settings.scenesSubfolder}/${scene.id}.md`;
        const historyFile = this.app.vault.getAbstractFileByPath(historyPath);

        if (!(historyFile instanceof TFile)) {
            new Notice(`❌ 找不到此 ID (${scene.id}) 的歷史紀錄。`);
            return;
        }

        // 2. 讀取並解析
        const hContent = await this.app.vault.read(historyFile);
        // Regex: 抓取 > [!save]- ... 裡面的內容
        const verRegex = /> \[!save\]- 💾 Ver: (.*?)\n((?:> .*\n?)*)/g;

        let verMatches;
        const versions = [];

        while ((verMatches = verRegex.exec(hContent)) !== null) {
            versions.push({
                label: verMatches[1], // 時間 + 名稱
                content: verMatches[2] // 內文
            });
        }

        if (versions.length === 0) { new Notice("⚠️ 歷史檔案存在，但找不到任何版本紀錄。"); return; }

        // 倒序排列 (最新的在最頂)
        versions.reverse();

        // 3. 選擇版本
        new GenericSuggester(
            this.app,
            versions,
            (item) => item.label,
            (selectedVersion) => {
                // 4. 選擇動作 (預覽 vs 還原)
                const actions = [
                    { label: "👀 預覽內容 (Preview)", id: "preview" },
                    { label: "⏪ 確認還原 (Restore)", id: "restore" }
                ];

                new GenericSuggester(
                    this.app,
                    actions,
                    (action) => action.label,
                    async (selectedAction) => {
                        // 清理 Callout 符號 (> )
                        let cleanBody = selectedVersion.content
                            .split("\n")
                            .map(l => l.replace(/^> ?/, "")) // 移除 >
                            .join("\n")
                            .trim();

                        if (selectedAction.id === "preview") {
                            // 預覽模式
                            this.showPreview(scene.title, selectedVersion.label, cleanBody);
                        } else {
                            // 還原模式
                            this.performRestore(editor, scene, cleanBody);
                        }
                    }
                ).open();
            }
        ).open();
    }

    // 執行還原動作 (替換編輯器文字)
    private performRestore(editor: CodeMirror.Editor | any, scene: any, newContent: string) {
        // 我們只替換「內文」，保留 Metadata
        // 所以要先讀取目前的 Metadata
        const currentRangeText = editor.getRange(
            { line: scene.startLine + 1, ch: 0 },
            { line: scene.endLine, ch: 0 }
        );

        const currentLines = currentRangeText.split("\n");
        let metaBuffer = [];

        for (const line of currentLines) {
            if (line.trim().startsWith(">") || (line.trim() === "" && metaBuffer.length > 0)) {
                metaBuffer.push(line);
            } else {
                break; // 遇到正文就停
            }
        }

        const finalBlock = metaBuffer.join("\n").trim() + "\n\n" + newContent + "\n";

        editor.replaceRange(
            finalBlock,
            { line: scene.startLine + 1, ch: 0 },
            { line: scene.endLine, ch: 0 }
        );

        new Notice("✅ 版本已還原！");
    }

    // 顯示預覽視窗
    private async showPreview(title: string, verLabel: string, content: string) {
        const previewPath = `${this.settings.historyBasePath}/版本預覽_Temp.md`;
        let previewFile = this.app.vault.getAbstractFileByPath(previewPath);

        const previewText = `# 👀 預覽：${title}\n> 📅 版本：${verLabel}\n\n---\n\n${content}`;

        if (!(previewFile instanceof TFile)) {
            previewFile = await this.app.vault.create(previewPath, previewText);
        } else {
            await this.app.vault.modify(previewFile, previewText);
        }

        // 打開預覽 (在右側)
        let leaf = this.app.workspace.getLeavesOfType("markdown").find(l => l.view.file && l.view.file.path === previewPath);
        if (!leaf) {
            leaf = this.app.workspace.getLeaf('split', 'vertical');
        }
        if (previewFile instanceof TFile) await leaf.openFile(previewFile);
        new Notice("👀 預覽已開啟 (右側)");
    }

    private async ensureFolderExists(path: string) {
        const folders = path.split("/");
        let currentPath = "";
        for (let i = 0; i < folders.length; i++) {
            currentPath += (i === 0 ? "" : "/") + folders[i];
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            if (!folder) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }
}