import { ItemView, WorkspaceLeaf, MarkdownView, Notice, Menu, setIcon, MarkdownRenderer, TFolder, TFile, TAbstractFile } from 'obsidian';
import Sortable, { SortableEvent } from 'sortablejs';
import NovelSmithPlugin from '../../main';
import { SimpleConfirmModal, DashboardBuilderModal, CorkboardModal, CorkboardDraftActionModal } from '../modals';
import { getAnchorSceneIdFromCursor, createIconButton, isScriveningsDraft, extractSceneId, cleanSceneTitle, DRAFT_FILENAME, extractSceneColor, getColorById, SCENE_COLORS, getManuscriptFiles, parseContent } from '../utils';

export const VIEW_TYPE_STRUCTURE = "novelsmith-structure-view";

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
    fileIdTag?: string;
}

export class StructureView extends ItemView {
    plugin: NovelSmithPlugin;
    private sortables: Sortable[] = [];
    private targetUpdateTimer: number | null = null;
    private docYaml: string = "";
    private isRefreshing: boolean = false;
    private eventsRegistered: boolean = false;
    private pendingRefresh: boolean = false;

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

    private isSprinting: boolean = false;
    private sprintRemainingSeconds: number = 0;
    private sprintStartLength: number = 0;
    private sprintTimerInterval: number | null = null;
    private sprintDropsEarned: number = 0;

    private lastOutlineSubTab: string = "";
    private lastInfoSubTab: string = "";

    private activeTab: 'outline' | 'history' | 'info' | 'target' = 'outline';
    private activeOutlineSubTab: 'scenes' | 'plot' = 'scenes';
    private activeInfoSubTab: 'scene' | 'comments' = 'scene';

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

