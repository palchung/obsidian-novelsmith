import { MarkdownView, Notice, Plugin, TFile, debounce } from 'obsidian';
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

export default class NovelSmithPlugin extends Plugin {
    settings: NovelSmithSettings;
    scrivenerManager: ScrivenerManager;
    historyManager: HistoryManager;
    writingManager: WritingManager;
    plotManager: PlotManager;
    wikiManager: WikiManager;
    compilerManager: CompilerManager;
    sceneManager: SceneManager;

    async onload() {
        console.log('NovelSmith 系統啟動 (Full Suite)');

        await this.loadSettings();

        this.registerEditorExtension([redundantHighlighter, dialogueHighlighter, structureHighlighter]);

        this.registerView(
            VIEW_TYPE_STRUCTURE,
            (leaf) => new StructureView(leaf)
        );

        // 1. 聘請經理
        this.scrivenerManager = new ScrivenerManager(this.app, this.settings);
        this.historyManager = new HistoryManager(this.app, this.settings);
        this.writingManager = new WritingManager(this.app, this.settings);
        this.plotManager = new PlotManager(this.app, this.settings);
        this.wikiManager = new WikiManager(this.app, this.settings);
        this.compilerManager = new CompilerManager(this.app, this.settings);
        this.sceneManager = new SceneManager(this.app, this.settings);

        // 2. 註冊設定頁
        this.addSettingTab(new NovelSmithSettingTab(this.app, this));

        // 自動化監聽：當檔案修改時，自動更新數據庫
        const debouncedUpdateDatabase = debounce(() => {
            if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
                this.sceneManager.generateDatabase();
            }
        }, 2000, true);

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md' && !file.name.startsWith("_")) {
                    debouncedUpdateDatabase();
                }
            })
        );

        // =================================================================
        // 註冊指令
        // =================================================================

        this.addCommand({
            id: 'open-structure-view',
            name: 'Open Structure Outline (打開觸控大綱)',
            callback: () => { this.activateView(); }
        });

        this.addCommand({
            id: 'compile-manuscript',
            name: 'Export: Compile Clean Manuscript (匯出最終文稿)',
            icon: 'book-up',
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    if (!checking) this.compilerManager.openCompileModal(view);
                    return true;
                }
                return false;
            }
        });

        // 串聯模式 (修改：針對整個 Folder 檢查 ID)
        this.addCommand({
            id: 'toggle-scrivenings',
            name: 'Toggle Scrivenings Mode (串聯模式)',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) {
                        const folder = markdownView.file.parent;
                        if (folder) {
                            // 先全家做一次體檢，確保無人漏 ID，再串聯
                            this.sceneManager.assignIDsToAllFiles(folder).then(() => {
                                this.scrivenerManager.toggleScrivenings();
                            });
                        }
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'save-scene-version',
            name: 'Atomic Save: Current Scene (原子存檔)',
            icon: 'save',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.historyManager.saveVersion(markdownView);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'restore-scene-version',
            name: 'Atomic Restore: Current Scene (還原版本)',
            icon: 'history',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.historyManager.restoreVersion(markdownView);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'assign-scene-ids',
            name: 'System: Assign IDs to Scenes (為情節分配身份證)',
            icon: 'fingerprint',
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    if (!checking) this.sceneManager.assignIDs(view);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'generate-scene-database',
            name: 'System: Update Scene Database (更新場景大表)',
            icon: 'database',
            callback: () => {
                this.sceneManager.generateDatabase();
            }
        });

        this.addCommand({
            id: 'toggle-redundant-mode',
            name: 'Writing Aid: Toggle Redundant Mode (贅字模式)',
            icon: 'search',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.writingManager.toggleRedundantMode(markdownView);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'toggle-dialogue-mode',
            name: 'Writing Aid: Toggle Dialogue Mode (對話模式)',
            icon: 'message-circle',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.writingManager.toggleDialogueMode(markdownView);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'correct-names',
            name: 'Writing Aid: Correct Names (正字刑警)',
            icon: 'check-circle',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.writingManager.correctNames(markdownView);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'clean-draft',
            name: 'Writing Aid: Clean Draft (一鍵定稿)',
            icon: 'trash',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.writingManager.cleanDraft(markdownView);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'split-scene',
            name: 'Plot: Split Scene (情節分拆)',
            icon: 'scissors',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.plotManager.splitScene(markdownView);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'merge-scene',
            name: 'Plot: Merge Scene (吸星大法)',
            icon: 'magnet',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.plotManager.mergeScene(markdownView);
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'auto-wiki',
            name: 'Wiki: Auto Scan & Create (自動百科)',
            icon: 'book',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) this.wikiManager.scanAndCreateWiki(markdownView);
                    return true;
                }
                return false;
            }
        });

        // =================================================================
        // Ribbon Icons
        // =================================================================

        this.addRibbonIcon('book-open', 'Toggle Scrivenings', () => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view && view.file.parent) {
                // 也是一樣，先檢查全家，再串聯
                this.sceneManager.assignIDsToAllFiles(view.file.parent).then(() => {
                    this.scrivenerManager.toggleScrivenings();
                });
            } else {
                new Notice("❌ 請先打開筆記！");
            }
        });

        this.addRibbonIcon('save', 'Atomic Save', () => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) this.historyManager.saveVersion(view);
            else new Notice("❌ 請先打開筆記！");
        });

        this.addRibbonIcon('layout-list', 'Open Outline', () => {
            this.activateView();
        });
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_STRUCTURE);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_STRUCTURE, active: true });
        }
        if (leaf) workspace.revealLeaf(leaf);
    }

    onunload() {
        console.log('NovelSmith 休息中');
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