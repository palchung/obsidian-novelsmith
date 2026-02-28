import { ItemView, WorkspaceLeaf, MarkdownView, Notice, Menu } from 'obsidian';
import Sortable from 'sortablejs';
import NovelSmithPlugin from '../main';
import { SimpleConfirmModal } from '../modals';
import { isScriveningsDraft, replaceEntireDocument, extractSceneId, cleanSceneTitle, DRAFT_FILENAME, extractSceneColor, getColorById, SCENE_COLORS } from '../utils';
import { t } from '../locales';

export const VIEW_TYPE_STRUCTURE = "novelsmith-structure-view";

const RE_EXTRACT_ID = /(?:SCENE_ID:\s*|data-scene-id=")([a-zA-Z0-9-]+)/;

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


    // 🔥 效能優化：防止 Refresh 途中吞咗用家最新嘅打字
    private pendingRefresh: boolean = false;

    // 🔥 效能優化：使用 WeakMap 儲存龐大字串，釋放 DOM 記憶體！
    private sceneContentMap = new WeakMap<HTMLElement, string>();
    private chapterPreambleMap = new WeakMap<HTMLElement, string>();



    // 🔥 優化 2：記錄上一次大綱的「指紋」，避免打字時無謂重繪 UI
    private lastOutlineHash: string = "";

    // 🔥 新增：防止選單「穿透點擊 (Ghost Click)」的無敵護盾
    private isMenuClicking: boolean = false;
    private renderTimer: number | null = null;

    private activeTab: 'outline' | 'history' | 'info' = 'outline';
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
            if (this.activeTab === 'outline') {
                // 🔥 終極修復：真正的防抖 (Debounce)！有新輸入就取消舊的排隊！
                if (this.renderTimer) window.clearTimeout(this.renderTimer);
                this.renderTimer = window.setTimeout(() => this.parseAndRender(), 500);
            }
        }));
        this.registerDomEvent(document, 'mouseup', () => {
            if (this.activeTab === 'history' || this.activeTab === 'info') setTimeout(() => this.parseAndRender(), 100);
        });
        this.registerDomEvent(document, 'keyup', (e: KeyboardEvent) => {
            if ((this.activeTab === 'history' || this.activeTab === 'info') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
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
        if (this.isRefreshing) {
            // 🔥 如果 Refresh 緊，記低有人 call 過，等陣補做，唔好直接 return 吞咗佢！
            this.pendingRefresh = true;
            return;
        }
        this.isRefreshing = true;



        // 🔥 升級 2：加入 try...finally 無敵解鎖結界
        try {
            const container = this.contentEl.querySelector(".ns-structure-container") as HTMLElement;
            if (!container) return; // 唔使再自己寫 this.isRefreshing = false 啦，finally 會幫你做！

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
            contentDiv.style.marginTop = "10px";

            if (!view) {
                contentDiv.setText("⚠️ 請先打開一篇筆記");
                return;
            }

            if (this.activeTab === 'outline') await this.renderOutline(contentDiv, view);
            else if (this.activeTab === 'info') await this.renderInfo(contentDiv, view);
            else await this.renderHistory(contentDiv, view);

        } finally {
            // 🔥 無論上面嘅渲染過程係成功定係 Error 崩潰，最後一定會執行呢度！
            // 保證大綱面板絕對唔會永久卡死！
            this.isRefreshing = false;
            if (this.pendingRefresh) {
                this.pendingRefresh = false;
                this.parseAndRender();
            }
        }

    }

    renderHeader(container: HTMLElement, view: MarkdownView | null) {
        const header = container.createDiv({ cls: "ns-control-header" });
        const topBtnRow = header.createDiv({ cls: "ns-button-row" });
        topBtnRow.style.marginBottom = "5px";

        // 🔥 判斷當前是否為草稿模式
        const isDraftMode = view && view.file && view.file.name === DRAFT_FILENAME;

        // 🔥 智能切換按鈕文字：草稿模式顯示「同步並結束」，正常顯示「串聯模式」
        const btnScrivenings = topBtnRow.createEl("button", {
            text: isDraftMode ? "💾 同步並結束" : "📚 串聯模式"
        });

        btnScrivenings.style.backgroundColor = "var(--interactive-accent)";
        btnScrivenings.style.color = "var(--text-on-accent)";
        btnScrivenings.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                const file = view.file;
                const content = view.editor.getValue();

                // 🔥 底層邏輯完全不變，系統本身已經識得自動分流！
                if (file.name === DRAFT_FILENAME) {
                    this.plugin.executeSmartSave(view);
                }
                else if (isScriveningsDraft(content)) {
                    new Notice("⛔ 系統拒絕：這是一份封存草稿檔，不能在此處啟動串聯模式以免發生無限迴圈！");
                }
                else {
                    const folder = file.parent;
                    if (folder) {
                        this.plugin.sceneManager.assignIDsToAllFiles(folder).then(() => {
                            this.plugin.scrivenerManager.toggleScrivenings();
                        });
                    }
                }
            }
        };

        // =========================================================
        // 🔥 智能情境按鈕：草稿模式顯示「捨棄」，正常模式顯示「匯出」
        // =========================================================
        if (view && view.file && view.file.name === DRAFT_FILENAME) {
            const btnDiscard = topBtnRow.createEl("button", { text: "🗑️ 捨棄草稿" });
            btnDiscard.style.backgroundColor = "var(--background-modifier-error)";
            btnDiscard.style.color = "white";
            btnDiscard.onclick = () => {
                new SimpleConfirmModal(
                    this.plugin.app,
                    "🚨 確定要放棄這份草稿嗎？\n\n這將會關閉並刪除此臨時檔案，您剛才在草稿裡打的所有字都不會同步回原稿！",
                    async () => {
                        await this.plugin.scrivenerManager.discardDraft(view.file!);
                    }
                ).open();
            };
        } else {
            const btnCompile = topBtnRow.createEl("button", { text: "📤 匯出文稿" });
            btnCompile.onclick = () => {
                if (view && this.plugin.checkInBookFolder(view.file)) this.plugin.compilerManager.openCompileModal(view);
            };
        }




        // =========================================================
        // 🔥 排版優化：核心按鈕列 (插入、同步)
        // =========================================================
        const btnRow = header.createDiv({ cls: "ns-button-row" });
        btnRow.style.marginBottom = "5px"; // 加少少空隙分開兩行

        // 輔助函數：檢查是否為封存草稿 (防呆用)
        const isArchivedDraft = (file: any, content: string) => {
            return file.name !== DRAFT_FILENAME &&
                (isScriveningsDraft(content));
        };

        const btnInsert = btnRow.createEl("button", { text: "➕ 插入卡片" });
        btnInsert.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                if (isArchivedDraft(view.file, view.editor.getValue())) {
                    new Notice("⛔ 這是一份封存草稿，請返回原本的章節筆記中插入卡片。");
                    return;
                }
                this.plugin.plotManager.insertSceneCard(view);
            }
        };

        const btnSave = btnRow.createEl("button", { text: "💾 同步" });
        btnSave.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                if (isArchivedDraft(view.file, view.editor.getValue())) {
                    new Notice("💾 封存草稿已儲存 (為保護檔案，系統不會在此重新分配 ID)。");
                } else {
                    this.plugin.executeSmartSave(view);
                }
            }
        };

        // =========================================================
        // 🔥 排版優化：進階與工具按鈕列 (分拆、吸星、工具)
        // =========================================================
        const btnRow2 = header.createDiv({ cls: "ns-button-row" });

        const btnSplit = btnRow2.createEl("button", { text: "✂️ 分拆" });
        btnSplit.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                if (isArchivedDraft(view.file, view.editor.getValue())) {
                    new Notice("⛔ 這是一份封存草稿，請勿在此分拆情節。");
                    return;
                }
                this.plugin.plotManager.splitScene(view);
            }
        };

        const btnMerge = btnRow2.createEl("button", { text: "🧲 吸星" });
        btnMerge.onclick = () => {
            if (view && this.plugin.checkInBookFolder(view.file)) {
                if (isArchivedDraft(view.file, view.editor.getValue())) {
                    new Notice("⛔ 這是一份封存草稿，請勿在此合併情節。");
                    return;
                }
                this.plugin.plotManager.mergeScene(view);
            }
        };

        const btnTools = btnRow2.createEl("button", { text: "🛠️ 工具" });
        btnTools.onclick = (e: MouseEvent) => {
            const currentView = this.getValidMarkdownView();
            if (!currentView || !this.plugin.checkInBookFolder(currentView.file)) return;

            // 建立 Obsidian 原生下拉選單
            const menu = new Menu();

            menu.addItem((item) => {
                item.setTitle("✍️ 正字刑警")
                    .setIcon("pencil")
                    .onClick(() => { this.plugin.writingManager.correctNames(currentView); });
            });

            menu.addItem((item) => {
                item.setTitle("🧹 一鍵定稿")
                    .setIcon("eraser")
                    .onClick(() => { this.plugin.writingManager.cleanDraft(currentView); });
            });

            menu.addSeparator();

            menu.addItem((item) => {
                item.setTitle("💬 對話模式")
                    .setIcon("message-circle")
                    .onClick(() => { this.plugin.writingManager.toggleDialogueMode(currentView); });
            });

            menu.addItem((item) => {
                item.setTitle("🔍 贅字模式")
                    .setIcon("search")
                    .onClick(() => { this.plugin.writingManager.toggleRedundantMode(currentView); });
            });

            menu.addSeparator();

            menu.addItem((item) => {
                item.setTitle("🧠 自動百科")
                    .setIcon("book")
                    .onClick(() => { this.plugin.wikiManager.scanAndCreateWiki(currentView); });
            });

            // 喺滑鼠點擊嘅位置彈出選單
            menu.showAtMouseEvent(e);
        };







        const tabsRow = header.createDiv({ cls: "ns-tabs-row" });

        let tabClassOutline = "ns-tab-btn" + (this.activeTab === 'outline' ? " is-active" : "");
        const tabOutline = tabsRow.createEl("button", { text: "📑 大綱", cls: tabClassOutline });
        tabOutline.onclick = () => { this.activeTab = 'outline'; this.lastOutlineHash = ""; this.parseAndRender(); };

        // 🔥 新增：資訊檢視器按鈕
        let tabClassInfo = "ns-tab-btn" + (this.activeTab === 'info' ? " is-active" : "");
        const tabInfo = tabsRow.createEl("button", { text: "ℹ️ 資訊", cls: tabClassInfo });
        tabInfo.onclick = () => { this.activeTab = 'info'; this.parseAndRender(); };

        let tabClassHistory = "ns-tab-btn" + (this.activeTab === 'history' ? " is-active" : "");
        const tabHistory = tabsRow.createEl("button", { text: "🕰️ 歷史", cls: tabClassHistory });
        tabHistory.onclick = () => { this.activeTab = 'history'; this.parseAndRender(); };
    }

    async renderOutline(container: HTMLElement, view: MarkdownView) {
        const text = view.editor.getValue();
        if (!text.trim()) { container.setText("📄 這份筆記是空的"); return; }

        const fileNameEl = container.createEl("h3");
        if (view.file && view.file.name === DRAFT_FILENAME) {
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

        // 🔥 防禦結界 1：準備一個計數機，專門對付無 ID 嘅雙胞胎！
        const renderNameCount = new Map<string, number>();

        tree.forEach((chapter, chIndex) => {
            if (chapter.name === "root" && chapter.scenes.length === 0) return;

            const chapterBox = container.createDiv({ cls: "ns-chapter-box" });
            chapterBox.dataset.name = chapter.name;
            this.chapterPreambleMap.set(chapterBox, chapter.preamble);

            if (chapter.name !== "root") {
                const chCard = chapterBox.createDiv({ cls: "ns-chapter-card" });
                chCard.innerText = `📂 ${chapter.name}`;
                chCard.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); this.jumpToLine(chapter.lineNumber); });
            }

            const sceneList = chapterBox.createDiv({ cls: "ns-scene-list" });
            sceneList.dataset.chapterIndex = chIndex.toString();

            chapter.scenes.forEach((scene) => {
                const scCard = sceneList.createDiv({ cls: "ns-scene-card" });

                // ==========================================
                // 🔥 核心修復：生成絕對防撞名的 Safe Key！
                // ==========================================
                let safeKey = scene.id;
                if (!safeKey) {
                    const count = renderNameCount.get(scene.name) || 0;
                    safeKey = `NO_ID_${scene.name}_${count}`;
                    renderNameCount.set(scene.name, count + 1);
                }
                scCard.dataset.safeKey = safeKey; // 狠狠地綁定落去張卡度！


                // 🔥 新增呢兩行：將 ID 同標題綁定喺卡片上，作為安全識別碼！
                scCard.dataset.sceneId = scene.id || "";
                scCard.dataset.sceneName = scene.name || "";


                // 🔥 1. 套用 CSS 顏色濾鏡！
                const colorObj = getColorById(scene.colorId);
                if (colorObj.cssClass) scCard.addClass(colorObj.cssClass);

                scCard.style.display = "flex";
                scCard.style.justifyContent = "space-between";
                scCard.style.alignItems = "center";

                const titleSpan = scCard.createSpan({ text: `🎬 ${scene.name}` });

                // 🔥 2. 加入「🎨 快速轉色」按鈕
                const colorBtn = scCard.createDiv({ text: "🎨" });
                colorBtn.style.cursor = "pointer";
                colorBtn.style.opacity = "0.3";
                colorBtn.style.fontSize = "12px";
                colorBtn.addEventListener("mouseover", () => colorBtn.style.opacity = "1");
                colorBtn.addEventListener("mouseout", () => colorBtn.style.opacity = "0.3");

                colorBtn.addEventListener("click", (e) => {
                    e.stopPropagation(); // 防止觸發跳轉
                    const menu = new Menu();
                    SCENE_COLORS.forEach(c => {
                        menu.addItem((item) => {
                            item.setTitle(c.name)
                                .setIcon("lucide-palette")
                                .onClick(() => {
                                    // 🔥 1. 瞬間啟動無敵護盾
                                    this.isMenuClicking = true;
                                    this.changeSceneColor(view, scene.lineNumber, c.id)
                                    // 🔥 2. 200毫秒後自動解除護盾 (足夠擋住殘留的 click 事件)
                                    setTimeout(() => this.isMenuClicking = false, 200);
                                });
                        });
                    });
                    menu.showAtMouseEvent(e);
                });

                // 🔥 捨棄 dataset，改用 WeakMap 儲存龐大正文！
                this.sceneContentMap.set(scCard, scene.content);

                if (this.selectedSceneId === scene.id) {
                    // 如果被選中，邊框加粗，底色加深少少
                    scCard.style.borderLeftWidth = "4px";
                    scCard.style.filter = "brightness(0.9)";
                }

                scCard.addEventListener("click", (e) => {
                    // 🔥 如果護盾生效中，直接沒收呢個點擊事件！
                    if (this.isMenuClicking) {
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
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

    async renderInfo(container: HTMLElement, view: MarkdownView) {
        const editor = view.editor;
        const cursor = editor.getCursor();
        let foundTitle = null;
        let startLine = -1;

        // 1. 向上尋找最近的情節標題
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
            hint.style.textAlign = "center"; hint.style.opacity = "0.6";
            hint.innerText = "👈 請將游標放在編輯器內的任何一個情節中，以檢視其資訊。";
            return;
        }

        const titleEl = container.createEl("h4");
        titleEl.innerText = `🎬 ${foundTitle}`;
        titleEl.style.color = "var(--text-accent)";
        titleEl.style.marginBottom = "12px";
        titleEl.style.borderBottom = "1px solid var(--background-modifier-border)";
        titleEl.style.paddingBottom = "8px";

        // 2. 向下收集 Callout 屬性與筆記
        let metaLines: string[] = [];
        let lineCount = editor.lineCount();
        for (let i = startLine + 1; i < lineCount; i++) {
            const line = editor.getLine(i).trim();
            // 遇到下個標題就停
            if (line.startsWith("######") || line.includes("++ FILE_ID")) break;

            if (line.startsWith(">")) {
                let cleanLine = line.substring(1).trim();
                // 過濾掉 Callout 宣告語法，保持畫面乾淨
                if (cleanLine.startsWith("[!NSmith") || cleanLine.startsWith("[!info]")) continue;
                metaLines.push(cleanLine);
            } else if (line === "" && metaLines.length > 0) {
                metaLines.push(""); // 容許空行
            } else if (line !== "" && metaLines.length > 0) {
                break; // 遇到正文，停止收集
            }
        }

        if (metaLines.length === 0 || metaLines.every(l => l === "")) {
            const hint = container.createDiv({ cls: "ns-history-card" });
            hint.style.textAlign = "center"; hint.style.opacity = "0.6";
            hint.innerText = "這個情節沒有任何屬性或筆記。";
            return;
        }

        // 3. 優雅地渲染出資訊面板
        const infoBox = container.createDiv({ cls: "ns-chapter-box" });
        infoBox.style.backgroundColor = "var(--background-primary)";

        metaLines.forEach(line => {
            if (line.trim() === "") {
                infoBox.createDiv({ text: " " }).style.height = "10px";
                return;
            }
            // 將 `Key:: Value` 排版得靚靚仔仔
            if (line.startsWith("- ") && line.includes("::")) {
                const parts = line.substring(2).split("::");
                const key = parts[0].trim();
                const value = parts.slice(1).join("::").trim();

                const row = infoBox.createDiv();
                row.style.marginBottom = "8px";
                row.style.lineHeight = "1.5";

                const keyEl = row.createSpan();
                keyEl.innerText = `${key} : `;
                keyEl.style.fontWeight = "bold";
                keyEl.style.color = "var(--text-muted)";

                const valEl = row.createSpan();
                valEl.innerText = value || " (未填寫)";
                if (!value) valEl.style.opacity = "0.5";
            } else {
                // 普通筆記內容
                const row = infoBox.createDiv();
                row.innerText = line.replace(/^- /, "");
                row.style.marginBottom = "6px";
                row.style.lineHeight = "1.5";
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

            //editor.setCursor({ line: lineNumber, ch: 0 });
            editor.scrollIntoView({ from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } }, true);
            //editor.focus();
        } else {
            new Notice("⚠️ 找不到目標筆記，請先點擊一下編輯區。");
        }
    }

    async saveChanges(container: HTMLElement, view: MarkdownView) {
        if (!view) return;

        const liveText = view.editor.getValue();
        const liveTree = this.parseDocument(liveText);

        // =========================================================
        // 🚨 防禦結界 2A：「防吞字」數量核對系統！
        // =========================================================
        let liveSceneCount = 0;
        liveTree.forEach(ch => liveSceneCount += ch.scenes.length);
        const domScenes = container.querySelectorAll(".ns-scene-card");

        if (liveSceneCount !== domScenes.length) {
            new Notice("⚠️ 偵測到文稿有未刷新的新增內容！為保護資料，本次拖拉已取消。請稍候一秒！");
            this.parseAndRender(); // 強制重繪大綱，還原視覺拖拉
            return;
        }

        new Notice("💾 排版更新中...");

        // =========================================================
        // 🛡️ 防禦結界 2B：防撞名字典 (Safe Key Map)
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
                // 用同一套邏輯，為即時正文計算出對應的 Safe Key
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
        // 🧱 開始根據 DOM 拖拉後嘅「新順序」，精準重新砌返篇文！
        // =========================================================
        const chunks: string[] = [];
        if (this.docYaml.trim()) chunks.push(this.docYaml.trim());

        const chapterBoxes = container.querySelectorAll(".ns-chapter-box");

        chapterBoxes.forEach((box) => {
            const el = box as HTMLElement;
            const chName = el.dataset.name;

            // 1. 章節標題與前言
            if (chName === "root") {
                if (rootPreamble.trim()) chunks.push(rootPreamble.trim());
            } else if (chName && chName !== "root") {
                chunks.push(`# 📄 ${chName}\n<span class="ns-file-id">++ FILE_ID: ${chName} ++</span>`);
                const chPreamble = liveChapterPreambleMap.get(chName) || "";
                if (chPreamble.trim()) chunks.push(chPreamble.trim());
            }

            // 2. 情節卡片 (使用絕對安全的 Safe Key)
            const scenes = el.querySelectorAll(".ns-scene-card");
            scenes.forEach((sc) => {
                const scEl = sc as HTMLElement;
                const safeKey = scEl.dataset.safeKey; // 🔥 抽出安全鎖匙

                const content = safeKey ? liveSceneMap.get(safeKey) : null;

                if (content && content.trim()) {
                    chunks.push(content.trimEnd());
                } else {
                    // 終極保底：如果真係發生時空扭曲搵唔到，用返 WeakMap 舊內容
                    const fallbackContent = this.sceneContentMap.get(scEl);
                    if (fallbackContent) chunks.push(fallbackContent.trimEnd());
                }
            });
        });

        // =========================================================
        // ✍️ 寫入編輯器並強制刷新
        // =========================================================
        const finalText = chunks.join("\n\n") + "\n";

        // P2 優化：無痕替換
        replaceEntireDocument(view.editor, finalText);

        this.lastOutlineHash = "";
        this.parseAndRender();
    }


    // ==========================================
    // 🔥 瞬間轉換卡片顏色魔法 (標題 + Callout 連動)
    // ==========================================
    changeSceneColor(view: MarkdownView, lineNumber: number, newColorId: string) {
        const editor = view.editor;
        const lineText = editor.getLine(lineNumber);

        // 1. 替換標題中的 data-color
        let newLine = "";
        if (lineText.includes('data-color="')) {
            newLine = lineText.replace(/data-color="[^"]*"/, `data-color="${newColorId}"`);
        } else if (lineText.includes('data-scene-id="')) {
            newLine = lineText.replace(/"><\/span>/, `" data-color="${newColorId}"><\/span>`);
        } else {
            new Notice("⚠️ 找不到卡片 ID，無法更改顏色！請先為其分配 ID。");
            return;
        }
        editor.setLine(lineNumber, newLine);

        // 🔥 2. 自動替換下一行的 Callout 顏色！
        // 向下掃描 1-2 行，尋找 > [!NSmith...]
        for (let i = lineNumber + 1; i <= lineNumber + 2 && i < editor.lineCount(); i++) {
            const nextLine = editor.getLine(i);
            if (nextLine.startsWith("> [!NSmith")) {
                const calloutType = newColorId === "default" ? "NSmith" : `NSmith-${newColorId}`;
                // 精準替換，唔理佢原本係 NSmith 定 NSmith-red
                const updatedCallout = nextLine.replace(/> \[!NSmith[^\]]*\]/, `> [!${calloutType}]`);
                editor.setLine(i, updatedCallout);
                break; // 搵到並改完就走
            }
        }

        new Notice(`🎨 顏色已更新！`);
        this.lastOutlineHash = ""; // 強制刷新大綱
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


                let uuid = extractSceneId(trimLine) || "";
                let cleanName = cleanSceneTitle(trimLine);
                let colorId = extractSceneColor(trimLine);

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