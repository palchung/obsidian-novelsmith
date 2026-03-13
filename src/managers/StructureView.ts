import { ItemView, WorkspaceLeaf, MarkdownView, Notice, Menu, setIcon, MarkdownRenderer, TFolder, TFile } from 'obsidian';
import Sortable from 'sortablejs';
import NovelSmithPlugin from '../../main';
import { SimpleConfirmModal, DashboardBuilderModal, CorkboardModal, CorkboardDraftActionModal } from '../modals';
import { getAnchorSceneIdFromCursor, createIconButton, isScriveningsDraft, replaceEntireDocument, extractSceneId, cleanSceneTitle, DRAFT_FILENAME, extractSceneColor, getColorById, SCENE_COLORS } from '../utils';


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


    // 🔥 Performance Optimization: Prevent Refresh from swallowing the user's latest typing
    private pendingRefresh: boolean = false;

    // 🔥 Performance Optimization：Use WeakMap.
    private sceneContentMap = new WeakMap<HTMLElement, string>();
    private chapterPreambleMap = new WeakMap<HTMLElement, string>();




    private lastOutlineHash: string = "";


    private isMenuClicking: boolean = false;
    private renderTimer: number | null = null;


    private currentWikiFile: TFile | null = null;
    private wikiUpdateTimer: number | null = null;


    private activeWikiNoteToRestore: { name: string, folder: string } | null = null;


    private lastInfoTitle: string | null = null;
    private lastInfoHash: string = "";

    // 🔥 Sprint Mode Variables
    private isSprinting: boolean = false;
    private sprintRemainingSeconds: number = 0;
    private sprintStartLength: number = 0;
    private sprintTimerInterval: number | null = null;
    private sprintDropsEarned: number = 0;



    private activeTab: 'outline' | 'history' | 'info' = 'outline';
    private lastTab: string = "";
    private lastDraftMode: boolean = false;
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

    async onOpen() {
        void this.refresh();
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf && leaf.view instanceof MarkdownView) {
                this.lastOutlineHash = "";
                void this.parseAndRender();
            }
        }));
        this.registerEvent(this.app.workspace.on('editor-change', (editor) => {
            // 🌟 SPRINT INTERCEPTOR: 如果衝刺緊，只更新數字，絕對唔刷新大綱！
            if (this.isSprinting) {
                this.sprintDropsEarned = Math.max(0, editor.getValue().length - this.sprintStartLength);
                const dropsEl = this.contentEl.querySelector(".ns-sprint-drops");
                if (dropsEl) dropsEl.textContent = `+ ${this.sprintDropsEarned} Drops`;
                return;
            }

            if (this.activeTab === 'outline') {
                if (this.renderTimer) window.clearTimeout(this.renderTimer);
                this.renderTimer = window.setTimeout(() => { void this.parseAndRender(); }, 500);
            }
        }));

        this.registerEvent(this.app.vault.on('modify', (file) => {

            if (file instanceof TFile && this.activeTab === 'info' && this.currentWikiFile && file.path === this.currentWikiFile.path) {


                if (this.wikiUpdateTimer) window.clearTimeout(this.wikiUpdateTimer);


                this.wikiUpdateTimer = window.setTimeout(() => {
                    void (async () => {
                        const container = this.contentEl.querySelector(".ns-wiki-content-wrapper");
                        if (container && this.currentWikiFile) {
                            container.empty();

                            const content = await this.app.vault.read(this.currentWikiFile);
                            const contentDiv = container.createDiv("markdown-rendered");
                            contentDiv.setCssStyles({ padding: "0 5px", fontSize: "0.95em" });

                            void MarkdownRenderer.render(this.app, content, contentDiv, this.currentWikiFile.path, this);
                        }
                    })();
                }, 1000);
            }
        }));

        // 🔋 iPad 終極慳電版：全域游標監聽器 (加入重度節流閥)
        let cursorTimer: number | null = null;

        const handleCursorMove = () => {
            // 只有當打開咗需要游標嘅面板，先至消耗 CPU 資源！
            if (this.activeTab === 'history' || this.activeTab === 'info') {
                if (cursorTimer) window.clearTimeout(cursorTimer);
                // 延遲 400ms，確保用家真係停低咗先去解析文稿
                cursorTimer = window.setTimeout(() => {
                    void this.parseAndRender();
                }, 400);
            }
        };

        this.registerDomEvent(document, 'mouseup', (e: MouseEvent) => {
            if (this.contentEl.contains(e.target as Node)) return; // 點擊面板自己唔理
            handleCursorMove();
        });

        this.registerDomEvent(document, 'keyup', (e: KeyboardEvent) => {
            // 只監聽方向鍵
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                handleCursorMove();
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
            const activeFile = this.app.workspace.getActiveFile();


            if (this.activeTab === 'info' && this.currentWikiFile && activeFile && activeFile.path === this.currentWikiFile.path) {
                return;
            }

            const container = this.contentEl.querySelector(".ns-structure-container");
            if (!container) return;


            // 🌟 變身魔法：如果衝刺緊，清空大綱，畫出巨大時鐘，直接 return！
            if (this.isSprinting) {
                container.empty();
                this.renderSprintUI(container);
                return;
            }



            const view = this.getValidMarkdownView();

            if (view && this.activeTab === 'outline') {
                const editor = view.editor;


                const text = editor.getValue();


                const matches = text.match(/^(?:# 📄|######|> \[!NSmith|> -).*$/gm);


                const hashBuilder = matches ? matches.join("|") : "";


                if (hashBuilder === this.lastOutlineHash) return;
                this.lastOutlineHash = hashBuilder;
            }



            if (view && this.activeTab === 'info') {
                const editor = view.editor;
                const cursor = editor.getCursor();
                let foundTitle = null;
                let startLine = -1;

                // look for title
                for (let i = cursor.line; i >= 0; i--) {
                    const line = editor.getLine(i);
                    if (line.trim().startsWith("######")) {
                        foundTitle = cleanSceneTitle(line);
                        startLine = i;
                        break;
                    }
                }

                // look for attributes
                if (foundTitle && startLine !== -1) {
                    const metaLines: string[] = [];
                    for (let i = startLine + 1; i < editor.lineCount(); i++) {
                        const line = editor.getLine(i).trim();
                        if (line.startsWith("######") || line.includes("++ FILE_ID")) break;
                        if (line.startsWith(">")) {
                            const cleanLine = line.substring(1).trim();
                            if (cleanLine.startsWith("[!NSmith") || cleanLine.startsWith("[!info]")) continue;
                            metaLines.push(cleanLine);
                        } else if (line !== "" && metaLines.length > 0) {
                            break;
                        }
                    }
                    const currentInfoHash = metaLines.join("|");


                    if (this.lastInfoTitle === foundTitle && this.lastInfoHash === currentInfoHash) {
                        return;
                    }
                    this.lastInfoTitle = foundTitle;
                    this.lastInfoHash = currentInfoHash;
                } else {
                    if (this.lastInfoTitle === null) return;
                    this.lastInfoTitle = null;
                    this.lastInfoHash = "";
                }
            }







            // ==========================================
            // 🚀 神級優化：防止頻繁清空整個側邊欄 (DOM Reuse)
            // ==========================================
            let header = container.querySelector(":scope > .ns-control-header");
            let contentDiv = container.querySelector(":scope > .ns-tab-content");

            const isDraftMode = view && view.file && view.file.name === DRAFT_FILENAME;
            const draftModeChanged = this.lastDraftMode !== !!isDraftMode;

            // 🌟 當「切換 Tab」、第一次載入、或「進出草稿模式」時，強制重畫頂部按鈕！
            if (!header || !contentDiv || this.lastTab !== this.activeTab || draftModeChanged) {
                container.empty();
                this.renderHeader(container, view);
                contentDiv = container.createDiv({ cls: "ns-tab-content" });
                contentDiv.setCssStyles({ marginTop: "10px" });
                this.lastTab = this.activeTab;
                this.lastDraftMode = !!isDraftMode; // 更新狀態

                this.sortables.forEach(s => s.destroy());
                this.sortables = [];
            }



            if (!view) {
                contentDiv.empty();
                contentDiv.setText("Please open a draft");
                return;
            }

            // 🌟 將重用嘅 contentDiv 交畀對應嘅函數做局部更新！
            if (this.activeTab === 'outline') {
                this.renderOutline(contentDiv, view);
            }
            else if (this.activeTab === 'info') {
                contentDiv.empty(); // Info 暫時保留清空重畫
                this.renderInfo(contentDiv, view);
            }
            else {
                contentDiv.empty(); // History 暫時保留清空重畫
                await this.renderHistory(contentDiv, view);
            }

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
        const isDraftMode = view && view.file && view.file.name === DRAFT_FILENAME;

        const isArchivedDraft = (file: unknown, content: string) => {
            return file.name !== DRAFT_FILENAME && (isScriveningsDraft(content));
        };

        // =========================================================
        // 🌟 Row 1: 全域模式與存檔 (Sync | Corkboard | Scrivenings/Discard)
        // =========================================================
        const row1 = header.createDiv({ cls: "ns-button-row" });
        row1.setCssStyles({ marginBottom: "5px" });

        // 1. 👈 左邊：同步 (Sync) 掣 
        const btnSave = createIconButton(row1, "save", "Sync", { backgroundColor: "var(--interactive-accent)", color: "var(--text-on-accent)" });
        btnSave.onclick = async () => {
            const currentView = this.getValidMarkdownView(); // 🌟 即時獲取最新視窗
            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                btnSave.classList.add("ns-btn-flash");
                const originalText = btnSave.innerText;
                btnSave.innerText = "Syncing...";
                btnSave.disabled = true;

                try {
                    if (isArchivedDraft(currentView.file, currentView.editor.getValue())) {
                        new Notice("Draft saved.");
                    } else {
                        await this.plugin.executeSmartSave(currentView);
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

        // 2. 🎯 中間：軟木板 (Corkboard) 掣
        const btnCorkboard = createIconButton(row1, "layout-dashboard", "Corkboard", { backgroundColor: "var(--interactive-normal)" });
        btnCorkboard.onclick = async () => {
            const currentView = this.getValidMarkdownView(); // 🌟 即時獲取最新視窗
            if (!currentView || !this.plugin.checkInBookFolder(currentView.file)) return;

            const currentFile = currentView.file;
            const currentFolder = currentFile.parent;
            const workingFolderPath = currentFolder ? currentFolder.path : this.plugin.settings.bookFolderPath;
            const draftPath = workingFolderPath === "/" ? `/${DRAFT_FILENAME}` : `${workingFolderPath}/${DRAFT_FILENAME}`;
            const draftFile = this.plugin.app.vault.getAbstractFileByPath(draftPath);

            if (draftFile && draftFile instanceof TFile) {
                new CorkboardDraftActionModal(
                    this.plugin.app,
                    async () => {
                        new Notice("Syncing draft...", 2000);
                        let anchorSceneId: string | null = null;
                        if (currentFile.name.endsWith(".md")) anchorSceneId = getAnchorSceneIdFromCursor(currentView.editor);
                        await this.plugin.scrivenerManager.syncBack(draftFile, currentFolder);
                        this.plugin.sceneManager.scheduleGenerateDatabase();
                        new CorkboardModal(this.plugin, anchorSceneId, workingFolderPath, true).open();
                    },
                    async () => {
                        new Notice("Discarding draft...", 2000);
                        await this.plugin.scrivenerManager.discardDraft(draftFile);
                        new CorkboardModal(this.plugin, null, workingFolderPath, false).open();
                    }
                ).open();
            } else {
                const anchorSceneId = getAnchorSceneIdFromCursor(currentView.editor);
                new CorkboardModal(this.plugin, anchorSceneId, workingFolderPath, false).open();
            }
        };

        // 3. 👉 右邊：串聯模式 (Scrivenings) OR 捨棄草稿 (Discard)
        if (isDraftMode) {
            const btnDiscard = createIconButton(row1, "trash-2", "Discard", { backgroundColor: "var(--background-modifier-error)", color: "white" });
            btnDiscard.onclick = () => {
                const currentView = this.getValidMarkdownView(); // 🌟 即時獲取最新視窗
                if (currentView) {
                    new SimpleConfirmModal(
                        this.plugin.app,
                        "Are you sure to discard this darft?\n\nWill close & delete this file, all your word will not be synced",
                        () => { void this.plugin.scrivenerManager.discardDraft(currentView.file); }
                    ).open();
                }
            };
        } else {
            const btnScrivenings = createIconButton(row1, "book-open", "Scrivenering");
            btnScrivenings.onclick = () => {
                const currentView = this.getValidMarkdownView(); // 🌟 即時獲取最新視窗
                if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                    const content = currentView.editor.getValue();
                    if (isArchivedDraft(currentView.file, content)) {
                        new Notice("Abort: this is a archived draft, scrivenering may cause infinite loop.");
                    } else {
                        const folder = currentView.file.parent;
                        if (folder) {
                            void this.plugin.sceneManager.assignIDsToAllFiles(folder).then(() => {
                                // 🌟 將 currentView.file 傳入，完美解決 "Please open a file first" Bug！
                                void this.plugin.scrivenerManager.toggleScrivenings(currentView.file);
                            });
                        }
                    }
                }
            };
        }

        // =========================================================
        // 🌟 Row 2: 結構編輯與工具 (Micro Actions)
        // =========================================================
        const row2 = header.createDiv({ cls: "ns-button-row" });

        const btnInsert = createIconButton(row2, "file-plus", "Scene");
        btnInsert.onclick = () => {
            const currentView = this.getValidMarkdownView(); // 🌟 即時獲取最新視窗
            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                if (isArchivedDraft(currentView.file, currentView.editor.getValue())) {
                    new Notice("This is a archived draft, please return to your working file to insert scene card.");
                    return;
                }
                void this.plugin.plotManager.insertSceneCard(currentView);
            }
        };

        const btnSplit = createIconButton(row2, "scissors", "Split");
        btnSplit.onclick = () => {
            const currentView = this.getValidMarkdownView();
            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                if (isArchivedDraft(currentView.file, currentView.editor.getValue())) {
                    new Notice("This is archived draft, please don't split scene here.");
                    return;
                }
                void this.plugin.plotManager.splitScene(currentView);
            }
        };

        const btnMerge = createIconButton(row2, "combine", "Merge");
        btnMerge.onclick = () => {
            const currentView = this.getValidMarkdownView();
            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                if (isArchivedDraft(currentView.file, currentView.editor.getValue())) {
                    new Notice("This is archived draft, please don't merge scene here.");
                    return;
                }
                this.plugin.plotManager.mergeScene(currentView);
            }
        };

        const btnTools = createIconButton(row2, "wrench", "Tools");
        btnTools.onclick = (e: MouseEvent) => {
            const currentView = this.getValidMarkdownView(); // 🌟 即時獲取最新視窗
            if (!currentView) return;

            const isInBookFolder = this.plugin.checkInBookFolderSilent(currentView.file);
            const menu = new Menu();



            menu.addItem((item) => {
                item.setTitle("Writer's journey").setIcon("trophy").onClick(() => {
                    import('../modals').then(({ StatsDashboardModal }) => { new StatsDashboardModal(this.plugin).open(); });
                });
            });

            menu.addItem((item) => {
                item.setTitle("Focus sprint").setIcon("timer").onClick(() => {
                    import('../modals').then(({ SprintSetupModal }) => {
                        new SprintSetupModal(this.plugin.app, (mins) => { this.startSprint(mins, currentView); }).open();
                    });
                });
            });


            menu.addSeparator();

            if (isInBookFolder) {
                menu.addItem((item) => { item.setTitle("Auto wiki").setIcon("book").onClick(() => { void this.plugin.wikiManager.scanAndCreateWiki(currentView); }); });
                menu.addItem((item) => { item.setTitle("Typo correction").setIcon("pencil").onClick(() => { void this.plugin.writingManager.correctNames(currentView); }); });
                menu.addSeparator();
                menu.addItem((item) => { item.setTitle("Dialogue mode").setIcon("message-circle").onClick(() => { this.plugin.writingManager.toggleDialogueMode(currentView); }); });
                menu.addItem((item) => { item.setTitle("Redundant mode").setIcon("search").onClick(() => { void this.plugin.writingManager.toggleRedundantMode(currentView); }); });
                menu.addSeparator();
                menu.addItem((item) => { item.setTitle("Clean draft").setIcon("eraser").onClick(() => { this.plugin.writingManager.cleanDraft(currentView); }); });
                if (!isDraftMode) {
                    menu.addItem((item) => {
                        item.setTitle("Compile draft").setIcon("file-output").onClick(() => {
                            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                                this.plugin.compilerManager.openCompileModal(currentView);
                            }
                        });
                    });
                }
                menu.addSeparator();
            }

            menu.addItem((item) => {
                item.setTitle("Insert dashboard").setIcon("bar-chart-3").onClick(async () => {
                    const availableAttributes = await this.plugin.dashboardManager.getAvailableAttributes();
                    if (availableAttributes.length === 0) return;
                    new DashboardBuilderModal(this.plugin.app, availableAttributes, (config) => {
                        const generatedCode = this.plugin.dashboardManager.generateDashboardCode(config);
                        currentView.editor.replaceSelection(generatedCode + "\n\n");
                        new Notice("Dashboard inserted!");
                    }).open();
                });
            });

            menu.showAtMouseEvent(e);
        };

        // =========================================================
        // 🌟 Row 3: 導航分頁 (Tabs)
        // =========================================================
        const tabsRow = header.createDiv({ cls: "ns-tabs-row" });

        const tabOutline = createIconButton(tabsRow, "list-tree", "Outline");
        tabOutline.className = "ns-tab-btn" + (this.activeTab === 'outline' ? " is-active" : "");
        tabOutline.onclick = () => { this.activeTab = 'outline'; this.lastOutlineHash = ""; void this.parseAndRender(); };

        const tabInfo = createIconButton(tabsRow, "info", "Info");
        tabInfo.className = "ns-tab-btn" + (this.activeTab === 'info' ? " is-active" : "");
        tabInfo.onclick = () => {
            this.activeTab = 'info';
            this.activeWikiNoteToRestore = null;
            this.currentWikiFile = null;
            this.lastInfoTitle = null;
            this.lastInfoHash = "";
            void this.parseAndRender();
        };

        const tabHistory = createIconButton(tabsRow, "history", "Backup");
        tabHistory.className = "ns-tab-btn" + (this.activeTab === 'history' ? " is-active" : "");
        tabHistory.onclick = () => { this.activeTab = 'history'; void this.parseAndRender(); };
    }

    renderOutline(container: HTMLElement, view: MarkdownView) {
        const text = view.editor.getValue();
        if (!text.trim()) { container.setText("This file is empty"); return; }

        // 1. 處理頂部標題區 (只更新文字，不摧毀 DOM)
        let headerContainer = container.querySelector(".ns-outline-header");
        if (!headerContainer) {
            headerContainer = container.createDiv({ cls: "ns-outline-header" });
            const fName = headerContainer.createEl("h3");
            fName.setCssStyles({ marginTop: "0", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "8px", marginBottom: "10px" });
        }

        const fileNameEl = headerContainer.querySelector("h3") as HTMLElement;
        if (view.file && view.file.name === DRAFT_FILENAME) {
            if (fileNameEl.innerText !== "Scrivenering draft") fileNameEl.innerText = "Scrivenering draft";
            fileNameEl.setCssStyles({ color: "var(--interactive-accent)" });
        } else if (view.file) {
            if (fileNameEl.innerText !== view.file.basename) fileNameEl.innerText = `${view.file.basename}`;
            fileNameEl.setCssStyles({ color: "var(--text-accent)" });
        }

        const tree = this.parseDocument(text);

        if (tree.length === 0) {
            let emptyMsg = container.querySelector(".ns-empty-msg");
            if (!emptyMsg) container.createDiv({ text: "Chapter or scene ID do not found", cls: "ns-empty-msg" });
            return;
        }
        const existingEmptyMsg = container.querySelector(".ns-empty-msg");
        if (existingEmptyMsg) existingEmptyMsg.remove();

        // 2. 處理大綱主體區
        let bodyContainer = container.querySelector(".ns-outline-body");
        if (!bodyContainer) {
            bodyContainer = container.createDiv({ cls: "ns-outline-body" });
        }

        const renderNameCount = new Map<string, number>();

        // ==========================================
        // 🌟 DOM Diffing 魔法開始：只更新有變動嘅卡片！
        // ==========================================
        const existingChapters = Array.from(bodyContainer.querySelectorAll(":scope > .ns-chapter-box"));
        const chapterMap = new Map<string, HTMLElement>();
        existingChapters.forEach(ch => chapterMap.set(ch.dataset.name || "", ch));

        let chIndex = 0;
        tree.forEach((chapter) => {
            if (chapter.name === "root" && chapter.scenes.length === 0) return;

            let chapterBox = chapterMap.get(chapter.name);
            if (!chapterBox) {
                // 👉 情況 A：畫面上冇呢個章節，建立新嘅！
                chapterBox = document.createElement("div");
                chapterBox.className = "ns-chapter-box";
                chapterBox.dataset.name = chapter.name;

                if (chapter.name !== "root") {
                    const chCard = chapterBox.createDiv({ cls: "ns-chapter-card" });
                    chCard.innerText = `${chapter.name}`;
                }

                const sceneList = chapterBox.createDiv({ cls: "ns-scene-list" });
                this.sortables.push(new Sortable(sceneList, {
                    group: 'scenes', animation: 150, ghostClass: 'ns-sortable-ghost', dragClass: 'ns-sortable-drag',
                    delay: 100, delayOnTouchOnly: true,
                    onEnd: (evt: unknown) => {
                        if (evt.newIndex !== evt.oldIndex || evt.from !== evt.to) this.saveChanges(container, view);
                    }
                }));
            }

            // 確保 DOM 順序與 Markdown 結構一致
            bodyContainer.appendChild(chapterBox);
            chapterMap.delete(chapter.name); // 從刪除名單剔除

            this.chapterPreambleMap.set(chapterBox, chapter.preamble);

            if (chapter.name !== "root") {
                const chCard = chapterBox.querySelector(".ns-chapter-card");
                chCard.onclick = (e) => { e.stopPropagation(); e.preventDefault(); this.jumpToLine(chapter.lineNumber); };
            }

            const sceneList = chapterBox.querySelector(".ns-scene-list");
            sceneList.dataset.chapterIndex = chIndex.toString();

            // --- 處理 Scene Card (卡片層級比對) ---
            const existingScenes = Array.from(sceneList.querySelectorAll(":scope > .ns-scene-card"));
            const sceneMap = new Map<string, HTMLElement>();
            existingScenes.forEach(sc => sceneMap.set(sc.dataset.safeKey || "", sc));

            chapter.scenes.forEach((scene) => {
                let safeKey = scene.id;
                if (!safeKey) {
                    const count = renderNameCount.get(scene.name) || 0;
                    safeKey = `NO_ID_${scene.name}_${count}`;
                    renderNameCount.set(scene.name, count + 1);
                }

                let scCard = sceneMap.get(safeKey);
                if (!scCard) {
                    // 👉 全新場景卡片，即刻畫！
                    scCard = document.createElement("div");
                    scCard.className = "ns-scene-card";
                    scCard.dataset.safeKey = safeKey;
                    scCard.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" });

                    const titleContainer = scCard.createDiv({ cls: "ns-scene-title-container" });
                    titleContainer.setCssStyles({ display: "flex", alignItems: "flex-start", gap: "6px", flex: "1", minWidth: "0" });

                    const iconEl = titleContainer.createSpan({ cls: "ns-scene-icon" });
                    setIcon(iconEl, "clapperboard");
                    iconEl.setCssStyles({ opacity: "0.6", display: "flex", alignItems: "center", flexShrink: "0", marginTop: "2px" });

                    titleContainer.createSpan({ cls: "ns-scene-title-text" });

                    const colorBtn = scCard.createDiv();
                    setIcon(colorBtn, "palette");
                    colorBtn.setCssStyles({ cursor: "pointer", opacity: "0.3", marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0" });
                    colorBtn.addEventListener("mouseover", () => colorBtn.setCssProps({ opacity: "1" }));
                    colorBtn.addEventListener("mouseout", () => colorBtn.setCssProps({ opacity: "0.3" }));
                }

                // 👉 情況 B：畫面上已經有呢張卡，我哋只更新「有變動嘅資料」！
                scCard.dataset.sceneId = scene.id || "";
                scCard.dataset.sceneName = scene.name || "";

                // 處理顏色更新
                const colorObj = getColorById(scene.colorId);
                scCard.className = "ns-scene-card"; // Reset
                if (colorObj.cssClass) scCard.addClass(colorObj.cssClass);

                // 處理高亮狀態
                if (this.selectedSceneId === scene.id) {
                    scCard.setCssProps({ borderLeftWidth: "4px", filter: "brightness(0.9)" });
                } else {
                    scCard.setCssProps({ borderLeftWidth: "", filter: "" });
                }

                // 處理標題更新 (唔好盲目覆寫，避免浪費效能)
                const titleText = scCard.querySelector(".ns-scene-title-text");
                if (titleText.innerText !== scene.name) titleText.innerText = scene.name;

                // 重新綁定事件
                const colorBtn = scCard.querySelector(".lucide-palette")?.parentElement;
                if (colorBtn) {
                    colorBtn.onclick = (e) => {
                        e.stopPropagation();
                        const menu = new Menu();
                        SCENE_COLORS.forEach(c => {
                            menu.addItem((item) => {
                                item.setTitle(c.name).setIcon("lucide-palette").onClick(() => {
                                    this.isMenuClicking = true;
                                    this.changeSceneColor(view, scene.lineNumber, c.id);
                                    setTimeout(() => this.isMenuClicking = false, 200);
                                });
                            });
                        });
                        menu.showAtMouseEvent(e);
                    };
                }

                scCard.onclick = (e) => {
                    if (this.isMenuClicking) { e.stopPropagation(); e.preventDefault(); return; }
                    e.stopPropagation(); e.preventDefault();
                    this.selectedSceneId = scene.id || null;
                    this.selectedSceneTitle = scene.name;
                    this.jumpToLine(scene.lineNumber);
                    this.lastOutlineHash = "";
                    void this.parseAndRender();
                };

                this.sceneContentMap.set(scCard, scene.content); // 更新 WeakMap 內容
                sceneList.appendChild(scCard); // 確保順序
                sceneMap.delete(safeKey); // 從刪除名單剔除
            });

            // 👉 清除已經喺 Markdown 刪除咗嘅舊場景卡片
            sceneMap.forEach(sc => sc.remove());
            chIndex++;
        });

        // 👉 清除已經刪除咗嘅舊章節 (順手回收 Sortable 記憶體)
        chapterMap.forEach(ch => {
            const list = ch.querySelector(".ns-scene-list");
            if (list) {
                const sIndex = this.sortables.findIndex(s => s.el === list);
                if (sIndex > -1) {
                    this.sortables[sIndex].destroy();
                    this.sortables.splice(sIndex, 1);
                }
            }
            ch.remove();
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
        titleEl.innerText = `Backup of ${this.selectedSceneTitle}`;
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

    // =========================================================
    // Info Tab
    // =========================================================
    renderInfo(container: HTMLElement, view: MarkdownView) {
        const editor = view.editor;
        const cursor = editor.getCursor();
        let foundTitle = null;
        let startLine = -1;

        // 1. search current scene
        for (let i = cursor.line; i >= 0; i--) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######")) {
                foundTitle = cleanSceneTitle(line);
                startLine = i;
                break;
            }
        }

        if (!foundTitle || startLine === -1) {
            container.createDiv({ text: "Please put cursor on scene content before scene info to be shown.", cls: "ns-history-card", attr: { style: "text-align: center; opacity: 0.6;" } });
            return;
        }

        // 2. extract current scene Metadata
        const metaLines: string[] = [];
        const lineCount = editor.lineCount();
        for (let i = startLine + 1; i < lineCount; i++) {
            const line = editor.getLine(i).trim();
            if (line.startsWith("######") || line.includes("++ FILE_ID")) break;

            if (line.startsWith(">")) {
                const cleanLine = line.substring(1).trim();
                if (cleanLine.startsWith("[!NSmith") || cleanLine.startsWith("[!info]")) continue;
                metaLines.push(cleanLine);
            } else if (line !== "" && metaLines.length > 0) {
                break;
            }
        }





        // ==========================================
        // 🏗️ Info page layer
        // ==========================================
        const layer1 = container.createDiv({ cls: "ns-info-layer-list" });
        const layer2 = container.createDiv({ cls: "ns-info-layer-reader" });
        layer2.hide();

        // --- draw Layer 1：attribute layer ---
        const titleEl = layer1.createEl("h4");
        titleEl.setCssStyles({ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-accent)", marginBottom: "12px", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "8px" });
        const iconSpan = titleEl.createSpan();
        setIcon(iconSpan, "clapperboard");
        titleEl.createSpan({ text: foundTitle });

        const infoBox = layer1.createDiv({ cls: "ns-chapter-box" });
        infoBox.setCssStyles({ backgroundColor: "var(--background-secondary)", padding: "12px", borderRadius: "6px", border: "1px solid var(--background-modifier-border)" });

        if (metaLines.length === 0 || metaLines.every(l => l === "")) {
            infoBox.createDiv({ text: "No scene info to display", attr: { style: "opacity: 0.6; text-align: center; font-style: italic;" } });
            return;
        }

        metaLines.forEach(line => {
            if (line.trim() === "") {
                infoBox.createDiv({ text: " " }).setCssStyles({ height: "10px" });
                return;
            }

            if (line.startsWith("- ") && line.includes("::")) {
                const parts = line.substring(2).split("::");
                const key = parts[0].trim();
                const value = parts.slice(1).join("::").trim();

                const row = infoBox.createDiv();
                row.setCssStyles({ marginBottom: "8px", lineHeight: "1.5", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" });


                const keyEl = row.createSpan();
                keyEl.innerText = `${key} : `;
                keyEl.setCssStyles({ fontWeight: "bold", color: "var(--text-muted)" });


                const wikiCategory = this.plugin.settings.wikiCategories?.find(c => c.name.split(/[,，、]/).map(s => s.trim()).includes(key));

                if (wikiCategory && value) {

                    const rawItems = value.replace(/[\[\]]/g, '').split(/[,，、/|\\;；]+/).map(i => i.trim()).filter(i => i);

                    rawItems.forEach(item => {
                        const chip = row.createSpan({ text: item });
                        chip.setCssStyles({ padding: "2px 8px", backgroundColor: "var(--interactive-accent)", color: "var(--text-on-accent)", borderRadius: "10px", fontSize: "0.85em", cursor: "pointer", fontWeight: "bold", transition: "filter 0.2s" });
                        chip.addEventListener("mouseover", () => chip.setCssProps({ filter: "brightness(1.2)" }));
                        chip.addEventListener("mouseout", () => chip.setCssProps({ filter: "brightness(1)" }));


                        chip.onclick = () => this.openWikiNote(item, wikiCategory.folderPath, layer1, layer2);
                    });


                    const btnAll = row.createSpan();
                    setIcon(btnAll, "folder-open");
                    btnAll.setCssStyles({ cursor: "pointer", opacity: "0.5", marginLeft: "4px", display: "flex", alignItems: "center", padding: "2px" });
                    const primaryName = wikiCategory.name.split(/[,，、]/)[0].trim();
                    btnAll.title = `Search all ${primaryName}`;

                    btnAll.addEventListener("mouseover", () => { btnAll.setCssProps({ opacity: "1", color: "var(--interactive-accent)" }); });
                    btnAll.addEventListener("mouseout", () => { btnAll.setCssProps({ opacity: "0.5", color: "initial" }); });


                    btnAll.onclick = () => this.renderAllWikiItems(primaryName, wikiCategory.folderPath, layer1, layer2);

                } else {

                    const valEl = row.createSpan();
                    valEl.innerText = value || " -- ";
                    if (!value) valEl.setCssStyles({ opacity: "0.5" });
                }
            } else {

                const row = infoBox.createDiv();
                row.innerText = line.replace(/^- /, "");
                row.setCssStyles({ marginBottom: "6px", lineHeight: "1.5" });
            }
        });


        if (this.activeWikiNoteToRestore) {
            void this.openWikiNote(this.activeWikiNoteToRestore.name, this.activeWikiNoteToRestore.folder, layer1, layer2);
        }


    }



    // =========================================================
    // Lazy Loading 
    // =========================================================
    async openWikiNote(noteName: string, folderPath: string, layer1: HTMLElement, layer2: HTMLElement) {

        this.activeWikiNoteToRestore = { name: noteName, folder: folderPath };

        layer1.hide();
        layer2.show();
        layer2.empty();

        const headerRow = layer2.createDiv();
        headerRow.setCssStyles({ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "10px" });

        const btnBack = createIconButton(headerRow, "arrow-left", "");
        btnBack.setCssStyles({ padding: "4px 8px" });
        btnBack.onclick = () => {
            layer2.hide();
            layer1.show();
            this.currentWikiFile = null;

            this.activeWikiNoteToRestore = null;


        };

        headerRow.createEl("h3", { text: noteName, attr: { style: "margin: 0; color: var(--interactive-accent);" } });

        // 🌟 精準路徑狙擊 (防止同名檔案開錯)
        const exactPath = folderPath ? `${folderPath}/${noteName}.md` : `${noteName}.md`;
        let file: TFile | null = this.app.vault.getAbstractFileByPath(exactPath) as TFile | null;
        if (!file || !(file instanceof TFile)) {
            file = this.app.metadataCache.getFirstLinkpathDest(noteName, folderPath || ""); // 備用方案
        }

        if (file) {
            const btnEdit = createIconButton(headerRow, "pencil", "");
            btnEdit.title = "在編輯器中修改此設定";
            btnEdit.setCssStyles({ padding: "4px 8px", opacity: "0.6" });


            btnEdit.addEventListener("mouseover", () => btnEdit.setCssProps({ opacity: "1", color: "var(--interactive-accent)" }));
            btnEdit.addEventListener("mouseout", () => btnEdit.setCssProps({ opacity: "0.6", color: "initial" }));


            btnEdit.onclick = () => {
                const leaf = this.app.workspace.getLeaf('split', 'vertical');
                void leaf.openFile(file);
            };
        }

        if (file) {
            this.currentWikiFile = file;


            const contentWrapper = layer2.createDiv({ cls: "ns-wiki-content-wrapper" });


            const content = await this.app.vault.read(file);
            const contentDiv = contentWrapper.createDiv("markdown-rendered");
            contentDiv.setCssStyles({ padding: "0 5px", fontSize: "0.95em" });
            void MarkdownRenderer.render(this.app, content, contentDiv, file.path, this);
        } else {
            this.currentWikiFile = null;
            layer2.createDiv({ text: `Cannot find「${noteName}」, please press Autowiki first.`, attr: { style: "color: var(--text-error);" } });
        }
    }

    // =========================================================
    // 📂 View all categories
    // =========================================================
    async renderAllWikiItems(categoryName: string, folderPath: string, layer1: HTMLElement, layer2: HTMLElement) {
        layer1.hide();
        layer2.show();
        layer2.empty();

        const headerRow = layer2.createDiv();
        headerRow.setCssStyles({ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "10px" });

        const btnBack = createIconButton(headerRow, "arrow-left", "");
        btnBack.onclick = () => { layer2.hide(); layer1.show(); };

        headerRow.createEl("h4", { text: `All ${categoryName}`, attr: { style: "margin: 0;" } });

        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (folder && folder instanceof TFolder) {
            const files = folder.children.filter(f => f instanceof TFile && f.extension === "md");

            if (files.length === 0) {
                layer2.createDiv({ text: "Empty folder" });
                return;
            }

            const list = layer2.createDiv();
            files.forEach(f => {
                const item = list.createDiv({ text: `📄 ${f.basename}` });
                item.setCssStyles({ padding: "8px", borderBottom: "1px solid var(--background-modifier-border)", cursor: "pointer", transition: "background-color 0.2s" });
                item.addEventListener("mouseover", () => item.setCssProps({ backgroundColor: "var(--background-secondary)" }));
                item.addEventListener("mouseout", () => item.setCssProps({ backgroundColor: "transparent" }));
                item.onclick = () => this.openWikiNote(f.basename, folderPath, layer1, layer2); // 點擊深入閱讀
            });
        } else {
            layer2.createDiv({ text: "cannot find folder, please confirm folder path in setting." });
        }
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
                chunks.push(`# 📄 ${chName} <span class="ns-chapter-center"></span>\n<span class="ns-file-id">++ FILE_ID: ${chName} ++</span>`);
                const chPreamble = liveChapterPreambleMap.get(chName) || "";
                if (chPreamble.trim()) chunks.push(chPreamble.trim());
            }


            const scenes = el.querySelectorAll(".ns-scene-card");
            let hasConflict = false; // 🛑 衝突標記

            for (const sc of Array.from(scenes)) {
                const scEl = sc as HTMLElement;
                const safeKey = scEl.dataset.safeKey;

                const content = safeKey ? liveSceneMap.get(safeKey) : null;

                if (content && content.trim()) {
                    chunks.push(content.trimEnd());
                } else {
                    // 🚨 致命危險：畫面同編輯器內容脫節！
                    // 絕對唔可以盲目用 fallbackContent 覆寫，會導致用家最新打嘅字遺失！
                    console.error("Sync conflict! Missing live content for key:", safeKey);
                    hasConflict = true;
                    break; // 停止處理呢個章節
                }
            }

            // 🛑 如果發現任何一張卡片對唔上，即刻中斷成個 Drag & Drop 儲存過程！
            if (hasConflict) {
                new Notice("Outline sync conflict! Drag cancelled to protect your latest typing.", 4000);
                this.parseAndRender(); // 強制重新讀取最新文字
                return; // 直接中止，唔好替換文稿！
            }
        });

        // =========================================================
        // ✍️ refresh editor
        // =========================================================
        const finalText = chunks.join("\n\n") + "\n";

        replaceEntireDocument(view.editor, finalText);

        this.lastOutlineHash = "";
        void this.parseAndRender();

        // 🌟 1. 自動觸發 Smart Save，確保新卡片即時獲得 ID
        void this.plugin.executeSmartSave(view);

        // 🌟 2. 給予大綱整理獎勵 (傳入 0 滴字數，但系統會自動 +10 分 Action Point)
        void this.plugin.statsManager.recordActivity(0);
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
                // 🌟 清除置中標籤，還原乾淨檔名
                const cleanName = trimLine.replace("# 📄", "").replace('<span class="ns-chapter-center"></span>', "").trim();
                currentChapter = { id: trimLine, name: cleanName, preamble: '', lineNumber: i, scenes: [], type: 'chapter' };
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

    // =========================================================
    // ⏱️ Sprint Engine Core
    // =========================================================
    startSprint(minutes: number, view: MarkdownView) {
        this.isSprinting = true;
        this.sprintRemainingSeconds = minutes * 60;
        this.sprintStartLength = view.editor.getValue().length;
        this.sprintDropsEarned = 0;

        this.lastOutlineHash = ""; // 強制刷新畫面
        void this.parseAndRender();

        if (this.sprintTimerInterval) window.clearInterval(this.sprintTimerInterval);

        // 每一秒鐘扣一秒
        this.sprintTimerInterval = window.setInterval(() => {
            this.sprintRemainingSeconds--;
            if (this.sprintRemainingSeconds <= 0) {
                this.endSprint(false);
            } else {
                const timerEl = this.contentEl.querySelector(".ns-sprint-timer");
                if (timerEl) {
                    const m = Math.floor(this.sprintRemainingSeconds / 60).toString().padStart(2, '0');
                    const s = (this.sprintRemainingSeconds % 60).toString().padStart(2, '0');
                    timerEl.textContent = `${m}:${s}`;
                }
            }
        }, 1000);
    }

    endSprint(early: boolean) {
        if (this.sprintTimerInterval) window.clearInterval(this.sprintTimerInterval);
        this.isSprinting = false;

        if (!early) {
            new Notice(`🎉 Sprint Finished! You earned ${this.sprintDropsEarned} ink drops!`, 8000);
            // 觸發自動儲存，將字數正式寫入熱力圖！
            const view = this.getValidMarkdownView();
            if (view) void this.plugin.executeSmartSave(view);
        } else {
            new Notice("Sprint cancelled.", 3000);
        }

        this.lastOutlineHash = "";
        void this.parseAndRender();
    }

    renderSprintUI(container: HTMLElement) {
        const sprintBox = container.createDiv({ cls: "ns-sprint-container" });
        sprintBox.createEl("h3", { text: "Focus mode", attr: { style: "color: var(--color-orange); margin-bottom: 30px;" } });

        const m = Math.floor(this.sprintRemainingSeconds / 60).toString().padStart(2, '0');
        const s = (this.sprintRemainingSeconds % 60).toString().padStart(2, '0');

        sprintBox.createDiv({ cls: "ns-sprint-timer", text: `${m}:${s}` });
        sprintBox.createDiv({ cls: "ns-sprint-drops", text: `+ ${this.sprintDropsEarned} Drops` });
        sprintBox.createDiv({ cls: "ns-sprint-message", text: "Don't look back. Keep writing." });

        const btnStop = sprintBox.createEl("button", { text: "Give up", cls: "mod-warning" });
        btnStop.setCssStyles({ marginTop: "auto" });
        btnStop.onclick = () => {
            new SimpleConfirmModal(this.plugin.app, "Give up on this sprint?", () => {
                this.endSprint(true);
            }).open();
        }
    }

    // =========================================================
    // 🧹 防死機大掃除 (清除所有背景計時器，防止記憶體洩漏)
    // =========================================================
    async onClose() {
        // 1. 清除大綱重新渲染計時器
        if (this.renderTimer) {
            window.clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }

        // 2. 清除側滑 Wiki 筆記更新計時器
        if (this.wikiUpdateTimer) {
            window.clearTimeout(this.wikiUpdateTimer);
            this.wikiUpdateTimer = null;
        }

        // 3. 🚨 最重要：清除番茄鐘倒數器！
        if (this.sprintTimerInterval) {
            window.clearInterval(this.sprintTimerInterval);
            this.sprintTimerInterval = null;
        }

        // 4. 強制解除衝刺狀態
        this.isSprinting = false;

        // 5. 清空畫面
        this.contentEl.empty();
    }

}