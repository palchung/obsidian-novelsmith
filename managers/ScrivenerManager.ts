// 整個 ScrivenerManager.ts
import { App, Notice, TFile, TFolder, MarkdownView, moment } from 'obsidian';
import { parseContent, RE_FILE_ID, DraftCard } from '../utils';
import { NovelSmithSettings } from '../settings';
import { ChapterSelectionModal, SimpleConfirmModal } from '../modals';
import { DRAFT_FILENAME, TEMPLATES_DIR, DRAFTS_DIR, ensureFolderExists } from '../utils';
import { t } from '../locales';

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
        if (!activeFile) { new Notice("❌ 請先打開一個檔案！"); return; }

        const currentFolder = activeFile.parent;
        if (!currentFolder) { new Notice("❌ 檔案位置異常"); return; }

        if (activeFile.name === DRAFT_FILENAME) {
            new Notice("⚡️ 準備同步回寫 (Sync)...");
            await this.syncBack(activeFile, currentFolder);
        } else {
            // 🔥 防自爆機制：檢查資料夾內是否已經存在未同步的草稿！
            const draftPath = `${currentFolder.path}/${DRAFT_FILENAME}`;
            const existingDraft = this.app.vault.getAbstractFileByPath(draftPath);

            // 將原本的編譯邏輯包裝成一個函數，方便稍後呼叫
            // 🔥 防禦升級：將函數改為 async，以便讀取檔案內容
            const startCompileProcess = async () => {
                const rawFiles = currentFolder.children.filter((f) =>
                    f instanceof TFile && f.extension === 'md' && f.name !== DRAFT_FILENAME &&
                    !f.name.includes("Script") && !f.name.includes("_History") && !f.name.startsWith("_")
                ) as TFile[];

                rawFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                if (rawFiles.length === 0) { new Notice("⚠️ 資料夾內沒有可串聯的檔案。"); return; }

                // =======================================================
                // 🛡️ 文稿雷達探測：過濾出真正有「劇情卡片」的檔案 (或全新空白檔)
                // =======================================================
                const validFiles: TFile[] = [];
                for (const f of rawFiles) {
                    // 使用 cachedRead 極速讀取檔案內容 (幾十個 File 都只需幾毫秒)
                    const content = await this.app.vault.cachedRead(f);

                    // 如果有 ###### 標記，或者係一個全新嘅空白檔案 (容許用家開新檔寫作)，就視為合法
                    if (content.includes("######") || content.trim() === "") {
                        validFiles.push(f);
                    }
                }

                // 如果過濾完之後一滴剩 (例如成個資料夾都係百科/設定集)
                if (validFiles.length === 0) {
                    new Notice(t("warn_no_valid_manuscript"), 6000);
                    return; // 果斷落閘！
                }

                let targetFileName = activeFile.name;
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

                // 🔥 記得將傳入去嘅變數由 files 改為過濾後嘅 validFiles！
                new ChapterSelectionModal(this.app, validFiles, async (selectedFiles) => {
                    new Notice(t("scrivener_compiling"));
                    await this.compileDraft(currentFolder, selectedFiles, targetFileName, targetSceneRaw);
                }).open();
            };

            // 🔥 核心攔截：如果發現舊草稿，彈出超嚴重警告視窗！
            if (existingDraft instanceof TFile) {
                new SimpleConfirmModal(
                    this.app,
                    "🚨 嚴重警告：發現未同步的串聯草稿！\n\n此資料夾內已經有一個串聯草稿存在。如果您現在重新啟動串聯模式，舊草稿中【所有未同步的修改】將會被徹底覆寫並永久遺失！\n\n確定要強行覆寫嗎？\n(強烈建議先按「取消」，打開該草稿並點擊「💾 同步並結束」)",
                    () => {
                        // 用家確認要強行覆寫，先放行
                        startCompileProcess();
                    }
                ).open();
            } else {
                // 如果無舊草稿，直接正常啟動
                startCompileProcess();
            }
        }
    }

    async compileDraft(folder: TFolder, files: TFile[], targetFileName: string, targetSceneRaw: string) {
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
                    if (buffer.length > 0) { contentChunks.push(buffer.join("\n").trimEnd() + "\n\n"); buffer = []; }
                    contentChunks.push(`${l}\n\n`);
                    isMeta = true;
                } else if (isMeta) {
                    // 🔥 致命細節修復：遇到空行不要 continue，而是當作正文的開始並保留！
                    if (l.startsWith(">")) continue;
                    else { isMeta = false; buffer.push(line); }
                } else {
                    buffer.push(line);
                }
            }
            if (buffer.length > 0) contentChunks.push(buffer.join("\n").trimEnd() + "\n");
        }

        const fullContent = contentChunks.join("");
        const draftPath = `${folder.path}/${DRAFT_FILENAME}`;
        let draftFile = this.app.vault.getAbstractFileByPath(draftPath);

        if (draftFile instanceof TFile) await this.app.vault.modify(draftFile, fullContent);
        else draftFile = await this.app.vault.create(draftPath, fullContent);

        if (draftFile instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(draftFile);
            new Notice(`✅ 編譯完成！共 ${files.length} 章`);

            setTimeout(() => {
                const newView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (newView && newView.file && newView.file.name === DRAFT_FILENAME) {
                    const editor = newView.editor;
                    let targetLine = 0;
                    if (targetSceneRaw) {
                        for (let i = 0; i < editor.lineCount(); i++) {
                            if (editor.getLine(i).trim() === targetSceneRaw) { targetLine = i; break; }
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

    async syncBack(draftFile: TFile, folder: TFolder) {
        const draftContent = await this.app.vault.read(draftFile);

        if (!draftContent.includes('<span class="ns-file-id">++ FILE_ID:')) {
            new Notice("❌ 嚴重錯誤：找不到任何 FILE_ID 標記！無法同步。", 0); return;
        }

        new Notice("🚀 同步中… (ID 優先模式)");

        let leafToClose = null;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file && view.file.path === draftFile.path) leafToClose = view.leaf;

        const allFolderFiles = folder.children.filter(f =>
            f instanceof TFile && f.extension === 'md' && f.name !== DRAFT_FILENAME && !f.name.startsWith("_")
        ) as TFile[];

        const fileContentCache = new Map<string, { file: TFile, text: string }>();
        const globalIdMap = new Map<string, DraftCard>();
        const parsedOriginalCache = new Map<string, any>();

        await Promise.all(allFolderFiles.map(async (file) => {
            const text = await this.app.vault.read(file);
            fileContentCache.set(file.name, { file: file, text: text });
            const data = parseContent(text, true);
            parsedOriginalCache.set(file.name, data);
            data.cards.forEach(card => { if (card.id) globalIdMap.set(card.id, card); });
        }));

        // 🔥 效能大躍進：在進入迴圈前「預先讀取」範本，避免迴圈內瘋狂讀取硬碟！
        let cachedTemplateText: string | null = null;
        const backstageTplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`;
        const tplFile = this.app.vault.getAbstractFileByPath(backstageTplPath);
        if (tplFile instanceof TFile) {
            cachedTemplateText = await this.app.vault.read(tplFile);
        }

        const fileBlocks = draftContent.split(RE_FILE_ID);
        let updatedCount = 0;
        const writePromises: Promise<void>[] = [];

        for (let i = 1; i < fileBlocks.length; i += 2) {
            const fileName = fileBlocks[i].trim();
            let blockContent = fileBlocks[i + 1];

            if (!blockContent) continue;
            const cachedData = fileContentCache.get(fileName);
            if (!cachedData) continue;

            const originalData = parsedOriginalCache.get(fileName);
            if (!originalData) continue; // 防呆保護


            const draftData = parseContent(blockContent, false);

            const localTitleMap = new Map<string, DraftCard>();
            originalData.cards.forEach(card => localTitleMap.set(card.key, card));

            // 🔥 大師級優化：改用陣列收集字串，徹底杜絕 += 造成的記憶體不斷重新分配！
            const chunks: string[] = [];

            if (originalData.headers.trim()) chunks.push(originalData.headers.trim() + "\n\n");

            for (let draftCard of draftData.cards) {
                let originalCard: DraftCard | undefined;
                if (draftCard.id && globalIdMap.has(draftCard.id)) originalCard = globalIdMap.get(draftCard.id);
                else if (localTitleMap.has(draftCard.key)) originalCard = localTitleMap.get(draftCard.key);

                if (originalCard) {
                    chunks.push(`${draftCard.rawHeader}\n${originalCard.meta.join("\n").trim()}\n\n${draftCard.body}\n\n`);
                } else {
                    if (!draftCard.key) continue;
                    let uuid = draftCard.id;
                    if (!uuid) uuid = crypto.randomUUID().substring(0, 8);
                    const idTag = ` <span class="ns-id" data-scene-id="${uuid}"></span>`;

                    let cleanRawHeader = draftCard.rawHeader.replace(/<span.*?<\/span>/g, "").trimEnd();
                    chunks.push(`${cleanRawHeader}${idTag}\n`);

                    if (draftCard.meta && draftCard.meta.length > 0) {
                        chunks.push(`${draftCard.meta.join("\n").trim()}\n\n`);
                    } else {
                        // 使用剛才預先讀好的快取，瞬間生成
                        let metaBlock = `> [!NSmith] 情節資訊\n> - Scene:: ${draftCard.key}\n> - Status:: #Writing`;
                        if (cachedTemplateText) {
                            const metaBlockMatch = cachedTemplateText.match(/> \[!NSmith\][\s\S]*?(?=\n[^>]|$)/);
                            if (metaBlockMatch) metaBlock = metaBlockMatch[0].replace(/{{SceneName}}/g, draftCard.key).trim();
                        }
                        chunks.push(`${metaBlock}\n\n`);
                    }
                    chunks.push(`${draftCard.body}\n\n`);
                }
            }

            // 🔥 迴圈結束後，一次過 join 成為字串，效能提升百倍！
            let finalContent = chunks.join("").trim();



            if (finalContent !== cachedData.text.trim()) {
                writePromises.push(this.app.vault.modify(cachedData.file, finalContent));
                updatedCount++;
            }
        }
        await Promise.all(writePromises);

        // =========================================================
        // 🔥 執行草稿封存：時間戳記放最前面！
        // =========================================================
        if (this.settings.keepDraftOnSync) {
            const timestamp = moment().format("YYYYMMDD_HHmmss");
            const backstageDrafts = `${this.settings.bookFolderPath}/${DRAFTS_DIR}`;
            await ensureFolderExists(this.app, backstageDrafts);

            const baseName = draftFile.basename;
            // 🔥 新命名規則：20260225_1742_NSmith_Scrivenering.md
            const newPath = `${backstageDrafts}/${timestamp}_${baseName}.md`;

            await this.app.fileManager.renameFile(draftFile, newPath);
            new Notice(`✅ 同步完成！草稿已封存`);
        } else {
            await this.app.vault.delete(draftFile);
            new Notice(`✅ 同步完成！更新了 ${updatedCount} 個檔案。`);
        }

        if (leafToClose) leafToClose.detach();
    }

    // =========================================================
    // 🔥 全新功能：捨棄草稿 (後悔藥)
    // =========================================================
    async discardDraft(draftFile: TFile) {
        let leafToClose = null;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);

        // 如果當前視窗就係呢份草稿，記低佢等陣關閉
        if (view && view.file && view.file.path === draftFile.path) {
            leafToClose = view.leaf;
        }

        // 🔥 貼心安全網：使用 app.vault.trash(file, true)
        // true 代表放入 Mac/Windows 系統的垃圾桶，而不是徹底刪除，讓作家有機會反悔！
        await this.app.vault.trash(draftFile, true);
        new Notice("🗑️ 草稿已捨棄！原稿維持不變。\n(如需挽回，請到電腦作業系統的垃圾桶找回)");

        // 功成身退，關閉分頁
        if (leafToClose) leafToClose.detach();
    }
}

