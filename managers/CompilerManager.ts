import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { CompileModal, CompileOptions, ChapterSelectionModal } from '../modals';
import { ensureFolderExists, DRAFT_FILENAME, RE_FILE_ID_HEADING, RE_FOLDER_HEADING, RE_SCENE_INFO } from '../utils';

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


            new CompileModal(this.app, (options) => {


                this.executeCompile(view, selectedFiles, options);

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


    async executeCompile(view: MarkdownView, files: TFile[], options: CompileOptions) {
        const activeFile = view.file;
        if (!activeFile) return;
        const parentFolder = activeFile.parent;
        if (!parentFolder) return;

        new Notice(`⚡️ Compile ${files.length} chapters...`);

        let finalContent = "";

        for (const file of files) {
            let content = await this.app.vault.read(file);

            // ============================================================
            // 🧹 Clen Process
            // ============================================================

            // A. Remove YAML
            if (options.removeYaml) {
                content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
            }

            // B. Remove Scene card
            if (options.removeSceneInfo) {
                const regexSceneInfo = RE_SCENE_INFO;
                content = content.replace(regexSceneInfo, "");

            }

            // C. Remove comment
            if (options.removeComments) {
                content = content.replace(/%%[\s\S]*?%%/g, "");
            }

            // D. Remove delete line
            if (options.removeStrikethrough) {
                content = content.replace(/~~[\s\S]*?~~/g, "");
            }

            // E. combine bold 
            if (options.mergeBold) {
                content = content.replace(/\*\*(.*?)\*\*/g, "$1");
            }

            // F. remove highlight
            if (options.removeHighlights) {
                content = content.replace(/==/g, "");
            }


            // remove internal link
            if (options.removeInternalLinks) {
                content = content.replace(/(?<!\!)\[\[(?:[^\]]*\|)?([^\]]+)\]\]/g, "$1");
            }



            if (options.hashtagAction === 'remove-all') {

                content = content.replace(/(^|\s)#[a-zA-Z0-9_\-\u4e00-\u9fa5]+/g, "$1");
            } else if (options.hashtagAction === 'remove-hash') {

                content = content.replace(/(^|\s)#([a-zA-Z0-9_\-\u4e00-\u9fa5]+)/g, "$1$2");
            }





            content = content.replace(RE_FILE_ID_HEADING, "");
            content = content.replace(RE_FOLDER_HEADING, "");


            content = content.replace(/<span class="ns-id"[^>]*><\/span>/g, "");


            content = content.replace(/\n{3,}/g, "\n\n");


            if (options.insertFileNameAsHeading && options.insertFileNameAsHeading !== 'none') {

                const level = parseInt(options.insertFileNameAsHeading, 10);

                const hashes = '#'.repeat(level);

                finalContent += `${hashes} ${file.basename}\n\n`;
            }

            finalContent += content.trim() + "\n\n";
        }


        const exportFolder = this.settings.exportFolderPath || "Output";

        await ensureFolderExists(this.app, exportFolder);


        const timestamp = window.moment().format("YYYYMMDD_HHmmss");
        const outputFileName = `${parentFolder.name}_Export_${timestamp}.md`;
        const outputPath = `${exportFolder}/${outputFileName}`;

        await this.app.vault.create(outputPath, finalContent.trim());

        new Notice(`✅ Complete！\n📂 ${outputPath}`);
        await this.app.workspace.openLinkText(outputPath, "", true);
    }
}