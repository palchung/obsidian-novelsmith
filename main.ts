import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { WorkspaceLeaf } from 'obsidian';
import { NovelSmithSettings, DEFAULT_SETTINGS, NovelSmithSettingTab } from './src/settings';
import { ScrivenerManager } from './src/managers/ScrivenerManager';
import { HistoryManager } from './src/managers/HistoryManager';
import { WritingManager } from './src/managers/WritingManager';
import { PlotManager } from './src/managers/PlotManager';
import { WikiManager } from './src/managers/WikiManager';
import { CompilerManager } from './src/managers/CompilerManager';
import { SceneManager } from './src/managers/SceneManager';
import { DashboardManager } from './src/managers/DashboardManager';
import { StatsManager } from './src/managers/StatsManager';
//import { PlotGridView, VIEW_TYPE_PLOTGRID } from './src/managers/PlotGridView';
import { redundantHighlighter, dialogueHighlighter, structureHighlighter, systemTagsProtector, alignPropertyProcessor } from './src/decorators';
import { StructureView, VIEW_TYPE_STRUCTURE } from './src/managers/StructureView';
import { WorldboardView, VIEW_TYPE_WORLDBOARD } from './src/managers/WorldboardView';
import { ST_WARNING, DRAFT_FILENAME, BACKSTAGE_DIR, TEMPLATES_DIR, ensureFolderExists, isScriveningsDraft } from './src/utils';
import { DashboardBuilderModal } from './src/modals';

export default class NovelSmithPlugin extends Plugin {
    settings: NovelSmithSettings;

    scrivenerManager: ScrivenerManager;
    historyManager: HistoryManager;
    writingManager: WritingManager;
    plotManager: PlotManager;
    wikiManager: WikiManager;
    compilerManager: CompilerManager;
    sceneManager: SceneManager;
    dashboardManager: DashboardManager;
    statsManager: StatsManager;

    // 🌟 2. Cache to track typed characters
    private fileLengthCache: Map<string, number> = new Map();

    // 🔥 Safeguard System: Record the last warning time (for cooldown)
    lastDraftWarningTime: number = 0;

    // 🔥 Power Saving: Debounce Timer
    private draftCheckTimer: number | null = null;
    private inkDropTimer: number | null = null;

