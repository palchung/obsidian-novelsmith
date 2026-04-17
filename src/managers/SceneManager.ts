import { App, Notice, MarkdownView, TFile, TFolder } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { SimpleConfirmModal } from '../modals';
import { replaceEntireDocument, ST_WARNING, isScriveningsDraft, generateSceneId, parseUniversalScenes, getColorById, RE_EXTRACT_ID, DRAFT_FILENAME, BACKSTAGE_DIR, SCENE_DB_FILE, ensureFolderExists } from '../utils';


interface SceneData {
    id: string;
    title: string;
    meta: string[];
    colorId: string;
}

export class SceneManager {
    app: App;
    settings: NovelSmithSettings;

    // 🔥 Performance Engine: Debounce timer
    private dbTimer: number | null = null;
    private dbInFlight: Promise<void> | null = null;
    private dbPending: boolean = false;

    // 🔥 Ultimate Power Saving Optimization: Add incremental update cache to record file paths, last modified times, and scene data
    private fileCache: Map<string, { mtime: number, scenes: SceneData[] }> = new Map();

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    // 🛡️ 終極碎骨機：專門處理極端損毀嘅標題殘骸
    private sanitizeTitle(line: string): string {
        // 匹配常見的標籤殘骸特徵：
        // 1. <span 或 </span>
        // 2. data-xxx
        // 3. ⛔️ 警告符號
        // 4. "> (標籤結尾)
        // 5. 🌟 神級防禦：任何以 =" 開頭，且內容包含 UUID/顏色/ns-id/⛔️ 的殘骸
        // (這會將前面連著的英文字母、亂碼一併當作屬性名殘骸，從根部精準切走！)
        const match = line.match(/(<span\b|<\/span>|data-[a-z-]+|⛔️|">|[a-z-]*="(?:ns-id|[a-z0-9-]{5,}|⛔️[^"]*|default|red|orange|yellow|green|blue|purple|grey)")/i);

        if (match && match.index !== undefined) {
            return line.substring(0, match.index).trimEnd();
        }
        return line.trimEnd();
    }

    // 🔥 New: Schedule database generation (Debounce) to avoid frantic disk read/writes within a second
    public scheduleGenerateDatabase(delayMs = 1500) {
        if (this.dbTimer) window.clearTimeout(this.dbTimer);
        this.dbTimer = window.setTimeout(() => {
            this.dbTimer = null;
            void this.triggerDatabaseGeneration();
        }, delayMs);
    }


    // 🔥 Mutex Lock & Queue
    private async triggerDatabaseGeneration() {
        if (this.dbInFlight !== null) {
            this.dbPending = true;
            return;
        }

        this.dbInFlight = (async () => {
            do {
                this.dbPending = false;
                await this.generateDatabase().catch(e => console.error("NovelSmith update DB fail", e));
            } while (this.dbPending);
        })();

        await this.dbInFlight;
        this.dbInFlight = null;
    }


    assignIDs(view: MarkdownView) {
        new SimpleConfirmModal(this.app, "Confirm to assign ID to all scenes ?", () => {
            this.executeAssignIDsSilent(view);
            new Notice(`Assign ID successfully!`);
        }).open();
    }

    executeAssignIDsSilent(view: MarkdownView) {
        const editor = view.editor;
        const lineCount = editor.lineCount();
        const newLines: string[] = [];
        let hasChanges = false;

        // 🔥 Repair: create a ID checkbook，prevent duplicate ID due to Copy & Paste.
        const seenIds = new Set<string>();

        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######")) {
                const idMatch = line.match(RE_EXTRACT_ID);

                if (!idMatch) {
                    // 👉 Case A：冇 ID 或者得返半截殘骸 -> 清理殘骸，派發新 ID
                    // 🛡️ 治癒魔法 1：一刀切走所有疑似 <span 嘅殘餘物
                    // 🛡️ 治癒魔法 1 升級：無論佢刪除咗 <span，定係淨低 class，或者 data-scene，我哋都一刀切！
                    const cleanTitle = this.sanitizeTitle(line);
                    const idTag = ` <span class="ns-id" data-scene-id="${generateSceneId()}" data-warning="${ST_WARNING}"></span>`;
                    newLines.push(cleanTitle + idTag);
                    hasChanges = true;
                } else {
                    const currentId = idMatch[1];
                    let healedLine = line;

                    // 🛡️ 治癒魔法 2：偵測有冇文字被錯誤擠咗去 </span> 後面，有就搬返去前面！
                    const spanRegex = /(<span class="ns-id"[^>]*>.*?<\/span>)/i;
                    const spanMatch = line.match(spanRegex);

                    if (spanMatch) {
                        const fullSpan = spanMatch[0];
                        const textBefore = line.substring(0, spanMatch.index);
                        const textAfter = line.substring(spanMatch.index! + fullSpan.length);

                        // 如果 span 後面有字，或者有奇怪嘅空格，即刻重新組裝！
                        if (textAfter.trim() !== "" || line.endsWith(" ")) {
                            healedLine = (textBefore.trimEnd() + textAfter).trimEnd() + " " + fullSpan;
                        }
                    } else {
                        // 雖然有 ID，但 span 標籤爛咗 (例如冇咗 </span>)，幫佢重建
                        const colorMatch = line.match(/data-color="([^"]+)"/);
                        const color = colorMatch ? colorMatch[1] : "default";
                        // 🛡️ 治癒魔法 1 升級：無論佢刪除咗 <span，定係淨低 class，或者 data-scene，我哋都一刀切！
                        const cleanTitle = this.sanitizeTitle(line);
                        const idTag = ` <span class="ns-id" data-scene-id="${currentId}" data-warning="${ST_WARNING}" data-color="${color}"></span>`;
                        healedLine = cleanTitle + idTag;
                    }

                    if (seenIds.has(currentId)) {
                        // Case B：發現重複 ID -> 換新 ID
                        const newId = generateSceneId();
                        const fixedLine = healedLine.replace(currentId, newId);
                        newLines.push(fixedLine);
                        seenIds.add(newId);
                        hasChanges = true;
                    } else {
                        // Case C：正常 ID -> 記錄，並檢查需唔需要寫入「治癒後」嘅文字
                        seenIds.add(currentId);
                        if (healedLine !== line) {
                            newLines.push(healedLine);
                            hasChanges = true;
                        } else {
                            newLines.push(line);
                        }
                    }
                }
            } else {
                newLines.push(line);
            }
        }

