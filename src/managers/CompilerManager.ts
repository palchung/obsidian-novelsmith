import { App, Notice, MarkdownView, TFile, Component, MarkdownRenderer } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { CompileModal, CompileOptions, ChapterSelectionModal } from '../modals';
import { ensureFolderExists, DRAFT_FILENAME, RE_FILE_ID_HEADING, RE_FOLDER_HEADING } from '../utils';

export class CompilerManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }


    openCompileModal(view: MarkdownView) {

        const files = this.getCompileableFiles(view);

        if (files.length === 0) {
            new Notice("Folder is empty。");
            return;
        }


        new ChapterSelectionModal(this.app, files, (selectedFiles) => {
            new CompileModal(this.app, (options, format) => { // 🌟 加入 format
                void this.executeCompile(view, selectedFiles, options, format);
            }).open();
        }).open();
    }


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


    // 🌟 加入 format 參數，預設為 'md'
    async executeCompile(view: MarkdownView, files: TFile[], options: CompileOptions, format: 'md' | 'html' = 'md') {
        const activeFile = view.file;
        if (!activeFile) return;
        const parentFolder = activeFile.parent;
        if (!parentFolder) return;

        new Notice(`⚡️ Compiling ${files.length} chapters...`);

        let finalContent = "";

        for (const file of files) {
            let content = await this.app.vault.read(file);

            // ============================================================
            // 🧹 Clean Process
            // ============================================================
            if (options.removeYaml) content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
            if (options.removeSceneInfo) {
                content = content.replace(/^######\s+.*$/gm, "");
                content = content.replace(/^>\s*\[!NSmith.*?\].*(?:\n>\s*.*)*/gm, "");
            }
            if (options.removeComments) content = content.replace(/%%[\s\S]*?%%/g, "");
            if (options.removeStrikethrough) content = content.replace(/~~[\s\S]*?~~/g, "");
            if (options.mergeBold) content = content.replace(/\*\*(.*?)\*\*/g, "$1");
            if (options.removeHighlights) content = content.replace(/==/g, "");
            if (options.removeInternalLinks) content = content.replace(/(?<!!)\[\[(?:[^\]]*\|)?([^\]]+)\]\]/g, "$1");
            if (options.hashtagAction === 'remove-all') content = content.replace(/(^|\s)#[a-zA-Z0-9_\-\u4e00-\u9fa5]+/g, "$1");
            else if (options.hashtagAction === 'remove-hash') content = content.replace(/(^|\s)#([a-zA-Z0-9_\-\u4e00-\u9fa5]+)/g, "$1$2");

            content = content.replace(RE_FILE_ID_HEADING, "");
            content = content.replace(RE_FOLDER_HEADING, "");
            content = content.replace(/<span class="ns-id"[^>]*><\/span>/g, "");
            content = content.replace(/\n{3,}/g, "\n\n");

            if (options.insertFileNameAsHeading && options.insertFileNameAsHeading !== 'none') {
                const level = parseInt(options.insertFileNameAsHeading, 10);
                const hashes = '#'.repeat(level);
                const cleanChapterName = file.basename.replace(/^\d+[\s_-]+/, "");
                finalContent += `${hashes} ${cleanChapterName}\n\n`;
            }

            finalContent += content.trim() + "\n\n";
        }

        const exportFolder = this.settings.exportFolderPath || "Output";
        await ensureFolderExists(this.app, exportFolder);
        const timestamp = window.moment().format("YYYYMMDD_HHmmss");

        // ============================================================
        // 🚀 雙軌匯出引擎：HTML vs Markdown
        // ============================================================
        if (format === 'html') {
            const outputFileName = `${parentFolder.name}_BetaRead_${timestamp}.html`;
            const outputPath = `${exportFolder}/${outputFileName}`;

            // 1. 召喚 Obsidian 原生渲染器將 Markdown 轉成 HTML 標籤
            const tempDiv = document.createElement("div");
            const comp = new Component();
            comp.load();
            await MarkdownRenderer.render(this.app, finalContent.trim(), tempDiv, "", comp);
            const renderedHtml = tempDiv.innerHTML;
            comp.unload();

            // 2. 注入極致優雅嘅「書卷氣」CSS 排版！(自動支援黑夜/白天模式)
            const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${parentFolder.name} - Manuscript</title>
    <style>
        :root { --bg: #fdfcf8; --text: #222; --h: #111; }
        @media (prefers-color-scheme: dark) { :root { --bg: #1e1e1e; --text: #ddd; --h: #eee; } }
        body { 
            font-family: 'Georgia', 'Times New Roman', serif; 
            line-height: 1.8; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 40px 20px; 
            color: var(--text); 
            background: var(--bg); 
            font-size: 18px; 
        }
        h1, h2, h3, h4, h5 { color: var(--h); margin-top: 2em; margin-bottom: 1em; font-weight: normal; }
        h1 { font-size: 2.2em; text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 0.5em; margin-bottom: 2em;}
        p { 
            margin-bottom: 1em; 
            text-align: justify; 
            
        }
        /* 取消標題後的首段縮排 (英式排版標準) */
        h1 + p, h2 + p, h3 + p, h4 + p { text-indent: 0; }
        hr { border: 0; text-align: center; margin: 3em 0; }
        hr::before { content: '***'; font-size: 1.5em; letter-spacing: 0.5em; color: #888; }
    </style>
</head>
<body>
    <h1>${parentFolder.name}</h1>
    ${renderedHtml}
</body>
</html>`;

            await this.app.vault.create(outputPath, htmlTemplate);
            new Notice(`HTML Export Complete!\n${outputPath} (Ready for Beta Readers!)`);

        } else {
            // 原本嘅 Markdown 匯出
            const outputFileName = `${parentFolder.name}_Export_${timestamp}.md`;
            const outputPath = `${exportFolder}/${outputFileName}`;
            await this.app.vault.create(outputPath, finalContent.trim());
            new Notice(`MD Export Complete!\n${outputPath}`);
            await this.app.workspace.openLinkText(outputPath, "", true);
        }
    }
}