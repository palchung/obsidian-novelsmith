import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { WorkspaceLeaf } from 'obsidian';
import { NovelSmithSettings, DEFAULT_SETTINGS, NovelSmithSettingTab } from './settings';
import { ScrivenerManager } from './managers/ScrivenerManager';
import { HistoryManager } from './managers/HistoryManager';
import { WritingManager } from './managers/WritingManager';
import { PlotManager } from './managers/PlotManager';
import { WikiManager } from './managers/WikiManager';
import { CompilerManager } from './managers/CompilerManager';
import { SceneManager } from './managers/SceneManager';
import { redundantHighlighter, dialogueHighlighter, structureHighlighter } from './decorators';
import { StructureView, VIEW_TYPE_STRUCTURE } from './managers/StructureView';
import { ST_WARNING, DRAFT_FILENAME, BACKSTAGE_DIR, TEMPLATES_DIR, ensureFolderExists, isScriveningsDraft } from './utils';

export default class NovelSmithPlugin extends Plugin {
    settings: NovelSmithSettings;

    scrivenerManager: ScrivenerManager;
    historyManager: HistoryManager;
    writingManager: WritingManager;
    plotManager: PlotManager;
    wikiManager: WikiManager;
    compilerManager: CompilerManager;
    sceneManager: SceneManager;

    // 🔥 Safeguard System: Record the last warning time (for cooldown)
    lastDraftWarningTime: number = 0;

    // 🔥 Extreme Power Saving: Debounce Timer
    private draftCheckTimer: number | null = null;

