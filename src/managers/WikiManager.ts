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
    // 🧠 AutoWiki (Upgraded: Smart Diff & Scroll Lock)
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

        // 🌟 1. 唔再逐行讀取 UI，而係一開始將全文抽入記憶體！
        const content = editor.getValue();
        const lines = content.split("\n");

        let createdCount = 0;
        let updatedLinesCount = 0;

        new Notice("Scanning scene attributes...");

        const separatorRegex = /(?=#)|[,，、/|\\;；]+/;
        const calloutRegex = /^(>\s*-\s*)(.*?)::(.*)$/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.trim().startsWith("> - ") && line.includes("::")) {
                const match = line.match(calloutRegex);
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

                    cleanItem = cleanItem.replace(/[[\]#<>:"|?*]/g, '').trim();
                    if (!cleanItem) continue;

                    const wikiLink = `[[${cleanItem}]]`;
                    processedItems.push(wikiLink);

                    if (!rawValue.includes(wikiLink)) {
                        lineChanged = true;
                    }

                    // 創建檔案邏輯 (保持不變)
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

                        let fileContent = `---\ntags:\n  - ${key}\n---\n# ${cleanItem}\n\n`;

                        if (tplFile instanceof TFile) {
                            fileContent = await this.app.vault.cachedRead(tplFile);
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
                    // 🌟 2. 唔再用 editor.setLine() 觸發 UI 跳動，只係喺記憶體入面更新字串！
                    const newLine = `${prefix}${key}:: ${processedItems.join(", ")}`;
                    lines[i] = newLine;
                    updatedLinesCount++;
                }
            }
        }

        // 🌟 3. 將修改好嘅字串砌返埋一齊
        const finalContent = lines.join("\n");

        if (finalContent !== content) {
            // 1. 影張相：記下目前的捲軸絕對位置
            const scrollInfo = editor.getScrollInfo();

            // 2. 寫入底層：執行智能差異更新
            await this.app.vault.modify(activeFile, finalContent);

            // 3. 終極鎖定：延遲一小段時間後強制撥回捲軸
            // 雖然可能會因為文字變長（加了 [[]]）而有幾像素的位移，
            // 但這比「飛返上頂」好上一萬倍！
            setTimeout(() => {
                editor.scrollTo(scrollInfo.left, scrollInfo.top);
            }, 100);
        }

        if (createdCount > 0 || updatedLinesCount > 0) {
            new Notice(`Autowiki complete!\nFormatted ${updatedLinesCount} lines.\nCreated ${createdCount} new notes!`, 6000);
        } else {
            new Notice(`Autowiki scanned successfully, all wiki links are already up to date.`);
        }
    }
}