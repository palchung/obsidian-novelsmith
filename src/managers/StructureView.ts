import { ItemView, WorkspaceLeaf, MarkdownView, Notice, Menu, setIcon } from 'obsidian';
import Sortable from 'sortablejs';
import NovelSmithPlugin from '../../main';
import { SimpleConfirmModal } from '../modals';
import { createIconButton, isScriveningsDraft, replaceEntireDocument, extractSceneId, cleanSceneTitle, DRAFT_FILENAME, extractSceneColor, getColorById, SCENE_COLORS } from '../utils';


export const VIEW_TYPE_STRUCTURE = "novelsmith-structure-view";

//const RE_EXTRACT_ID = /(?:SCENE_ID:\s*|data-scene-id=")([a-zA-Z0-9-]+)/;

interface SceneNode {
    id: string;
    rawHeader: string;
    name: string;
    content: string;
    lineNumber: number;
    type: 'scene';
    colorId: string;
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
    private lastStructureHash: string = "";

    // 🔥 Performance Optimization: Prevent Refresh from swallowing the user's latest typing
    private pendingRefresh: boolean = false;

    // 🔥 Performance Optimization：Use WeakMap.
    private sceneContentMap = new WeakMap<HTMLElement, string>();
    private chapterPreambleMap = new WeakMap<HTMLElement, string>();



    // 🔥 Performance Optimization：record outline hash
    private lastOutlineHash: string = "";

    // 🔥 Prevent Ghost Click
    private isMenuClicking: boolean = false;
    private renderTimer: number | null = null;

    private activeTab: 'outline' | 'history' | 'info' = 'outline';
    private selectedSceneId: string | null = null;
    private selectedSceneTitle: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: NovelSmithPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    private getValidMarkdownView(): MarkdownView | null {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {

            const leaves = this.app.workspace.getLeavesOfType("markdown");
            for (const leaf of leaves) {
                if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.file.path === activeFile.path) {
                    return leaf.view;
                }
            }
        }

