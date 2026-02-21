import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
// 🔥 引入新視窗
import { CompileModal, CompileOptions, ChapterSelectionModal } from '../modals';

export class CompilerManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    // 入口函數：啟動匯出流程
    openCompileModal(view: MarkdownView) {
        // 1. 先抓取所有可用的檔案
        const files = this.getCompileableFiles(view);

        if (files.length === 0) {
            new Notice("⚠️ 資料夾內沒有可編譯的章節。");
            return;
        }

        // 2. 開啟 Step 1: 選擇章節
        new ChapterSelectionModal(this.app, files, (selectedFiles) => {

            // 3. 當 Step 1 完成後，開啟 Step 2: 清理設定
            new CompileModal(this.app, (options) => {

                // 4. 最後執行編譯 (傳入「選擇的檔案」和「選項」)
                this.executeCompile(view, selectedFiles, options);

            }).open();

        }).open();
    }

    // 輔助：獲取資料夾內所有候選檔案
    getCompileableFiles(view: MarkdownView): TFile[] {
        const activeFile = view.file;
        if (!activeFile) return [];
        const parentFolder = activeFile.parent;
        if (!parentFolder) return [];

        return parentFolder.children
            .filter(f => f instanceof TFile && f.extension === "md")
            .filter(f => f.name !== this.settings.draftFilename)
            .filter(f => !f.name.includes("_Scene_Database") && !f.name.includes("_History") && !f.name.startsWith("Script_"))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) as TFile[];
    }

    // 執行核心編譯邏輯
    async executeCompile(view: MarkdownView, files: TFile[], options: CompileOptions) {
        const activeFile = view.file;
        if (!activeFile) return;
        const parentFolder = activeFile.parent;
        if (!parentFolder) return;

        new Notice(`⚡️ 正在編譯 ${files.length} 個章節...`);

        let finalContent = "";

        for (const file of files) {
            let content = await this.app.vault.read(file);

            // ============================================================
            // 🧹 根據選項執行清理
            // ============================================================

            // A. 移除 YAML
            if (options.removeYaml) {
                content = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
            }

            // B. 移除情節卡片
            if (options.removeSceneInfo) {
                const regexSceneInfo = /^###### 🎬 .*[\r\n]+(> .*[\r\n]*)*/gm;
                content = content.replace(regexSceneInfo, "");
                content = content.replace(/^###### 草稿[\s\S]*?(?=^###### 初稿)/gm, "");
                content = content.replace(/^###### 初稿\s*$/gm, "");
            }

            // C. 移除註釋
            if (options.removeComments) {
                content = content.replace(/%%[\s\S]*?%%/g, "");
            }

            // D. 移除刪除線
            if (options.removeStrikethrough) {
                content = content.replace(/~~[\s\S]*?~~/g, "");
            }

            // E. 合併粗體
            if (options.mergeBold) {
                content = content.replace(/\*\*(.*?)\*\*/g, "$1");
            }

            // F. 移除高亮
            if (options.removeHighlights) {
                content = content.replace(/==/g, "");
            }

            // G. 移除 ID 標記 (強制執行，防止洩漏)
            content = content.replace(/<small>\+\+ FILE_ID: .*? \+\+<\/small>/g, "");
            content = content.replace(/^# 📄 .*$/gm, "");

            // H. 壓縮空行
            content = content.replace(/\n{3,}/g, "\n\n");

            finalContent += content.trim() + "\n\n"; // 章節間加空行
        }

        // 2. 寫入目標位置
        const exportFolder = this.settings.exportFolderPath || "Output";
        if (!this.app.vault.getAbstractFileByPath(exportFolder)) {
            await this.app.vault.createFolder(exportFolder);
        }

        const timestamp = window.moment().format("YYYYMMDD_HHmm");
        const outputFileName = `${parentFolder.name}_Export_${timestamp}.md`;
        const outputPath = `${exportFolder}/${outputFileName}`;

        await this.app.vault.create(outputPath, finalContent.trim());

        new Notice(`✅ 編譯完成！\n📂 ${outputPath}`);
        await this.app.workspace.openLinkText(outputPath, "", true);
    }
}