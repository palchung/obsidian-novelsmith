import { App, Notice, TFile, MarkdownView, moment } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { InputModal, GenericSuggester } from '../modals';
import { parseUniversalScenes, HISTORY_DIR, ensureFolderExists, extractSceneId, cleanSceneTitle } from '../utils';

export class HistoryManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(newSettings: NovelSmithSettings) {
        this.settings = newSettings;
    }

    public getSceneInfoAtCursor(editor: CodeMirror.Editor | any) {
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        // 🔥 P2 Architecture Refactoring: Global radar handles basic data instantly
        const parsedScenes = parseUniversalScenes(editor.getValue());
        const currentScene = [...parsedScenes].reverse().find(s => s.lineIndex <= cursor.line);

        if (!currentScene) return null;

        // Still need to search downwards for the end of this scene (until the next marker or EOF)
        let endLineIndex = lineCount;
        for (let i = currentScene.lineIndex + 1; i < lineCount; i++) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######") || line.includes("++ FILE_ID")) {
                endLineIndex = i;
                break;
            }
        }

        return {
            id: currentScene.id,
            title: currentScene.title,
            startLine: currentScene.lineIndex,
            endLine: endLineIndex,
            headerRaw: currentScene.rawHeader
        };
    }

    async saveVersion(view: MarkdownView, onComplete?: () => void) {
        const editor = view.editor;
        const scene = this.getSceneInfoAtCursor(editor);

        if (!scene) { new Notice("⚠️ Please place your cursor within a ###### scene block."); return; }
        if (!scene.id) { new Notice("🚫 This scene does not have an ID yet! Please execute Smart Save first."); return; }

        const rawRange = editor.getRange({ line: scene.startLine + 1, ch: 0 }, { line: scene.endLine, ch: 0 });
        const lines = rawRange.split("\n");
        let bodyLines = [];
        let isMeta = true;

        // 🔥 Ultimate Fix: Accurately identify Callout, protecting the Blockquote of the body text!
        for (const line of lines) {
            if (isMeta) {
                const trimLine = line.trim();
                if (trimLine.startsWith("> [!NSmith") || trimLine.startsWith("> [!info") || trimLine.startsWith("> -") || trimLine === ">") continue;
                if (trimLine === "") continue;
                isMeta = false;
            }
            bodyLines.push(line);
        }

        const cleanContent = bodyLines.join("\n").trim();
        if (!cleanContent) { new Notice("⚠️ The scene body is empty; cannot be saved."); return; }

        new InputModal(this.app, `Backup: ${scene.title}`, async (verName) => {
            if (!verName) return;


            // 🔥 Upgrade 4: Sanitization! Force convert all line breaks (Enter) to spaces to prevent breaking Markdown formatting
            const sanitizedVerName = verName.replace(/[\r\n]+/g, " ").trim();
            const finalVerName = sanitizedVerName === "" ? "Auto Backup" : sanitizedVerName;


            await this.executeSave(scene.id!, scene.title, cleanContent, finalVerName);
            if (onComplete) onComplete();
        }).open();
    }

    async executeSave(id: string, title: string, content: string, verName: string) {
        // 🔥 Modification: Directly use the merged path
        const historyFolder = `${this.settings.bookFolderPath}/${HISTORY_DIR}`;
        const targetFilePath = `${historyFolder}/${id}.md`;

        await ensureFolderExists(this.app, historyFolder);

        let historyFile = this.app.vault.getAbstractFileByPath(targetFilePath);
        const timestamp = moment().format("YYYY-MM-DD HH:mm");

        if (!(historyFile instanceof TFile)) {
            // 🔥 YAML Bomb Defusal: Safely handle double quotes in titles, and switch to a more standard list format
            const safeTitle = title.replace(/"/g, '\\"');

            const fileHeader = `---\naliases:\n  - "${safeTitle}"\ncreated: ${timestamp}\nscene_id: ${id}\n---\n# 📜 History Record: ${title}\n> [!info] System Notice\n> This file is named by ID, so records remain even if the manuscript is renamed.\n\n`;

            historyFile = await this.app.vault.create(targetFilePath, fileHeader);
        }

        const calloutBody = content.split("\n").map(l => "> " + l).join("\n");
        const versionBlock = `\n> [!save]- 💾 Ver: ${timestamp} - ${verName}\n${calloutBody}\n`;

        if (historyFile instanceof TFile) {
            await this.app.vault.append(historyFile, versionBlock);
            new Notice(`✅ Atomic Backup successful!\n(ID: ${id})`);
        }
    }

    public async getSceneVersions(sceneId: string) {
        // 🔥 Modification: Directly use the merged path
        const historyPath = `${this.settings.bookFolderPath}/${HISTORY_DIR}/${sceneId}.md`;
        const historyFile = this.app.vault.getAbstractFileByPath(historyPath);

        if (!(historyFile instanceof TFile)) return [];

        const hContent = await this.app.vault.read(historyFile);
        const verRegex = /> \[!save\]- 💾 Ver: (.*?)\n((?:> .*\n?)*)/g;
        let verMatches;
        const versions = [];

        while ((verMatches = verRegex.exec(hContent)) !== null) {
            let cleanBody = verMatches[2]
                .split("\n")
                .map(l => l.replace(/^> ?/, ""))
                .join("\n")
                .trim();
            versions.push({ label: verMatches[1], content: cleanBody });
        }
        return versions.reverse();
    }

    public performRestore(editor: CodeMirror.Editor | any, scene: any, newContent: string) {
        const currentRangeText = editor.getRange({ line: scene.startLine + 1, ch: 0 }, { line: scene.endLine, ch: 0 });
        const currentLines = currentRangeText.split("\n");
        let metaBuffer = [];

        // 🔥 Ultimate Fix: Accurately identify during restoration, without breaking the body text
        for (const line of currentLines) {
            const trimLine = line.trim();
            if (trimLine.startsWith("> [!NSmith") || trimLine.startsWith("> [!info") || trimLine.startsWith("> -") || trimLine === ">") {
                metaBuffer.push(line);
            } else if (trimLine === "" && metaBuffer.length > 0) {
                metaBuffer.push(line);
            } else break;
        }

        const finalBlock = metaBuffer.join("\n").trim() + "\n\n" + newContent + "\n";
        editor.replaceRange(finalBlock, { line: scene.startLine + 1, ch: 0 }, { line: scene.endLine, ch: 0 });
        new Notice("✅ Version restored successfully!");
    }

    public async showPreview(title: string, verLabel: string, content: string) {
        // 🔥 Modification: Directly use the merged path
        const previewPath = `${this.settings.bookFolderPath}/${HISTORY_DIR}/preview_Temp.md`;
        let previewFile = this.app.vault.getAbstractFileByPath(previewPath);

        const previewText = `# 👀 Preview: ${title}\n> 📅 Version: ${verLabel}\n\n---\n\n${content}`;

        if (!(previewFile instanceof TFile)) {
            await this.app.vault.create(previewPath, previewText);
            previewFile = this.app.vault.getAbstractFileByPath(previewPath);
        } else {
            if (previewFile instanceof TFile) await this.app.vault.modify(previewFile, previewText);
        }

        let leaf = this.app.workspace.getLeavesOfType("markdown").find(l => l.view.file && l.view.file.path === previewPath);
        if (!leaf) leaf = this.app.workspace.getLeaf('split', 'vertical');
        if (previewFile instanceof TFile) await leaf.openFile(previewFile);
        new Notice("👀 Preview opened (Right panel)");
    }

    async restoreVersion(view: MarkdownView) {
        const editor = view.editor;
        const scene = this.getSceneInfoAtCursor(editor);

        if (!scene || !scene.id) { new Notice("⚠️ Cannot restore: Please ensure your cursor is inside a scene with an ID."); return; }

        const versions = await this.getSceneVersions(scene.id);
        if (versions.length === 0) { new Notice("⚠️ No version records found."); return; }

        new GenericSuggester(this.app, versions, (item) => item.label, (selectedVersion) => {
            const actions = [
                { label: "👀 Preview", id: "preview" },
                { label: "⏪ Restore", id: "restore" }
            ];
            new GenericSuggester(this.app, actions, (action) => action.label, async (selectedAction) => {
                if (selectedAction.id === "preview") {
                    this.showPreview(scene.title, selectedVersion.label, selectedVersion.content);
                } else {
                    this.performRestore(editor, scene, selectedVersion.content);
                }
            }).open();
        }).open();
    }


}