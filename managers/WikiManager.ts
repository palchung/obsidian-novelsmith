import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';

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

    // =================================================================
    // 🧠 自動百科 (Auto Wiki)
    // =================================================================
    async scanAndCreateWiki(view: MarkdownView) {
        const activeFile = view.file;
        if (!activeFile) return;

        const targetFolder = this.settings.wikiFolderPath;

        // 1. 確保目標資料夾存在
        await this.ensureFolderExists(targetFolder);

        // 2. 讀取內容
        const content = view.editor.getValue();

        // 3. Regex 抓取 [[連結]]
        // 優化版 Regex：忽略 #錨點 和 |別名，只抓檔名
        const regex = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]+)?\]\]/g;
        const matches = [...content.matchAll(regex)];

        if (matches.length === 0) {
            new Notice("👀 這一章無發現任何 [[Internal Link]]。");
            return;
        }

        // 去除重複
        const uniqueLinks = [...new Set(matches.map(m => m[1].trim()))];

        let createdCount = 0;
        let movedCount = 0;
        const activeFileName = activeFile.basename;

        new Notice(`🔍 正在掃描 ${uniqueLinks.length} 個連結...`);

        for (const linkName of uniqueLinks) {
            // 跳過自己
            if (linkName === activeFileName) continue;

            // 檢查檔案是否存在
            const existingFile = this.app.metadataCache.getFirstLinkpathDest(linkName, "");

            if (!existingFile) {
                // --- 情況 A：未存在 -> 建立新檔 ---
                const newFilePath = `${targetFolder}/${linkName}.md`;
                // 預設內容：標題 + 標籤
                const defaultContent = `# ${linkName}\n\n> [!info] 設定資料\n> - Type:: \n> - Tags:: #Wiki\n\n`;

                await this.app.vault.create(newFilePath, defaultContent);
                createdCount++;
            } else {
                // --- 情況 B：已存在 -> 檢查是否需要搬運 ---
                // 邏輯：如果檔案在根目錄 ("/" 或 "")，就搬入去設定集
                if (existingFile.parent.path === "/" || existingFile.parent.path === "") {
                    const newPath = `${targetFolder}/${existingFile.name}`;
                    await this.app.fileManager.renameFile(existingFile, newPath);
                    movedCount++;
                }
            }
        }

        if (createdCount > 0 || movedCount > 0) {
            new Notice(`✅ 百科整理完成！\n🆕 新建：${createdCount}\n📦 搬運：${movedCount}\n📂 目標：${targetFolder}`, 5000);
        } else {
            new Notice("👌 所有連結都已歸檔。");
        }
    }
}