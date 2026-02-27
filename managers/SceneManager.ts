import { App, Notice, MarkdownView, TFile, TFolder, moment } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { SimpleConfirmModal } from '../modals';
import { extractSceneColor, getColorById, extractSceneId, cleanSceneTitle, RE_EXTRACT_ID, DRAFT_FILENAME, BACKSTAGE_DIR, SCENE_DB_FILE, ensureFolderExists } from '../utils';


interface SceneData {
    id: string;
    title: string;
    meta: string[];
    colorId: string;
}

export class SceneManager {
    app: App;
    settings: NovelSmithSettings;

    // 🔥 效能引擎：防抖計時器
    private dbTimer: number | null = null;
    private dbInFlight: Promise<void> | null = null;

    // 🔥 終極省電優化：加入增量更新快取，記錄檔案的路徑、最後修改時間與情節數據
    private fileCache: Map<string, { mtime: number, scenes: SceneData[] }> = new Map();

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    // 🔥 全新：排程更新數據庫 (Debounce)，避免一秒內瘋狂讀寫硬碟
    public scheduleGenerateDatabase(delayMs = 1500) {
        if (this.dbTimer) window.clearTimeout(this.dbTimer);
        this.dbTimer = window.setTimeout(() => {
            this.dbTimer = null;
            this.dbInFlight = this.generateDatabase()
                .catch(e => console.error("NovelSmith DB 更新失敗", e))
                .finally(() => { this.dbInFlight = null; });
        }, delayMs);
    }

    async assignIDs(view: MarkdownView) {
        new SimpleConfirmModal(this.app, "這將會為所有情節標題添加隱形 ID，確定嗎？", async () => {
            await this.executeAssignIDsSilent(view);
            new Notice(`✅ 已成功為情節分配身份證！`);
        }).open();
    }

