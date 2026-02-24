import { App, Notice, TFile, TFolder, MarkdownView, moment } from 'obsidian';
import { parseContent, RE_FILE_ID, DraftCard } from '../utils';
import { NovelSmithSettings } from '../settings';
import { ChapterSelectionModal } from '../modals';

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

    // 🔥 輔助：創建資料夾 (升級防呆版，過濾多餘斜線)
    private async ensureFolderExists(folderPath: string) {
        const cleanPath = folderPath.replace(/^\/+|\/+$/g, ''); // 移除頭尾多餘斜線
        if (!cleanPath) return;

        const folders = cleanPath.split("/");
        let currentPath = "";

        for (let i = 0; i < folders.length; i++) {
            currentPath += (i === 0 ? "" : "/") + folders[i];
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            if (!folder) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    async toggleScrivenings() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) { new Notice("❌ 請先打開一個檔案！"); return; }

        const currentFolder = activeFile.parent;
        if (!currentFolder) { new Notice("❌ 檔案位置異常 (Root?)"); return; }

        if (activeFile.name === this.settings.draftFilename) {
            new Notice("⚡️ 準備同步回寫 (Sync)...");
            await this.syncBack(activeFile, currentFolder);
        } else {
            const draftName = this.settings.draftFilename;
            const files = currentFolder.children.filter((f) =>
                f instanceof TFile && f.extension === 'md' && f.name !== draftName &&
                !f.name.includes("Script") && !f.name.includes("_History") && !f.name.startsWith("_")
            ) as TFile[];

            files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            if (files.length === 0) { new Notice("⚠️ 資料夾內沒有可串聯的檔案。"); return; }

            let targetFileName = activeFile.name;
            let targetSceneRaw = "";
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                const editor = view.editor;
                const cursor = editor.getCursor();
                for (let i = cursor.line; i >= 0; i--) {
                    const line = editor.getLine(i);
                    if (line.trim().startsWith("######")) {
                        targetSceneRaw = line.trim();
                        break;
                    }
                }
            }

            new ChapterSelectionModal(this.app, files, async (selectedFiles) => {
                new Notice("⚡️ 準備串聯編譯 (Compile)...");
                await this.compileDraft(currentFolder, selectedFiles, targetFileName, targetSceneRaw);
            }).open();
        }
    }

    async compileDraft(folder: TFolder, files: TFile[], targetFileName: string, targetSceneRaw: string) {
        const draftName = this.settings.draftFilename;

        let contentChunks: string[] = [];
        contentChunks.push(`## 📜 串聯潤稿模式：${folder.name}\n`);

        for (const file of files) {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            contentChunks.push(`\n\n# 📄 ${file.name}\n`);
            contentChunks.push(`<span class="ns-file-id">++ FILE_ID: ${file.name} ++</span>\n`);

            let isMeta = false;
            let buffer: string[] = [];

            for (let line of lines) {
                const l = line.trim();
                if (l.startsWith("######")) {
                    if (buffer.length > 0) {
                        contentChunks.push(buffer.join("\n").trim() + "\n\n");
                        buffer = [];
                    }
                    contentChunks.push(`${l}\n\n`);
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
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(draftFile);
            new Notice(`✅ 編譯完成！共 ${files.length} 章`);

            setTimeout(() => {
                const newView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (newView && newView.file && newView.file.name === draftName) {
                    const editor = newView.editor;
                    let targetLine = 0;

                    if (targetSceneRaw) {
                        for (let i = 0; i < editor.lineCount(); i++) {
                            if (editor.getLine(i).trim() === targetSceneRaw) {
                                targetLine = i;
                                break;
                            }
                        }
                    }
                    else if (targetFileName) {
                        for (let i = 0; i < editor.lineCount(); i++) {
                            if (editor.getLine(i).includes(`++ FILE_ID: ${targetFileName} ++`)) {
                                targetLine = i;
                                break;
                            }
                        }
                    }

                    if (targetLine > 0) {
                        editor.setCursor({ line: targetLine, ch: 0 });
                        editor.scrollIntoView({ from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } }, true);
                    }
                }
            }, 300);
        }
    }

    async syncBack(draftFile: TFile, folder: TFolder) {
        const draftName = this.settings.draftFilename;
        const draftContent = await this.app.vault.read(draftFile);

        if (!draftContent.includes('<span class="ns-file-id">++ FILE_ID:')) {
            new Notice("❌ 嚴重錯誤：找不到任何 FILE_ID 標記！無法同步。", 0);
            return;
        }

        new Notice("🚀 同步中… (ID 優先模式)");

        // 記低目前打開緊草稿嘅分頁 (Tab)，等陣同步完用嚟關閉
        let leafToClose = null;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file && view.file.path === draftFile.path) {
            leafToClose = view.leaf;
        }

        const allFolderFiles = folder.children.filter(f =>
            f instanceof TFile && f.extension === 'md' && f.name !== draftName && !f.name.startsWith("_")
        ) as TFile[];

        const fileContentCache = new Map<string, { file: TFile, text: string }>();
        const globalIdMap = new Map<string, DraftCard>();
        const globalTitleMap = new Map<string, DraftCard>();

        await Promise.all(allFolderFiles.map(async (file) => {
            const text = await this.app.vault.read(file);
            fileContentCache.set(file.name, { file: file, text: text });

            const data = parseContent(text, true);
            data.cards.forEach(card => {
                globalTitleMap.set(card.key, card);
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
            const draftData = parseContent(blockContent, false);

            let finalContent = "";
            if (originalData.headers.trim()) finalContent += originalData.headers.trim() + "\n\n";

            for (let draftCard of draftData.cards) {
                let originalCard: DraftCard | undefined;

                if (draftCard.id && globalIdMap.has(draftCard.id)) {
                    originalCard = globalIdMap.get(draftCard.id);
                }
                else if (globalTitleMap.has(draftCard.key)) {
                    originalCard = globalTitleMap.get(draftCard.key);
                }

                if (originalCard) {
                    finalContent += `${draftCard.rawHeader}\n${originalCard.meta.join("\n").trim()}\n\n${draftCard.body}\n\n`;
                } else {
                    if (!draftCard.key) continue;

                    const uuid = crypto.randomUUID().substring(0, 8);
                    const idTag = ` <span class="ns-id">SCENE_ID: ${uuid}</span>`;

                    finalContent += `${draftCard.rawHeader.trimEnd()}${idTag}\n`;

                    if (draftCard.meta && draftCard.meta.length > 0) {
                        finalContent += `${draftCard.meta.join("\n").trim()}\n\n`;
                    } else {
                        const tplPath = this.settings.templateFilePath;
                        const tplFile = this.app.vault.getAbstractFileByPath(tplPath);
                        let metaBlock = `> [!NSmith] 情節資訊\n> - Scene:: ${draftCard.key}\n> - Status:: #Writing`;

                        if (tplFile instanceof TFile) {
                            const templateText = await this.app.vault.read(tplFile);
                            const metaBlockMatch = templateText.match(/> \[!NSmith\][\s\S]*?(?=\n[^>]|$)/);
                            if (metaBlockMatch) {
                                metaBlock = metaBlockMatch[0].replace(/{{SceneName}}/g, draftCard.key).trim();
                            }
                        }
                        finalContent += `${metaBlock}\n\n`;
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

        // =========================================================
        // 🔥 執行草稿封存或刪除，然後乾脆俐落咁關閉視窗！
        // =========================================================
        if (this.settings.keepDraftOnSync) {
            const timestamp = moment().format("YYYYMMDD_HHmmss");
            const archiveFolder = this.settings.keptDraftPath || this.settings.bookFolderPath;
            await this.ensureFolderExists(archiveFolder);

            const baseName = draftFile.basename;
            const newPath = `${archiveFolder}/${baseName}_${timestamp}.md`;

            await this.app.fileManager.renameFile(draftFile, newPath);
            new Notice(`✅ 同步完成！草稿已封存`);
        } else {
            await this.app.vault.delete(draftFile);
            new Notice(`✅ 同步完成！更新了 ${updatedCount} 個檔案。`);
        }

        // 功成身退，直接關閉目前的分頁，唔再彈出任何嘢！
        if (leafToClose) {
            leafToClose.detach();
        }
    }
}