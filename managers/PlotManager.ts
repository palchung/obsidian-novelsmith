import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { GenericSuggester, SceneCreateModal } from '../modals';
import { ST_WARNING, generateSceneId, TEMPLATES_DIR, parseUniversalScenes } from '../utils';
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

    // ==========================================
    // 🔥 Performance Optimization: Template Cache
    // ==========================================
    private templateCache: string | null = null;
    private templateCacheTime: number = 0;

    private async getTemplateContent(sceneName: string, colorId: string = "default"): Promise<string> {
        const tplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`;
        let templateText = "";
        const tplFile = this.app.vault.getAbstractFileByPath(tplPath);
        const uuid = generateSceneId();

        // Smartly determine Callout type (linked with color)
        const calloutType = colorId === "default" ? "NSmith" : `NSmith-${colorId}`;

        if (tplFile instanceof TFile) {
            // 🔥 Core Magic: Check cache! If the file hasn't been modified, use the memory version directly
            if (this.templateCache && tplFile.stat.mtime === this.templateCacheTime) {
                templateText = this.templateCache;
            } else {
                // If it's the first time opening, or the user modified the template, read from the disk again
                templateText = await this.app.vault.read(tplFile);
                this.templateCache = templateText;
                this.templateCacheTime = tplFile.stat.mtime;
            }

            templateText = templateText.replace(
                /^(###### .*?)(?:\s*<span.*<\/span>)?\s*$/m,
                `$1 <span class="ns-id" data-scene-id="{{UUID}}" data-warning="${ST_WARNING}" data-color="${colorId}"></span>`
            );

            // Dynamically convert Callout colors inside the template
            templateText = templateText.replace(/> \[!NSmith\]/, `> [!${calloutType}]`);



        } else {
            templateText = `###### {{SceneName}} <span class="ns-id" data-scene-id="${generateSceneId()}" data-warning="${ST_WARNING}" data-color="${colorId}"></span>\n> [!${calloutType}] Scene Info\n> - Time:: \n> - POV:: \n> - Status:: #Writing\n> - Note:: \n\n`;
        }

        return templateText
            .replace(/{{SceneName}}/g, sceneName)
            .replace(/{{UUID}}/g, uuid);
    }

    async insertSceneCard(view: MarkdownView) {
        // 🔥 New: First-time use safeguard and guide
        const tplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`;
        if (!this.app.vault.getAbstractFileByPath(tplPath)) {
            await this.plugin.ensureTemplateFileExists(false, true); // true = trigger file opening and beginner tips
            return; // Terminate insertion process, wait for user to finish modifying the template
        }

        // 🔥 Upgraded: Use premium card creator
        new SceneCreateModal(this.app, "➕ Insert Scene Card", "", async (newSceneName, colorId) => {
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

            // 🔥 Pass in colorId
            const newContent = await this.getTemplateContent(newSceneName, colorId);
            const finalContent = prefix + newContent + "\n";

            editor.replaceRange(finalContent, cursor);

            const addedLines = finalContent.split("\n").length - 1;
            const newCursor = { line: cursor.line + addedLines - 1, ch: 0 };
            editor.setCursor(newCursor);
            editor.scrollIntoView({ from: newCursor, to: newCursor }, true);

            new Notice(`✅ Inserted Scene Card: ${newSceneName}`);
            this.plugin.sceneManager.scheduleGenerateDatabase();
        }).open();
    }

    async splitScene(view: MarkdownView) {
        // 🔥 New: First-time use safeguard and guide
        const tplPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`;
        if (!this.app.vault.getAbstractFileByPath(tplPath)) {
            await this.plugin.ensureTemplateFileExists(false, true);
            return;
        }
        const editor = view.editor;
        const cursor = editor.getCursor();
        //const lineCount = editor.lineCount();

        // 🔥 P2 Architecture Refactoring: Call global radar directly to instantly locate the card and attributes at the cursor!
        const parsedScenes = parseUniversalScenes(editor.getValue());
        const currentScene = [...parsedScenes].reverse().find(s => s.lineIndex <= cursor.line);
        let metadataLines: string[] = currentScene ? currentScene.meta : [];

        // 🔥 Upgraded: Color selection available during splitting!
        new SceneCreateModal(this.app, "🔪 Split Scene", "", async (newSceneName, colorId) => {
            if (!newSceneName) return;

            let newContent = "";
            //const uuid = generateSceneId();

            if (metadataLines.length > 0) {
                // 🔥 Add data-color during splitting
                newContent += `###### ${newSceneName} <span class="ns-id" data-scene-id="${generateSceneId()}" data-warning="${ST_WARNING}" data-color="${colorId}"></span>\n`;
                for (let line of metadataLines) {
                    if (line.includes("Scene::")) continue;

                    // 🔥 Ultimate Fix 1: Intercept and modify the inherited Callout color!
                    if (line.startsWith("> [!NSmith")) {
                        const calloutType = colorId === "default" ? "NSmith" : `NSmith-${colorId}`;
                        line = line.replace(/> \[!NSmith[^\]]*\]/, `> [!${calloutType}]`);
                    }

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

            new Notice(`✅ Splitted from here: ${newSceneName}`);
            this.plugin.sceneManager.scheduleGenerateDatabase();
        }).open();
    }

    async mergeScene(view: MarkdownView) {
        const editor = view.editor;
        const cursor = editor.getCursor();
        //const lineCount = editor.lineCount();

        // 🔥 P2 Tweak: Use global radar to locate the target scene, and mandate an ID!
        const parsedScenes = parseUniversalScenes(editor.getValue());
        const currentScene = [...parsedScenes].reverse().find(s => s.lineIndex <= cursor.line);

        if (!currentScene || !currentScene.id) {
            new Notice("Please place your cursor within a main scene that has an ID. If there is no ID, click the 'sync' button first!");
            return;
        }

        const targetSceneId = currentScene.id;
        const targetHeaderLine = currentScene.lineIndex;




        if (targetHeaderLine === -1) {
            new Notice("Please place your cursor within the main scene.");
            return;
        }

        // 🔥 P2 Architecture Refactoring: Call global radar to instantly fetch all clean scene data!
        //const parsedScenes = parseUniversalScenes(editor.getValue());
        const allScenes = parsedScenes
            .filter(s => s.lineIndex !== targetHeaderLine)
            .map(s => ({
                label: s.title,
                line: s.lineIndex,
                raw: s.rawHeader
            }));

        if (allScenes.length === 0) {
            new Notice("No other scenes found to merge.");
            return;
        }

        new GenericSuggester(
            this.app,
            allScenes,
            (item) => item.label,
            (selectedScene) => {
                this.executeMerge(view, targetSceneId, selectedScene.line);
            }
        ).open();
    }

    executeMerge(view: MarkdownView, targetSceneId: string, sourceStartLine: number) {
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

        // 🔥 Ultimate Fix 2: Default body start line to the "end" (i.e., default to no body text).
        // This prevents new cards with no body text from accidentally sucking the Callout in as body text!
        let bodyStartLine = sourceEndLine;

        for (let i = sourceStartLine + 1; i < sourceEndLine; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith(">") || line === "") {
                continue;
            } else {
                bodyStartLine = i; // Find the true body text start point
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

        // 🔥 P2 Tweak: Use the universally unique ID to identify, guaranteeing no mistakes even with 10 identically named scenes!
        for (let i = 0; i < newLineCount; i++) {
            if (editor.getLine(i).includes(`data-scene-id="${targetSceneId}"`)) {
                newTargetHeaderLine = i;
                break;
            }
        }

        if (newTargetHeaderLine === -1) {
            new Notice("Error occurred: could not find the main scene. Merge aborted.");
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
            new Notice(`Successfully absorbed content!`);

            this.plugin.sceneManager.scheduleGenerateDatabase();
        } else {
            new Notice("The selected scene is empty, nothing to absorb!");
        }
    }
}