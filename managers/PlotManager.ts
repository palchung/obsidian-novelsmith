import { App, Notice, MarkdownView, EditorPosition } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { InputModal, GenericSuggester } from '../modals';

export class PlotManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(newSettings: NovelSmithSettings) {
        this.settings = newSettings;
    }

    // =================================================================
    // 🔪 情節分拆 (Split Scene) - 自動生成 ID 版
    // =================================================================
    async splitScene(view: MarkdownView) {
        const editor = view.editor;
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        // 1. 尋找「上一場」的標題 (Parent Header) 以便遺傳 Metadata
        let parentHeaderLine = -1;

        for (let i = cursor.line; i >= 0; i--) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######")) {
                parentHeaderLine = i;
                break;
            }
        }

        // 2. 獲取 Metadata (遺傳邏輯)
        let metadataLines: string[] = [];
        if (parentHeaderLine !== -1) {
            for (let i = parentHeaderLine + 1; i < lineCount; i++) {
                const line = editor.getLine(i).trim();
                if (line === "" || (!line.startsWith(">") && !line.startsWith("- "))) break;
                metadataLines.push(editor.getLine(i));
            }
        }

        // 3. 彈出輸入框問名
        new InputModal(this.app, "🔪 分拆新情節：請輸入名稱", (newSceneName) => {
            if (!newSceneName) return;
            this.executeSplit(view, cursor, newSceneName, metadataLines);
        }).open();
    }

    executeSplit(view: MarkdownView, cursor: EditorPosition, newSceneName: string, metadataLines: string[]) {
        const editor = view.editor;

        // 4. 生成新內容 (遺傳 DNA)
        let newMetadataBlock = "";

        if (metadataLines.length > 0) {
            newMetadataBlock = metadataLines.join("\n").replace(/Scene::.*/, `Scene:: ${newSceneName}`);
        } else {
            newMetadataBlock = `> [!quote] 情節資訊\n> - Scene:: ${newSceneName}\n>   - Time:: \n>   - Status:: #Writing\n>   - POV:: \n>   - Players:: \n>   - Note:: `;
        }

        // 🔥 關鍵修改：立刻生成 ID，無需等待
        const uuid = crypto.randomUUID().substring(0, 8);
        const warning = "⛔️ ID (勿改)";
        // 注意：這裡改用加號拼接，避免反引號問題
        const idTag = " <!-- SCENE_ID: " + uuid + " | " + warning + " -->";

        const template = `\n###### 🎬 ${newSceneName}${idTag}\n${newMetadataBlock}\n\n`;

        // 5. 執行插入
        editor.replaceRange(template, cursor);

        // 6. 調整游標位置
        const linesInserted = template.split("\n").length;
        const newCursor = { line: cursor.line + linesInserted, ch: 0 };
        editor.setCursor(newCursor);
        editor.scrollIntoView({ from: newCursor, to: newCursor }, true);

        new Notice(`✅ 已分拆：${newSceneName} (ID 已生成)`);
    }

    // =================================================================
    // 🌀 情節合併 (Merge Scene / 吸星大法)
    // =================================================================
    async mergeScene(view: MarkdownView) {
        const editor = view.editor;
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        // 1. 鎖定當前主情節 (Target / A)
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

        // 2. 掃描全書，列出所有其他情節 (Source / B)
        const allScenes: { label: string, line: number, raw: string }[] = [];

        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######") && i !== targetHeaderLine) {
                // 顯示時去掉 ID 標籤，讓選單乾淨點
                const cleanLabel = line
                    .replace(/######\s*/, "")
                    .replace(/^🎬\s*/, "")
                    .replace(/<!-- SCENE_ID: (.*?) \|.*?-->/, "") // 隱藏 ID
                    .trim();

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

        // 3. 彈出選單讓用戶選擇
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

        // 步驟 A: 刪除 B
        editor.replaceRange("",
            { line: sourceStartLine, ch: 0 },
            { line: sourceEndLine, ch: 0 }
        );

        // 步驟 B: 重新定位 A (因為行號變了，我們用純標題去搜可能不準)
        // 但因為我們沒有改 A 的內容，所以用標題搜暫時是安全的
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

        // 步驟 C: 尋找 A 的屁股
        let insertLine = newLineCount;
        for (let i = newTargetHeaderLine + 1; i < newLineCount; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######") || line.includes("++ FILE_ID")) {
                insertLine = i;
                break;
            }
        }

        // 步驟 D: 插入
        if (textToMerge.trim() !== "") {
            editor.replaceRange("\n\n" + textToMerge, { line: insertLine, ch: 0 });
            const scrollPos = { line: insertLine, ch: 0 };
            editor.scrollIntoView({ from: scrollPos, to: scrollPos }, true);
            new Notice(`✅ 成功吸取內容！`);
        } else {
            new Notice("⚠️ 被選取的情節係空嘅，冇嘢好吸！");
        }
    }
}