    async executeAssignIDsSilent(view: MarkdownView) {
        const editor = view.editor;
        const lineCount = editor.lineCount();
        const newLines: string[] = [];
        let hasChanges = false;

        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######")) {
                if (!RE_EXTRACT_ID.test(line)) {
                    const uuid = crypto.randomUUID().substring(0, 8);
                    const idTag = ` <span class="ns-id" data-scene-id="${uuid}"></span>`;
                    newLines.push(line.trimEnd() + idTag);
                    hasChanges = true;
                } else {
                    newLines.push(line);
                }
            } else {
                newLines.push(line);
            }
        }

        if (hasChanges) editor.setValue(newLines.join("\n"));
        this.scheduleGenerateDatabase();
    }




    async assignIDsToAllFiles(folder: TFolder) {

        const files = folder.children.filter(f =>
            f instanceof TFile && f.extension === 'md' && !f.name.startsWith("_") &&
            f.name !== DRAFT_FILENAME
        ) as TFile[];

        let filesChanged = 0;
        for (const file of files) {
            let content = await this.app.vault.read(file);
            if (content.includes('++ FILE_ID:') || content.includes('## 📜')) continue;

            let lines = content.split("\n");
            let fileHasChanges = false;
            let newLines = [];

            for (const line of lines) {
                if (line.trim().startsWith("######")) {
                    if (!RE_EXTRACT_ID.test(line)) {
                        const uuid = crypto.randomUUID().substring(0, 8);
                        const idTag = ` <span class="ns-id" data-scene-id="${uuid}"></span>`;
                        newLines.push(line.trimEnd() + idTag);
                        fileHasChanges = true;
                    } else newLines.push(line);
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

        const backstagePath = `${bookFolder}/${BACKSTAGE_DIR}`; // 🔥 鎖定後台路徑
        const exportPath = this.settings.exportFolderPath;

        const files = this.app.vault.getMarkdownFiles()
            .filter(f => {
                if (!f.path.startsWith(bookFolder)) return false;
                if (f.name.startsWith("_") || f.name.startsWith("Script_")) return false;
                if (f.name === DRAFT_FILENAME) return false;

                // 🔥 終極無敵防護網：直接排除整個 _Backstage 資料夾！
                if (f.path.startsWith(backstagePath)) return false;

                if (exportPath && f.path.startsWith(exportPath)) return false;
                return true;
            })
            .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

        let dbContent = `---\nTry: Dataview_Target\nUpdated: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n---\n\n# 📊 場景數據庫 (系統自動生成)\n> [!warning] 請勿手動修改此檔案\n\n`;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);

        for (const file of files) {
            const isEditing = (view && view.file === file);
            let fileScenes: SceneData[] = [];

            // 🔥 增量更新邏輯：如果正在編輯該檔、或者 Cache 沒資料、或者檔案修改時間變了，才重新讀取！
            if (isEditing || !this.fileCache.has(file.path) || this.fileCache.get(file.path)!.mtime !== file.stat.mtime) {
                const content = isEditing ? view.editor.getValue() : await this.app.vault.read(file);

                if (content.includes('++ FILE_ID:') || content.includes('## 📜')) continue;

                fileScenes = this.extractScenesFromFile(content.split("\n"));

                // 將最新結果存入 Cache (正在編輯的臨時狀態不存，依賴下次存檔更新)
                if (!isEditing) {
                    this.fileCache.set(file.path, { mtime: file.stat.mtime, scenes: fileScenes });
                }
            } else {
                // 🔥 瞬間重用舊結果，省下幾十次硬碟讀取與運算！
                fileScenes = this.fileCache.get(file.path)!.scenes;
            }

            if (fileScenes.length > 0) {
                dbContent += `## [[${file.basename}]]\n`;
                for (const scene of fileScenes) {
                    const link = `[[${file.basename}#${scene.title}|${scene.title}]]`;

                    // 🔥 終極改動：將所有屬性集中喺同一行，使用 [Key:: Value] 格式
                    let sceneLine = `- [Scene:: ${link}] [SceneName:: ${scene.title}] [SceneID:: \`${scene.id}\`]`;

                    if (scene.colorId !== "default") {
                        const colorObj = getColorById(scene.colorId);
                        sceneLine += ` [Color:: ${colorObj.icon} ${colorObj.name}]`;
                    }

                    for (const metaLine of scene.meta) {
                        let cleanMeta = metaLine.replace(/^> ?/, "").trim();
                        // 略過 Callout 宣告同埋重複嘅 Scene 屬性
                        if (cleanMeta.startsWith("[!") || cleanMeta.includes("Scene::")) continue;

                        if (cleanMeta.includes("::")) {
                            // 移除開頭嘅 "- "，然後將 Key 同 Value 分開
                            const cleanPair = cleanMeta.replace(/^- ?/, "").trim();
                            const parts = cleanPair.split("::");
                            if (parts.length >= 2) {
                                const key = parts[0].trim();
                                const val = parts.slice(1).join("::").trim();
                                // 用中括號包住附加喺同一行
                                sceneLine += ` [${key}:: ${val}]`;
                            }
                        }
                    }
                    dbContent += sceneLine + "\n";
                }
                dbContent += "---\n";
            }
        }

        // 🔥 將 Database 放進後台
        await ensureFolderExists(this.app, backstagePath);
        const dbPath = `${backstagePath}/${SCENE_DB_FILE}`;
        const dbFile = this.app.vault.getAbstractFileByPath(dbPath);
        if (dbFile instanceof TFile) await this.app.vault.modify(dbFile, dbContent);
        else await this.app.vault.create(dbPath, dbContent);
    }

    private extractScenesFromFile(lines: string[]): SceneData[] {
        const scenes: SceneData[] = [];
        let currentScene: SceneData | null = null;
        const htmlCommentStart = "<" + "!--";

        for (const line of lines) {
            const trimLine = line.trim();
            if (trimLine.startsWith("######")) {
                let uuid = extractSceneId(trimLine) || "";
                let exactTitle = cleanSceneTitle(trimLine);
                let colorId = extractSceneColor(trimLine); // 🔥 讀取隱藏顏色

                // 🔥 將 colorId 放入物件
                currentScene = { id: uuid, title: exactTitle, meta: [], colorId: colorId };
                scenes.push(currentScene);
            } else if (currentScene && trimLine.startsWith(">")) {
                currentScene.meta.push(trimLine);
            } else if (currentScene && !trimLine.startsWith(">") && trimLine !== "") {
                currentScene = null;
            }
        }
        return scenes;
    }
}