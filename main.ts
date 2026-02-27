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
import { DRAFT_FILENAME, BACKSTAGE_DIR, TEMPLATES_DIR, ensureFolderExists } from './utils';

export default class NovelSmithPlugin extends Plugin {
    settings: NovelSmithSettings;

    scrivenerManager: ScrivenerManager;
    historyManager: HistoryManager;
    writingManager: WritingManager;
    plotManager: PlotManager;
    wikiManager: WikiManager;
    compilerManager: CompilerManager;
    sceneManager: SceneManager;

    // 🔥 防呆系統：記錄上次警告的時間 (冷卻期用)
    lastDraftWarningTime: number = 0;

    // 🔥 極致省電：防抖計時器
    private draftCheckTimer: number | null = null;

    async onload() {
        console.log('NovelSmith 系統啟動 (Full Suite)');

        await this.loadSettings();


        this.registerEditorExtension([redundantHighlighter, dialogueHighlighter, structureHighlighter]);

        this.registerView(
            VIEW_TYPE_STRUCTURE,
            (leaf) => new StructureView(leaf, this)
        );


        // =================================================================
        // 🔥 貼心 UX 1：在左側邊欄 (Ribbon) 加入一個實體按鈕
        // =================================================================
        this.addRibbonIcon('book-open', '開啟 NovelSmith 面板', () => {
            this.activateView();
        });

        // =================================================================
        // 🔥 貼心 UX 2：當 Obsidian 畫面載入完成後，自動把面板掛載到右邊！
        // =================================================================
        this.app.workspace.onLayoutReady(() => {
            this.activateView();
        });








        this.scrivenerManager = new ScrivenerManager(this.app, this.settings);
        this.historyManager = new HistoryManager(this.app, this.settings);
        this.writingManager = new WritingManager(this.app, this.settings);
        this.plotManager = new PlotManager(this.app, this.settings, this);
        this.wikiManager = new WikiManager(this.app, this.settings);
        this.compilerManager = new CompilerManager(this.app, this.settings);
        this.sceneManager = new SceneManager(this.app, this.settings);

        this.addSettingTab(new NovelSmithSettingTab(this.app, this));

        // =================================================================
        // 🔥 極致省電版防呆監聽器：等你停手先檢查
        // =================================================================
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                // 如果用家不斷打字，就清除上一次嘅計時器，唔好做嘢
                if (this.draftCheckTimer !== null) {
                    window.clearTimeout(this.draftCheckTimer);
                }

                // 重新設定計時器：等用家停手 1.5 秒後，先至真正執行檢查
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
                        new Notice("⚠️ 警告：串聯模式進行中！\n在此處的修改可能會在稍後同步時被覆寫。\n請返回草稿檔修改，或先結束串聯。", 8000);
                        this.lastDraftWarningTime = now;
                    }
                }, 1500); // 1500 毫秒 = 1.5 秒
            })
        );






        // =================================================================
        // 註冊指令 (加入結界防護與邏輯統一)
        // =================================================================
        this.addCommand({
            id: 'smart-save-sync',
            name: 'System: Smart Save & Sync (智能儲存與同步)',
            icon: 'save',
            hotkeys: [{ modifiers: ["Mod"], key: "s" }],
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    if (!checking && this.checkInBookFolder(view.file)) {
                        const content = view.editor.getValue();
                        // 🔥 終極防護網：如果係「封存草稿」，只作普通儲存，絕對不派發 ID！
                        if (view.file.name !== DRAFT_FILENAME && (content.includes('++ FILE_ID:') || content.includes('## 📜'))) {
                            new Notice("💾 封存草稿已儲存 (為保護檔案，系統不會在此重新分配 ID)。");
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
                    if (!checking && this.checkInBookFolder(view.file)) {
                        this.compilerManager.openCompileModal(view);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'toggle-scrivenings',
            name: 'Toggle Scrivenings Mode (串聯模式)',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        const file = markdownView.file;
                        const content = markdownView.editor.getValue();

                        // 🔥 邏輯統一：如果身處「當前臨時草稿」，直接交俾 Smart Save 處理 (同步 + 更新 DB)
                        if (file.name === DRAFT_FILENAME) {
                            this.executeSmartSave(markdownView);
                        }
                        // 🔥 防護網升級：只認最核心字眼，新舊草稿通殺！
                        else if (content.includes('++ FILE_ID:') || content.includes('## 📜')) {
                            new Notice("⛔ 系統拒絕：這是一份串聯草稿檔（或封存草稿），不能在此處啟動串聯模式以免發生無限迴圈！");
                        }
                        // 正常章節檔案，安全啟動串聯模式
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
            name: 'Atomic Save: Current Scene (原子存檔)',
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
            name: 'Atomic Restore: Current Scene (還原版本)',
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
            name: 'Plot: Split Scene (情節分拆)',
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
            name: 'Plot: Merge Scene (吸星大法)',
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
        // 🛠️ 註冊寫作輔助命令 (贅字、正字、對話模式、一鍵定稿)
        // =================================================================
        this.addCommand({
            id: 'toggle-redundant-mode',
            name: '🔍 贅字模式 (切換)',
            editorCallback: (editor, view) => {
                this.writingManager.toggleRedundantMode(view);
            }
        });

        this.addCommand({
            id: 'correct-names',
            name: '✍️ 正字刑警 (一鍵修正名詞)',
            editorCallback: (editor, view) => {
                this.writingManager.correctNames(view);
            }
        });

        this.addCommand({
            id: 'toggle-dialogue-mode',
            name: '💬 對話模式 (切換)',
            editorCallback: (editor, view) => {
                this.writingManager.toggleDialogueMode(view);
            }
        });

        this.addCommand({
            id: 'clean-draft',
            name: '🧹 一鍵定稿 (清除所有標記)',
            editorCallback: (editor, view) => {
                this.writingManager.cleanDraft(view);
            }
        });

        this.addCommand({
            id: 'auto-wiki',
            name: 'Wiki: Auto Scan & Create (自動百科)',
            icon: 'book',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking && this.checkInBookFolder(markdownView.file)) {
                        this.wikiManager.scanAndCreateWiki(markdownView);
                    }
                    return true;
                }
                return false;
            }
        });

        // Ribbon Icons
        // this.addRibbonIcon('save', 'Smart Save (智能儲存)', () => {
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
        if (!bookFolder) return true;

        // 🔥 絕對結界：靜默攔截所有後台操作
        if (file.path.includes(`/${BACKSTAGE_DIR}/`)) return false;

        return file.path.startsWith(bookFolder);
    }

    public checkInBookFolder(file: TFile | null): boolean {
        if (!file) {
            new Notice("❌ 請先打開筆記！");
            return false;
        }

        const bookFolder = this.settings.bookFolderPath;
        if (!bookFolder) return true;

        // 🔥 絕對結界：如果路徑包含 _Backstage，一律落閘放狗！
        if (file.path.includes(`/${BACKSTAGE_DIR}/`)) {
            new Notice(`⛔ 系統拒絕：這裡是被鎖定的系統後台 (_Backstage)，為保護檔案，已禁用所有寫作功能！`);
            return false;
        }

        if (file.path.startsWith(bookFolder)) {
            return true;
        } else {
            new Notice(`⛔ 系統拒絕：此檔案不在您的「專屬寫作資料夾」(${bookFolder}) 內，已禁用插件功能以保護檔案。`);
            return false;
        }
    }

    async executeSmartSave(view: MarkdownView) {
        const activeFile = view.file;
        if (!activeFile) return;
        const folder = activeFile.parent;
        if (!folder) return;

        if (activeFile.name === DRAFT_FILENAME) {
            new Notice("🔄 正在結束串聯並同步...");
            await this.scrivenerManager.syncBack(activeFile, folder);
            this.sceneManager.scheduleGenerateDatabase();
        } else {
            await this.sceneManager.executeAssignIDsSilent(view);
        }
    }

    // =================================================================
    // 📄 智能範本生成器 (支援手動觸發、防覆蓋與新手引導)
    // =================================================================
    public async ensureTemplateFileExists(forceShowNotice: boolean = false, openAfterCreate: boolean = false) {

        // 🔥 效能與架構升級：使用中央常數與共用函數，極度簡潔！
        const folderPath = `${this.settings.bookFolderPath}/${TEMPLATES_DIR}`;
        const tplPath = `${folderPath}/NovelSmith_Template.md`;

        await ensureFolderExists(this.app, folderPath);


        const file = this.app.vault.getAbstractFileByPath(tplPath);
        if (!file) {
            const defaultTemplate = `###### 🎬 {{SceneName}} <span class="ns-id" data-scene-id="{{UUID}}"></span>\n> [!NSmith] 情節資訊\n> - Time:: \n> - POV:: \n> - Status:: #Writing\n> - Note:: \n\n這裡開始寫正文...`;
            try {
                const newFile = await this.app.vault.create(tplPath, defaultTemplate);

                // 🔥 新增：新手引導模式！第一次生成時自動打開畀用家改
                if (openAfterCreate && newFile instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf('split', 'vertical');
                    await leaf.openFile(newFile);
                    new Notice("🎉 這是你的專屬劇情卡片範本！\n你可以現在修改它 (例如加減屬性)，設定好之後，再次點擊「插入卡片」就會使用這個新格式喔！", 10000);
                } else if (forceShowNotice) {
                    new Notice(`✅ 成功生成範本：${tplPath}`);
                }
            } catch (e) {
                console.error("建立範本檔失敗 (請檢查路徑)", e);
                if (forceShowNotice) new Notice(`❌ 建立範本失敗，請檢查路徑是否合法`);
            }
        } else {
            if (forceShowNotice) new Notice(`⚠️ 範本已經存在 (${tplPath})，為免覆蓋你的自訂設定，系統停止生成。`);
        }
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