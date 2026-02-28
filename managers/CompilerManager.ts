import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
// 🔥 引入新視窗
import { CompileModal, CompileOptions, ChapterSelectionModal } from '../modals';
import { ensureFolderExists, DRAFT_FILENAME, RE_FILE_ID_HEADING, RE_FOLDER_HEADING, RE_SCENE_INFO } from '../utils';

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
            .filter(f => f.name !== DRAFT_FILENAME)
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
                const regexSceneInfo = RE_SCENE_INFO;
                content = content.replace(regexSceneInfo, "");
                //content = content.replace(/^###### 草稿[\s\S]*?(?=^###### 初稿)/gm, "");
                //content = content.replace(/^###### 初稿\s*$/gm, "");
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


            // 🔥 新增：移除內部連結 (保留顯示文字)
            if (options.removeInternalLinks) {
                content = content.replace(/\[\[(?:[^\]]*\|)?([^\]]+)\]\]/g, "$1");
            }


            // ==========================================
            // 🔥 新增：智能 Hashtag 處理邏輯
            // 該正則確保只會匹配標籤 (例如 #Draft)，絕對不會匹配標題 (例如 # 標題)
            // ==========================================
            if (options.hashtagAction === 'remove-all') {
                // 完全刪除 (替換為原本前面的空格)
                content = content.replace(/(^|\s)#[a-zA-Z0-9_\-\u4e00-\u9fa5]+/g, "$1");
            } else if (options.hashtagAction === 'remove-hash') {
                // 僅刪除 # 符號，保留後面的文字 ($1 是前面的空格，$2 是標籤文字)
                content = content.replace(/(^|\s)#([a-zA-Z0-9_\-\u4e00-\u9fa5]+)/g, "$1$2");
            }




            // G. 移除 ID 標記 (強制執行，防止洩漏)
            content = content.replace(RE_FILE_ID_HEADING, "");
            content = content.replace(RE_FOLDER_HEADING, "");

            // 🔥 升級版：無論裡面加咗 data-color 定其他屬性，一律通殺！
            content = content.replace(/<span class="ns-id"[^>]*><\/span>/g, "");

            // H. 壓縮空行
            content = content.replace(/\n{3,}/g, "\n\n");

            // 🔥 新增：如果用家揀咗，就喺內容最頂加上檔案名稱作為 H2 標題！
            if (options.insertFileNameAsHeading) {
                // file.basename 會自動甩走 .md 副檔名，非常乾淨
                finalContent += `## ${file.basename}\n\n`;
            }

            finalContent += content.trim() + "\n\n"; // 章節間加空行
        }

        // 2. 寫入目標位置
        const exportFolder = this.settings.exportFolderPath || "Output";
        // 🔥 升級版：支援無限多層資料夾自動建立
        await ensureFolderExists(this.app, exportFolder);

        // 🔥 防撞名升級：時間戳記加入秒數 (HHmmss)
        const timestamp = window.moment().format("YYYYMMDD_HHmmss");
        const outputFileName = `${parentFolder.name}_Export_${timestamp}.md`;
        const outputPath = `${exportFolder}/${outputFileName}`;

        await this.app.vault.create(outputPath, finalContent.trim());

        new Notice(`✅ 編譯完成！\n📂 ${outputPath}`);
        await this.app.workspace.openLinkText(outputPath, "", true);
    }
}