    async onload() {
        console.log('NovelSmith System Booting (Full Suite)');

        await this.loadSettings();


        this.scrivenerManager = new ScrivenerManager(this.app, this.settings);
        this.historyManager = new HistoryManager(this.app, this.settings);
        this.writingManager = new WritingManager(this.app, this.settings);
        this.plotManager = new PlotManager(this.app, this.settings, this);
        this.wikiManager = new WikiManager(this.app, this.settings);
        this.compilerManager = new CompilerManager(this.app, this.settings);
        this.sceneManager = new SceneManager(this.app, this.settings);

        this.registerEditorExtension([redundantHighlighter, dialogueHighlighter, structureHighlighter]);

        this.registerView(
            VIEW_TYPE_STRUCTURE,
            (leaf) => new StructureView(leaf, this)
        );


        // =================================================================
        // 🔥 Thoughtful UX 1: Add a physical button to the left Ribbon
        // =================================================================
        this.addRibbonIcon('book-open', 'Open NovelSmith Panel', () => {
            this.activateView();
        });

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
                    if (activeFile.name === "NovelSmith_Template.md") return;

                    const now = Date.now();
                    if (now - this.lastDraftWarningTime < 5 * 60 * 1000) return;

                    const folder = activeFile.parent;
                    if (!folder) return;
                    const draftPath = `${folder.path}/${DRAFT_FILENAME}`;
                    const draftFile = this.app.vault.getAbstractFileByPath(draftPath);

                    if (draftFile) {
                        new Notice("⚠️ Warning: Scrivenings Mode is active!\nEdits made here may be overwritten during the next sync.\nPlease return to the draft file to edit, or end Scrivenings Mode first.", 8000);
                        this.lastDraftWarningTime = now;
                    }
                }, 1500); // 1500 milliseconds = 1.5 seconds
            })
        );






        // =================================================================
        // Register Commands (Add barrier protection and logic unification)
        // =================================================================
        this.addCommand({
            id: 'smart-save-sync',
            name: 'System: Smart Save & Sync',
            icon: 'save',
            hotkeys: [{ modifiers: ["Mod"], key: "s" }],
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    if (!checking && this.checkInBookFolder(view.file)) {
                        const content = view.editor.getValue();
                        // 🔥 Ultimate Defense Net: If it's an 'Archived Draft', perform a normal save only, absolutely no ID assignment!
                        if (view.file.name !== DRAFT_FILENAME && (isScriveningsDraft(content))) {
                            new Notice("💾 Archived Draft saved. (To protect the file, the system will not reassign IDs here).");
                            return true;
                        }
                        this.executeSmartSave(view);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'open-structure-view',
            name: 'Open Structure Outline',
            callback: () => { this.activateView(); }
        });

        this.addCommand({
            id: 'compile-manuscript',
            name: 'Export: Compile Clean Manuscript',
            icon: 'book-up',
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    if (!checking && this.checkInBookFolder(view.file)) {
                        // 🔥 Safeguard Checkpoint: Check if the export path is set
                        if (!this.settings.exportFolderPath || this.settings.exportFolderPath.trim() === "") {
                            new Notice("⚠️ Please go to the Settings page to configure your 'Compile Export Path' first!");
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
            name: 'Toggle Scrivenings Mode',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        const file = markdownView.file;
                        const content = markdownView.editor.getValue();

                        // 🔥 Logic Unification: If in the 'Current Temporary Draft', hand over to Smart Save directly (Sync + Update DB)
                        if (file.name === DRAFT_FILENAME) {
                            this.executeSmartSave(markdownView);
                        }
                        // 🔥 Defense Net Upgrade: Recognize only core keywords, handles both new and old drafts!
                        else if (isScriveningsDraft(content)) {
                            new Notice("⛔ System Rejected: This is a Scrivenings draft file (or archived draft). You cannot activate Scrivenings Mode here to prevent infinite loops!");
                        }
                        // Normal chapter file, safely activate Scrivenings Mode
                        else {
                            const folder = file.parent;
                            if (folder) {
                                this.sceneManager.assignIDsToAllFiles(folder).then(() => {
                                    this.scrivenerManager.toggleScrivenings();
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
            name: 'Atomic Save: Current Scene',
            icon: 'save',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        this.historyManager.saveVersion(markdownView);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'restore-scene-version',
            name: 'Atomic Restore: Current Scene',
            icon: 'history',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        this.historyManager.restoreVersion(markdownView);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'split-scene',
            name: 'Plot: Split Scene',
            icon: 'scissors',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        this.plotManager.splitScene(markdownView);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'merge-scene',
            name: 'Plot: Merge Scene',
            icon: 'magnet',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        this.plotManager.mergeScene(markdownView);
                    }
                    return true;
                }
                return false;
            }
        });

        // =================================================================
        // 🛠️ Register writing aid commands (Redundant, Corrector, Dialogue, Clean Draft)
        // =================================================================
        this.addCommand({
            id: 'toggle-redundant-mode',
            name: '🔍 Toggle Redundant Words Mode',
            editorCallback: (editor, view) => {
                this.writingManager.toggleRedundantMode(view);
            }
        });

        this.addCommand({
            id: 'correct-names',
            name: '✍️ Name Corrector (One-Click Auto-Fix)',
            editorCallback: (editor, view) => {
                this.writingManager.correctNames(view);
            }
        });

        this.addCommand({
            id: 'toggle-dialogue-mode',
            name: '💬 Toggle Dialogue Mode',
            editorCallback: (editor, view) => {
                this.writingManager.toggleDialogueMode(view);
            }
        });

        this.addCommand({
            id: 'clean-draft',
            name: '🧹 Clean Draft (Remove all markers)',
            editorCallback: (editor, view) => {
                this.writingManager.cleanDraft(view);
            }
        });

        this.addCommand({
            id: 'auto-wiki',
            name: 'Wiki: Auto Scan & Create',
            icon: 'book',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        // 🔥 Safeguard Checkpoint: Check if Wiki path is set
                        if (!this.settings.wikiFolderPath || this.settings.wikiFolderPath.trim() === "") {
                            new Notice("⚠️ Please go to the Settings page to configure your 'Wiki Storage Folder' first!");
                            return true;
                        }
                        this.wikiManager.scanAndCreateWiki(markdownView);
                    }
                    return true;
                }
                return false;
            }
        });

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
            new Notice("❌ Please open a note first!");
            return false;
        }

        const bookFolder = this.settings.bookFolderPath;

        // 🔥 Fix: If folder is not set, pop up a friendly reminder and block all operations!
        if (!bookFolder || bookFolder.trim() === "") {
            new Notice("⚠️ Welcome to NovelSmith! Please go to the Settings page to configure your 'Dedicated Writing Folder' and initialize it.");
            return false;
        }

        // 🔥 Absolute Barrier: If the path contains _Backstage, block completely!
        if (file.path.includes(`/${BACKSTAGE_DIR}/`)) {
            new Notice(`⛔ System Rejected: This is the locked system backstage (_Backstage). To protect your files, all writing functions are disabled here!`);
            return false;
        }

        if (file.path.startsWith(bookFolder)) {
            return true;
        } else {
            new Notice(`⛔ System Rejected: This file is not inside your 'Dedicated Writing Folder' (${bookFolder}). Plugin functions are disabled to protect the file.`);
            return false;
        }
    }

    async executeSmartSave(view: MarkdownView) {
        const activeFile = view.file;
        if (!activeFile) return;
        const folder = activeFile.parent;
        if (!folder) return;

        if (activeFile.name === DRAFT_FILENAME) {
            new Notice("🔄 Ending Scrivenings Mode and Syncing...");
            await this.scrivenerManager.syncBack(activeFile, folder);
            this.sceneManager.scheduleGenerateDatabase();
        } else {
            await this.sceneManager.executeAssignIDsSilent(view);
        }
    }

    // =================================================================
    // 📄 Smart Template Generator (Supports manual trigger, overwrite protection, and beginner guide)
    // =================================================================
    public async ensureTemplateFileExists(forceShowNotice: boolean = false, openAfterCreate: boolean = false) {

        // 🔥 Performance and Architecture Upgrade: Use central constants and shared functions, extremely clean!
        const folderPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}`;
        const tplPath = `${folderPath}/NovelSmith_Template.md`;

        await ensureFolderExists(this.app, folderPath);


        const file = this.app.vault.getAbstractFileByPath(tplPath);
        if (!file) {
            const defaultTemplate = `###### 🎬 {{SceneName}} <span class="ns-id" data-scene-id="{{UUID}}" data-warning="${ST_WARNING}"></span>\n> [!NSmith] Scene Info\n> - Time:: \n> - POV:: \n> - Status:: #Writing\n> - Note:: \n\nWrite your story here...`;
            try {
                const newFile = await this.app.vault.create(tplPath, defaultTemplate);

                // 🔥 New: Beginner Guide Mode! Automatically opens for the user to edit upon first generation
                if (openAfterCreate && newFile instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf('split', 'vertical');
                    await leaf.openFile(newFile);
                    new Notice("🎉 This is your exclusive Scene Card template!\nYou can modify it now (e.g., add or remove attributes). Once set, clicking 'Insert Scene Card' will use this new format!", 10000);
                } else if (forceShowNotice) {
                    new Notice(`✅ Successfully generated template: ${tplPath}`);
                }
            } catch (e) {
                console.error("Failed to create template file (please check the path)", e);
                if (forceShowNotice) new Notice(`❌ Failed to create template, please check if the path is valid.`);
            }
        } else {
            if (forceShowNotice) new Notice(`⚠️ Template already exists (${tplPath}). To avoid overwriting your custom settings, system generation stopped.`);
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
        if (leaf) workspace.revealLeaf(leaf);
    }

    onunload() {
        console.log('NovelSmith Shutting Down');
        // 🔥 Defense Upgrade 2: When the plugin is disabled or updated, completely detach the panel to prevent ghost panels from multiplying infinitely!
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_STRUCTURE);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
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