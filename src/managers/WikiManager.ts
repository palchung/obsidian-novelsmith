import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { ensureFolderExists, TEMPLATES_DIR } from '../utils';

export class WikiManager {
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
    // 🧠 AutoWiki 
    // =================================================================
    async scanAndCreateWiki(view: MarkdownView) {
        const activeFile = view.file;
        if (!activeFile) return;

        const categories = this.settings.wikiCategories;
        if (!categories || categories.length === 0) {
            new Notice("Please add at least one wiki category in the settings first!");
            return;
        }

        const editor = view.editor;
        const lineCount = editor.lineCount();
        let createdCount = 0;
        let updatedLinesCount = 0;

        new Notice("Scanning scene attributes...");


        // 🌟 加入 (?=#) 邏輯，遇到 Hashtag 識得自動切開，同雷達系統睇齊！
        const separatorRegex = /(?=#)|[,，、/|\\;；]+/;

        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i);


            if (line.trim().startsWith("> - ") && line.includes("::")) {


                const match = line.match(/^(>\s*-\s*)(.*?)::(.*)$/);
                if (!match) continue;

                const prefix = match[1];
                const key = match[2].trim();
                const rawValue = match[3];

                if (!rawValue.trim()) continue;


                const category = categories.find(c => c.name.split(/[,，、]/).map(s => s.trim()).includes(key));
                if (!category) continue;


                const items = rawValue.split(separatorRegex);
                const processedItems: string[] = [];
                let lineChanged = false;

                for (let item of items) {
                    let cleanItem = item.trim();
                    if (!cleanItem) continue;

                    // 🌟 終極過濾：清走括號、#號，以及所有 Windows/Mac 嚴禁做檔名嘅非法字元！
                    cleanItem = cleanItem.replace(/[\[\]#<>:"|?*]/g, '').trim();

                    // 確保清完之後唔係空字串，先至繼續處理
                    if (!cleanItem) continue;


                    const wikiLink = `[[${cleanItem}]]`;
                    processedItems.push(wikiLink);


                    if (!rawValue.includes(wikiLink)) {
                        lineChanged = true;
                    }

                    // ==========================================
                    // 📂 create md file
                    // ==========================================
                    const existingFile = this.app.metadataCache.getFirstLinkpathDest(cleanItem, "");

                    if (!existingFile) {

                        const folderPath = category.folderPath.trim();
                        if (!folderPath) {
                            new Notice(`Category [${key}] has no storage path. Skipped creating ${cleanItem}.`);
                            continue;
                        }


                        await ensureFolderExists(this.app, folderPath);
                        const newFilePath = `${folderPath}/${cleanItem}.md`;


                        const primaryName = category.name.split(/[,，、]/)[0].trim();
                        const tplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/${primaryName}.md`;
                        const tplFile = this.app.vault.getAbstractFileByPath(tplPath);


                        let fileContent = `# ${cleanItem}\n\n> [!info] ${key} Info\n> - Tags:: #${key}\n> - Note:: \n\n`;


                        if (tplFile instanceof TFile) {
                            fileContent = await this.app.vault.read(tplFile);

                            fileContent = fileContent.replace(/\{\{WikiName\}\}/g, cleanItem);
                        }


                        try {
                            await this.app.vault.create(newFilePath, fileContent);
                            createdCount++;
                        } catch (e) {
                            console.error(`Failed to create ${cleanItem}:`, e);
                        }
                    }
                }


                if (lineChanged && processedItems.length > 0) {


                    const newLine = `${prefix}${key}:: ${processedItems.join(", ")}`;
                    editor.setLine(i, newLine);
                    updatedLinesCount++;
                }
            }
        }

        if (createdCount > 0 || updatedLinesCount > 0) {
            new Notice(`Autowiki complete!\nFormatted ${updatedLinesCount} lines.\nCreated ${createdCount} new notes!`, 6000);
        } else {
            new Notice(`Autowiki scanned successfully, all wiki links are already up to date.`);
        }
    }
}