        if (this.eventsRegistered) return;
        this.eventsRegistered = true;

        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf && leaf.view instanceof MarkdownView) {
                this.lastOutlineHash = "";
                this.lastInfoHash = "";
                void this.parseAndRender();
            }
        }));

        this.registerEvent(this.app.workspace.on('editor-change', (editor) => {
            if (this.containerEl.clientWidth === 0) return;

            if (this.isSprinting) {
                this.sprintDropsEarned = Math.max(0, editor.getValue().length - this.sprintStartLength);
                const dropsEl = this.contentEl.querySelector(".ns-sprint-drops");
                if (dropsEl) dropsEl.textContent = `+ ${this.sprintDropsEarned} Drops`;
                return;
            }

            if (this.activeTab === 'outline' || this.activeTab === 'info') {
                if (this.renderTimer) window.clearTimeout(this.renderTimer);
                this.renderTimer = window.setTimeout(() => { void this.parseAndRender(); }, 1200);
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
                            const content = await this.app.vault.cachedRead(this.currentWikiFile);
                            const contentDiv = container.createDiv("markdown-rendered");
                            contentDiv.setCssStyles({ padding: "0 5px", fontSize: "0.95em" });
                            void MarkdownRenderer.render(this.app, content, contentDiv, this.currentWikiFile.path, this);
                        }
                    })();
                }, 1000);
            }
        }));

        let cursorTimer: number | null = null;
        const handleCursorMove = () => {
            if (this.activeTab === 'history' || this.activeTab === 'info') {
                if (cursorTimer) window.clearTimeout(cursorTimer);
                cursorTimer = window.setTimeout(() => { void this.parseAndRender(); }, 400);
            }
        };

        this.registerDomEvent(document, 'mouseup', (e: MouseEvent) => {
            if (this.contentEl.contains(e.target as Node)) return;
            handleCursorMove();
        });

        this.registerDomEvent(document, 'keyup', (e: KeyboardEvent) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) handleCursorMove();
        });

        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                if (this.activeTab !== 'target') return;
                if (this.targetUpdateTimer) window.clearTimeout(this.targetUpdateTimer);
                this.targetUpdateTimer = window.setTimeout(() => { void this.parseAndRender(); }, 1500);
            })
        );
    }

    async refresh() {
        this.contentEl.empty();
        this.contentEl.createDiv({ cls: "ns-structure-container" });
        this.lastOutlineHash = "";
        this.lastInfoHash = "";
        await this.parseAndRender();
    }

    async parseAndRender() {
        if (this.isRefreshing) {
            this.pendingRefresh = true;
            return;
        }
        this.isRefreshing = true;

        let previousScrollTop = 0;
        const scrollContainer = this.contentEl.querySelector(".ns-structure-container");
        if (scrollContainer) previousScrollTop = scrollContainer.scrollTop;

        try {
            const activeFile = this.app.workspace.getActiveFile();

            if (this.activeTab === 'info' && this.currentWikiFile && activeFile && activeFile.path === this.currentWikiFile.path) {
                return;
            }

            const container = this.contentEl.querySelector(".ns-structure-container");
            if (!container) return;

            if (this.isSprinting) {
                container.empty();
                this.renderSprintUI(container);
                return;
            }

            const view = this.getValidMarkdownView();

            if (view && view.file && !this.plugin.checkInBookFolderSilent(view.file)) {
                container.empty();
                container.createDiv({ text: "Current file is not in your novel folder.", cls: "ns-empty-msg" });
                this.lastTab = "";
                this.lastOutlineHash = "";
                this.lastInfoHash = "";
                return;
            }

            const isDraftMode = view && view.file && view.file.name === DRAFT_FILENAME;
            const draftModeChanged = this.lastDraftMode !== !!isDraftMode;
            const tabChanged = this.lastTab !== this.activeTab;
            const subTabChanged = (this.activeTab === 'outline' && this.lastOutlineSubTab !== this.activeOutlineSubTab) ||
                (this.activeTab === 'info' && this.lastInfoSubTab !== this.activeInfoSubTab);

            const forceRender = tabChanged || subTabChanged || draftModeChanged || !container.querySelector(".ns-control-header");

            if (view && this.activeTab === 'outline') {
                const editor = view.editor;
                if (this.activeOutlineSubTab === 'scenes') {
                    const text = editor.getValue();
                    const matches = text.match(/^(?:# 📄|######|> \[!NSmith|> -).*$/gm);
                    const hashBuilder = (view.file ? view.file.path : "") + "|" + (matches ? matches.join("|") : "");
                    if (!forceRender && hashBuilder === this.lastOutlineHash) return;
                    this.lastOutlineHash = hashBuilder;
                } else {
                    const text = editor.getValue();
                    const yamlMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                    const hashBuilder = (view.file ? view.file.path : "") + "|" + (yamlMatch ? yamlMatch[0] : "NO_YAML");
                    if (!forceRender && hashBuilder === this.lastOutlineHash) return;
                    this.lastOutlineHash = hashBuilder;
                }
            }

            if (view && this.activeTab === 'info') {
                const editor = view.editor;
                if (this.activeInfoSubTab === 'scene') {
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

                    if (foundTitle && startLine !== -1) {
                        const metaLines: string[] = [];
                        for (let i = startLine + 1; i < editor.lineCount(); i++) {
                            const line = editor.getLine(i).trim();
                            if (line.startsWith("######") || line.includes("++ FILE_ID")) break;
                            if (line.startsWith(">")) {
                                const cleanLine = line.substring(1).trim();
                                if (cleanLine.startsWith("[!NSmith") || cleanLine.startsWith("[!info]")) continue;
                                metaLines.push(cleanLine);
                            } else if (line !== "" && metaLines.length > 0) break;
                        }
                        const currentInfoHash = metaLines.join("|");

                        if (!forceRender && this.lastInfoTitle === foundTitle && this.lastInfoHash === currentInfoHash) return;
                        this.lastInfoTitle = foundTitle;
                        this.lastInfoHash = currentInfoHash;
                    } else {
                        if (!forceRender && this.lastInfoTitle === null) return;
                        this.lastInfoTitle = null;
                        this.lastInfoHash = "";
                    }
                } else if (this.activeInfoSubTab === 'comments') {
                    const text = editor.getValue();
                    const matches = text.match(/~~%%[\s\S]*?%%~~|%%[\s\S]*?%%/g);
                    const currentCommentsHash = matches ? matches.join("|") : "NO_COMMENTS";
                    const fullHash = (view.file ? view.file.path : "") + "||" + currentCommentsHash;
                    if (!forceRender && this.lastInfoHash === fullHash) return;
                    this.lastInfoHash = fullHash;
                }
            }

            let header = container.querySelector(":scope > .ns-control-header");
            let contentDiv = container.querySelector(":scope > .ns-tab-content");

            if (forceRender || !header || !contentDiv) {
                container.empty();
                this.renderHeader(container, view);
                contentDiv = container.createDiv({ cls: "ns-tab-content" });

                this.lastTab = this.activeTab;
                this.lastDraftMode = !!isDraftMode;
                this.lastOutlineSubTab = this.activeOutlineSubTab;
                this.lastInfoSubTab = this.activeInfoSubTab;

                this.sortables.forEach(s => s.destroy());
                this.sortables = [];
            }

            if (!view) {
                contentDiv.empty();
                contentDiv.createDiv({ text: "Please open a draft", cls: "ns-empty-msg" });
                return;
            }

            if (this.activeTab === 'outline') {
                contentDiv.empty();
                if (this.activeOutlineSubTab === 'scenes') {
                    this.renderScenesTab(contentDiv, view);
                } else {
                    await this.renderPlotBeatsTab(contentDiv, view);
                }
            }
            else if (this.activeTab === 'info') {
                contentDiv.empty();
                if (this.activeInfoSubTab === 'scene') {
                    await this.renderSceneInfoTab(contentDiv, view);
                } else {
                    this.renderCommentsTab(contentDiv, view);
                }
            }
            else if (this.activeTab === 'history') {
                contentDiv.empty();
                await this.renderHistory(contentDiv, view);
            }
            else if (this.activeTab === 'target') {
                contentDiv.empty();
                this.renderTarget(contentDiv, view);
            }

        } finally {
            const containerToRestore = this.contentEl.querySelector(".ns-structure-container");
            if (containerToRestore && previousScrollTop > 0) {
                requestAnimationFrame(() => { containerToRestore.scrollTop = previousScrollTop; });
            }

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
        const isArchivedDraft = (file: TAbstractFile, content: string) => { return file.name !== DRAFT_FILENAME && (isScriveningsDraft(content)); };

        const row1 = header.createDiv({ cls: "ns-button-row ns-button-row-top" });

        const btnWorldboard = createIconButton(row1, "globe", "World", { flex: "1", padding: "6px 0", backgroundColor: "var(--interactive-accent)", color: "var(--text-on-accent)" });
        btnWorldboard.onclick = () => { void this.plugin.activateWorldboardView(); };

        const btnPlotGrid = createIconButton(row1, "table", "Plot", { flex: "1", padding: "6px 0", backgroundColor: "var(--interactive-normal)" });
        btnPlotGrid.onclick = async () => {
            const file = this.app.workspace.getActiveFile();
            if (!file || !file.path.startsWith(this.plugin.settings.bookFolderPath)) { new Notice("You are not inside the manuscript folder."); return; }
            let targetFolder = this.plugin.settings.bookFolderPath;
            if (file.parent) targetFolder = file.parent.path;
            // @ts-ignore
            await this.plugin.activatePlotGridView(targetFolder);
        };

        const btnCorkboard = createIconButton(row1, "layout-dashboard", "Board", { flex: "1", padding: "6px 0", backgroundColor: "var(--interactive-normal)" });
        btnCorkboard.onclick = async () => {
            const currentView = this.getValidMarkdownView();
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

        let btnDraft;
        if (isDraftMode) {
            btnDraft = createIconButton(row1, "trash-2", "Discard", { flex: "1", padding: "6px 0", backgroundColor: "var(--background-modifier-error)", color: "white" });
            btnDraft.addClass("ns-btn-discard");
            btnDraft.onclick = () => {
                const currentView = this.getValidMarkdownView();
                if (currentView) {
                    new SimpleConfirmModal(this.plugin.app, "Are you sure to discard this darft?\n\nWill close & delete this file, all your word will not be synced", () => { void this.plugin.scrivenerManager.discardDraft(currentView.file); }).open();
                }
            };
        } else {
            btnDraft = createIconButton(row1, "book-open", "Draft", { flex: "1", padding: "6px 0" });
            btnDraft.onclick = () => {
                const currentView = this.getValidMarkdownView();
                if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                    const content = currentView.editor.getValue();
                    if (isArchivedDraft(currentView.file, content)) {
                        new Notice("Abort: this is a archived draft, scrivenering may cause infinite loop.");
                    } else {
                        const folder = currentView.file.parent;
                        if (folder) {
                            void this.plugin.sceneManager.assignIDsToAllFiles(folder).then(() => {
                                void this.plugin.scrivenerManager.toggleScrivenings(currentView.file);
                            });
                        }
                    }
                }
            };
        }

        const row2 = header.createDiv({ cls: "ns-button-row ns-button-row-bottom" });
        const btnSave = createIconButton(row2, "save", "", { flex: "1", padding: "6px 0", backgroundColor: "var(--interactive-accent)", color: "var(--text-on-accent)" });
        btnSave.title = "Smart sync & save";
        btnSave.onclick = async () => {
            const currentView = this.getValidMarkdownView();
            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                btnSave.classList.add("ns-btn-flash");
                const originalHTML = btnSave.innerHTML;
                btnSave.innerHTML = "<span>...</span>";
                btnSave.disabled = true;

                try {
                    if (isArchivedDraft(currentView.file, currentView.editor.getValue())) {
                        new Notice("Draft saved.");
                    } else {
                        // @ts-ignore
                        await this.plugin.executeSmartSave(currentView);
                    }
                } finally {
                    setTimeout(() => {
                        btnSave.innerHTML = originalHTML;
                        btnSave.disabled = false;
                        btnSave.classList.remove("ns-btn-flash");
                    }, 400);
                }
            }
        };

        const btnInsert = createIconButton(row2, "file-plus", "", { flex: "1", padding: "6px 0" });
        btnInsert.title = "Insert scene";
        btnInsert.onclick = () => {
            const currentView = this.getValidMarkdownView();
            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                if (isArchivedDraft(currentView.file, currentView.editor.getValue())) { new Notice("This is a archived draft, please return to your working file to insert scene card."); return; }
                void this.plugin.plotManager.insertSceneCard(currentView);
            }
        };

        const btnSplit = createIconButton(row2, "scissors", "", { flex: "1", padding: "6px 0" });
        btnSplit.title = "Split scene";
        btnSplit.onclick = () => {
            const currentView = this.getValidMarkdownView();
            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                if (isArchivedDraft(currentView.file, currentView.editor.getValue())) { new Notice("This is archived draft, please don't split scene here."); return; }
                void this.plugin.plotManager.splitScene(currentView);
            }
        };

        const btnMerge = createIconButton(row2, "combine", "", { flex: "1", padding: "6px 0" });
        btnMerge.title = "Merge scene";
        btnMerge.onclick = () => {
            const currentView = this.getValidMarkdownView();
            if (currentView && this.plugin.checkInBookFolder(currentView.file)) {
                if (isArchivedDraft(currentView.file, currentView.editor.getValue())) { new Notice("This is archived draft, please don't merge scene here."); return; }
                this.plugin.plotManager.mergeScene(currentView);
            }
        };

        const btnTools = createIconButton(row2, "wrench", "", { flex: "1", padding: "6px 0" });
        btnTools.title = "Tools";
        btnTools.onclick = (e: MouseEvent) => {
            const currentView = this.getValidMarkdownView();
            if (!currentView) return;

            const isInBookFolder = this.plugin.checkInBookFolderSilent(currentView.file);
            const menu = new Menu();

            menu.addItem((item) => {
                item.setTitle("Writer's journey").setIcon("trophy").onClick(() => {
                    // @ts-ignore
                    import('../modals').then(({ StatsDashboardModal }) => { new StatsDashboardModal(this.plugin).open(); });
                });
            });

            menu.addItem((item) => {
                item.setTitle("Focus sprint").setIcon("timer").onClick(() => {
                    // @ts-ignore
                    import('../modals').then(({ SprintSetupModal }) => {
                        new SprintSetupModal(this.plugin.app, (mins: number) => { this.startSprint(mins, currentView); }).open();
                    });
                });
            });

            menu.addSeparator();

            if (isInBookFolder) {
                menu.addItem((item) => { item.setTitle("Auto wiki").setIcon("book").onClick(() => { void this.plugin.wikiManager.scanAndCreateWiki(currentView); }); });
                menu.addItem((item) => { item.setTitle("Typo correction").setIcon("pencil").onClick(() => { void this.plugin.writingManager.correctNames(currentView); }); });
                menu.addSeparator();
                menu.addItem((item) => {
                    item.setTitle("Dialogue mode").setIcon("message-circle").onClick(() => {
                        this.plugin.writingManager.toggleDialogueMode(currentView);
                        this.lastOutlineHash = "";
                        setTimeout(() => this.parseAndRender(), 50);
                    });
                });
                menu.addItem((item) => { item.setTitle("Redundant mode").setIcon("search").onClick(() => { void this.plugin.writingManager.toggleRedundantMode(currentView); }); });
                menu.addItem((item) => { item.setTitle("Echo radar").setIcon("activity").onClick(() => { void this.plugin.writingManager.toggleEchoMode(currentView); }); });
                menu.addItem((item) => { item.setTitle("Syntax radar").setIcon("scan-text").onClick(() => { void this.plugin.writingManager.toggleSyntaxMode(currentView); }); });
                menu.addSeparator();
                menu.addItem((item) => { item.setTitle("Clean draft").setIcon("eraser").onClick(() => { this.plugin.writingManager.cleanDraft(currentView); }); });
                if (!isDraftMode) {
                    menu.addItem((item) => {
                        item.setTitle("Compile draft").setIcon("file-output").onClick(() => {
                            if (currentView && this.plugin.checkInBookFolder(currentView.file)) { this.plugin.compilerManager.openCompileModal(currentView); }
                        });
                    });
                }
                menu.addSeparator();
            }

            menu.addItem((item) => {
                item.setTitle("Word count report").setIcon("bar-chart").onClick(() => {
                    // @ts-ignore
                    import('../modals').then(({ WordCountModal }) => { new WordCountModal(this.plugin).open(); });
                });
            });

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

        const tabsRow = header.createDiv({ cls: "ns-tabs-row" });

        const tabOutline = createIconButton(tabsRow, "list-tree", "");
        tabOutline.title = "Outline";
        tabOutline.className = "ns-tab-btn" + (this.activeTab === 'outline' ? " is-active" : "");
        tabOutline.onclick = () => { this.activeTab = 'outline'; this.lastOutlineHash = ""; void this.parseAndRender(); };

        const tabInfo = createIconButton(tabsRow, "info", "");
        tabInfo.title = "Scene Info";
        tabInfo.className = "ns-tab-btn" + (this.activeTab === 'info' ? " is-active" : "");
        tabInfo.onclick = () => {
            this.activeTab = 'info';
            this.activeWikiNoteToRestore = null;
            this.currentWikiFile = null;
            this.lastInfoTitle = null;
            this.lastInfoHash = "";
            void this.parseAndRender();
        };

        const tabHistory = createIconButton(tabsRow, "history", "");
        tabHistory.title = "Backup History";
        tabHistory.className = "ns-tab-btn" + (this.activeTab === 'history' ? " is-active" : "");
        tabHistory.onclick = () => { this.activeTab = 'history'; void this.parseAndRender(); };

        const tabTarget = createIconButton(tabsRow, "target", "");
        tabTarget.title = "Writing Target";
        tabTarget.className = "ns-tab-btn" + (this.activeTab === 'target' ? " is-active" : "");
        tabTarget.onclick = () => { this.activeTab = 'target'; void this.parseAndRender(); };

        const subTabContainer = header.createDiv({ cls: "ns-subtab-container" });

        if (this.activeTab === 'outline') {
            const b1 = createIconButton(subTabContainer, "layout-list", "Scenes");
            const b2 = createIconButton(subTabContainer, "list-todo", "Plot Beats");
            b1.className = `ns-subtab-btn ${this.activeOutlineSubTab === 'scenes' ? 'is-active' : ''}`;
            b2.className = `ns-subtab-btn ${this.activeOutlineSubTab === 'plot' ? 'is-active' : ''}`;

            b1.onclick = () => {
                this.activeOutlineSubTab = 'scenes';
                this.lastOutlineHash = "";
                void this.parseAndRender();
            };
            b2.onclick = () => {
                this.activeOutlineSubTab = 'plot';
                this.lastOutlineHash = "";
                void this.parseAndRender();
            };
        } else if (this.activeTab === 'info') {
            const b1 = createIconButton(subTabContainer, "clapperboard", "Scene Info");
            const b2 = createIconButton(subTabContainer, "message-square", "Comments");
            b1.className = `ns-subtab-btn ${this.activeInfoSubTab === 'scene' ? 'is-active' : ''}`;
            b2.className = `ns-subtab-btn ${this.activeInfoSubTab === 'comments' ? 'is-active' : ''}`;

            b1.onclick = () => {
                this.activeInfoSubTab = 'scene';
                this.lastInfoHash = "";
                void this.parseAndRender();
            };
            b2.onclick = () => {
                this.activeInfoSubTab = 'comments';
                this.lastInfoHash = "";
                void this.parseAndRender();
            };
        } else {
            subTabContainer.hide();
        }
    }

    renderScenesTab(container: HTMLElement, view: MarkdownView) {
        const text = view.editor.getValue();

        if (!text.trim()) {
            container.createDiv({ text: "This file is empty", cls: "ns-empty-msg" });
            return;
        }

        const tree = this.parseDocument(text);
        if (tree.length === 0) {
            container.createDiv({ text: "Chapter or scene ID do not found", cls: "ns-empty-msg" });
            return;
        }

        let headerContainer = container.querySelector(".ns-outline-header");
        if (!headerContainer) {
            headerContainer = container.createDiv({ cls: "ns-outline-header" });
            const fName = headerContainer.createEl("h4", { cls: "ns-tab-header-title" });
            const iconSpan = fName.createSpan();
            setIcon(iconSpan, "file-text");
            fName.createSpan({ cls: "ns-header-title-text" });
        }

        const fileNameEl = headerContainer.querySelector("h4") as HTMLElement;
        const titleTextEl = headerContainer.querySelector(".ns-header-title-text") as HTMLElement;

        if (view.file && view.file.name === DRAFT_FILENAME) {
            if (titleTextEl.innerText !== "Scrivenering draft") titleTextEl.innerText = "Scrivenering draft";
            fileNameEl.className = "ns-tab-header-title is-draft";
        } else if (view.file) {
            if (titleTextEl.innerText !== view.file.basename) titleTextEl.innerText = `${view.file.basename}`;
            fileNameEl.className = "ns-tab-header-title is-normal";
        }

        const bodyContainer = container.createDiv({ cls: "ns-outline-body" });
        const renderNameCount = new Map<string, number>();
        let chIndex = 0;
        const isDialogueMode = document.body.classList.contains('ns-mode-dialogue');
        let grandTotalChars = 0;
        let grandTotalDialogues = 0;

        tree.forEach((chapter) => {
            if (chapter.name === "root" && chapter.scenes.length === 0) return;

            let totalChChars = 0;
            let totalChDialogues = 0;

            const chapterBox = document.createElement("div");
            chapterBox.className = "ns-chapter-box";
            chapterBox.dataset.name = chapter.name;

            if (chapter.name !== "root") {
                const chCard = chapterBox.createDiv({ cls: "ns-chapter-card" });
                chCard.innerText = `${chapter.name}`;
                chCard.onclick = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); this.jumpToLine(chapter.lineNumber); };
            }

            const sceneList = chapterBox.createDiv({ cls: "ns-scene-list" });
            sceneList.dataset.chapterIndex = chIndex.toString();

            this.sortables.push(new Sortable(sceneList, {
                group: 'scenes', animation: 150, ghostClass: 'ns-sortable-ghost', dragClass: 'ns-sortable-drag',
                delay: 100, delayOnTouchOnly: true,
                onEnd: (evt: SortableEvent) => {
                    if (evt.newIndex !== evt.oldIndex || evt.from !== evt.to) this.saveChanges(container, view);
                }
            }));

            bodyContainer.appendChild(chapterBox);
            this.chapterPreambleMap.set(chapterBox, chapter.preamble);

            chapter.scenes.forEach((scene) => {
                const dialogueMatches = scene.content.match(/「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"/g) || [];
                const dialogueLen = dialogueMatches.join("").length;
                const totalLen = scene.content.replace(/[#\s]/g, "").length || 1;
                const scenePct = Math.round((dialogueLen / totalLen) * 100);

                totalChChars += totalLen;
                totalChDialogues += dialogueLen;
                grandTotalChars += totalLen;
                grandTotalDialogues += dialogueLen;

                let safeKey = scene.id;
                if (!safeKey) {
                    const count = renderNameCount.get(scene.name) || 0;
                    safeKey = `NO_ID_${scene.name}_${count}`;
                    renderNameCount.set(scene.name, count + 1);
                }

                const scCard = document.createElement("div");
                scCard.className = "ns-scene-card";
                scCard.dataset.safeKey = safeKey;
                scCard.dataset.sceneId = scene.id || "";
                scCard.dataset.sceneName = scene.name || "";
                scCard.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" });

                const titleContainer = scCard.createDiv({ cls: "ns-scene-title-container" });
                titleContainer.setCssStyles({ display: "flex", alignItems: "flex-start", gap: "6px", flex: "1", minWidth: "0" });

                const iconEl = titleContainer.createSpan({ cls: "ns-scene-icon" });
                setIcon(iconEl, "clapperboard");
                iconEl.setCssStyles({ opacity: "0.6", display: "flex", alignItems: "center", flexShrink: "0", marginTop: "2px" });

                titleContainer.createSpan({ cls: "ns-scene-title-text", text: scene.name });

                const heatEl = scCard.createSpan({ cls: "ns-scene-heat", text: `${scenePct}%` });
                heatEl.setCssStyles({ fontSize: "0.8em", opacity: "0.5", marginLeft: "8px", marginRight: "8px", flexShrink: "0", display: isDialogueMode ? "block" : "none" });

                const colorBtn = scCard.createDiv();
                setIcon(colorBtn, "palette");
                colorBtn.setCssStyles({ cursor: "pointer", opacity: "0.3", marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0" });
                colorBtn.addEventListener("mouseover", () => colorBtn.setCssProps({ opacity: "1" }));
                colorBtn.addEventListener("mouseout", () => colorBtn.setCssProps({ opacity: "0.3" }));

                const colorObj = getColorById(scene.colorId);
                scCard.style.setProperty('--scene-bg', colorObj.bg);
                scCard.style.setProperty('--scene-border', colorObj.border);

                if (this.selectedSceneId === scene.id) {
                    scCard.setCssProps({ borderLeftWidth: "4px", filter: "brightness(0.9)" });
                }

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

                scCard.onclick = (e) => {
                    if (this.isMenuClicking) { e.stopPropagation(); e.preventDefault(); return; }
                    e.stopPropagation(); e.preventDefault();

                    this.selectedSceneId = scene.id || null;
                    this.selectedSceneTitle = scene.name;
                    this.jumpToLine(scene.lineNumber);

                    const allCards = container.querySelectorAll(".ns-scene-card");
                    allCards.forEach(card => (card as HTMLElement).setCssProps({ borderLeftWidth: "", filter: "" }));
                    scCard.setCssProps({ borderLeftWidth: "4px", filter: "brightness(0.9)" });
                };

                this.sceneContentMap.set(scCard, scene.content);
                sceneList.appendChild(scCard);
            });

            if (chapter.name !== "root") {
                const chCard = chapterBox.querySelector(".ns-chapter-card") as HTMLElement;
                if (chCard) {
                    if (isDialogueMode) {
                        const chPct = Math.round((totalChDialogues / (totalChChars || 1)) * 100);
                        chCard.innerText = `${chapter.name} (${chPct}%)`;
                    } else {
                        chCard.innerText = `${chapter.name}`;
                    }
                }
            }
            chIndex++;
        });

        const topTitleEl = container.querySelector(".ns-outline-header .ns-header-title-text") as HTMLElement;
        if (topTitleEl && view.file) {
            let baseName = view.file.name === DRAFT_FILENAME ? "Scrivenering draft" : view.file.basename;
            if (isDialogueMode && grandTotalChars > 0) {
                const docPct = Math.round((grandTotalDialogues / grandTotalChars) * 100);
                topTitleEl.innerText = `${baseName} (${docPct}%)`;
            }
        }
    }

    async renderPlotBeatsTab(container: HTMLElement, view: MarkdownView) {
        let targetFile = view.file;

        if (targetFile && targetFile.name === DRAFT_FILENAME) {
            const editor = view.editor;
            const cursor = editor.getCursor();
            for (let i = cursor.line; i >= 0; i--) {
                const line = editor.getLine(i);
                const match = line.match(/<span class="ns-file-id">\+\+ FILE_ID: (.*?) \+\+<\/span>/);
                if (match && targetFile.parent) {
                    const realFile = this.app.vault.getAbstractFileByPath(`${targetFile.parent.path}/${match[1].trim()}`);
                    if (realFile instanceof TFile) {
                        targetFile = realFile;
                        break;
                    }
                }
            }
        }

        if (!targetFile || targetFile.name === DRAFT_FILENAME) {
            container.createDiv({ text: "Please place cursor inside a specific chapter to view its plot beats.", cls: "ns-empty-msg" });
            return;
        }

        const cache = this.app.metadataCache.getFileCache(targetFile);
        const frontmatter = cache?.frontmatter || {};
        const storylines = this.plugin.settings.plotStorylineOrder || [];

        const titleEl = container.createEl("h4", { cls: "ns-tab-header-title" });
        if (targetFile.name === DRAFT_FILENAME) titleEl.addClass("is-draft");
        else titleEl.addClass("is-normal");

        setIcon(titleEl.createSpan(), "file-text");
        const baseName = targetFile.name === DRAFT_FILENAME ? "Scrivenering draft" : targetFile.basename;
        titleEl.createSpan({ text: baseName });

        const list = container.createDiv({ cls: "ns-storyline-inspector-list" });
        let visibleCount = 0;

        // 🌟 改用 for...of 迴圈，確保異步渲染 (async rendering) 可以順利執行
        for (const lineName of storylines) {
            const summary = frontmatter[lineName] || "";
            if (!summary || summary.trim() === "") continue;

            visibleCount++;

            const row = list.createDiv({ cls: "ns-inspector-row" });
            const slColorId = this.plugin.settings.plotColors?.storylines?.[lineName] || 'default';
            const slColorObj = getColorById(slColorId);

            if (slColorId !== 'default') {
                row.style.background = `linear-gradient(${slColorObj.bg}, ${slColorObj.bg}), var(--background-primary)`;
                row.style.borderLeft = `4px solid ${slColorObj.color}`;
            }

            // @ts-ignore
            const statusKey = `${targetFile.path}::${lineName}`;
            const isDone = this.plugin.settings.plotBeatsState?.[statusKey] === true;

            const topRow = row.createDiv({ cls: "ns-inspector-top-row" });
            const cb = topRow.createEl("input", { type: "checkbox", cls: "ns-inspector-checkbox" });
            cb.checked = isDone;

            topRow.createSpan({ text: lineName, cls: "ns-inspector-title" });

            if (isDone) row.addClass("is-resolved");

            cb.onchange = async () => {
                if (!this.plugin.settings.plotBeatsState) this.plugin.settings.plotBeatsState = {};
                if (cb.checked) this.plugin.settings.plotBeatsState[statusKey] = true;
                else delete this.plugin.settings.plotBeatsState[statusKey];

                await this.plugin.saveSettings();
                if (cb.checked) row.addClass("is-resolved");
                else row.removeClass("is-resolved");
            };

            // 🌟 核心修復：呼叫 MarkdownRenderer 將大綱內容渲染成真正嘅 Markdown 格式！
            const summaryContainer = row.createDiv({ cls: "ns-inspector-summary markdown-rendered" });

            // 覆蓋 CSS 入面嘅 white-space: pre-wrap，等 Markdown 標籤 (如 <p>, <h1>) 可以自行決定排版
            summaryContainer.setCssStyles({ whiteSpace: "normal" });

            await MarkdownRenderer.render(this.app, summary, summaryContainer, targetFile.path, this);
        }

        if (visibleCount === 0) {
            list.createDiv({ text: "No plot beats planned for this chapter.", cls: "ns-empty-msg" });
        }
    }

    async renderSceneInfoTab(container: HTMLElement, view: MarkdownView) {
        const editor = view.editor;
        const cursor = editor.getCursor();
        let foundTitle = null;
        let foundId = null;

        for (let i = cursor.line; i >= 0; i--) {
            const line = editor.getLine(i);
            if (line.trim().startsWith("######")) {
                foundTitle = cleanSceneTitle(line);
                foundId = extractSceneId(line);
                break;
            }
        }

        if (!foundTitle || !foundId) {
            container.createDiv({ text: "Please put cursor on a scene to view its info.", cls: "ns-empty-msg" });
            return;
        }

        let metaLines: string[] = [];

        if (view.file && view.file.name === DRAFT_FILENAME) {
            const allFiles = getManuscriptFiles(this.app, view.file.parent?.path || this.plugin.settings.bookFolderPath, this.plugin.settings.exportFolderPath);
            for (const file of allFiles) {
                const content = await this.app.vault.cachedRead(file);
                if (content.includes(`data-scene-id="${foundId}"`)) {
                    const parsed = parseContent(content, true, this.app, file);
                    const card = parsed.cards.find(c => c.id === foundId);
                    if (card && card.meta) {
                        metaLines = card.meta.map(l => l.replace(/^>\s*/, "").trim()).filter(l => l && !l.startsWith("[!NSmith") && !l.startsWith("[!info"));
                    }
                    break;
                }
            }
        } else {
            let startLine = -1;
            for (let i = cursor.line; i >= 0; i--) {
                if (editor.getLine(i).trim().startsWith("######")) { startLine = i; break; }
            }
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
        }

        const layer1 = container.createDiv({ cls: "ns-info-layer-list" });
        const layer2 = container.createDiv({ cls: "ns-info-layer-reader" });
        layer2.hide();

        const titleEl = layer1.createEl("h4", { cls: "ns-tab-header-title is-normal" });
        setIcon(titleEl.createSpan(), "clapperboard");
        titleEl.createSpan({ text: foundTitle });

        const infoBox = layer1.createDiv({ cls: "ns-inspector-row" });

        if (metaLines.length === 0 || metaLines.every(l => l === "")) {
            infoBox.createDiv({ text: "No scene info to display", cls: "ns-empty-msg" });
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

                const row = infoBox.createDiv({ cls: "ns-info-property-row" });
                row.createSpan({ text: `${key} : `, cls: "ns-info-property-key" });

                const wikiCategory = this.plugin.settings.wikiCategories?.find(c => c.name.split(/[,，、]/).map(s => s.trim()).includes(key));

                if (wikiCategory && value) {
                    const rawItems = value.replace(/[\[\]]/g, '').split(/[,，、/|\\;；]+/).map(i => i.trim()).filter(i => i);

                    rawItems.forEach(item => {
                        const chip = row.createSpan({ text: item, cls: "ns-info-chip" });
                        chip.onclick = () => this.openWikiNote(item, wikiCategory.folderPath, layer1, layer2);
                    });

                    const btnAll = row.createSpan({ cls: "ns-folder-open-btn" });
                    setIcon(btnAll, "folder-open");
                    const primaryName = wikiCategory.name.split(/[,，、]/)[0].trim();
                    btnAll.title = `Search all ${primaryName}`;
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

    renderCommentsTab(container: HTMLElement, view: MarkdownView) {
        const text = view.editor.getValue();
        const regex = /(~~%%[\s\S]*?%%~~)|(%%[\s\S]*?%%)/g;
        let match;
        const comments = [];

        while ((match = regex.exec(text)) !== null) {
            const fullMatch = match[0];
            const isResolved = fullMatch.startsWith('~~');
            let innerText = fullMatch.replace(/(^~~%%|%%~~$|^%%|%%$)/g, '').trim();
            if (!innerText) innerText = "(Empty comment)";

            const startPos = view.editor.offsetToPos(match.index);
            const endPos = view.editor.offsetToPos(match.index + fullMatch.length);

            comments.push({ text: innerText, isResolved, startPos, endPos, fullMatch });
        }

        if (comments.length === 0) {
            container.createDiv({ text: "No comments (%% ... %%) found in this file.", cls: "ns-empty-msg" });
            return;
        }

        const titleEl = container.createEl("h4", { cls: "ns-tab-header-title is-normal" });
        setIcon(titleEl.createSpan(), "message-square");
        titleEl.createSpan({ text: "Document Comments" });

        const list = container.createDiv({ cls: "ns-storyline-inspector-list" });

        comments.forEach((c) => {
            const row = list.createDiv({ cls: "ns-inspector-row" });
            if (c.isResolved) row.addClass("is-resolved");

            const topRow = row.createDiv({ cls: "ns-inspector-top-row" });

            const cb = topRow.createEl("input", { type: "checkbox", cls: "ns-inspector-checkbox" });
            cb.checked = c.isResolved;

            cb.onchange = () => {
                const newText = cb.checked ? `~~${c.fullMatch}~~` : c.fullMatch.substring(2, c.fullMatch.length - 2);
                view.editor.replaceRange(newText, c.startPos, c.endPos);
            };

            const textEl = topRow.createDiv({ text: c.text, cls: "ns-inspector-summary-clickable" });
            if (c.isResolved) textEl.addClass("is-resolved");

            textEl.onclick = () => {
                view.editor.setCursor(c.startPos);
                view.editor.scrollIntoView({ from: c.startPos, to: c.endPos }, true);
                view.editor.focus();
            };
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
            container.createDiv({ text: "Please put cursor on scene content.", cls: "ns-empty-msg" });
            return;
        }

        const titleEl = container.createEl("h4", { cls: "ns-tab-header-title is-normal" });
        titleEl.innerText = `Backup of ${this.selectedSceneTitle}`;

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
            container.createDiv({ text: `「${this.selectedSceneTitle}」do not have an ID, cannot be load a backup. Please press sync button`, cls: "ns-empty-msg" });
            return;
        }

        const versions = await this.plugin.historyManager.getSceneVersions(this.selectedSceneId);

        if (versions.length === 0) {
            container.createDiv({ text: "This scene do not have any backup. You may click save button above to create one.", cls: "ns-empty-msg" });
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
                        // @ts-ignore
                        await this.plugin.historyManager.deleteVersion(this.selectedSceneId, ver.label, () => {
                            void this.parseAndRender();
                        });
                    }
                ).open();
            };
        }
    }

    renderTarget(container: HTMLElement, view: MarkdownView) {
        const text = view.editor.getValue();
        const parsed = (this.plugin as unknown as any).utils?.parseContent ? (this.plugin as unknown as any).utils.parseContent(text, false) : { preamble: text, cards: [] };

        let pureText = parsed.preamble + "\n";
        if (parsed.cards && parsed.cards.length > 0) {
            parsed.cards.forEach((card: any) => pureText += card.body + "\n");
        }

        pureText = pureText.replace(/%%[\s\S]*?%%/g, "");
        pureText = pureText.replace(/~~[\s\S]*?~~/g, "");

        const words = pureText.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9]+/g);
        const currentCount = words ? words.length : 0;

        if (!this.plugin.settings.wordTargets) this.plugin.settings.wordTargets = {};

        const isDraftMode = view.file && view.file.name === DRAFT_FILENAME;
        const currentPath = view.file ? view.file.path : "";

        const targetKey = (isDraftMode && view.file?.parent) ? `FOLDER_${view.file.parent.path}` : currentPath;
        const targetCount = this.plugin.settings.wordTargets[targetKey] || this.plugin.settings.defaultChapterWordTarget || 2000;

        let percentage = Math.round((currentCount / targetCount) * 100);
        if (isNaN(percentage)) percentage = 0;
        let displayPercent = percentage;
        if (percentage > 100) percentage = 100;
        const dashArray = `${percentage}, 100`;
        const isDone = percentage >= 100;

        const targetBox = container.createDiv({ cls: "ns-target-container" });

        const ringWrapper = targetBox.createDiv({ cls: "ns-ring-wrapper" });
        const svgHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" class="ns-circular-chart ${isDone ? 'is-done' : ''}">
                <defs>
                    <linearGradient id="ns-ring-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="var(--interactive-accent)" />
                        <stop offset="100%" stop-color="var(--text-accent)" /> 
                    </linearGradient>
                    <linearGradient id="ns-ring-grad-done" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="var(--color-green)" />
                        <stop offset="100%" stop-color="var(--color-cyan)" />
                    </linearGradient>
                </defs>
                <path class="ns-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="ns-circle" stroke-dasharray="${dashArray}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <div class="ns-ring-percentage">${displayPercent}%</div>
        `;
        ringWrapper.innerHTML = svgHTML;

        const countDisplay = targetBox.createDiv({ cls: "ns-word-count-display" });
        countDisplay.createDiv({ text: currentCount.toLocaleString(), cls: "ns-current-words" });

        const targetBtn = countDisplay.createDiv({ text: `Target: ${targetCount.toLocaleString()}`, cls: "ns-target-words" });

        targetBtn.onclick = () => {
            if (!targetKey) { new Notice("Error: No active file."); return; }
            import('../modals').then(({ InputModal }) => {
                new InputModal(this.plugin.app, "Set Word Count Target", async (result) => {
                    const num = parseInt(result);
                    if (!isNaN(num) && num > 0) {
                        try {
                            if (!this.plugin.settings.wordTargets) this.plugin.settings.wordTargets = {};
                            this.plugin.settings.wordTargets[targetKey] = num;
                            if (typeof this.plugin.saveSettings === 'function') { await this.plugin.saveSettings(); }
                            else { await this.plugin.saveData(this.plugin.settings); }

                            container.empty(); this.renderTarget(container, view);
                        } catch (error) {
                            new Notice("Error saving target");
                        }
                    } else { new Notice("Please enter a valid number."); }
                }, targetCount.toString()).open();
            });
        };

        const msg = isDone ? "Target achieved! Brilliant writing." : "Keep flowing. Every word counts.";
        targetBox.createDiv({ text: msg, cls: "ns-target-msg" });
    }

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

        const exactPath = folderPath ? `${folderPath}/${noteName}.md` : `${noteName}.md`;
        let file: TFile | null = this.app.vault.getAbstractFileByPath(exactPath) as TFile | null;
        if (!file || !(file instanceof TFile)) {
            file = this.app.metadataCache.getFirstLinkpathDest(noteName, folderPath || "");
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
            const content = await this.app.vault.cachedRead(file);
            const contentDiv = contentWrapper.createDiv("markdown-rendered");
            contentDiv.setCssStyles({ padding: "0 5px", fontSize: "0.95em" });
            void MarkdownRenderer.render(this.app, content, contentDiv, file.path, this);
        } else {
            this.currentWikiFile = null;
            layer2.createDiv({ text: `Cannot find「${noteName}」, please press Autowiki first.`, attr: { style: "color: var(--text-error);" } });
        }
    }

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
            const files = folder.children.filter(f => f instanceof TFile && f.extension === "md") as TFile[];

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
                item.onclick = () => this.openWikiNote(f.basename, folderPath, layer1, layer2);
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

            editor.scrollIntoView({ from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } }, true);
        } else {
            new Notice("Can't find the file, please click on the editor zone.");
        }
    }

    async saveChanges(container: HTMLElement, staleView?: MarkdownView) {
        const view = this.getValidMarkdownView();
        if (!view) return;

        const liveText = view.editor.getValue();
        const liveTree = this.parseDocument(liveText);

        let liveSceneCount = 0;
        liveTree.forEach(ch => liveSceneCount += ch.scenes.length);
        const domScenes = container.querySelectorAll(".ns-scene-card");

        if (liveSceneCount !== domScenes.length) {
            new Notice("No new content in this draft, cancel this drag to protect draft content.");
            void this.parseAndRender();
            return;
        }

        new Notice("Re-organizing...");

        const liveSceneMap = new Map<string, string>();
        const liveChapterPreambleMap = new Map<string, string>();
        const liveChapterFileIdMap = new Map<string, string>();
        let rootPreamble = "";

        const liveNameCount = new Map<string, number>();

        liveTree.forEach(ch => {
            if (ch.name === "root") {
                rootPreamble = ch.preamble;
            } else {
                liveChapterPreambleMap.set(ch.name, ch.preamble);
                if (ch.fileIdTag) liveChapterFileIdMap.set(ch.name, ch.fileIdTag);
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

        const chunks: string[] = [];
        if (this.docYaml.trim()) chunks.push(this.docYaml.trim());

        const chapterBoxes = container.querySelectorAll(".ns-chapter-box");

        chapterBoxes.forEach((box) => {
            const el = box as HTMLElement;
            const chName = el.dataset.name;

            if (chName === "root") {
                if (rootPreamble.trim()) chunks.push(rootPreamble.trim());
            } else if (chName && chName !== "root") {
                const fileIdTag = liveChapterFileIdMap.get(chName) || `<span class="ns-file-id">++ FILE_ID: ${chName} ++</span>`;
                chunks.push(`# 📄 ${chName} <span class="ns-chapter-center"></span>\n${fileIdTag}`);

                const chPreamble = liveChapterPreambleMap.get(chName) || "";
                if (chPreamble.trim()) chunks.push(chPreamble.trim());
            }

            const scenes = el.querySelectorAll(".ns-scene-card");
            let hasConflict = false;

            for (const sc of Array.from(scenes)) {
                const scEl = sc as HTMLElement;
                const safeKey = scEl.dataset.safeKey;
                const content = safeKey ? liveSceneMap.get(safeKey) : null;

                if (content && content.trim()) {
                    chunks.push(content.trimEnd());
                } else {
                    hasConflict = true;
                    break;
                }
            }

            if (hasConflict) {
                new Notice("Outline sync conflict! Drag cancelled to protect your latest typing.", 4000);
                void this.parseAndRender();
                return;
            }
        });

        const finalText = chunks.join("\n\n") + "\n";
        const scrollInfo = view.editor.getScrollInfo();

        await this.app.vault.modify(view.file, finalText);

        this.lastOutlineHash = "";

        setTimeout(() => {
            view.editor.scrollTo(scrollInfo.left, scrollInfo.top);
            void this.parseAndRender();
            void this.plugin.statsManager.recordActivity(0);
        }, 150);
    }

    changeSceneColor(view: MarkdownView, lineNumber: number, newColorId: string) {
        const editor = view.editor;
        const lineText = editor.getLine(lineNumber);

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
                const cleanName = trimLine.replace("# 📄", "").replace('<span class="ns-chapter-center"></span>', "").trim();
                currentChapter = { id: trimLine, name: cleanName, preamble: '', lineNumber: i, scenes: [], type: 'chapter', fileIdTag: '' };
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

            if (trimLine.includes('<span class="ns-file-id">++ FILE_ID')) {
                currentChapter.fileIdTag = line.trim();
                continue;
            }
            buffer.push(line);
        }
        flushChapter();
        if (tree.length === 0) tree.push(currentChapter);
        return tree;
    }

    startSprint(minutes: number, view: MarkdownView) {
        this.isSprinting = true;
        this.sprintRemainingSeconds = minutes * 60;
        this.sprintStartLength = view.editor.getValue().length;
        this.sprintDropsEarned = 0;

        this.lastOutlineHash = "";
        void this.parseAndRender();

        if (this.sprintTimerInterval) window.clearInterval(this.sprintTimerInterval);

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

    async onClose() {
        if (this.renderTimer) {
            window.clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }

        if (this.wikiUpdateTimer) {
            window.clearTimeout(this.wikiUpdateTimer);
            this.wikiUpdateTimer = null;
        }

        if (this.sprintTimerInterval) {
            window.clearInterval(this.sprintTimerInterval);
            this.sprintTimerInterval = null;
        }

        this.isSprinting = false;
        this.contentEl.empty();

        if (this.targetUpdateTimer) {
            window.clearTimeout(this.targetUpdateTimer);
            this.targetUpdateTimer = null;
        }
    }
}