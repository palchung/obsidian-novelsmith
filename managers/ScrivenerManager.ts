import { App, Notice, TFile, TFolder, MarkdownView } from 'obsidian';
import { parseContent, RE_FILE_ID, DraftCard } from '../utils';
import { NovelSmithSettings } from '../settings';

export class ScrivenerManager {
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
    // 🧠 核心邏輯
    // =================================================================
    async toggleScrivenings() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) { new Notice("❌ 請先打開一個檔案！"); return; }

        const currentFolder = activeFile.parent;
        if (!currentFolder) { new Notice("❌ 檔案位置異常 (Root?)"); return; }

        if (activeFile.name === this.settings.draftFilename) {
            new Notice("⚡️ 準備同步回寫 (Sync)...");
            await this.syncBack(activeFile, currentFolder);
        } else {
            new Notice("⚡️ 準備串聯編譯 (Compile)...");
            await this.compileDraft(currentFolder);
        }
    }

    async compileDraft(folder: TFolder) {
        const draftName = this.settings.draftFilename;
        const files = folder.children.filter((f) =>
            f instanceof TFile && f.extension === 'md' && f.name !== draftName &&
            !f.name.includes("Script") && !f.name.includes("_History") && !f.name.startsWith("_")
        ) as TFile[];

        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (files.length === 0) { new Notice("⚠️ 資料夾內沒有可串聯的檔案。"); return; }

        let contentChunks: string[] = [];
        contentChunks.push(`---\ncssclasses: draft-mode\n---\n## 📜 串聯潤稿模式：${folder.name}\n`);

        for (const file of files) {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            contentChunks.push(`\n\n# 📄 ${file.name}\n`);
            contentChunks.push(`<small>++ FILE_ID: ${file.name} ++</small>\n`);

            let isMeta = false;
            let buffer: string[] = [];

            for (let line of lines) {
                const l = line.trim();
                if (l.startsWith("######")) {
                    if (buffer.length > 0) {
                        contentChunks.push(buffer.join("\n").trim() + "\n\n");
                        buffer = [];
                    }
                    contentChunks.push(`${l}\n\n`); // 這裡會連同 ID 標籤一起編譯進去
                    isMeta = true;
                } else if (isMeta) {
                    if (l.startsWith(">") || l.includes("::") || l === "") continue;
                    else { isMeta = false; buffer.push(line); }
                } else {
                    buffer.push(line);
                }
            }
            if (buffer.length > 0) contentChunks.push(buffer.join("\n").trim() + "\n");
        }

        const fullContent = contentChunks.join("");
        const draftPath = `${folder.path}/${draftName}`;
        let draftFile = this.app.vault.getAbstractFileByPath(draftPath);

        if (draftFile instanceof TFile) {
            await this.app.vault.modify(draftFile, fullContent);
        } else {
            draftFile = await this.app.vault.create(draftPath, fullContent);
        }

        if (draftFile instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(draftFile);
            new Notice(`✅ 編譯完成！共 ${files.length} 章`);
        }
    }

    async syncBack(draftFile: TFile, folder: TFolder) {
        const draftName = this.settings.draftFilename;
        const draftContent = await this.app.vault.read(draftFile);

        if (!draftContent.includes("<small>++ FILE_ID:")) {
            new Notice("❌ 嚴重錯誤：找不到任何 FILE_ID 標記！無法同步。", 0);
            return;
        }

        new Notice("🚀 同步中… (ID 優先模式)");

        const allFolderFiles = folder.children.filter(f =>
            f instanceof TFile && f.extension === 'md' && f.name !== draftName && !f.name.startsWith("_")
        ) as TFile[];

        // 1. 建立兩張地圖：一張認 ID (優先)，一張認標題 (備用)
        const fileContentCache = new Map<string, { file: TFile, text: string }>();
        const globalIdMap = new Map<string, DraftCard>();   // 根據 ID 找舊情節
        const globalTitleMap = new Map<string, DraftCard>(); // 根據 標題 找舊情節

        await Promise.all(allFolderFiles.map(async (file) => {
            const text = await this.app.vault.read(file);
            fileContentCache.set(file.name, { file: file, text: text });

            // 解析原檔內容
            const data = parseContent(text, true);
            data.cards.forEach(card => {
                // 登記標題
                globalTitleMap.set(card.key, card);
                // 如果有 ID，登記 ID
                if (card.id) {
                    globalIdMap.set(card.id, card);
                }
            });
        }));

        const fileBlocks = draftContent.split(RE_FILE_ID);
        let updatedCount = 0;
        const writePromises: Promise<void>[] = [];

        for (let i = 1; i < fileBlocks.length; i += 2) {
            const fileName = fileBlocks[i].trim();
            let blockContent = fileBlocks[i + 1];

            if (!blockContent) continue;

            const cachedData = fileContentCache.get(fileName);
            if (!cachedData) continue;

            const originalData = parseContent(cachedData.text, true);
            const draftData = parseContent(blockContent, false); // false = 代表這是草稿，需要解析 ID

            let finalContent = "";
            // 保留原本的檔頭 (YAML 等)
            if (originalData.headers.trim()) finalContent += originalData.headers.trim() + "\n\n";

            for (let draftCard of draftData.cards) {
                let originalCard: DraftCard | undefined;

                // 🔥 核心修改：優先用 ID 配對
                if (draftCard.id && globalIdMap.has(draftCard.id)) {
                    originalCard = globalIdMap.get(draftCard.id);
                }
                // 找不到 ID，才嘗試用標題配對
                else if (globalTitleMap.has(draftCard.key)) {
                    originalCard = globalTitleMap.get(draftCard.key);
                }

                if (originalCard) {
                    // 找到了！更新舊情節
                    // 如果 Draft 改了標題，這裡會用 Draft 的 header (draftCard.rawHeader)
                    // 這樣就實現了「改名同步」！
                    finalContent += `${draftCard.rawHeader}\n${originalCard.meta.join("\n").trim()}\n\n${draftCard.body}\n\n`;
                } else {
                    // 完全是新的情節 (New Scene)
                    if (!draftCard.key) continue;
                    finalContent += `${draftCard.rawHeader}\n`;
                    if (draftCard.meta && draftCard.meta.length > 0) {
                        finalContent += `${draftCard.meta.join("\n").trim()}\n\n`;
                    } else {
                        // 預設 Metadata
                        finalContent += `> [!quote] 情節資訊\n> - Scene:: ${draftCard.key}\n>   - Time:: \n>   - Status:: #Writing\n\n`;
                    }
                    finalContent += `${draftCard.body}\n\n`;
                }
            }

            finalContent = finalContent.trim();
            if (finalContent !== cachedData.text.trim()) {
                writePromises.push(this.app.vault.modify(cachedData.file, finalContent));
                updatedCount++;
            }
        }

        await Promise.all(writePromises);
        await this.app.vault.delete(draftFile);

        // 不需要手動呼叫 updateDatabase，因為 main.ts 的自動監聽器會偵測到檔案修改並自動執行
        new Notice(`✅ 同步完成！更新了 ${updatedCount} 個檔案。`);
    }
}