    async onload() {
        //console.log('NovelSmith booting');

        await this.loadSettings();


        this.scrivenerManager = new ScrivenerManager(this.app, this.settings);
        this.historyManager = new HistoryManager(this.app, this.settings);
        this.writingManager = new WritingManager(this.app, this.settings);
        this.plotManager = new PlotManager(this.app, this.settings, this);
        this.wikiManager = new WikiManager(this.app, this.settings);
        this.compilerManager = new CompilerManager(this.app, this.settings);
        this.sceneManager = new SceneManager(this.app, this.settings);
        this.dashboardManager = new DashboardManager(this.app, this.settings);


        // 🌟 3. Instantiate the StatsManager and load data
        this.statsManager = new StatsManager(this);
        await this.statsManager.loadData(this.settings.statsData);

        // 🌟 4. Listen to file open to baseline the character count
        this.registerEvent(this.app.workspace.on('file-open', async (file) => {
            if (file && file.extension === 'md' && this.checkInBookFolderSilent(file)) {
                const content = await this.app.vault.cachedRead(file);
                this.fileLengthCache.set(file.path, content.length);
            }
        }));


        this.registerMarkdownPostProcessor(alignPropertyProcessor);
        this.registerEditorExtension([redundantHighlighter, dialogueHighlighter, structureHighlighter, systemTagsProtector]);
        this.registerView(
            VIEW_TYPE_STRUCTURE,
            (leaf) => new StructureView(leaf, this)
        );

        this.registerView(
            VIEW_TYPE_WORLDBOARD,
            (leaf) => new WorldboardView(leaf, this)
        );

        // this.registerView(
        //     VIEW_TYPE_PLOTGRID,
        //     (leaf) => new PlotGridView(leaf, this)
        // );


        // =================================================================
        // 🔥 Thoughtful UX 1: Add a physical button to the left Ribbon
        // =================================================================
        this.addRibbonIcon('book-open', 'Open novelsmith panel', () => {
            void this.activateView();
        });

        // 🌟 新增 Plot Grid 嘅左側捷徑按鈕 (Ribbon Icon)
        // this.addRibbonIcon('table', 'Open Plot Grid', async (evt: MouseEvent) => {
        //     // 1. 檢查用家依家打開緊邊份筆記
        //     const activeFile = this.app.workspace.getActiveFile();

        //     // 2. 預設目標資料夾係成本書嘅根目錄
        //     let targetFolder = this.settings.bookFolderPath;

        //     // 3. 如果用家依家打開緊「第一章」嘅筆記，就將目標設定為「第一章」所在嘅資料夾
        //     if (activeFile && activeFile.parent) {
        //         targetFolder = activeFile.parent.path;
        //     }

        //     // 4. 召喚 Plot Grid 面板！
        //     await this.activatePlotGridView(targetFolder);
        // });

        // =================================================================
        // 🌍 Worldboard Entry (With gatekeeper protection!)
        // =================================================================
        // this.addRibbonIcon('globe', 'Open worldboard', () => {
        //     const folder = this.settings.bookFolderPath;
        //     // 防呆攔截：未 Initialize 唔畀入！
        //     if (!folder || folder.trim() === "") {
        //         new Notice("Welcome to novelsmith! Please go to the settings page to initialize your workspace before exploring the Worldboard.");
        //         return;
        //     }
        //     void this.activateWorldboardView();
        // });

        // =================================================================
        // 🔥 Thoughtful UX 2: Automatically mount the panel to the right when Obsidian is ready!
        // =================================================================
        // this.app.workspace.onLayoutReady(() => {
        //     this.activateView();
        // });


        this.addSettingTab(new NovelSmithSettingTab(this.app, this));

        // =================================================================
        // 🔥 Extreme Power Saving Safeguard Listener: Checks only when you stop typing
        // =================================================================
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                // If the user keeps typing, clear the previous timer and do nothing
                if (this.draftCheckTimer !== null) {
                    window.clearTimeout(this.draftCheckTimer);
                }

                // Reset the timer: wait until the user stops for 1.5 seconds before executing the check
                this.draftCheckTimer = window.setTimeout(() => {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (!activeFile) return;

                    if (!this.checkInBookFolderSilent(activeFile)) return;

                    if (activeFile.name === DRAFT_FILENAME) return;
                    if (activeFile.name.startsWith("_")) return;
                    // const templateName = this.settings.templateFilePath.split('/').pop();
                    if (activeFile.name === "${DRAFT_FILENAME}") return;

                    const now = Date.now();
                    if (now - this.lastDraftWarningTime < 5 * 60 * 1000) return;

                    const folder = activeFile.parent;
                    if (!folder) return;
                    const draftPath = `${folder.path}/${DRAFT_FILENAME}`;
                    const draftFile = this.app.vault.getAbstractFileByPath(draftPath);

                    if (draftFile) {
                        new Notice("Warning: scrivenings mode is active!\nEdits made here may be overwritten during the next sync.\nPlease return to the draft file to edit, or end scrivenings mode first.", 8000);
                        this.lastDraftWarningTime = now;
                    }
                }, 1500); // 1500 milliseconds = 1.5 seconds
            })
        );

        // =================================================================
        // 🏆 Background Silent Tracker: Auto-tally Ink Drops when user pauses typing
        // =================================================================
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor, view) => {
                if (this.inkDropTimer !== null) window.clearTimeout(this.inkDropTimer);

                // 當用家停低打字 3 秒後，自動結算墨水滴！
                this.inkDropTimer = window.setTimeout(async () => {
                    if (view && view.file && this.checkInBookFolderSilent(view.file)) {
                        const currentText = editor.getValue();
                        const currentLength = currentText.length;
                        const previousLength = this.fileLengthCache.get(view.file.path) || currentLength;

                        const inkDropsEarned = currentLength - previousLength;

                        // 只有當字數真係有變動先記錄，避免浪費效能
                        if (inkDropsEarned !== 0) {
                            this.fileLengthCache.set(view.file.path, currentLength);
                            // 🌟 靜靜雞計分，唔會彈 Notice 騷擾用家
                            await this.statsManager.recordActivity(inkDropsEarned);
                        }
                    }
                }, 3000); // 3000 毫秒 = 3 秒
            })
        );




        // =================================================================
        // 📊 Dashboard Widget Generator Command
        // =================================================================
        this.addCommand({
            id: 'insert-dashboard-widget',
            name: 'Analytics: insert data dashboard chart',
            icon: 'bar-chart-3',
            editorCallback: async (editor, view) => {
                // 1. Scan Database for attributes
                const availableAttributes = await this.dashboardManager.getAvailableAttributes();

                if (availableAttributes.length === 0) return;

                // 2. Show modal
                new DashboardBuilderModal(this.app, availableAttributes, (config) => {

                    // 3. generate code of chart
                    const generatedCode = this.dashboardManager.generateDashboardCode(config);

                    // 4. insert the chart
                    editor.replaceSelection(generatedCode + "\n\n");

                    new Notice("Success, please enable dataview in setting.");

                }).open();
            }
        });




        // =================================================================
        // Register Commands (Add barrier protection and logic unification)
        // =================================================================
        this.addCommand({
            id: 'smart-save-sync',
            name: 'System: smart save & sync',
            icon: 'save',
            //hotkeys: [{ modifiers: ["Mod"], key: "s" }],
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    if (!checking && this.checkInBookFolder(view.file)) {
                        const content = view.editor.getValue();
                        // 🔥 Ultimate Defense Net: If it's an 'Archived Draft', perform a normal save only, absolutely no ID assignment!
                        if (view.file.name !== DRAFT_FILENAME && (isScriveningsDraft(content))) {
                            new Notice("Archived draft saved. (to protect the file, the system will not reassign ID here).");
                            return true;
                        }
                        void this.executeSmartSave(view);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'open-structure-view',
            name: 'Open structure outline',
            callback: () => { void this.activateView(); }
        });

        this.addCommand({
            id: 'compile-manuscript',
            name: 'Export: compile clean manuscript',
            icon: 'book-up',
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    if (!checking && this.checkInBookFolder(view.file)) {
                        // 🔥 Safeguard Checkpoint: Check if the export path is set
                        if (!this.settings.exportFolderPath || this.settings.exportFolderPath.trim() === "") {
                            new Notice("Please go to the settings page to configure your 'compile export path' first!");
                            return true;
                        }
                        this.compilerManager.openCompileModal(view);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'toggle-scrivenings',
            name: 'Toggle scrivenings mode',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        const file = markdownView.file;
                        const content = markdownView.editor.getValue();

                        // 🔥 Logic Unification: If in the 'Current Temporary Draft', hand over to Smart Save directly (Sync + Update DB)
                        if (file.name === DRAFT_FILENAME) {
                            void this.executeSmartSave(markdownView);
                        }
                        // 🔥 Defense Net Upgrade: Recognize only core keywords, handles both new and old drafts!
                        else if (isScriveningsDraft(content)) {
                            new Notice("System rejected: this is a scrivenings draft file (or archived draft). You cannot activate scrivenings mode here to prevent infinite loops!");
                        }
                        // Normal chapter file, safely activate Scrivenings Mode
                        else {
                            const folder = file.parent;
                            if (folder) {
                                void this.sceneManager.assignIDsToAllFiles(folder).then(() => {
                                    void this.scrivenerManager.toggleScrivenings();
                                });
                            }
                        }
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'save-scene-version',
            name: 'Atomic save: current scene',
            icon: 'save',

            editorCallback: (editor, view) => {
                if (this.checkInBookFolder(view.file)) {
                    this.historyManager.saveVersion(view);
                }
            }
        });

        this.addCommand({
            id: 'restore-scene-version',
            name: 'Atomic restore: current scene',
            icon: 'history',
            editorCallback: (editor, view) => {
                if (this.checkInBookFolder(view.file)) {
                    void this.historyManager.restoreVersion(view);
                }
            }
        });

        this.addCommand({
            id: 'split-scene',
            name: 'Plot: split scene',
            icon: 'scissors',
            editorCallback: (editor, view) => {
                if (this.checkInBookFolder(view.file)) {
                    void this.plotManager.splitScene(view);
                }
            }
        });

        this.addCommand({
            id: 'merge-scene',
            name: 'Plot: merge scene',
            icon: 'magnet',
            editorCallback: (editor, view) => {
                if (this.checkInBookFolder(view.file)) {
                    this.plotManager.mergeScene(view);
                }
            }
        });

        // =================================================================
        // 🛠️ Register writing aid commands (Redundant, Corrector, Dialogue, Clean Draft)
        // =================================================================
        this.addCommand({
            id: 'toggle-redundant-mode',
            name: 'Toggle redundant words mode',
            editorCallback: (editor, view) => {
                void this.writingManager.toggleRedundantMode(view);
            }
        });

        this.addCommand({
            id: 'correct-names',
            name: 'Name corrector (one-click auto-fix)',
            editorCallback: (editor, view) => {
                void this.writingManager.correctNames(view);
            }
        });

        this.addCommand({
            id: 'toggle-dialogue-mode',
            name: 'Toggle dialogue mode',
            editorCallback: (editor, view) => {
                this.writingManager.toggleDialogueMode(view);
            }
        });

        this.addCommand({
            id: 'clean-draft',
            name: 'Clean draft (remove all markers)',
            editorCallback: (editor, view) => {
                this.writingManager.cleanDraft(view);
            }
        });

        this.addCommand({
            id: 'auto-wiki',
            name: 'Wiki: auto scan & create',
            icon: 'book',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        // 🔥 Safeguard Checkpoint: Check if Wiki path is set
                        if (!this.settings.wikiFolderPath || this.settings.wikiFolderPath.trim() === "") {
                            new Notice("Please go to the settings page to configure your 'wiki storage folder' first!");
                            return true;
                        }
                        void this.wikiManager.scanAndCreateWiki(markdownView);
                    }
                    return true;
                }
                return false;
            }
        });


        // 🌟 啟動改名追蹤雷達 (自動更新 data.json 內的路徑)
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                // 如果 data.json 入面有記錄舊路徑嘅字數
                if (this.settings.wordTargets && this.settings.wordTargets[oldPath]) {
                    // 將舊資料搬去新路徑
                    this.settings.wordTargets[file.path] = this.settings.wordTargets[oldPath];
                    // 刪除舊路徑記錄
                    delete this.settings.wordTargets[oldPath];
                    // 儲存落硬碟 (data.json)
                    await this.saveSettings();
                }
            })
        );

        // 🌟 順手加埋刪除追蹤 (如果刪除咗檔案，就清走垃圾數據)
        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                if (this.settings.wordTargets && this.settings.wordTargets[file.path]) {
                    delete this.settings.wordTargets[file.path];
                    await this.saveSettings();
                }
            })
        );








        // Ribbon Icons
        // this.addRibbonIcon('save', 'Smart Save', () => {
        //     const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        //     if (view && this.checkInBookFolder(view.file)) this.executeSmartSave(view);
        // });

        // this.addRibbonIcon('book-open', 'Toggle Scrivenings', () => {
        //     const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        //     if (view && this.checkInBookFolder(view.file)) {
        //         if (view.file.parent) {
        //             this.sceneManager.assignIDsToAllFiles(view.file.parent).then(() => {
        //                 this.scrivenerManager.toggleScrivenings();
        //             });
        //         }
        //     }
        // });

        // this.addRibbonIcon('layout-list', 'Open Outline', () => {
        //     this.activateView();
        // });








    }

    // =================================================================
    // 🔥 Phase 3: Reverse Sync Engine (逆向同步劇情卡模板)
    // =================================================================

    async syncSceneTemplateWithCategories() {
        const folder = this.settings.bookFolderPath;
        if (!folder || folder.trim() === "") return;

        const tplPath = `${folder}/${TEMPLATES_DIR}/${DRAFT_FILENAME}`;
        const tplFile = this.app.vault.getAbstractFileByPath(tplPath);
        if (!(tplFile instanceof TFile)) return;

        let content = await this.app.vault.read(tplFile);
        let modified = false;

        const categories = this.settings.wikiCategories || [];
        for (const cat of categories) {
            if (!cat.name.trim()) continue;
            const primaryName = cat.name.split(/[,，、]/)[0].trim();

            // 檢查 Template 入面係咪已經有呢個屬性
            const regex = new RegExp(`> - ${primaryName}::`, 'i');
            if (!regex.test(content)) {
                // 如果有 > - Note::，就完美咁插喺佢前面
                if (content.includes("> - Note::")) {
                    content = content.replace("> - Note::", `> - ${primaryName}:: \n> - Note::`);
                } else {
                    // 如果冇 Note，就夾硬搵個 Callout 最尾一行加落去
                    const lines = content.split('\n');
                    let lastCalloutIdx = -1;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith(">")) lastCalloutIdx = i;
                    }
                    if (lastCalloutIdx !== -1) {
                        lines.splice(lastCalloutIdx + 1, 0, `> - ${primaryName}:: `);
                        content = lines.join('\n');
                    }
                }
                modified = true;
            }
        }

        // 只有真係加咗嘢，先至 Save 檔案，並且彈 Notice 提示用家！
        if (modified) {
            await this.app.vault.modify(tplFile, content);
            new Notice(`Auto-sync: scene card template updated with new worldboard categories!`);
        }
    }

    public checkInBookFolderSilent(file: TFile | null): boolean {
        if (!file) return false;
        const bookFolder = this.settings.bookFolderPath;
        if (!bookFolder || bookFolder.trim() === "") return false;

        // 🔥 Absolute Barrier: Silently block all background operations
        if (file.path.includes(`/${BACKSTAGE_DIR}/`)) return false;

        return file.path.startsWith(bookFolder);
    }

    public checkInBookFolder(file: TFile | null): boolean {
        if (!file) {
            new Notice("Please open a note first!");
            return false;
        }

        const bookFolder = this.settings.bookFolderPath;

        // 🔥 Fix: If folder is not set, pop up a friendly reminder and block all operations!
        if (!bookFolder || bookFolder.trim() === "") {
            new Notice("Welcome to novelsmith! Please go to the settings page to configure your 'dedicated writing folder' and initialize it.");
            return false;
        }

        // 🔥 Absolute Barrier: If the path contains _Backstage, block completely!
        if (file.path.includes(`/${BACKSTAGE_DIR}/`)) {
            new Notice(`System rejected: this is the locked system backstage (_backstage). To protect your files, all writing functions are disabled here!`);
            return false;
        }

        if (file.path.startsWith(bookFolder)) {
            return true;
        } else {
            new Notice(`System rejected: This file is not inside your 'dedicated writing folder' (${bookFolder}). Plugin functions are disabled to protect the file.`);
            return false;
        }
    }

    async executeSmartSave(view: MarkdownView) {
        const activeFile = view.file;
        if (!activeFile) return;
        const folder = activeFile.parent;
        if (!folder) return;

        if (activeFile.name === DRAFT_FILENAME) {
            new Notice("Ending scrivenings mode and syncing...");
            await this.scrivenerManager.syncBack(activeFile, folder);
            this.sceneManager.scheduleGenerateDatabase();
        } else {
            this.sceneManager.executeAssignIDsSilent(view);
        }

    }

    // =================================================================
    // 📄 Smart Template Generator (Supports manual trigger, overwrite protection, and beginner guide)
    // =================================================================
    public async ensureTemplateFileExists(forceShowNotice: boolean = false, openAfterCreate: boolean = false) {

        // 🔥 Performance and Architecture Upgrade: Use central constants and shared functions, extremely clean!
        const folderPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}`;
        const tplPath = `${folderPath}/${DRAFT_FILENAME}`;

        await ensureFolderExists(this.app, folderPath);


        const file = this.app.vault.getAbstractFileByPath(tplPath);
        if (!file) {
            // 動態讀取 Wiki 分類，預先加落 Template！
            let catLines = "";
            if (this.settings.wikiCategories && this.settings.wikiCategories.length > 0) {
                catLines = this.settings.wikiCategories.map(c => {
                    const p = c.name.split(/[,，、]/)[0].trim();
                    return p ? `> - ${p}:: ` : "";
                }).filter(Boolean).join("\n");
                if (catLines) catLines += "\n";
            }

            const defaultTemplate = `###### {{SceneName}} <span class="ns-id" data-scene-id="{{UUID}}" data-warning="${ST_WARNING}"></span>\n> [!NSmith] Scene Info\n> - Time:: \n> - POV:: \n> - Status:: #Writing\n${catLines}> - Note:: \n\nWrite your story here...`;

            try {
                const newFile = await this.app.vault.create(tplPath, defaultTemplate);

                // 🔥 New: Beginner Guide Mode! Automatically opens for the user to edit upon first generation
                if (openAfterCreate && newFile instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf('split', 'vertical');
                    await leaf.openFile(newFile);
                    new Notice("This is your exclusive scene card template!\nYou can modify it now (e.g., add or remove attributes). Once set, clicking 'insert scene card' will use this new format!", 10000);
                } else if (forceShowNotice) {
                    new Notice(`Successfully generated template: ${tplPath}`);
                }
            } catch (e) {
                console.error("Failed to create template file (please check the path)", e);
                if (forceShowNotice) new Notice(`Failed to create template, please check if the path is valid.`);
            }
        } else {
            if (forceShowNotice) new Notice(`Template already exists (${tplPath}). To avoid overwriting your custom settings, system generation stopped.`);
        }
    }

    // =================================================================
    // AutoWiki Template Generator (Phase 1)
    // =================================================================
    // =================================================================
    // AutoWiki Template Generator
    // =================================================================
    public async ensureWikiTemplateExists(categoryName: string, forceShowNotice: boolean = true) {
        if (!categoryName || categoryName.trim() === "") {
            new Notice("Please enter a 'category name' first before generating template!");
            return;
        }


        const primaryName = categoryName.split(/[,，、]/)[0].trim();

        const folderPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}`;
        const tplPath = `${folderPath}/${primaryName}.md`;

        await ensureFolderExists(this.app, folderPath);

        const file = this.app.vault.getAbstractFileByPath(tplPath);
        if (!file) {
            const defaultTemplate = `---\ntags:\n  - ${primaryName}\naliases:\nnote: ""\n---\n# {{WikiName}}\n\nWrite the details of this ${primaryName} here...`;
            try {
                const newFile = await this.app.vault.create(tplPath, defaultTemplate);

                if (newFile instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf('split', 'vertical');
                    await leaf.openFile(newFile);
                    if (forceShowNotice) new Notice(`Generated template for [${primaryName}]!`, 8000);
                }
            } catch (e) {
                console.error(`Failed to create template for ${primaryName}`, e);
                if (forceShowNotice) new Notice(`Failed to create template, please check if the vault path is valid.`);
            }
        } else {
            if (forceShowNotice) new Notice(`Template already exists (${tplPath}). System generation stopped to prevent overwrite.`);
        }
    }

    async activateView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_STRUCTURE);

        // 🔥 Defense Upgrade 1: If more than one panel is found (due to sync or hot-reload), destroy the extra clones!
        if (leaves.length > 1) {
            for (let i = 1; i < leaves.length; i++) {
                leaves[i].detach();
            }
        }

        let leaf: WorkspaceLeaf | null = leaves.length > 0 ? leaves[0] : null;

        if (!leaf) {
            leaf = workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_STRUCTURE, active: true });
        }
        if (leaf) void workspace.revealLeaf(leaf);
    }

    async activateWorldboardView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_WORLDBOARD)[0];

        if (!leaf) {
            // 🌟 核心分別：唔係開喺 RightLeaf，而係開喺主編輯區 (Tab)！
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: VIEW_TYPE_WORLDBOARD, active: true });
        }
        workspace.revealLeaf(leaf);
    }

    // async activatePlotGridView(targetFolderPath: string) {
    //     const { workspace } = this.app;
    //     let leaf = workspace.getLeavesOfType(VIEW_TYPE_PLOTGRID)[0];

    //     if (!leaf) {
    //         // 開喺主編輯區 (Tab)
    //         leaf = workspace.getLeaf('tab');
    //         await leaf.setViewState({ type: VIEW_TYPE_PLOTGRID, active: true });
    //     }

    //     // 傳遞目標資料夾，等佢知道 Micro 模式要掃描邊度
    //     if (leaf.view instanceof PlotGridView) {
    //         leaf.view.targetFolderPath = targetFolderPath;
    //         await leaf.view.renderGrid();
    //     }

    //     workspace.revealLeaf(leaf);
    // }


    onunload() {
        // 🔥 清理計時器，防止記憶體洩漏
        if (this.draftCheckTimer) {
            window.clearTimeout(this.draftCheckTimer);
            this.draftCheckTimer = null;
        }
        if (this.inkDropTimer) {
            window.clearTimeout(this.inkDropTimer);
            this.inkDropTimer = null;
        }

        // 清理面板資源
        this.app.workspace.getLeavesOfType(VIEW_TYPE_STRUCTURE).forEach(leaf => {
            if (leaf.view instanceof StructureView) {
                leaf.view.onClose();
            }
        });

        //console.log('NovelSmith cleaned up and shut down.');
    }

    async loadSettings() {

        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        // 🌟 Sync stats data before saving to disk
        this.settings.statsData = this.statsManager.data;
        await this.saveData(this.settings);
        this.scrivenerManager.updateSettings(this.settings);
        this.historyManager.updateSettings(this.settings);
        this.writingManager.updateSettings(this.settings);
        this.plotManager.updateSettings(this.settings);
        this.wikiManager.updateSettings(this.settings);
        this.compilerManager.settings = this.settings;
        this.sceneManager.settings = this.settings;

    }
}