import { App, Notice, MarkdownView, TFile, TFolder, moment } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { SimpleConfirmModal } from '../modals';

// 定義 ID 的格式 Regex
const RE_SCENE_ID = /<!-- SCENE_ID: (.*?) \|.*?-->/;
// 用於匹配已經有 ID 的標題行
const RE_SCENE_HEADER = /^(###### .*?)( <!-- SCENE_ID: .*? -->)?$/;

interface SceneData {
    id: string;
    title: string;
    meta: string[];
}

export class SceneManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    // ============================================================
    // 💉 功能 1: 為當前筆記注入隱形 ID
    // ============================================================
    async assignIDs(view: MarkdownView) {
        // 先彈出確認視窗，防止誤按
        new SimpleConfirmModal(this.app, "這將會為所有情節標題添加隱形 ID，確定嗎？", async () => {
            await this.executeAssignIDs(view);
        }).open();
    }

    async executeAssignIDs(view: MarkdownView) {
        const editor = view.editor;
        const lineCount = editor.lineCount();
        let changesCount = 0;

        // 為了避免影響游標位置，我們整份讀取處理後再寫回 (或者逐行掃描)
        // 這裡採用逐行掃描並替換的方式
        const newLines: string[] = [];
        let hasChanges = false;

        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i);

            // 偵測 ###### 標題
            if (line.trim().startsWith("######")) {
                // 檢查是否已經有 ID
                if (!RE_SCENE_ID.test(line)) {
                    // 生成新 ID (使用 Web Crypto API 生成 UUID)
                    const uuid = crypto.randomUUID().substring(0, 8); // 用短 UUID 比較清爽 (8碼)
                    const warning = "⛔️ ID (勿改)";
                    const idTag = " <!-- SCENE_ID: " + uuid + " | " + warning + " -->";

                    // 拼接： "###### 初遇" + " "
                    newLines.push(line.trimEnd() + idTag);
                    changesCount++;
                    hasChanges = true;
                } else {
                    // 已經有 ID，保持原樣
                    newLines.push(line);
                }
            } else {
                newLines.push(line);
            }
        }

        if (hasChanges) {
            editor.setValue(newLines.join("\n"));
            new Notice(`✅ 已為 ${changesCount} 個情節分配身份證！`);

            // 分配完 ID 後，順手更新一下數據庫，讓 Dataview 也能即時讀到
            this.generateDatabase();
        } else {
            new Notice("👌 所有情節已有 ID，無需變更。");
        }
    }


    // ============================================================
    // 💉 功能 1.5: 為「整個資料夾」注入 ID (批量/後台處理) 🔥 新增
    // ============================================================
    async assignIDsToAllFiles(folder: TFolder) {
        // 找出所有 Markdown 檔案 (排除系統檔)
        const files = folder.children.filter(f =>
            f instanceof TFile && f.extension === 'md' && !f.name.startsWith("_")
        ) as TFile[];

        let totalChanges = 0;
        let filesChanged = 0;

        for (const file of files) {
            let content = await this.app.vault.read(file);
            let lines = content.split("\n");
            let fileHasChanges = false;
            let newLines = [];

            for (const line of lines) {
                if (line.trim().startsWith("######")) {
                    // 🔥 保護機制：這裡同樣檢查有無 ID
                    if (!RE_SCENE_ID.test(line)) {
                        const uuid = crypto.randomUUID().substring(0, 8);
                        const warning = "⛔️ ID (勿改)";

                        // 🔥 生成 ID (請留意中文代號)
                        const idTag = " <!-- SCENE_ID: " + uuid + " | " + warning + " -->";

                        newLines.push(line.trimEnd() + idTag);
                        fileHasChanges = true;
                        totalChanges++;
                    } else {
                        newLines.push(line);
                    }
                } else {
                    newLines.push(line);
                }
            }

            if (fileHasChanges) {
                await this.app.vault.modify(file, newLines.join("\n"));
                filesChanged++;
            }
        }

        if (filesChanged > 0) {
            new Notice(`🛡️ 串聯前檢查：已為 ${filesChanged} 個檔案補發 ID (共 ${totalChanges} 個情節)。`);
            // 因為改了檔案，順手更新數據庫
            this.generateDatabase();
        }
    }



    // ============================================================
    // 📊 功能 2: 生成影子索引 (Shadow Database)
    // ============================================================
    async generateDatabase() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        // 1. 鎖定範圍 (當前資料夾)
        const parentFolder = activeFile.parent;
        if (!parentFolder) return;

        new Notice(`🔄 正在更新場景數據庫...`);

        // 2. 獲取所有 Markdown 檔案 (排除系統檔)
        const files = parentFolder.children
            .filter(f => f instanceof TFile && f.extension === "md")
            .filter(f => !f.name.startsWith("_")) // 排除 _History, _Database, _Full_Draft
            .filter(f => !f.name.startsWith("Script_"))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) as TFile[];

        let databaseContent = "";

        // 3. 建構檔頭 YAML (給 Dataview 識別)
        databaseContent += `---\nTry: Dataview_Target\nUpdated: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n---\n\n`;
        databaseContent += `# 📊 場景數據庫 (系統自動生成)\n> [!warning] 請勿手動修改此檔案\n> 此檔案用於 Dataview 查詢，會隨時被覆寫。\n\n`;

        for (const file of files) {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            // 讀取檔案內的場景
            const scenes = this.extractScenesFromFile(lines);

            if (scenes.length > 0) {
                databaseContent += `## [[${file.basename}]]\n`; // 檔案連結 (作為章節分類)

                for (const scene of scenes) {
                    // Option B: Markdown List 格式 (Dataview 友善)
                    // 格式：
                    // - [[連結|標題]] (ID: ...)
                    //   - Status:: ...
                    //   - Summary:: ...

                    // 構建連結：[[檔名#標題|顯示標題]]
                    const link = `[[${file.basename}#${scene.title}|${scene.title}]]`;
                    databaseContent += `- **Scene**: ${link}\n`;
                    databaseContent += `  - **ID**: \`${scene.id}\`\n`; // 用 code block 包住 ID 方便複製
                    databaseContent += `  - **RawTitle**: ${scene.title}\n`;

                    // 提取 Metadata (如果有)
                    if (scene.meta.length > 0) {
                        for (const metaLine of scene.meta) {
                            // 清理一下引用符號 "> "
                            const cleanMeta = metaLine.replace(/^> ?/, "").trim();
                            // 確保是 Key:: Value 格式才加入 (給 Dataview 抓取)
                            if (cleanMeta.includes("::")) {
                                databaseContent += `  - ${cleanMeta}\n`;
                            }
                        }
                    }
                    databaseContent += "\n";
                }
                databaseContent += "---\n"; // 分隔線
            }
        }

        // 4. 寫入 _Scene_Database.md
        const dbPath = `${parentFolder.path}/_Scene_Database.md`;
        let dbFile = this.app.vault.getAbstractFileByPath(dbPath);

        if (dbFile instanceof TFile) {
            await this.app.vault.modify(dbFile, databaseContent);
        } else {
            await this.app.vault.create(dbPath, databaseContent);
        }

        new Notice(`✅ 數據庫已更新：_Scene_Database.md`);
    }

    // 輔助：解析單一檔案內容
    private extractScenesFromFile(lines: string[]): SceneData[] {
        const scenes: SceneData[] = [];
        let currentScene: SceneData | null = null;

        for (const line of lines) {
            const trimLine = line.trim();

            // 1. 偵測標題行 (######)
            if (trimLine.startsWith("######")) {
                // 解析 ID
                const idMatch = trimLine.match(RE_SCENE_ID);
                // 解析標題 (移除 ID 部分)
                const titleMatch = trimLine.match(/###### (.*?)( <!--|$)/);
                if (idMatch && titleMatch) {
                    currentScene = {
                        id: idMatch[1].trim(),
                        title: titleMatch[1].trim(),
                        meta: [] as string[]
                    };
                    scenes.push(currentScene);
                } else if (titleMatch) {
                    currentScene = null;
                }
            } else if (currentScene && trimLine.startsWith(">")) {
                currentScene.meta.push(trimLine);
            } else if (currentScene && !trimLine.startsWith(">") && trimLine !== "") {
                // 正文開始
            }
        }
        return scenes;
    }
}