        if (hasChanges) replaceEntireDocument(editor, newLines.join("\n"));
        this.scheduleGenerateDatabase();
    }




    async assignIDsToAllFiles(folder: TFolder) {
        const files = folder.children.filter(f =>
            f instanceof TFile && f.extension === 'md' && !f.name.startsWith("_") &&
            f.name !== DRAFT_FILENAME
        ) as TFile[];

        let filesChanged = 0;

        // 🔥 Upgrade: Place seenIds outside the file loop for ultimate cross-file duplicate checking!
        const seenIds = new Set<string>();

        for (const file of files) {
            const content = await this.app.vault.read(file);
            if (isScriveningsDraft(content)) continue;

            const lines = content.split("\n");
            let fileHasChanges = false;
            const newLines = [];

            for (const line of lines) {
                if (line.trim().startsWith("######")) {
                    const idMatch = line.match(RE_EXTRACT_ID);

                    if (!idMatch) {
                        // 👉 Case A：冇 ID -> 清理殘骸並派發
                        // 🛡️ 治癒魔法 1 升級：無論佢刪除咗 <span，定係淨低 class，或者 data-scene，我哋都一刀切！
                        const cleanTitle = this.sanitizeTitle(line);
                        const idTag = ` <span class="ns-id" data-scene-id="${generateSceneId()}" data-warning="${ST_WARNING}"></span>`;
                        newLines.push(cleanTitle + idTag);
                        fileHasChanges = true;
                    } else {
                        const currentId = idMatch[1];
                        let healedLine = line;

                        // 🛡️ 治癒魔法：搬字過紙
                        const spanRegex = /(<span class="ns-id"[^>]*>.*?<\/span>)/i;
                        const spanMatch = line.match(spanRegex);

                        if (spanMatch) {
                            const fullSpan = spanMatch[0];
                            const textBefore = line.substring(0, spanMatch.index);
                            const textAfter = line.substring(spanMatch.index! + fullSpan.length);

                            if (textAfter.trim() !== "" || line.endsWith(" ")) {
                                healedLine = (textBefore.trimEnd() + textAfter).trimEnd() + " " + fullSpan;
                            }
                        } else {
                            const colorMatch = line.match(/data-color="([^"]+)"/);
                            const color = colorMatch ? colorMatch[1] : "default";
                            // 🛡️ 治癒魔法 1 升級：無論佢刪除咗 <span，定係淨低 class，或者 data-scene，我哋都一刀切！
                            const cleanTitle = this.sanitizeTitle(line);
                            const idTag = ` <span class="ns-id" data-scene-id="${currentId}" data-warning="${ST_WARNING}" data-color="${color}"></span>`;
                            healedLine = cleanTitle + idTag;
                        }

                        if (seenIds.has(currentId)) {
                            // Case B：重複 ID
                            const newId = generateSceneId();
                            const fixedLine = healedLine.replace(currentId, newId);
                            newLines.push(fixedLine);
                            seenIds.add(newId);
                            fileHasChanges = true;
                        } else {
                            // Case C：正常 ID
                            seenIds.add(currentId);
                            if (healedLine !== line) {
                                newLines.push(healedLine);
                                fileHasChanges = true;
                            } else {
                                newLines.push(line);
                            }
                        }
                    }
                } else newLines.push(line);
            }

            if (fileHasChanges) {
                await this.app.vault.modify(file, newLines.join("\n"));
                filesChanged++;
            }
        }

        if (filesChanged > 0) this.scheduleGenerateDatabase();
    }

    async generateDatabase() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !this.settings.bookFolderPath) return;
        if (!activeFile.path.startsWith(this.settings.bookFolderPath)) return;

        const bookFolder = this.settings.bookFolderPath;

        const backstagePath = `${bookFolder}/${BACKSTAGE_DIR}`;
        const exportPath = this.settings.exportFolderPath;

        const files = this.app.vault.getMarkdownFiles()
            .filter(f => {
                if (!f.path.startsWith(bookFolder)) return false;
                if (f.name.startsWith("_") || f.name.startsWith("Script_")) return false;
                if (f.name === DRAFT_FILENAME) return false;

                // 🔥 exclude the whole Backstage folder
                if (f.path.startsWith(backstagePath)) return false;

                if (exportPath && f.path.startsWith(exportPath)) return false;
                return true;
            })
            .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

        // =========================================================
        // 🔥 Enterprise-Grade Protection 2: Purge Dead Cache
        // =========================================================
        const validPaths = new Set(files.map(f => f.path));
        for (const cachePath of this.fileCache.keys()) {
            if (!validPaths.has(cachePath)) {
                this.fileCache.delete(cachePath); // Kick files that no longer exist out of memory!
                //console.log(`NovelSmith System Optimization: Cleared phantom cache ${cachePath}`);
            }
        }
        // =========================================================





        let dbContent = `---\nTry: Dataview_Target\nUpdated: ${window.moment().format("YYYY-MM-DD HH:mm:ss")}\n---\n\n# 📊 Scenes Database (Auto-generated)\n> [!warning] Please don't modify this markdown file manually \n\n`;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);

        for (const file of files) {
            const isEditing = (view && view.file === file);
            let fileScenes: SceneData[] = [];

            if (isEditing || !this.fileCache.has(file.path) || this.fileCache.get(file.path).mtime !== file.stat.mtime) {
                const content = isEditing ? view.editor.getValue() : await this.app.vault.cachedRead(file);

                if (isScriveningsDraft(content)) continue;

                fileScenes = this.extractScenesFromFile(content.split("\n"));


                if (!isEditing) {
                    this.fileCache.set(file.path, { mtime: file.stat.mtime, scenes: fileScenes });
                }
            } else {

                fileScenes = this.fileCache.get(file.path).scenes;
            }

            if (fileScenes.length > 0) {
                dbContent += `## [[${file.basename}]]\n`;
                for (const scene of fileScenes) {
                    const link = `[[${file.basename}#${scene.title}|${scene.title}]]`;

                    let sceneLine = `- [Scene:: ${link}] [SceneName:: ${scene.title}] [SceneID:: \`${scene.id}\`]`;

                    if (scene.colorId !== "default") {
                        const colorObj = getColorById(scene.colorId);
                        sceneLine += ` [Color:: ${colorObj.icon} ${colorObj.name}]`;
                    }

                    for (const metaLine of scene.meta) {
                        const cleanMeta = metaLine.replace(/^> ?/, "").trim();

                        if (cleanMeta.startsWith("[!") || cleanMeta.includes("Scene::")) continue;

                        if (cleanMeta.includes("::")) {

                            const cleanPair = cleanMeta.replace(/^- ?/, "").trim();
                            const parts = cleanPair.split("::");
                            if (parts.length >= 2) {
                                const key = parts[0].trim();
                                const val = parts.slice(1).join("::").trim();

                                sceneLine += ` [${key}:: ${val}]`;
                            }
                        }
                    }
                    dbContent += sceneLine + "\n";
                }
                dbContent += "---\n";
            }
        }

        // 🔥 Put Database into Backstage
        await ensureFolderExists(this.app, backstagePath);
        const dbPath = `${backstagePath}/${SCENE_DB_FILE}`;
        const dbFile = this.app.vault.getAbstractFileByPath(dbPath);
        if (dbFile instanceof TFile) await this.app.vault.modify(dbFile, dbContent);
        else await this.app.vault.create(dbPath, dbContent);
    }

    private extractScenesFromFile(lines: string[]): SceneData[] {
        return parseUniversalScenes(lines).map(scene => ({
            id: scene.id || "",
            title: scene.title,
            meta: scene.meta,
            colorId: scene.colorId
        }));
    }
}