        return this.app.workspace.getActiveViewOfType(MarkdownView);
    }



    getViewType() { return VIEW_TYPE_STRUCTURE; }
    getDisplayText() { return "Novelsmith panel"; }
    getIcon() { return "kanban-square"; }

    onOpen() {
        void this.refresh();
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf && leaf.view instanceof MarkdownView) {
                this.lastOutlineHash = "";
                void this.parseAndRender();
            }
        }));
        this.registerEvent(this.app.workspace.on('editor-change', () => {
            if (this.activeTab === 'outline') {
                // 🔥 Repair：Debounce
                if (this.renderTimer) window.clearTimeout(this.renderTimer);
                this.renderTimer = window.setTimeout(() => { void this.parseAndRender(); }, 500);
            }
        }));
        this.registerDomEvent(document, 'mouseup', () => {
            if (this.activeTab === 'history' || this.activeTab === 'info') {
                window.setTimeout(() => {
                    void this.parseAndRender();
                }, 100);
            }
        });
        this.registerDomEvent(document, 'keyup', (e: KeyboardEvent) => {
            if ((this.activeTab === 'history' || this.activeTab === 'info') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                window.setTimeout(() => { void this.parseAndRender(); }, 100);
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
        if (this.isRefreshing) {

            this.pendingRefresh = true;
            return;
        }
        this.isRefreshing = true;



        // 🔥 Include try...finally
        try {
            const container = this.contentEl.querySelector(".ns-structure-container");
            if (!container) return;

            const view = this.getValidMarkdownView();

            if (view && this.activeTab === 'outline') {
                const editor = view.editor;
                const lineCount = editor.lineCount();
                let hashBuilder = "";

                for (let i = 0; i < lineCount; i++) {
                    const line = editor.getLine(i);
                    if (line.startsWith("#") || line.startsWith("<small>")) {
                        hashBuilder += line + "|";
                    }
                }

                if (hashBuilder === this.lastOutlineHash) return;
                this.lastOutlineHash = hashBuilder;
            }

            container.empty();
            this.renderHeader(container, view);

            const contentDiv = container.createDiv({ cls: "ns-tab-content" });
            contentDiv.setCssStyles({ marginTop: "10px" });

            if (!view) {
                contentDiv.setText("Please open a draft");
                return;
            }

            if (this.activeTab === 'outline') this.renderOutline(contentDiv, view);
            else if (this.activeTab === 'info') this.renderInfo(contentDiv, view);
            else await this.renderHistory(contentDiv, view);

        } finally {

            this.isRefreshing = false;
            if (this.pendingRefresh) {
                this.pendingRefresh = false;
                void this.parseAndRender();
            }
        }

    }

    renderHeader(container: HTMLElement, view: MarkdownView | null) {
        const header = container.createDiv({ cls: "ns-control-header" });
        const topBtnRow = header.createDiv({ cls: "ns-button-row" });
        topBtnRow.setCssStyles({ marginBottom: "5px" });


        const isDraftMode = view && view.file && view.file.name === DRAFT_FILENAME;

        // Scrivenings Button
        const btnScrivenings = createIconButton(
            topBtnRow,
            isDraftMode ? "save" : "book-open",
            isDraftMode ? "Sync & close" : "Scrivenering",
            {
                backgroundColor: "var(--interactive-accent)",
                color: "var(--text-on-accent)"
            }
        );



        btnScrivenings.setCssStyles({
            backgroundColor: "var(--interactive-accent)",
            color: "var(--text-on-accent)"
        });


        btnScrivenings.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                const file = view.file;
                const content = view.editor.getValue();


                if (file.name === DRAFT_FILENAME) {
                    void this.plugin.executeSmartSave(view);
                }
                else if (isScriveningsDraft(content)) {
                    new Notice("Abort: this is a archived draft, scrivenering may cause infinite loop.");
                }
                else {
                    const folder = file.parent;
                    if (folder) {
                        void this.plugin.sceneManager.assignIDsToAllFiles(folder).then(() => {
                            void this.plugin.scrivenerManager.toggleScrivenings();
                        });
                    }
                }
            }
        };

        // =========================================================
        // 🔥 Discard & Compile button
        // =========================================================
        if (isDraftMode) {


            const btnDiscard = createIconButton(topBtnRow, "trash-2", "Discard", {
                backgroundColor: "var(--background-modifier-error)",
                color: "white"
            });

            btnDiscard.onclick = () => {
                new SimpleConfirmModal(
                    this.plugin.app,
                    "Are you sure to discard this darft?\n\nWill close & delete this file, all your word will not be synced",
                    () => {
                        void this.plugin.scrivenerManager.discardDraft(view.file);
                    }
                ).open();
            };
        } else {
            const btnCompile = createIconButton(topBtnRow, "file-output", "Compile draft");


            btnCompile.onclick = () => {
                if (view && this.plugin.checkInBookFolder(view.file)) this.plugin.compilerManager.openCompileModal(view);
            };
        }


        // =========================================================
        // 🔥 Split & Merge
        // =========================================================
        const btnRow = header.createDiv({ cls: "ns-button-row" });
        btnRow.setCssStyles({ marginBottom: "5px" });


        const isArchivedDraft = (file: unknown, content: string) => {
            return file.name !== DRAFT_FILENAME &&
                (isScriveningsDraft(content));
        };

        const btnInsert = createIconButton(btnRow, "file-plus", "Scene card");



        btnInsert.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                if (isArchivedDraft(view.file, view.editor.getValue())) {
                    new Notice("This is a archived draft, please return to your working file to insert scene card.");
                    return;
                }
                void this.plugin.plotManager.insertSceneCard(view);
            }
        };

        const btnSave = createIconButton(btnRow, "save", "Sync");

        btnSave.onclick = async () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {


                btnSave.classList.add("ns-btn-flash");
                const originalText = btnSave.innerText;
                btnSave.innerText = "Syncing...";
                btnSave.disabled = true;

                try {
                    if (isArchivedDraft(view.file, view.editor.getValue())) {
                        new Notice("Draft saved.");
                    } else {
                        await this.plugin.executeSmartSave(view);

                        if (view.file.name !== DRAFT_FILENAME) {
                            new Notice("Sync & smart save complete!");
                        }
                    }
                } finally {

                    setTimeout(() => {
                        btnSave.innerText = originalText;
                        btnSave.disabled = false;
                        btnSave.classList.remove("ns-btn-flash");
                    }, 400);
                }
            }
        };

        // =========================================================
        // 🔥 Spilt, merge and tools
        // =========================================================
        const btnRow2 = header.createDiv({ cls: "ns-button-row" });

        const btnSplit = createIconButton(btnRow2, "scissors", "Split");
        btnSplit.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                if (isArchivedDraft(view.file, view.editor.getValue())) {
                    new Notice("This is archived draft, please don't split scene here.");
                    return;
                }
                void this.plugin.plotManager.splitScene(view);
            }
        };

        const btnMerge = createIconButton(btnRow2, "combine", "Merge");
        btnMerge.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                if (isArchivedDraft(view.file, view.editor.getValue())) {
                    new Notice("This is archived draft, please don't merge scene here.");
                    return;
                }
                this.plugin.plotManager.mergeScene(view);
            }
        };

        const btnTools = createIconButton(btnRow2, "wrench", "Tools");
        btnTools.onclick = (e: MouseEvent) => {
            const currentView = this.getValidMarkdownView();
            if (!currentView || !this.plugin.checkInBookFolder(currentView.file)) return;

            // Create Obsidian option list
            const menu = new Menu();

            menu.addItem((item) => {
                item.setTitle("Typo correction")
                    .setIcon("pencil")
                    .onClick(() => { void this.plugin.writingManager.correctNames(currentView); });
            });

            menu.addItem((item) => {
                item.setTitle("Clean draft")
                    .setIcon("eraser")
                    .onClick(() => { this.plugin.writingManager.cleanDraft(currentView); });
            });

            menu.addSeparator();

            menu.addItem((item) => {
                item.setTitle("Dialogue mode")
                    .setIcon("message-circle")
                    .onClick(() => { this.plugin.writingManager.toggleDialogueMode(currentView); });
            });

            menu.addItem((item) => {
                item.setTitle("Redundant mode")
                    .setIcon("search")
                    .onClick(() => { void this.plugin.writingManager.toggleRedundantMode(currentView); });
            });

            menu.addSeparator();

            menu.addItem((item) => {
                item.setTitle("Auto wiki")
                    .setIcon("book")
                    .onClick(() => { void this.plugin.wikiManager.scanAndCreateWiki(currentView); });
            });


            menu.showAtMouseEvent(e);
        };







        const tabsRow = header.createDiv({ cls: "ns-tabs-row" });

        // 1. Outline Tab
        const tabOutline = createIconButton(tabsRow, "list-tree", "Outline");
        tabOutline.className = "ns-tab-btn" + (this.activeTab === 'outline' ? " is-active" : "");
        tabOutline.onclick = () => { this.activeTab = 'outline'; this.lastOutlineHash = ""; void this.parseAndRender(); };

        // 2. Info Tab
        const tabInfo = createIconButton(tabsRow, "info", "Info");
        tabInfo.className = "ns-tab-btn" + (this.activeTab === 'info' ? " is-active" : "");
        tabInfo.onclick = () => { this.activeTab = 'info'; void this.parseAndRender(); };

        // 3. Backup Tab
        const tabHistory = createIconButton(tabsRow, "history", "Backup");
        tabHistory.className = "ns-tab-btn" + (this.activeTab === 'history' ? " is-active" : "");
        tabHistory.onclick = () => { this.activeTab = 'history'; void this.parseAndRender(); };
    }

    renderOutline(container: HTMLElement, view: MarkdownView) {
        const text = view.editor.getValue();
        if (!text.trim()) { container.setText("This file is empty"); return; }

        const fileNameEl = container.createEl("h3");
        if (view.file && view.file.name === DRAFT_FILENAME) {
            fileNameEl.innerText = "Scrivenering draft";
            fileNameEl.setCssStyles({ color: "var(--interactive-accent)" });
        } else if (view.file) {
            fileNameEl.innerText = `${view.file.basename}`;
            fileNameEl.setCssStyles({ color: "var(--text-accent)" });
        }
        fileNameEl.setCssProps({ marginTop: "0" });
        fileNameEl.setCssProps({ borderBottom: "1px solid var(--background-modifier-border)" });
        fileNameEl.setCssProps({ paddingBottom: "8px" });
        fileNameEl.setCssProps({ marginBottom: "10px" });

        const tree = this.parseDocument(text);

        this.sortables.forEach((s: unknown) => s.destroy());
        this.sortables = [];

        if (tree.length === 0) { container.setText("Chapter or scene ID do not found"); return; }

        // 🔥 Hanle duplicated scene ID
        const renderNameCount = new Map<string, number>();

        tree.forEach((chapter, chIndex) => {
            if (chapter.name === "root" && chapter.scenes.length === 0) return;

            const chapterBox = container.createDiv({ cls: "ns-chapter-box" });
            chapterBox.dataset.name = chapter.name;
            this.chapterPreambleMap.set(chapterBox, chapter.preamble);

            if (chapter.name !== "root") {
                const chCard = chapterBox.createDiv({ cls: "ns-chapter-card" });
                chCard.innerText = `${chapter.name}`;
                chCard.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); this.jumpToLine(chapter.lineNumber); });
            }

            const sceneList = chapterBox.createDiv({ cls: "ns-scene-list" });
            sceneList.dataset.chapterIndex = chIndex.toString();

            chapter.scenes.forEach((scene) => {
                const scCard = sceneList.createDiv({ cls: "ns-scene-card" });

                // ==========================================
                // 🔥 Generate Safe Key！
                // ==========================================
                let safeKey = scene.id;
                if (!safeKey) {
                    const count = renderNameCount.get(scene.name) || 0;
                    safeKey = `NO_ID_${scene.name}_${count}`;
                    renderNameCount.set(scene.name, count + 1);
                }
                scCard.dataset.safeKey = safeKey;


                scCard.dataset.sceneId = scene.id || "";
                scCard.dataset.sceneName = scene.name || "";


                const colorObj = getColorById(scene.colorId);
                if (colorObj.cssClass) scCard.addClass(colorObj.cssClass);

                scCard.setCssStyles({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%"
                });
                const titleContainer = scCard.createDiv({ cls: "ns-scene-title-container" });
                titleContainer.setCssStyles({
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                });

                const iconEl = titleContainer.createSpan({ cls: "ns-scene-icon" });
                setIcon(iconEl, "clapperboard"); // "file-text", "pen-tool", "clapperboard" 
                iconEl.setCssStyles({
                    opacity: "0.6",
                    display: "flex",
                    alignItems: "center"
                });

                titleContainer.createSpan({ text: scene.name });






                // 🔥 2. Add 🎨 color change button
                const colorBtn = scCard.createDiv();
                setIcon(colorBtn, "palette");
                colorBtn.setCssStyles({
                    cursor: "pointer",
                    opacity: "0.3",
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                });



                colorBtn.addEventListener("mouseover", () => colorBtn.setCssProps({ opacity: "1" }));
                colorBtn.addEventListener("mouseout", () => colorBtn.setCssProps({ opacity: "0.3" }));

                colorBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const menu = new Menu();
                    SCENE_COLORS.forEach(c => {
                        menu.addItem((item) => {
                            item.setTitle(c.name)
                                .setIcon("lucide-palette")
                                .onClick(() => {

                                    this.isMenuClicking = true;
                                    this.changeSceneColor(view, scene.lineNumber, c.id)

                                    setTimeout(() => this.isMenuClicking = false, 200);
                                });
                        });
                    });
                    menu.showAtMouseEvent(e);
                });

                // 🔥 WeakMap to save mega content
                this.sceneContentMap.set(scCard, scene.content);

                if (this.selectedSceneId === scene.id) {

                    scCard.setCssProps({ borderLeftWidth: "4px" });
                    scCard.setCssProps({ filter: "brightness(0.9)" });
                }

                scCard.addEventListener("click", (e) => {

                    if (this.isMenuClicking) {
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                    e.stopPropagation(); e.preventDefault();
                    this.selectedSceneId = scene.id || null;
                    this.selectedSceneTitle = scene.name;
                    this.jumpToLine(scene.lineNumber);
                    this.lastOutlineHash = "";
                    void this.parseAndRender();
                });
            });

            this.sortables.push(new Sortable(sceneList, {
                group: 'scenes', animation: 150, ghostClass: 'ns-sortable-ghost', dragClass: 'ns-sortable-drag',
                delay: 100, delayOnTouchOnly: true,

                onEnd: (evt: unknown) => {

                    if (evt.newIndex !== evt.oldIndex || evt.from !== evt.to) this.saveChanges(container, view);
                }
            }));
        });
    }

    async renderHistory(container: HTMLElement, view: MarkdownView) {
        if (view.file && !view.file.path.includes("preview_Temp")) {
            const editor = view.editor;
            const cursor = editor.getCursor();
            let foundTitle = null; let foundId = null;

            for (let i = cursor.line; i >= 0; i--) {
                const line = editor.getLine(i);
                if (line.trim().startsWith("######")) {


                    foundId = extractSceneId(line);
                    foundTitle = cleanSceneTitle(line);


                    break;
                }
            }
            if (foundTitle) { this.selectedSceneTitle = foundTitle; this.selectedSceneId = foundId || null; }
        }

        if (!this.selectedSceneTitle) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.setCssProps({ textAlign: "center" }); hint.setCssProps({ opacity: "0.6" });
            hint.innerText = "Please put cursor on scene content.";
            return;
        }

        const titleEl = container.createEl("h4");
        titleEl.innerText = `Backup of ${this.selectedSceneTitle}'`;
        titleEl.setCssProps({ color: "var(--text-accent)" }); titleEl.setCssProps({ marginBottom: "8px" });

        const btnSaveVersion = createIconButton(container, "save", "Save current version", {
            width: "100%",
            marginBottom: "15px",
            backgroundColor: "var(--interactive-accent)",
            color: "var(--text-on-accent)"
        });
        btnSaveVersion.onclick = () => {
            this.plugin.historyManager.saveVersion(view, () => { void this.parseAndRender(); });
        };

        if (!this.selectedSceneId) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.innerText = `「${this.selectedSceneTitle}」do not have an ID, cannot be load a backup. Please press sync button`;
            return;
        }

        const versions = await this.plugin.historyManager.getSceneVersions(this.selectedSceneId);

        if (versions.length === 0) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.innerText = "This scene do not have any backup. You may click save button above to create one.";
            return;
        }

        const list = container.createDiv({ cls: "ns-history-list" });
        for (const ver of versions) {
            const card = list.createDiv({ cls: "ns-history-card" });
            const header = card.createDiv({ cls: "ns-history-header" });
            header.innerText = ver.label;
            const actions = card.createDiv({ cls: "ns-history-actions" });




            const btnPreview = createIconButton(actions, "eye", "Preview");
            btnPreview.addClass("ns-history-btn", "ns-btn-preview");
            btnPreview.onclick = () => {

                void this.plugin.historyManager.showPreview(this.selectedSceneTitle, ver.label, ver.content);
            };


            const btnRestore = createIconButton(actions, "history", "Recover");
            btnRestore.addClass("ns-history-btn", "ns-btn-recover");
            btnRestore.onclick = () => {
                new SimpleConfirmModal(
                    this.plugin.app,
                    `Are you sure to recover version [${ver.label}]?\n\nThis will overwrite the current scene content in your editor. You can always use ctrl+z to undo if you make a mistake.`,
                    () => {
                        this.handleRestore(view, this.selectedSceneId, ver.content);
                    }
                ).open();
            };


            const btnDelete = createIconButton(actions, "trash-2", "");
            btnDelete.addClass("ns-history-btn", "ns-btn-delete");
            btnDelete.setAttribute("aria-label", "Delete backup");
            btnDelete.onclick = () => {
                new SimpleConfirmModal(
                    this.plugin.app,
                    `Are you sure to delete this backup version [${ver.label}]?\n\nThis action cannot be undone.`,
                    async () => {
                        await this.plugin.historyManager.deleteVersion(this.selectedSceneId, ver.label, () => {

                            void this.parseAndRender();
                        });
                    }
                ).open();
            };


        }
    }

    renderInfo(container: HTMLElement, view: MarkdownView) {
        const editor = view.editor;
        const cursor = editor.getCursor();
        let foundTitle = null;
        let startLine = -1;

        for (let i = cursor.line; i >= 0; i--) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######")) {


                foundTitle = cleanSceneTitle(line);


                startLine = i;
                break;
            }
        }

        if (!foundTitle || startLine === -1) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.setCssProps({ textAlign: "center" }); hint.setCssProps({ opacity: "0.6" });
            hint.innerText = "Please put cursor on scene content before scene info to be shown.";
            return;
        }

        const titleEl = container.createEl("h4");

        titleEl.setCssStyles({
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "var(--text-accent)",
            marginBottom: "12px",
            borderBottom: "1px solid var(--background-modifier-border)",
            paddingBottom: "8px"
        });


        const iconSpan = titleEl.createSpan();

        setIcon(iconSpan, "clapperboard");
        iconSpan.setCssStyles({
            display: "flex",
            alignItems: "center",
            opacity: "0.8"
        });


        titleEl.createSpan({ text: foundTitle });


        const metaLines: string[] = [];
        const lineCount = editor.lineCount();
        for (let i = startLine + 1; i < lineCount; i++) {
            const line = editor.getLine(i).trim();

            if (line.startsWith("######") || line.includes("++ FILE_ID")) break;

            if (line.startsWith(">")) {
                const cleanLine = line.substring(1).trim();

                if (cleanLine.startsWith("[!NSmith") || cleanLine.startsWith("[!info]")) continue;
                metaLines.push(cleanLine);
            } else if (line === "" && metaLines.length > 0) {
                metaLines.push("");
            } else if (line !== "" && metaLines.length > 0) {
                break;
            }
        }

        if (metaLines.length === 0 || metaLines.every(l => l === "")) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.setCssProps({ textAlign: "center" }); hint.setCssProps({ opacity: "0.6" });
            hint.innerText = "This scene do not have any info.";
            return;
        }


        const infoBox = container.createDiv({ cls: "ns-chapter-box" });
        infoBox.setCssProps({ backgroundColor: "var(--background-primary)" });

        metaLines.forEach(line => {
            if (line.trim() === "") {
                infoBox.createDiv({ text: " " }).setCssProps({ height: "10px" });
                return;
            }

            if (line.startsWith("- ") && line.includes("::")) {
                const parts = line.substring(2).split("::");
                const key = parts[0].trim();
                const value = parts.slice(1).join("::").trim();

                const row = infoBox.createDiv();
                row.setCssProps({ marginBottom: "8px" });
                row.setCssProps({ lineHeight: "1.5" });

                const keyEl = row.createSpan();
                keyEl.innerText = `${key} : `;
                keyEl.setCssProps({ fontWeight: "bold" });
                keyEl.setCssProps({ color: "var(--text-muted)" });

                const valEl = row.createSpan();
                valEl.innerText = value || " -- ";
                if (!value) valEl.setCssProps({ opacity: "0.5" });
            } else {
                // 普通筆記內容
                const row = infoBox.createDiv();
                row.innerText = line.replace(/^- /, "");
                row.setCssProps({ marginBottom: "6px" });
                row.setCssProps({ lineHeight: "1.5" });
            }
        });
    }





    handleRestore(view: MarkdownView, targetId: string, newContent: string) {
        const editor = view.editor;
        const lineCount = editor.lineCount();
        let startLine = -1; let endLine = lineCount;

        for (let i = 0; i < lineCount; i++) {
            if (editor.getLine(i).includes(targetId) && editor.getLine(i).trim().startsWith("######")) {
                startLine = i;
                break;
            }
        }
        if (startLine === -1) { new Notice("No scene is found in this file."); return; }
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

            //editor.setCursor({ line: lineNumber, ch: 0 });
            editor.scrollIntoView({ from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } }, true);
            //editor.focus();
        } else {
            new Notice("Can't find the file, please click on the editor zone.");
        }
    }

    saveChanges(container: HTMLElement, view: MarkdownView) {
        if (!view) return;

        const liveText = view.editor.getValue();
        const liveTree = this.parseDocument(liveText);

        // =========================================================
        // 🚨 Prevention 2A：word disappear prevention 
        // =========================================================
        let liveSceneCount = 0;
        liveTree.forEach(ch => liveSceneCount += ch.scenes.length);
        const domScenes = container.querySelectorAll(".ns-scene-card");

        if (liveSceneCount !== domScenes.length) {
            new Notice("No new content in this draft, cancel this drag to protect draft content.");
            void this.parseAndRender();
            return;
        }

        new Notice("Re-organizing...");

        // =========================================================
        // 🛡️ Prevention 2B：Safe Key Map
        // =========================================================
        const liveSceneMap = new Map<string, string>();
        const liveChapterPreambleMap = new Map<string, string>();
        let rootPreamble = "";

        const liveNameCount = new Map<string, number>();

        liveTree.forEach(ch => {
            if (ch.name === "root") {
                rootPreamble = ch.preamble;
            } else {
                liveChapterPreambleMap.set(ch.name, ch.preamble);
            }

            ch.scenes.forEach(sc => {

                let key = sc.id;
                if (!key) {
                    const count = liveNameCount.get(sc.name) || 0;
                    key = `NO_ID_${sc.name}_${count}`;
                    liveNameCount.set(sc.name, count + 1);
                }
                liveSceneMap.set(key, sc.content);
            });
        });

        // =========================================================
        // 🧱 Re-organize draft base on new DOM order
        // =========================================================
        const chunks: string[] = [];
        if (this.docYaml.trim()) chunks.push(this.docYaml.trim());

        const chapterBoxes = container.querySelectorAll(".ns-chapter-box");

        chapterBoxes.forEach((box) => {
            const el = box as HTMLElement;
            const chName = el.dataset.name;


            if (chName === "root") {
                if (rootPreamble.trim()) chunks.push(rootPreamble.trim());
            } else if (chName && chName !== "root") {
                chunks.push(`# 📄 ${chName}\n<span class="ns-file-id">++ FILE_ID: ${chName} ++</span>`);
                const chPreamble = liveChapterPreambleMap.get(chName) || "";
                if (chPreamble.trim()) chunks.push(chPreamble.trim());
            }


            const scenes = el.querySelectorAll(".ns-scene-card");
            scenes.forEach((sc) => {
                const scEl = sc as HTMLElement;
                const safeKey = scEl.dataset.safeKey;

                const content = safeKey ? liveSceneMap.get(safeKey) : null;

                if (content && content.trim()) {
                    chunks.push(content.trimEnd());
                } else {
                    // fall back to old content from WeakMap
                    const fallbackContent = this.sceneContentMap.get(scEl);
                    if (fallbackContent) chunks.push(fallbackContent.trimEnd());
                }
            });
        });

        // =========================================================
        // ✍️ refresh editor
        // =========================================================
        const finalText = chunks.join("\n\n") + "\n";

        replaceEntireDocument(view.editor, finalText);

        this.lastOutlineHash = "";
        void this.parseAndRender();
    }


    // ==========================================
    // 🔥 Change Scene card color
    // ==========================================
    changeSceneColor(view: MarkdownView, lineNumber: number, newColorId: string) {
        const editor = view.editor;
        const lineText = editor.getLine(lineNumber);

        // 1. change data-color rom title
        let newLine = "";
        if (lineText.includes('data-color="')) {
            newLine = lineText.replace(/data-color="[^"]*"/, `data-color="${newColorId}"`);
        } else if (lineText.includes('data-scene-id="')) {
            newLine = lineText.replace(/"><\/span>/, `" data-color="${newColorId}"></span>`);
        } else {
            new Notice("No scene ID, color cannot be assigned. Please press sync.");
            return;
        }
        editor.setLine(lineNumber, newLine);


        for (let i = lineNumber + 1; i <= lineNumber + 2 && i < editor.lineCount(); i++) {
            const nextLine = editor.getLine(i);
            if (nextLine.startsWith("> [!NSmith")) {
                const calloutType = newColorId === "default" ? "NSmith" : `NSmith-${newColorId}`;

                const updatedCallout = nextLine.replace(/> \[!NSmith[^\]]*\]/, `> [!${calloutType}]`);
                editor.setLine(i, updatedCallout);
                break;
            }
        }

        new Notice(`Color updated`);
        this.lastOutlineHash = "";
        this.plugin.sceneManager.scheduleGenerateDatabase();
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


                const uuid = extractSceneId(trimLine) || "";
                const cleanName = cleanSceneTitle(trimLine);
                const colorId = extractSceneColor(trimLine);

                currentScene = { id: uuid, rawHeader: trimLine, name: cleanName.trim(), content: line + "\n", lineNumber: i, type: 'scene', colorId: colorId };
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