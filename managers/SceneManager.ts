import { App, Notice, MarkdownView, TFile, TFolder, moment } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { SimpleConfirmModal } from '../modals';

// 🔥 優化 1：將正則表達式抽離到外層，避免迴圈內重複編譯，極大節省 CPU
const RE_EXTRACT_ID = /SCENE_ID:\s*([a-zA-Z0-9-]+)/;

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
        const op = "<" + "!--";
        const cl = "--" + ">";

        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######")) {
                if (!RE_EXTRACT_ID.test(line)) {
                    const uuid = crypto.randomUUID().substring(0, 8);
                    const idTag = ` <span class="ns-id">SCENE_ID: ${uuid}</span>`;
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
        await this.generateDatabase();
    }

    async assignIDsToAllFiles(folder: TFolder) {
        const draftName = this.settings.draftFilename;
        const templateName = this.settings.templateFilePath.split('/').pop() || "";
        const files = folder.children.filter(f =>
            f instanceof TFile && f.extension === 'md' && !f.name.startsWith("_") &&
            f.name !== draftName && f.name !== templateName
        ) as TFile[];

        let filesChanged = 0;
        const op = "<" + "!--";
        const cl = "--" + ">";

        for (const file of files) {
            let content = await this.app.vault.read(file);
            let lines = content.split("\n");
            let fileHasChanges = false;
            let newLines = [];

            for (const line of lines) {
                if (line.trim().startsWith("######")) {
                    if (!RE_EXTRACT_ID.test(line)) {
                        const uuid = crypto.randomUUID().substring(0, 8);
                        const idTag = ` <span class="ns-id">SCENE_ID: ${uuid}</span>`;
                        newLines.push(line.trimEnd() + idTag);
                        fileHasChanges = true;
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
        if (filesChanged > 0) this.generateDatabase();
    }

    async generateDatabase() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !this.settings.bookFolderPath) return;
        if (!activeFile.path.startsWith(this.settings.bookFolderPath)) return;

        const bookFolder = this.settings.bookFolderPath;
        const draftName = this.settings.draftFilename;
        const templatePath = this.settings.templateFilePath;

        const files = this.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(bookFolder) && !f.name.startsWith("_") && !f.name.startsWith("Script_") && f.name !== draftName && f.path !== templatePath)
            .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

        let dbContent = `---\nTry: Dataview_Target\nUpdated: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n---\n\n# 📊 場景數據庫 (系統自動生成)\n> [!warning] 請勿手動修改此檔案\n\n`;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);

        for (const file of files) {
            const content = (view && view.file === file) ? view.editor.getValue() : await this.app.vault.read(file);
            const scenes = this.extractScenesFromFile(content.split("\n"));

            if (scenes.length > 0) {
                dbContent += `## [[${file.basename}]]\n`;
                for (const scene of scenes) {
                    const link = `[[${file.basename}#${scene.title}|${scene.title}]]`;
                    dbContent += `- Scene:: ${link}\n  - SceneName:: ${scene.title}\n  - SceneID:: \`${scene.id}\`\n`;
                    for (const metaLine of scene.meta) {
                        let cleanMeta = metaLine.replace(/^> ?/, "").trim();
                        if (cleanMeta.startsWith("[!") || cleanMeta.includes("Scene::")) continue;
                        if (cleanMeta.includes("::")) {
                            if (!cleanMeta.startsWith("-")) cleanMeta = "- " + cleanMeta;
                            dbContent += `  ${cleanMeta}\n`;
                        }
                    }
                    dbContent += "\n";
                }
                dbContent += "---\n";
            }
        }

        const dbPath = `${bookFolder}/_Scene_Database.md`;
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
                let uuid = "";
                const idMatch = trimLine.match(RE_EXTRACT_ID);
                if (idMatch) uuid = idMatch[1].trim();

                let exactTitle = trimLine.replace(/^######\s*/, "");


                if (exactTitle.includes("<span")) exactTitle = exactTitle.split("<span")[0];
                if (exactTitle.includes(htmlCommentStart)) exactTitle = exactTitle.split(htmlCommentStart)[0];
                if (exactTitle.includes("<small>")) exactTitle = exactTitle.split("<small>")[0];

                currentScene = { id: uuid, title: exactTitle.trim(), meta: [] };
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