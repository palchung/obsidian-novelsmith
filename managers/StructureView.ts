import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from 'obsidian';
import Sortable from 'sortablejs';
import NovelSmithPlugin from '../main';

export const VIEW_TYPE_STRUCTURE = "novelsmith-structure-view";

const RE_EXTRACT_ID = /SCENE_ID:\s*([a-zA-Z0-9-]+)/;

interface SceneNode {
    id: string;
    rawHeader: string;
    name: string;
    content: string;
    lineNumber: number;
    type: 'scene';
}

interface ChapterNode {
    id: string;
    name: string;
    preamble: string;
    lineNumber: number;
    scenes: SceneNode[];
    type: 'chapter';
}

export class StructureView extends ItemView {
    plugin: NovelSmithPlugin;
    private sortables: Sortable[] = [];
    private docYaml: string = "";
    private isRefreshing: boolean = false;

    // 🔥 優化 2：記錄上一次大綱的「指紋」，避免打字時無謂重繪 UI
    private lastOutlineHash: string = "";

    private activeTab: 'outline' | 'history' = 'outline';
    private selectedSceneId: string | null = null;
    private selectedSceneTitle: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: NovelSmithPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    // 🔥 新增：精準鎖定當前 Markdown 視窗 (無視側邊欄焦點干擾)
    private getValidMarkdownView(): MarkdownView | null {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            // 強制遍歷所有視窗，搵出同當前活躍檔案完全吻合嗰一個
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            for (const leaf of leaves) {
                if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.file.path === activeFile.path) {
                    return leaf.view;
                }
            }
        }
        // 如果真係搵唔到，先至用系統預設方法
        return this.app.workspace.getActiveViewOfType(MarkdownView);
    }



    getViewType() { return VIEW_TYPE_STRUCTURE; }
    getDisplayText() { return "NovelSmith 控制台"; }
    getIcon() { return "kanban-square"; }

    async onOpen() {
        this.refresh();
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf && leaf.view instanceof MarkdownView) {
                this.lastOutlineHash = ""; // 換檔案強制重繪
                this.parseAndRender();
            }
        }));
        this.registerEvent(this.app.workspace.on('editor-change', () => {
            if (this.activeTab === 'outline') setTimeout(() => this.parseAndRender(), 500);
        }));
        this.registerDomEvent(document, 'mouseup', () => {
            if (this.activeTab === 'history') setTimeout(() => this.parseAndRender(), 100);
        });
        this.registerDomEvent(document, 'keyup', (e: KeyboardEvent) => {
            if (this.activeTab === 'history' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                setTimeout(() => this.parseAndRender(), 100);
            }
        });
    }

    async refresh() {
        this.contentEl.empty();
        this.contentEl.createDiv({ cls: "ns-structure-container" });
        this.lastOutlineHash = "";
        await this.parseAndRender();
    }

    async parseAndRender() {
        if (this.isRefreshing) return;
        this.isRefreshing = true;

        const container = this.contentEl.querySelector(".ns-structure-container") as HTMLElement;
        if (!container) { this.isRefreshing = false; return; }

        // 🔥 使用精準鎖定雷達
        const view = this.getValidMarkdownView();

        // 🔥 指紋檢查邏輯：如果大綱沒變，直接退出，節省 iPad 電量！
        if (view && this.activeTab === 'outline') {
            const text = view.editor.getValue();
            // 抽取所有標題做成指紋
            const currentHash = text.split("\n").filter(l => l.startsWith("#") || l.startsWith("<small>")).join("|");
            if (currentHash === this.lastOutlineHash) {
                this.isRefreshing = false;
                return; // 結構無變，直接收工，零消耗！
            }
            this.lastOutlineHash = currentHash;
        }

        container.empty();
        this.renderHeader(container, view);

        const contentDiv = container.createDiv({ cls: "ns-tab-content" });
        contentDiv.style.marginTop = "10px";

        if (!view) {
            contentDiv.setText("⚠️ 請先打開一篇筆記");
            this.isRefreshing = false;
            return;
        }

        if (this.activeTab === 'outline') await this.renderOutline(contentDiv, view);
        else await this.renderHistory(contentDiv, view);

        this.isRefreshing = false;
    }

    renderHeader(container: HTMLElement, view: MarkdownView | null) {
        const header = container.createDiv({ cls: "ns-control-header" });
        const topBtnRow = header.createDiv({ cls: "ns-button-row" });
        topBtnRow.style.marginBottom = "5px";

        const btnScrivenings = topBtnRow.createEl("button", { text: "📚 串聯模式" });
        btnScrivenings.style.backgroundColor = "var(--interactive-accent)";
        btnScrivenings.style.color = "var(--text-on-accent)";
        btnScrivenings.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                const folder = view.file.parent;
                if (folder) {
                    this.plugin.sceneManager.assignIDsToAllFiles(folder).then(() => {
                        this.plugin.scrivenerManager.toggleScrivenings();
                    });
                }
            }
        };

        const btnCompile = topBtnRow.createEl("button", { text: "📤 匯出文稿" });
        btnCompile.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) this.plugin.compilerManager.openCompileModal(view);
        };

        const btnRow = header.createDiv({ cls: "ns-button-row" });
        const btnInsert = btnRow.createEl("button", { text: "➕ 插入卡片" });
        btnInsert.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) this.plugin.plotManager.insertSceneCard(view);
        };

        const btnSave = btnRow.createEl("button", { text: "💾 同步" });
        btnSave.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) this.plugin.executeSmartSave(view);
        };

        const btnSplit = btnRow.createEl("button", { text: "✂️ 分拆" });
        btnSplit.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) this.plugin.plotManager.splitScene(view);
        };

        const btnMerge = btnRow.createEl("button", { text: "🧲 吸星" });
        btnMerge.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) this.plugin.plotManager.mergeScene(view);
        };

        const tabsRow = header.createDiv({ cls: "ns-tabs-row" });
        let tabClassOutline = "ns-tab-btn" + (this.activeTab === 'outline' ? " is-active" : "");
        const tabOutline = tabsRow.createEl("button", { text: "📑 大綱", cls: tabClassOutline });
        tabOutline.onclick = () => { this.activeTab = 'outline'; this.lastOutlineHash = ""; this.parseAndRender(); };

        let tabClassHistory = "ns-tab-btn" + (this.activeTab === 'history' ? " is-active" : "");
        const tabHistory = tabsRow.createEl("button", { text: "🕰️ 歷史", cls: tabClassHistory });
        tabHistory.onclick = () => { this.activeTab = 'history'; this.parseAndRender(); };
    }

    async renderOutline(container: HTMLElement, view: MarkdownView) {
        const text = view.editor.getValue();
        if (!text.trim()) { container.setText("📄 這份筆記是空的"); return; }

        const fileNameEl = container.createEl("h3");
        if (view.file && view.file.name === this.plugin.settings.draftFilename) {
            fileNameEl.innerText = "📚 串聯模式草稿";
            fileNameEl.style.color = "var(--interactive-accent)";
        } else if (view.file) {
            fileNameEl.innerText = `📖 ${view.file.basename}`;
            fileNameEl.style.color = "var(--text-accent)";
        }
        fileNameEl.style.marginTop = "0";
        fileNameEl.style.borderBottom = "1px solid var(--background-modifier-border)";
        fileNameEl.style.paddingBottom = "8px";
        fileNameEl.style.marginBottom = "10px";

        const tree = this.parseDocument(text);
        this.sortables.forEach(s => s.destroy());
        this.sortables = [];

        if (tree.length === 0) { container.setText("📭 找不到章節或情節標記"); return; }

        tree.forEach((chapter, chIndex) => {
            if (chapter.name === "root" && chapter.scenes.length === 0) return;

            const chapterBox = container.createDiv({ cls: "ns-chapter-box" });
            chapterBox.dataset.name = chapter.name;
            chapterBox.dataset.preamble = chapter.preamble;

            if (chapter.name !== "root") {
                const chCard = chapterBox.createDiv({ cls: "ns-chapter-card" });
                chCard.innerText = `📂 ${chapter.name}`;
                chCard.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); this.jumpToLine(chapter.lineNumber); });
            }

            const sceneList = chapterBox.createDiv({ cls: "ns-scene-list" });
            sceneList.dataset.chapterIndex = chIndex.toString();

            chapter.scenes.forEach((scene) => {
                const scCard = sceneList.createDiv({ cls: "ns-scene-card" });
                scCard.innerText = `🎬 ${scene.name}`;
                scCard.dataset.content = scene.content;

                if (this.selectedSceneId === scene.id) {
                    scCard.style.borderLeft = "4px solid var(--interactive-accent)";
                    scCard.style.backgroundColor = "var(--background-primary-alt)";
                }

                scCard.addEventListener("click", (e) => {
                    e.stopPropagation(); e.preventDefault();
                    this.selectedSceneId = scene.id || null;
                    this.selectedSceneTitle = scene.name;
                    this.jumpToLine(scene.lineNumber);
                    this.lastOutlineHash = ""; // 點擊時強制重繪以更新高亮
                    this.parseAndRender();
                });
            });

            this.sortables.push(new Sortable(sceneList, {
                group: 'scenes', animation: 150, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag',
                delay: 100, delayOnTouchOnly: true,
                onEnd: (evt) => {
                    if (evt.newIndex !== evt.oldIndex || evt.from !== evt.to) this.saveChanges(container, view);
                }
            }));
        });
    }

    async renderHistory(container: HTMLElement, view: MarkdownView) {
        if (view.file && !view.file.path.includes("版本預覽_Temp")) {
            const editor = view.editor;
            const cursor = editor.getCursor();
            let foundTitle = null; let foundId = null;

            for (let i = cursor.line; i >= 0; i--) {
                const line = editor.getLine(i);
                if (line.trim().startsWith("######")) {
                    const idMatch = line.match(RE_EXTRACT_ID);
                    if (idMatch) foundId = idMatch[1].trim();

                    let cleanName = line.replace(/^[#\s]+|^🎬\s*/g, "");
                    const htmlCommentStart = "<" + "!--";
                    if (cleanName.includes(htmlCommentStart)) cleanName = cleanName.split(htmlCommentStart)[0];
                    if (cleanName.includes("<span")) cleanName = cleanName.split("<span")[0];
                    if (cleanName.includes("<small>")) cleanName = cleanName.split("<small>")[0];
                    foundTitle = cleanName.trim();
                    break;
                }
            }
            if (foundTitle) { this.selectedSceneTitle = foundTitle; this.selectedSceneId = foundId || null; }
        }

        if (!this.selectedSceneTitle) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.style.textAlign = "center"; hint.style.opacity = "0.6";
            hint.innerText = "👈 請將游標放在編輯器內的任何一個情節中。";
            return;
        }

        const titleEl = container.createEl("h4");
        titleEl.innerText = `📜 ${this.selectedSceneTitle} 的備份`;
        titleEl.style.color = "var(--text-accent)"; titleEl.style.marginBottom = "8px";

        const btnSaveVersion = container.createEl("button", { text: "💾 備份當前版本 (原子存檔)" });
        btnSaveVersion.style.width = "100%"; btnSaveVersion.style.marginBottom = "15px";
        btnSaveVersion.style.backgroundColor = "var(--interactive-accent)"; btnSaveVersion.style.color = "var(--text-on-accent)";

        btnSaveVersion.onclick = () => {
            this.plugin.historyManager.saveVersion(view, () => { this.parseAndRender(); });
        };

        if (!this.selectedSceneId) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.innerText = `⚠️ 情節「${this.selectedSceneTitle}」尚未有 ID，無法讀取備份。請先點擊上方「💾 儲存/同步」按鈕為其分配 ID。`;
            return;
        }

        const versions = await this.plugin.historyManager.getSceneVersions(this.selectedSceneId);

        if (versions.length === 0) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.innerText = "此情節目前沒有任何備份紀錄。點擊上方按鈕建立第一個備份！";
            return;
        }

        const list = container.createDiv({ cls: "ns-history-list" });
        for (const ver of versions) {
            const card = list.createDiv({ cls: "ns-history-card" });
            const header = card.createDiv({ cls: "ns-history-header" });
            header.innerText = ver.label;
            const actions = card.createDiv({ cls: "ns-history-actions" });

            const btnPreview = actions.createEl("button", { text: "👀 預覽" });
            btnPreview.onclick = () => { this.plugin.historyManager.showPreview(this.selectedSceneTitle!, ver.label, ver.content); };
            const btnRestore = actions.createEl("button", { text: "⏪ 還原" });
            btnRestore.onclick = () => { this.handleRestore(view, this.selectedSceneId!, ver.content); };
        }
    }

    handleRestore(view: MarkdownView, targetId: string, newContent: string) {
        const editor = view.editor;
        const lineCount = editor.lineCount();
        let startLine = -1; let endLine = lineCount;

        for (let i = 0; i < lineCount; i++) {
            if (editor.getLine(i).includes(`SCENE_ID: ${targetId}`)) { startLine = i; break; }
        }
        if (startLine === -1) { new Notice("❌ 在當前檔案找不到此情節。"); return; }
        for (let i = startLine + 1; i < lineCount; i++) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######") || line.includes("++ FILE_ID")) { endLine = i; break; }
        }
        this.plugin.historyManager.performRestore(editor, { startLine: startLine, endLine: endLine }, newContent);
    }

    jumpToLine(lineNumber: number) {
        const view = this.getValidMarkdownView();
        if (view) {
            const editor = view.editor;
            if (lineNumber < 0) lineNumber = 0;
            const maxLine = editor.lineCount() - 1;
            if (lineNumber > maxLine) lineNumber = maxLine;

            editor.setCursor({ line: lineNumber, ch: 0 });
            editor.scrollIntoView({ from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } }, true);
            editor.focus();
        } else {
            new Notice("⚠️ 找不到目標筆記，請先點擊一下編輯區。");
        }
    }

    async saveChanges(container: HTMLElement, view: MarkdownView) {
        if (!view) return;
        new Notice("💾 排版更新中...");
        let newFullText = this.docYaml;
        const chapterBoxes = container.querySelectorAll(".ns-chapter-box");

        chapterBoxes.forEach((box) => {
            const el = box as HTMLElement;
            const chName = el.dataset.name;
            const chPreamble = el.dataset.preamble || "";

            if (chName && chName !== "root") {
                if (newFullText.trim() !== "") newFullText += "\n\n";
                newFullText += `# 📄 ${chName}\n<span class="ns-file-id">++ FILE_ID: ${chName} ++</span>\n`;
            }
            if (chPreamble) newFullText += chPreamble;

            const scenes = el.querySelectorAll(".ns-scene-card");
            scenes.forEach((sc) => {
                const content = (sc as HTMLElement).dataset.content;
                if (content) {
                    if (!newFullText.endsWith("\n\n")) newFullText += "\n\n";
                    newFullText += content.trim();
                }
            });
        });
        view.editor.setValue(newFullText.trim());
    }

    parseDocument(text: string): ChapterNode[] {
        const lines = text.split("\n");
        const tree: ChapterNode[] = [];
        this.docYaml = ""; let startLineIndex = 0;

        if (text.startsWith("---")) {
            const endYamlIndex = text.indexOf("\n---", 3);
            if (endYamlIndex !== -1) {
                this.docYaml = text.substring(0, endYamlIndex + 4) + "\n";
                startLineIndex = this.docYaml.split("\n").length - 1;
            }
        }

        let currentChapter: ChapterNode = { id: 'root', name: 'root', preamble: '', lineNumber: 0, scenes: [], type: 'chapter' };
        let currentScene: SceneNode | null = null;
        let buffer: string[] = [];

        const flushScene = () => {
            if (currentScene) { currentScene.content += buffer.join("\n"); currentChapter.scenes.push(currentScene); }
            else if (buffer.length > 0) { currentChapter.preamble += buffer.join("\n"); }
            buffer = [];
        };

        const flushChapter = () => {
            flushScene();
            if (currentChapter.name !== 'root' || currentChapter.scenes.length > 0 || currentChapter.preamble.trim().length > 0) tree.push(currentChapter);
        };

        const htmlCommentStart = "<" + "!--";

        for (let i = startLineIndex; i < lines.length; i++) {
            const line = lines[i];
            const trimLine = line.trim();

            if (trimLine.startsWith("# 📄")) {
                flushChapter();
                currentChapter = { id: trimLine, name: trimLine.replace("# 📄", "").trim(), preamble: '', lineNumber: i, scenes: [], type: 'chapter' };
                currentScene = null; buffer = []; continue;
            }

            if (trimLine.startsWith("######")) {
                flushScene();
                let uuid = "";
                const idMatch = trimLine.match(RE_EXTRACT_ID);
                if (idMatch) uuid = idMatch[1].trim();

                let cleanName = trimLine.replace(/^[#\s]+|^🎬\s*/g, "");
                if (cleanName.includes(htmlCommentStart)) cleanName = cleanName.split(htmlCommentStart)[0];
                if (cleanName.includes("<span")) cleanName = cleanName.split("<span")[0];
                if (cleanName.includes("<small>")) cleanName = cleanName.split("<small>")[0];

                currentScene = { id: uuid, rawHeader: trimLine, name: cleanName.trim(), content: line + "\n", lineNumber: i, type: 'scene' };
                buffer = []; continue;
            }
            if (trimLine.includes('<span class="ns-file-id">++ FILE_ID')) continue;
            buffer.push(line);
        }
        flushChapter();
        if (tree.length === 0) tree.push(currentChapter);
        return tree;
    }
}