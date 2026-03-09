// ScrivenerManager.ts
import { App, Notice, TFile, TFolder, MarkdownView } from 'obsidian';
import { parseContent, RE_FILE_ID, DraftCard, ParseResult } from '../utils';
import { NovelSmithSettings } from '../settings';
import { ChapterSelectionModal, SimpleConfirmModal } from '../modals';
import { HISTORY_DIR, ST_WARNING, generateSceneId, DRAFT_FILENAME, TEMPLATES_DIR, DRAFTS_DIR, ensureFolderExists } from '../utils';


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


    async toggleScrivenings() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) { new Notice("Please open a file first!"); return; }

        const currentFolder = activeFile.parent;
        if (!currentFolder) { new Notice("Abnormal file location."); return; }

        if (activeFile.name === DRAFT_FILENAME) {
            new Notice("Preparing to sync back ...");
            await this.syncBack(activeFile, currentFolder);
        } else {
            // 🔥 Anti-self-destruct mechanism
            const draftPath = `${currentFolder.path}/${DRAFT_FILENAME}`;
            const existingDraft = this.app.vault.getAbstractFileByPath(draftPath);

            const startCompileProcess = async () => {
                const rawFiles = currentFolder.children.filter((f) =>
                    f instanceof TFile && f.extension === 'md' && f.name !== DRAFT_FILENAME &&
                    !f.name.includes("Script") && !f.name.includes("_History") && !f.name.startsWith("_")
                ) as TFile[];

                rawFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                if (rawFiles.length === 0) { new Notice("No valid files in this folder "); return; }

                // =======================================================
                // 🛡️ Draft Radar: Look for file with scenes card
                // =======================================================
                const validFiles: TFile[] = [];
                for (const f of rawFiles) {

                    const content = await this.app.vault.cachedRead(f);


                    if (content.includes("######") || content.trim() === "") {
                        validFiles.push(f);
                    }
                }


                if (validFiles.length === 0) {
                    new Notice("Access denied: no scene cards (######) found in this folder.\nScrivenings mode can only be launched in folders containing valid manuscript files!", 6000);
                    return;
                }

                const targetFileName = activeFile.name;
                let targetSceneRaw = "";
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    const editor = view.editor;
                    const cursor = editor.getCursor();
                    for (let i = cursor.line; i >= 0; i--) {
                        const line = editor.getLine(i);
                        if (line.trim().startsWith("######")) { targetSceneRaw = line.trim(); break; }
                    }
                }

                // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Modal UI callback needs async execution
                new ChapterSelectionModal(this.app, validFiles, async (selectedFiles) => {
                    new Notice("Compiling scrivenings draft...");
                    await this.compileDraft(currentFolder, selectedFiles, targetFileName, targetSceneRaw);
                }).open();
            };


            if (existingDraft instanceof TFile) {
                new SimpleConfirmModal(
                    this.app,
                    "Warning: non-sync Scrivenering draft is found.\n\nScrivenering draft exist in this folder. Start a new Scrivenering draft will remove all your previous non-sync draft!\n\nAre you sure to replace it?\n(Suggest you to cancel and open the original draft, then press sync and close)",
                    () => {

                        void startCompileProcess();
                    }
                ).open();
            } else {

                void startCompileProcess();
            }
        }
    }

    async compileDraft(folder: TFolder, files: TFile[], targetFileName: string, targetSceneRaw: string) {
        const contentChunks: string[] = [];
        contentChunks.push(`## 📜 Scrivenering mode：${folder.name}\n`);

        for (const file of files) {
            const content = await this.app.vault.read(file);


            const parsedData = parseContent(content, true, this.app, file);

            contentChunks.push(`\n\n# 📄 ${file.name}\n`);
            contentChunks.push(`<span class="ns-file-id">++ FILE_ID: ${file.name} ++</span>\n\n`);


            if (parsedData.preamble) {
                contentChunks.push(`${parsedData.preamble}\n\n`);
            }


            for (const card of parsedData.cards) {
                contentChunks.push(`${card.rawHeader}\n`);
                //if (card.meta.length > 0) contentChunks.push(`${card.meta.join("\n")}\n`);
                contentChunks.push(`\n${card.body}\n\n`);
            }
        }

        const fullContent = contentChunks.join("");
        const draftPath = `${folder.path}/${DRAFT_FILENAME}`;
        let draftFile = this.app.vault.getAbstractFileByPath(draftPath);

        if (draftFile instanceof TFile) await this.app.vault.modify(draftFile, fullContent);
        else draftFile = await this.app.vault.create(draftPath, fullContent);

        if (draftFile instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(draftFile);
            new Notice(`Compilation complete！Total ${files.length} chapters`);

            setTimeout(() => {
                const newView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (newView && newView.file && newView.file.name === DRAFT_FILENAME) {
                    const editor = newView.editor;
                    let targetLine = 0;
                    if (targetSceneRaw) {
                        for (let i = 0; i < editor.lineCount(); i++) {
                            if (editor.getLine(i).includes(targetSceneRaw)) { targetLine = i; break; }
                        }
                    } else if (targetFileName) {
                        for (let i = 0; i < editor.lineCount(); i++) {
                            if (editor.getLine(i).includes(`++ FILE_ID: ${targetFileName} ++`)) { targetLine = i; break; }
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

    // =========================================================
    // 🔥 New Feature: Silent Rebuild (For Corkboard Restoration)
    // =========================================================
    async rebuildScriveningsSilent(folder: TFolder, targetSceneId: string | null = null) {
        const rawFiles = folder.children.filter((f) =>
            f instanceof TFile && f.extension === 'md' && f.name !== DRAFT_FILENAME &&
            !f.name.includes("Script") && !f.name.includes("_History") && !f.name.startsWith("_")
        ) as TFile[];

        rawFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        const validFiles: TFile[] = [];
        for (const f of rawFiles) {
            const content = await this.app.vault.cachedRead(f);
            if (content.includes("######") || content.trim() === "") {
                validFiles.push(f);
            }
        }

        if (validFiles.length === 0) return;

        // 轉換 ID 為可搜尋字串
        let targetSceneRaw = "";
        if (targetSceneId) {
            targetSceneRaw = `data-scene-id="${targetSceneId}"`;
        }

        // 直接無痕執行 compile，唔彈任何 Modal
        await this.compileDraft(folder, validFiles, "", targetSceneRaw);
    }

    async syncBack(draftFile: TFile, folder: TFolder) {
        const draftContent = await this.app.vault.read(draftFile);

        if (!draftContent.includes('<span class="ns-file-id">++ FILE_ID:')) {

            new Notice("File ID can't be found, sync abort", 0); return;
        }

        new Notice("Sync in process…");

        let leafToClose = null;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file && view.file.path === draftFile.path) leafToClose = view.leaf;

        const allFolderFiles = folder.children.filter(f =>
            f instanceof TFile && f.extension === 'md' && f.name !== DRAFT_FILENAME && !f.name.startsWith("_")
        ) as TFile[];

        const fileContentCache = new Map<string, { file: TFile, text: string }>();
        const globalIdMap = new Map<string, DraftCard>();
        const parsedOriginalCache = new Map<string, ParseResult>();

        await Promise.all(allFolderFiles.map(async (file) => {
            const text = await this.app.vault.read(file);
            fileContentCache.set(file.name, { file: file, text: text });
            const data = parseContent(text, true, this.app, file);
            parsedOriginalCache.set(file.name, data);
            data.cards.forEach(card => { if (card.id) globalIdMap.set(card.id, card); });
        }));


        let cachedTemplateText: string | null = null;
        const backstageTplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`;
        const tplFile = this.app.vault.getAbstractFileByPath(backstageTplPath);
        if (tplFile instanceof TFile) {
            cachedTemplateText = await this.app.vault.read(tplFile);
        }

        const fileBlocks = draftContent.split(RE_FILE_ID);
        let updatedCount = 0;
        const writePromises: Promise<void>[] = [];


        const skippedFiles: string[] = [];

        // 🔥 Draft protection 1A：prepare a snapshots before scrivenering
        const syncTimestamp = window.moment().format("YYYYMMDD_HHmmss");
        const snapshotDir = `${this.settings.bookFolderPath}/${HISTORY_DIR}/Sync_Snapshots/${syncTimestamp}`;
        let snapshotDirCreated = false;
        const snapshotPromises: Promise<TFile>[] = [];



        for (let i = 1; i < fileBlocks.length; i += 2) {
            const fileName = fileBlocks[i].trim();
            const blockContent = fileBlocks[i + 1];

            if (!blockContent) continue;
            const cachedData = fileContentCache.get(fileName);
            if (!cachedData) {
                skippedFiles.push(fileName);
                continue;
            };




            const originalData = parsedOriginalCache.get(fileName);
            if (!originalData) {
                skippedFiles.push(fileName);
                continue;
            };


            const draftData = parseContent(blockContent, false);

            const localTitleMap = new Map<string, DraftCard>();

            originalData.cards.forEach((card) => localTitleMap.set(card.key, card));


            const chunks: string[] = [];

            // =======================================================
            // Combine YAML + preamble + scene content
            // =======================================================


            if (originalData.yaml) {
                chunks.push(originalData.yaml + "\n\n");
            }


            if (draftData.preamble) {
                chunks.push(draftData.preamble + "\n\n");
            }




            for (const draftCard of draftData.cards) {
                let originalCard: DraftCard | undefined;
                if (draftCard.id && globalIdMap.has(draftCard.id)) originalCard = globalIdMap.get(draftCard.id);
                else if (localTitleMap.has(draftCard.key)) originalCard = localTitleMap.get(draftCard.key);

                if (originalCard) {
                    // 🔥 P0 repair：recover ID due to mistaken deletion
                    let safeHeader = draftCard.rawHeader.trimEnd();
                    if (originalCard.id && !safeHeader.includes(originalCard.id)) {
                        // remove span, then assign ID
                        safeHeader = safeHeader.replace(/<span.*?<\/span>/g, "").trimEnd();
                        safeHeader += ` <span class="ns-id" data-scene-id="${originalCard.id}" data-warning="${ST_WARNING}"></span>`;
                    }
                    chunks.push(`${safeHeader}\n${originalCard.meta.join("\n").trim()}\n\n${draftCard.body}\n\n`);
                } else {
                    if (!draftCard.key) continue;
                    let uuid = draftCard.id;
                    if (!uuid) uuid = generateSceneId();
                    const idTag = ` <span class="ns-id" data-scene-id="${uuid}" data-warning="${ST_WARNING}"></span>`;
                    const cleanRawHeader = draftCard.rawHeader.replace(/<span.*?<\/span>/g, "").trimEnd();
                    chunks.push(`${cleanRawHeader}${idTag}\n`);

                    if (draftCard.meta && draftCard.meta.length > 0) {
                        chunks.push(`${draftCard.meta.join("\n").trim()}\n\n`);
                    } else {

                        let metaBlock = `> [!NSmith] Scene Info\n> - Scene:: ${draftCard.key}\n> - Status:: #Writing`;
                        if (cachedTemplateText) {
                            const metaBlockMatch = cachedTemplateText.match(/> \[!NSmith\][\s\S]*?(?=\n[^>]|$)/);
                            if (metaBlockMatch) metaBlock = metaBlockMatch[0].replace(/{{SceneName}}/g, draftCard.key).trim();
                        }
                        chunks.push(`${metaBlock}\n\n`);
                    }
                    chunks.push(`${draftCard.body}\n\n`);
                }
            }


            const finalContent = chunks.join("").trim();



            if (finalContent !== cachedData.text.trim()) {
                // 🔥 Protection 1B：Save Snapshot into history folder before sync.
                if (!snapshotDirCreated) {
                    await ensureFolderExists(this.app, snapshotDir);
                    snapshotDirCreated = true;
                }
                const snapshotPath = `${snapshotDir}/${fileName}`;

                snapshotPromises.push(this.app.vault.create(snapshotPath, cachedData.text));


                writePromises.push(this.app.vault.modify(cachedData.file, finalContent));
                updatedCount++;
            }
        }
        // 🔥 Protection 1C：Execute sync after snapshorts are in place.
        if (snapshotPromises.length > 0) {
            await Promise.all(snapshotPromises);
        }
        await Promise.all(writePromises);

        // =========================================================
        // 🔥 Execute draft saving
        // =========================================================
        if (this.settings.keepDraftOnSync) {
            const timestamp = window.moment().format("YYYYMMDD_HHmmss");
            const backstageDrafts = `${this.settings.bookFolderPath}/${DRAFTS_DIR}`;
            await ensureFolderExists(this.app, backstageDrafts);

            const baseName = draftFile.basename;
            // 🔥 New naming rule：20260225_1742_NSmith_Scrivenering.md
            const newPath = `${backstageDrafts}/${timestamp}_${baseName}.md`;

            await this.app.fileManager.renameFile(draftFile, newPath);
            new Notice(`Sync complete, draft saved`);
        } else {
            await this.app.fileManager.trashFile(draftFile);
            new Notice(`Sync complete, updated ${updatedCount} files.`);
        }

        if (leafToClose) leafToClose.detach();

        if (skippedFiles.length > 0) {
            new Notice(`Error：${skippedFiles.length} files can't be synced. (Rename or deleted)\nFiles：${skippedFiles.join(", ")}`, 15000);
        }
    }

    // =========================================================
    // 🔥 New Feature: Discard Draft
    // =========================================================
    async discardDraft(draftFile: TFile) {
        let leafToClose = null;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);

        // If the current window is this draft, note it down to close later
        if (view && view.file && view.file.path === draftFile.path) {
            leafToClose = view.leaf;
        }


        if (leafToClose) leafToClose.detach();

        // After the visual disappears, silently trash the file in the background
        await this.app.fileManager.trashFile(draftFile);
        new Notice("Draft discarded! Original manuscript remains unchanged,\nif you need to recover it, check your system's trash/recycle bin.");


    }
}

