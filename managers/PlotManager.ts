import { App, Notice, MarkdownView, EditorPosition, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { InputModal, GenericSuggester, SceneCreateModal } from '../modals';
import { TEMPLATES_DIR } from '../utils';
import NovelSmithPlugin from '../main';

export class PlotManager {
    app: App;
    settings: NovelSmithSettings;
    plugin: NovelSmithPlugin;

    constructor(app: App, settings: NovelSmithSettings, plugin: NovelSmithPlugin) {
        this.app = app;
        this.settings = settings;
        this.plugin = plugin;
    }

    updateSettings(newSettings: NovelSmithSettings) {
        this.settings = newSettings;
    }

    private async getTemplateContent(sceneName: string, colorId: string = "default"): Promise<string> {
        const tplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`;
        let templateText = "";
        const tplFile = this.app.vault.getAbstractFileByPath(tplPath);
        const uuid = crypto.randomUUID().substring(0, 8);

        const calloutType = colorId === "default" ? "NSmith" : `NSmith-${colorId}`;

        if (tplFile instanceof TFile) {
            templateText = await this.app.vault.read(tplFile);
            // 🔥 魔術替換：喺原本嘅 UUID 後面靜靜雞攝入 data-color
            templateText = templateText.replace(/data-scene-id="{{UUID}}">/, `data-scene-id="{{UUID}}" data-color="${colorId}">`);
            // 如果係自訂範本，嘗試將 [!NSmith] 換成對應顏色
            templateText = templateText.replace(/> \[!NSmith\]/, `> [!${calloutType}]`);
        } else {
            // 🔥 換上動態 Callout 類型
            templateText = `###### 🎬 {{SceneName}} <span class="ns-id" data-scene-id="${uuid}" data-color="${colorId}"></span>\n> [!${calloutType}] 情節資訊\n> - Time:: \n> - POV:: \n> - Status:: #Writing\n> - Note:: \n\n`;
        }



        return templateText
            .replace(/{{SceneName}}/g, sceneName)
            .replace(/{{UUID}}/g, uuid);
    }

    async insertSceneCard(view: MarkdownView) {
        // 🔥 新增：第一次使用防呆與引導
        const tplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`;
        if (!this.app.vault.getAbstractFileByPath(tplPath)) {
            await this.plugin.ensureTemplateFileExists(false, true); // true = 觸發開檔與新手提示
            return; // 終止插入流程，等用家改好範本先
        }

        // 🔥 升級版：使用豪華卡片建立器
        new SceneCreateModal(this.app, "➕ 插入劇情卡片", "", async (newSceneName, colorId) => {
            if (!newSceneName) return;

            const editor = view.editor;
            const cursor = editor.getCursor();
            const currentLineText = editor.getLine(cursor.line);

            let prefix = "";
            if (currentLineText.substring(0, cursor.ch).trim() !== "") {
                prefix = "\n\n";
            } else if (cursor.line > 0 && editor.getLine(cursor.line - 1).trim() !== "") {
                prefix = "\n";
            }

            // 🔥 將 colorId 傳入去
            const newContent = await this.getTemplateContent(newSceneName, colorId);
            const finalContent = prefix + newContent + "\n";

            editor.replaceRange(finalContent, cursor);

            const addedLines = finalContent.split("\n").length - 1;
            const newCursor = { line: cursor.line + addedLines - 1, ch: 0 };
            editor.setCursor(newCursor);
            editor.scrollIntoView({ from: newCursor, to: newCursor }, true);

            new Notice(`✅ 已插入劇情卡片：${newSceneName}`);
            this.plugin.sceneManager.scheduleGenerateDatabase();
        }).open();
    }

    async splitScene(view: MarkdownView) {
        // 🔥 新增：第一次使用防呆與引導
        const tplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`;
        if (!this.app.vault.getAbstractFileByPath(tplPath)) {
            await this.plugin.ensureTemplateFileExists(false, true);
            return;
        }
        const editor = view.editor;
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        let parentHeaderLine = -1;
        for (let i = cursor.line; i >= 0; i--) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######")) {
                parentHeaderLine = i;
                break;
            }
        }

        let metadataLines: string[] = [];
        if (parentHeaderLine !== -1) {
            for (let i = parentHeaderLine + 1; i < lineCount; i++) {
                const line = editor.getLine(i).trim();
                if (line === "" || (!line.startsWith(">") && !line.startsWith("- "))) break;
                metadataLines.push(editor.getLine(i));
            }
        }

        // 🔥 升級版：分拆時都可以揀色！
        new SceneCreateModal(this.app, "🔪 分拆新情節", "", async (newSceneName, colorId) => {
            if (!newSceneName) return;

            let newContent = "";
            const uuid = crypto.randomUUID().substring(0, 8);

            if (metadataLines.length > 0) {
                // 🔥 分拆時加入 data-color
                newContent += `###### 🎬 ${newSceneName} <span class="ns-id" data-scene-id="${uuid}" data-color="${colorId}"></span>\n`;

                for (let line of metadataLines) {
                    if (line.includes("Scene::")) continue;
                    newContent += `${line}\n`;
                }
            } else {
                newContent = await this.getTemplateContent(newSceneName, colorId);
            }

            editor.replaceRange("\n\n" + newContent.trim() + "\n\n", cursor);

            const linesInserted = newContent.trim().split("\n").length;
            const newCursor = { line: cursor.line + linesInserted + 2, ch: 0 };
            editor.setCursor(newCursor);
            editor.scrollIntoView({ from: newCursor, to: newCursor }, true);

            new Notice(`✅ 已從此處分拆出：${newSceneName}`);
            this.plugin.sceneManager.scheduleGenerateDatabase();
        }).open();
    }

    async mergeScene(view: MarkdownView) {
        const editor = view.editor;
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        let targetHeaderLine = -1;
        let targetHeaderText = "";

        for (let i = cursor.line; i >= 0; i--) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######")) {
                targetHeaderLine = i;
                targetHeaderText = line;
                break;
            }
        }

        if (targetHeaderLine === -1) {
            new Notice("⚠️ 請先將游標放在主情節 (A) 範圍內");
            return;
        }

        const allScenes: { label: string, line: number, raw: string }[] = [];
        const htmlCommentStart = "<" + "!--";

        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######") && i !== targetHeaderLine) {
                let cleanLabel = line.replace(/######\s*/, "").replace(/^🎬\s*/, "");
                if (cleanLabel.includes(htmlCommentStart)) {
                    cleanLabel = cleanLabel.split(htmlCommentStart)[0];
                }
                if (cleanLabel.includes("<span")) cleanLabel = cleanLabel.split("<span")[0];
                if (cleanLabel.includes("<small>")) cleanLabel = cleanLabel.split("<small>")[0];
                cleanLabel = cleanLabel.trim();

                allScenes.push({
                    label: cleanLabel,
                    line: i,
                    raw: line
                });
            }
        }

        if (allScenes.length === 0) {
            new Notice("⚠️ 找不到其他情節可以合併");
            return;
        }

        new GenericSuggester(
            this.app,
            allScenes,
            (item) => item.label,
            (selectedScene) => {
                this.executeMerge(view, targetHeaderText, selectedScene.line);
            }
        ).open();
    }

    executeMerge(view: MarkdownView, targetHeaderText: string, sourceStartLine: number) {
        const editor = view.editor;
        const currentLineCount = editor.lineCount();
        let sourceEndLine = currentLineCount;

        for (let i = sourceStartLine + 1; i < currentLineCount; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######") || line.includes("++ FILE_ID")) {
                sourceEndLine = i;
                break;
            }
        }

        let bodyStartLine = sourceStartLine + 1;
        for (let i = sourceStartLine + 1; i < sourceEndLine; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith(">") || line === "") {
                continue;
            } else {
                bodyStartLine = i;
                break;
            }
        }

        if (bodyStartLine > sourceEndLine) bodyStartLine = sourceEndLine;

        const textToMerge = editor.getRange(
            { line: bodyStartLine, ch: 0 },
            { line: sourceEndLine, ch: 0 }
        );

        editor.replaceRange("",
            { line: sourceStartLine, ch: 0 },
            { line: sourceEndLine, ch: 0 }
        );

        let newTargetHeaderLine = -1;
        const newLineCount = editor.lineCount();

        for (let i = 0; i < newLineCount; i++) {
            if (editor.getLine(i).trim() === targetHeaderText.trim()) {
                newTargetHeaderLine = i;
                break;
            }
        }

        if (newTargetHeaderLine === -1) {
            new Notice("⚠️ 發生錯誤：搵唔返主情節，合併中止。");
            return;
        }

        let insertLine = newLineCount;
        for (let i = newTargetHeaderLine + 1; i < newLineCount; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######") || line.includes("++ FILE_ID")) {
                insertLine = i;
                break;
            }
        }

        if (textToMerge.trim() !== "") {
            editor.replaceRange("\n\n" + textToMerge, { line: insertLine, ch: 0 });
            const scrollPos = { line: insertLine, ch: 0 };
            editor.scrollIntoView({ from: scrollPos, to: scrollPos }, true);
            new Notice(`✅ 成功吸取內容！`);

            this.plugin.sceneManager.scheduleGenerateDatabase();
        } else {
            new Notice("⚠️ 被選取的情節係空嘅，冇嘢好吸！");
        }
    }
}