import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { ensureFolderExists } from '../utils';

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

        const targetFolder = this.settings.wikiFolderPath;

        // 1. Ensure the target folder exists
        await ensureFolderExists(this.app, targetFolder);

        // 2. Read content
        const content = view.editor.getValue();

        // 3. Capture [[Links]] using Regex
        // Optimized Regex: Ignore #anchors and |aliases, capture only the file name
        const regex = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]+)?\]\]/g;
        const matches = [...content.matchAll(regex)];

        if (matches.length === 0) {
            new Notice("👀 No [[Internal Links]] found in this chapter.");
            return;
        }

        // Remove duplicates
        const uniqueLinks = [...new Set(matches.map(m => m[1].trim()))];

        let createdCount = 0;
        let movedCount = 0;
        const activeFileName = activeFile.basename;

        new Notice(`🔍 Scanning ${uniqueLinks.length} links...`);

        for (const linkName of uniqueLinks) {
            // Skip self
            if (linkName === activeFileName) continue;

            // Check if the file exists
            const existingFile = this.app.metadataCache.getFirstLinkpathDest(linkName, "");

            if (!existingFile) {
                // --- Case A: Does not exist -> Create new file ---
                const newFilePath = `${targetFolder}/${linkName}.md`;
                // Default content: Title + Tags
                const defaultContent = `# ${linkName}\n\n> [!info] Lore Data\n> - Type:: \n> - Tags:: #Wiki\n\n`;

                await this.app.vault.create(newFilePath, defaultContent);
                createdCount++;
            } else {
                // --- Case B: Exists -> Check if relocation is needed ---
                // Logic: If the file is in the root directory ("/" or ""), move it to the wiki folder
                if (existingFile.parent.path === "/" || existingFile.parent.path === "") {
                    const newPath = `${targetFolder}/${existingFile.name}`;
                    await this.app.fileManager.renameFile(existingFile, newPath);
                    movedCount++;
                }
            }
        }

        if (createdCount > 0 || movedCount > 0) {
            new Notice(`✅ AutoWiki generation complete!\n🆕 Created: ${createdCount}\n📦 Moved: ${movedCount}\n📂 Target: ${targetFolder}`, 5000);
        } else {
            new Notice("👌 All links have been archived.");
        }
    }
}