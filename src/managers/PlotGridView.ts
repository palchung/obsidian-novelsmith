import { ItemView, WorkspaceLeaf, Notice, setIcon, TFile, TFolder, Modal, App, MarkdownRenderer, Component, Menu } from 'obsidian';
import NovelSmithPlugin from '../../main';
import { getManuscriptFiles, sanitizeFileName, SCENE_COLORS, getColorById, PLOT_TEMPLATES, BACKSTAGE_DIR } from '../utils';
import { SimpleConfirmModal } from '../modals';

export const VIEW_TYPE_PLOTGRID = "novelsmith-plotgrid-view";

// ============================================================
// 📝 單行輸入對話框
// ============================================================
class StorylinePromptModal extends Modal {
    onSubmit: (name: string) => void;
    constructor(app: App, onSubmit: (name: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Enter new storyline name" });

        const input = contentEl.createEl("input", { type: "text" });
        input.setCssStyles({ width: "100%", padding: "8px", marginBottom: "15px", borderRadius: "4px", border: "1px solid var(--background-modifier-border)" });
        input.focus();

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.isComposing) {
                e.preventDefault();
                const val = input.value.trim();
                if (val) this.onSubmit(val);
                this.close();
            }
        });

        const btnRow = contentEl.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 10px;" } });
        const btnCancel = btnRow.createEl("button", { text: "Cancel" });
        btnCancel.onclick = () => this.close();
        const btnSave = btnRow.createEl("button", { text: "Add", cls: "mod-cta" });
        btnSave.onclick = () => {
            const val = input.value.trim();
            if (val) this.onSubmit(val);
            this.close();
        };
    }
    onClose() { this.contentEl.empty(); }
}

// ============================================================
// 📝 選擇 Template 的開局視窗
// ============================================================
class PlotTemplateModal extends Modal {
    onSubmit: (type: string) => void;
    constructor(app: App, onSubmit: (type: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Choose a Template to start" });

        const btnContainer = contentEl.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 10px; margin-top: 20px;" } });

        Object.entries(PLOT_TEMPLATES).forEach(([key, tpl]) => {
            const btn = btnContainer.createEl("button", { text: tpl.name, cls: "mod-cta" });
            btn.onclick = () => { this.onSubmit(key); this.close(); };
        });

        const btnBlank = btnContainer.createEl("button", { text: "Start from Blank (白紙開局)" });
        btnBlank.onclick = () => { this.onSubmit(""); this.close(); };
    }
    onClose() { this.contentEl.empty(); }
}

// ============================================================
// 📌 Plot Grid 核心視圖
// ============================================================
export class PlotGridView extends ItemView {
    plugin: NovelSmithPlugin;
    targetFolderPath: string = "";

    sessionStorylines = new Set<string>();
    optimisticOrder: string[] | null = null;

    // 🌟 新增：渲染防護鎖，防止「多重影分身」Bug
    private isRendering: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: NovelSmithPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_PLOTGRID; }
    getDisplayText() { return "Plot Grid"; }
    getIcon() { return "table"; }

    // 🌟 記憶系統：保存與載入上次離開時的資料夾狀態
    getState() {
        return { targetFolderPath: this.targetFolderPath };
    }
    async setState(state: any, result: any) {
        if (state && state.targetFolderPath) {
            this.targetFolderPath = state.targetFolderPath;
        }
        await super.setState(state, result);
        this.renderGrid();
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ns-plotgrid-view");

        if (!this.plugin.settings.plotColors) this.plugin.settings.plotColors = { chapters: {}, storylines: {} };
        if (!this.plugin.settings.plotBeatsState) this.plugin.settings.plotBeatsState = {};
        if (!this.plugin.settings.plotStorylineOrder) this.plugin.settings.plotStorylineOrder = [];
        if (!this.plugin.settings.plotCollapsedLines) this.plugin.settings.plotCollapsedLines = {};

        const headerEl = contentEl.createDiv({ cls: "ns-plotgrid-header" });
        headerEl.setCssStyles({
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 15px", borderBottom: "1px solid var(--background-modifier-border)",
            backgroundColor: "var(--background-secondary)", zIndex: "100", position: "sticky", top: "0"
        });

        const leftGroup = headerEl.createDiv({ cls: "ns-plotgrid-header-left", attr: { style: "display: flex; align-items: center; gap: 15px;" } });
        setIcon(leftGroup.createSpan(), "table");
        leftGroup.createEl("h3", { text: "Plot Grid", attr: { style: "margin: 0;" } });

        const btnRefresh = leftGroup.createEl("button", { cls: "clickable-icon" });
        setIcon(btnRefresh, "refresh-cw");
        btnRefresh.title = "Refresh from files";
        btnRefresh.onclick = () => {
            this.renderGrid();
            new Notice("Grid synced with manuscript files.");
        };

        const rightGroup = headerEl.createDiv({ attr: { style: "display: flex; gap: 10px;" } });
        const btnAddLine = rightGroup.createEl("button", { text: "+ Storyline", cls: "mod-cta" });
        btnAddLine.onclick = () => this.addNewStoryline();

        const gridWrapper = contentEl.createDiv({ cls: "ns-plotgrid-wrapper" });
        gridWrapper.setCssStyles({ flexGrow: "1", overflow: "auto", position: "relative" });
        gridWrapper.createDiv({ cls: "ns-plotgrid-container" });

        await this.renderGrid();
    }

    private isStorylineKey(k: string) {
        const EXCLUDED = ['position', 'tags', 'aliases', 'cssclasses'];
        return !EXCLUDED.includes(k);
    }

    async renderGrid() {

        // 🌟 攔截器：如果畫緊，就直接拒絕第二次請求，防止 DOM 炒車！
        if (this.isRendering) return;
        this.isRendering = true;

        try {
            const container = this.contentEl.querySelector(".ns-plotgrid-container") as HTMLElement;
            if (!container) return;
            container.empty();

            // 🌟 獲取所有部曲資料夾 (Sub-folders)，並過濾系統資料夾
            const bookFolder = this.app.vault.getAbstractFileByPath(this.plugin.settings.bookFolderPath);
            let subFolders: TFolder[] = [];
            if (bookFolder instanceof TFolder) {
                subFolders = bookFolder.children.filter(c =>
                    c instanceof TFolder &&
                    !c.name.startsWith('_') &&        // 排除底線開頭的資料夾
                    c.name !== BACKSTAGE_DIR          // 🌟 排除草稿系統資料夾
                ) as TFolder[];
            }

            // 如果未設定或路徑無效，智能指派
            if (!this.targetFolderPath || !this.app.vault.getAbstractFileByPath(this.targetFolderPath)) {
                this.targetFolderPath = subFolders.length > 0 ? subFolders[0].path : this.plugin.settings.bookFolderPath;
            }
            const scanPath = this.targetFolderPath;

            // 🌟 更新頂部資料夾下拉選單 (如果有多部曲)
            const leftGroup = this.contentEl.querySelector(".ns-plotgrid-header-left");
            if (leftGroup) {
                let select = leftGroup.querySelector(".ns-folder-select") as HTMLSelectElement;
                if (subFolders.length > 0) {
                    if (!select) {
                        select = leftGroup.createEl("select", { cls: "dropdown ns-folder-select" });
                        select.onchange = () => {
                            this.targetFolderPath = select.value;
                            this.renderGrid();
                        };
                    }
                    select.empty();
                    subFolders.forEach(f => {
                        select.createEl("option", { text: f.name, value: f.path });
                    });
                    select.value = scanPath;
                } else if (select) {
                    select.remove();
                }
            }

            const allFiles = getManuscriptFiles(this.app, scanPath, this.plugin.settings.exportFolderPath);

            // 孤兒搜尋
            let hasOrphans = false;
            for (const file of allFiles) {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter) {
                    Object.keys(cache.frontmatter).forEach(k => {
                        if (this.isStorylineKey(k) && !this.plugin.settings.plotStorylineOrder.includes(k)) {
                            this.plugin.settings.plotStorylineOrder.push(k);
                            hasOrphans = true;
                        }
                    });
                }
            }
            if (hasOrphans) await this.plugin.saveSettings();

            const finalStorylines = this.plugin.settings.plotStorylineOrder;

            // 🌟 開局空狀態與 Template 選擇
            if (allFiles.length === 0) {
                const emptyBox = container.createEl("div", {
                    cls: "ns-grid-empty-msg",
                    attr: { style: "display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; color: var(--text-muted);" }
                });
                emptyBox.createEl("p", { text: `No chapters found in: [${scanPath}]` });
                const btnCreateFirst = emptyBox.createEl("button", { text: "Create First Chapter", cls: "mod-cta", attr: { style: "margin-top: 15px;" } });

                btnCreateFirst.onclick = () => {
                    new PlotTemplateModal(this.app, async (type) => {
                        if (type && PLOT_TEMPLATES[type]) {
                            this.plugin.settings.plotStorylineOrder = [...PLOT_TEMPLATES[type].storylines];
                        } else {
                            this.plugin.settings.plotStorylineOrder = [];
                        }
                        await this.plugin.saveSettings();

                        const newPath = scanPath === "/" ? "01_New_Chapter.md" : `${scanPath}/01_New_Chapter.md`;
                        try {
                            await this.app.vault.create(newPath, `---\n---\n\n`);
                            new Notice("First chapter created!");
                        } catch (e) { }
                        this.renderGrid();
                    }).open();
                };
                return;
            }

            container.setCssStyles({
                display: "grid",
                gridTemplateColumns: `200px repeat(${allFiles.length}, 300px) 150px`,
                width: "max-content"
            });

            const corner = this.createCell(container, "ns-grid-header-corner");
            corner.createSpan({ text: "Storylines / Chapters" });
            corner.setCssStyles({ position: "sticky", left: "0", top: "0", zIndex: "50", background: "var(--background-secondary)" });

            // X 軸
            allFiles.forEach(file => {
                const head = this.createCell(container, "ns-grid-header-top");
                head.setCssStyles({ position: "sticky", top: "0", zIndex: "40", display: "flex", justifyContent: "space-between", alignItems: "center" });

                const chapterColorId = this.plugin.settings.plotColors.chapters[file.path] || 'default';
                const chColorObj = getColorById(chapterColorId);

                if (chapterColorId !== 'default') {
                    head.style.background = `linear-gradient(${chColorObj.bg}, ${chColorObj.bg}), var(--background-primary)`;
                    head.style.borderTop = `4px solid ${chColorObj.color}`;
                } else {
                    head.style.background = "var(--background-secondary)";
                }

                const dragGroup = head.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; cursor: grab; flex-grow: 1;" } });
                dragGroup.setAttribute("draggable", "true");
                setIcon(dragGroup.createSpan({ attr: { style: "opacity: 0.5" } }), "grip-horizontal");
                dragGroup.createSpan({ text: file.basename });

                dragGroup.addEventListener("dragstart", (e) => { e.dataTransfer?.setData("ns-chapter-path", file.path); head.style.opacity = "0.5"; });
                dragGroup.addEventListener("dragend", () => { head.style.opacity = "1"; });
                head.addEventListener("dragover", (e) => { e.preventDefault(); head.style.filter = "brightness(1.1)"; });
                head.addEventListener("dragleave", () => { head.style.filter = ""; });
                head.addEventListener("drop", async (e) => {
                    e.preventDefault();
                    head.style.filter = "";
                    const sourcePath = e.dataTransfer?.getData("ns-chapter-path");
                    if (sourcePath && sourcePath !== file.path) {
                        await this.reorderChapters(sourcePath, file.path, allFiles);
                    }
                });

                const headControls = head.createDiv({ attr: { style: "display: flex; gap: 4px;" } });
                const btnColorCh = headControls.createSpan({ attr: { style: "cursor: pointer; opacity: 0.4; padding: 4px;" } });
                setIcon(btnColorCh, "palette");
                btnColorCh.onclick = (e) => this.handleChangeChapterColor(e, file);
                btnColorCh.addEventListener("mouseover", () => btnColorCh.style.opacity = "1");
                btnColorCh.addEventListener("mouseout", () => btnColorCh.style.opacity = "0.4");

                const btnEditName = headControls.createSpan({ attr: { style: "cursor: pointer; opacity: 0.4; padding: 4px;" } });
                setIcon(btnEditName, "pencil");
                btnEditName.onclick = () => this.handleRenameChapter(file);
                btnEditName.addEventListener("mouseover", () => btnEditName.style.opacity = "1");
                btnEditName.addEventListener("mouseout", () => btnEditName.style.opacity = "0.4");

                const btnDel = headControls.createSpan({ attr: { style: "cursor: pointer; opacity: 0.4; padding: 4px;" } });
                setIcon(btnDel, "trash-2");
                btnDel.onclick = () => this.handleDeleteChapter(file);
                btnDel.addEventListener("mouseover", () => btnDel.style.opacity = "1");
                btnDel.addEventListener("mouseout", () => btnDel.style.opacity = "0.4");
            });

            const addChHead = this.createCell(container, "ns-grid-header-top");
            addChHead.setCssStyles({ position: "sticky", top: "0", zIndex: "40", background: "var(--background-secondary)", display: "flex", justifyContent: "center", alignItems: "center" });
            const btnAddCh = addChHead.createEl("button", { text: "+ Add Chapter" });
            btnAddCh.onclick = () => this.handleCreateChapter(allFiles);

            // 🌟 獲取本資料夾的隱藏名單
            const collapsedLines = this.plugin.settings.plotCollapsedLines[scanPath] || [];

            // Y 軸
            for (const storyline of finalStorylines) {
                const slColorId = this.plugin.settings.plotColors.storylines[storyline] || 'default';
                const slColorObj = getColorById(slColorId);
                const isCollapsed = collapsedLines.includes(storyline);

                const sideHead = this.createCell(container, "ns-grid-header-left");
                if (isCollapsed) sideHead.addClass("is-collapsed"); // 🌟 套用隱藏樣式

                sideHead.setCssStyles({
                    position: "sticky", left: "0", zIndex: "30",
                    display: "flex", flexDirection: isCollapsed ? "row" : "column",
                    gap: "8px", justifyContent: isCollapsed ? "space-between" : "center", padding: "10px"
                });

                if (slColorId !== 'default') {
                    sideHead.style.background = `linear-gradient(${slColorObj.bg}, ${slColorObj.bg}), var(--background-primary)`;
                    sideHead.style.borderLeft = `4px solid ${slColorObj.color}`;
                } else {
                    sideHead.style.background = "var(--background-primary)";
                }

                const dragYGroup = sideHead.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; cursor: grab; width: 100%;" } });
                dragYGroup.setAttribute("draggable", "true");
                setIcon(dragYGroup.createSpan({ attr: { style: "opacity: 0.5; flex-shrink: 0;" } }), "grip-vertical");
                dragYGroup.createSpan({ text: storyline, attr: { style: "font-weight: bold; color: var(--text-accent); word-break: break-word;" } });

                dragYGroup.addEventListener("dragstart", (e) => { e.dataTransfer?.setData("ns-storyline-key", storyline); sideHead.style.opacity = "0.5"; });
                dragYGroup.addEventListener("dragend", () => { sideHead.style.opacity = "1"; });
                sideHead.addEventListener("dragover", (e) => { e.preventDefault(); sideHead.style.filter = "brightness(1.1)"; });
                sideHead.addEventListener("dragleave", () => { sideHead.style.filter = ""; });
                sideHead.addEventListener("drop", async (e) => {
                    e.preventDefault();
                    sideHead.style.filter = "";
                    const sourceKey = e.dataTransfer?.getData("ns-storyline-key");
                    if (sourceKey && sourceKey !== storyline) {
                        await this.reorderStorylines(sourceKey, storyline, allFiles);
                    }
                });

                const btnControls = sideHead.createDiv({ attr: { style: "display: flex; gap: 8px; justify-content: flex-end;" } });
                if (!isCollapsed) btnControls.style.width = "100%";

                // 🌟 隱藏/展開 按鈕 (永遠顯示)
                const btnToggleCollapse = btnControls.createSpan({ attr: { style: "cursor: pointer; opacity: 0.6; padding: 4px;" } });
                setIcon(btnToggleCollapse, isCollapsed ? "eye-off" : "eye");
                btnToggleCollapse.title = isCollapsed ? "Expand storyline" : "Hide storyline in this folder";
                btnToggleCollapse.onclick = async () => {
                    if (!this.plugin.settings.plotCollapsedLines[scanPath]) this.plugin.settings.plotCollapsedLines[scanPath] = [];
                    if (isCollapsed) {
                        this.plugin.settings.plotCollapsedLines[scanPath] = this.plugin.settings.plotCollapsedLines[scanPath].filter(k => k !== storyline);
                    } else {
                        this.plugin.settings.plotCollapsedLines[scanPath].push(storyline);
                    }
                    await this.plugin.saveSettings();
                    this.renderGrid();
                };
                btnToggleCollapse.addEventListener("mouseover", () => btnToggleCollapse.style.opacity = "1");
                btnToggleCollapse.addEventListener("mouseout", () => btnToggleCollapse.style.opacity = "0.6");

                // 如果冇摺疊，先顯示其他編輯按鈕
                if (!isCollapsed) {
                    const btnColorSl = btnControls.createSpan({ attr: { style: "cursor: pointer; opacity: 0.4; padding: 4px;" } });
                    setIcon(btnColorSl, "palette");
                    btnColorSl.onclick = (e) => this.handleChangeStorylineColor(e, storyline);
                    btnColorSl.addEventListener("mouseover", () => btnColorSl.style.opacity = "1");
                    btnColorSl.addEventListener("mouseout", () => btnColorSl.style.opacity = "0.4");

                    const btnRenameStoryline = btnControls.createSpan({ attr: { style: "cursor: pointer; opacity: 0.4; padding: 4px;" } });
                    setIcon(btnRenameStoryline, "pencil");
                    btnRenameStoryline.onclick = () => this.handleRenameStoryline(storyline, allFiles);
                    btnRenameStoryline.addEventListener("mouseover", () => btnRenameStoryline.style.opacity = "1");
                    btnRenameStoryline.addEventListener("mouseout", () => btnRenameStoryline.style.opacity = "0.4");

                    const btnDelStoryline = btnControls.createSpan({ attr: { style: "cursor: pointer; opacity: 0.4; padding: 4px;" } });
                    setIcon(btnDelStoryline, "trash-2");
                    btnDelStoryline.onclick = () => this.handleDeleteStoryline(storyline, allFiles);
                    btnDelStoryline.addEventListener("mouseover", () => btnDelStoryline.style.opacity = "1");
                    btnDelStoryline.addEventListener("mouseout", () => btnDelStoryline.style.opacity = "0.4");
                }

                for (const file of allFiles) {
                    const cell = this.createCell(container, "ns-grid-cell");
                    if (isCollapsed) cell.addClass("is-collapsed"); // 🌟 套用隱藏樣式
                    cell.setCssStyles({ display: "flex", alignItems: "stretch", padding: "5px" });
                    if (slColorId !== 'default') cell.style.background = slColorObj.bg;
                    await this.renderCellContent(cell, file, storyline, isCollapsed);
                }

                const fillCell = this.createCell(container, "ns-grid-cell");
                if (isCollapsed) fillCell.addClass("is-collapsed");
                if (slColorId !== 'default') fillCell.style.background = slColorObj.bg;
            }

        } finally {
            // 🌟 解除防護鎖：無論成功定失敗，最後一定會開鎖
            this.isRendering = false;
        }


    }

    private async renderCellContent(cell: HTMLElement, file: TFile, key: string, isCollapsed: boolean = false) {
        const cache = this.app.metadataCache.getFileCache(file);
        const summary = cache?.frontmatter?.[key] || "";

        const card = cell.createDiv({ cls: "ns-plot-card" });
        card.setCssStyles({
            flexGrow: "1", width: "100%", minHeight: "80px",
            padding: "10px", boxSizing: "border-box", cursor: "pointer",
            backgroundColor: "var(--background-primary)",
            border: "1px solid var(--background-modifier-border)", borderRadius: "6px",
            transition: "box-shadow 0.2s ease"
        });

        const stateKey = `${file.path}::${key}`;
        const isDone = this.plugin.settings.plotBeatsState[stateKey] === true;
        if (isDone) {
            card.style.opacity = "0.4";
            card.style.border = "1px solid var(--text-success)";
        }

        if (!summary) {
            card.addClass("is-empty");
            if (!isDone) card.setCssStyles({ opacity: "0.6", borderStyle: "dashed" });
            card.createDiv({ text: "Click to add beat", cls: "ns-plot-card-placeholder" });
        } else {
            card.setAttribute("draggable", "true");
            card.style.cursor = "grab";
            const textDiv = card.createDiv({ cls: "ns-plot-card-text markdown-rendered" });
            textDiv.setCssStyles({ fontSize: "0.95em", userSelect: "text" });
            const comp = new Component();
            comp.load();
            await MarkdownRenderer.render(this.app, summary, textDiv, file.path, comp);
        }

        card.onclick = async (e: MouseEvent) => {
            if (isCollapsed) return; // 🌟 隱藏模式下禁止編輯

            const target = e.target as HTMLElement;

            const internalLink = target.closest("a.internal-link");
            if (internalLink) {
                e.preventDefault();
                const linkText = internalLink.getAttribute("data-href");
                if (linkText) await this.app.workspace.openLinkText(linkText, file.path, e.ctrlKey || e.metaKey);
                return;
            }

            const tagTarget = target.closest("a.tag");
            if (tagTarget) {
                e.preventDefault();
                const tagText = tagTarget.textContent;
                if (tagText) {
                    try {
                        // @ts-ignore
                        const searchPlugin = this.app.internalPlugins.getPluginById('global-search');
                        if (searchPlugin && searchPlugin.instance) searchPlugin.instance.openGlobalSearch(`tag:${tagText}`);
                    } catch (err) { }
                }
                return;
            }

            if (card.querySelector("textarea")) return;

            cell.style.position = "relative";
            cell.style.zIndex = "999";
            card.style.position = "relative";
            card.style.zIndex = "999";
            card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.4)";
            card.style.opacity = "1";

            const freshCache = this.app.metadataCache.getFileCache(file);
            const freshSummary = freshCache?.frontmatter?.[key] || "";

            card.removeAttribute("draggable");
            const textDiv = card.querySelector(".ns-plot-card-text") as HTMLElement;
            const placeholder = card.querySelector(".ns-plot-card-placeholder") as HTMLElement;
            if (textDiv) textDiv.style.display = "none";
            if (placeholder) placeholder.style.display = "none";

            const textarea = card.createEl("textarea");
            textarea.value = freshSummary;
            textarea.setCssStyles({
                width: "100%", minHeight: "80px", resize: "both",
                backgroundColor: "var(--background-primary-alt)",
                color: "var(--text-normal)", border: "1px solid var(--interactive-accent)",
                borderRadius: "4px", padding: "8px", fontFamily: "var(--font-text)",
                fontSize: "0.95em", outline: "none"
            });

            textarea.focus();
            textarea.setSelectionRange(freshSummary.length, freshSummary.length);
            textarea.addEventListener("mousedown", (ev) => ev.stopPropagation());

            textarea.onblur = async () => {
                cell.style.zIndex = "";
                card.style.zIndex = "";
                card.style.boxShadow = "";

                const newVal = textarea.value.trim();
                if (newVal !== freshSummary) {
                    await this.app.fileManager.processFrontMatter(file, (fm) => { fm[key] = newVal; });
                    new Notice(`Updated beat in ${file.basename}`);
                    setTimeout(() => this.renderGrid(), 200);
                } else {
                    textarea.remove();
                    if (textDiv) textDiv.style.display = "block";
                    if (placeholder) placeholder.style.display = "block";
                    card.setAttribute("draggable", "true");
                    if (isDone) card.style.opacity = "0.4";
                }
            };
        };

        if (!isCollapsed) {
            card.addEventListener("dragstart", (e) => {
                if (!summary) { e.preventDefault(); return; }
                e.dataTransfer?.setData("text/plain", JSON.stringify({ sourcePath: file.path, sourceKey: key, text: summary }));
                card.style.opacity = "0.4";
            });
            card.addEventListener("dragend", () => { card.style.opacity = isDone ? "0.4" : "1"; });
            cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.style.backgroundColor = "var(--background-modifier-hover)"; });
            cell.addEventListener("dragleave", () => { cell.style.backgroundColor = ""; });
            cell.addEventListener("drop", async (e) => {
                e.preventDefault(); cell.style.backgroundColor = "";
                const rawData = e.dataTransfer?.getData("text/plain");
                if (!rawData) return;
                try {
                    const data = JSON.parse(rawData);
                    await this.handleCardDrop(data.sourcePath, data.sourceKey, data.text, file, key);
                } catch (err) { }
            });
        }
    }

    private handleChangeChapterColor(e: MouseEvent, file: TFile) {
        const menu = new Menu();
        SCENE_COLORS.forEach(c => {
            menu.addItem(item => {
                item.setTitle(c.name).setIcon("palette").onClick(async () => {
                    if (c.id === "default") delete this.plugin.settings.plotColors.chapters[file.path];
                    else this.plugin.settings.plotColors.chapters[file.path] = c.id;
                    await this.plugin.saveSettings();
                    this.renderGrid();
                });
            });
        });
        menu.showAtMouseEvent(e);
    }

    private handleChangeStorylineColor(e: MouseEvent, storyline: string) {
        const menu = new Menu();
        SCENE_COLORS.forEach(c => {
            menu.addItem(item => {
                item.setTitle(c.name).setIcon("palette").onClick(async () => {
                    if (c.id === "default") delete this.plugin.settings.plotColors.storylines[storyline];
                    else this.plugin.settings.plotColors.storylines[storyline] = c.id;
                    await this.plugin.saveSettings();
                    this.renderGrid();
                });
            });
        });
        menu.showAtMouseEvent(e);
    }

    private async handleCardDrop(sourcePath: string, sourceKey: string, draggedText: string, targetFile: TFile, targetKey: string) {
        if (sourcePath === targetFile.path && sourceKey === targetKey) return;
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!(sourceFile instanceof TFile)) return;

        const targetCache = this.app.metadataCache.getFileCache(targetFile);
        const existingTargetText = targetCache?.frontmatter?.[targetKey] || "";

        // 🌟 1. 完美掉位 (Swap) YAML 文本
        await this.app.fileManager.processFrontMatter(sourceFile, (fm) => {
            if (existingTargetText) fm[sourceKey] = existingTargetText;
            else delete fm[sourceKey]; // 如果目標係吉嘅，就清空原本嗰格
        });
        await this.app.fileManager.processFrontMatter(targetFile, (fm) => {
            if (draggedText) fm[targetKey] = draggedText;
            else delete fm[targetKey];
        });

        // 🌟 2. 完美掉位 (Swap) data.json 內嘅 Checkbox 完成狀態
        const sourceStateKey = `${sourcePath}::${sourceKey}`;
        const targetStateKey = `${targetFile.path}::${targetKey}`;

        const sourceDone = this.plugin.settings.plotBeatsState[sourceStateKey];
        const targetDone = this.plugin.settings.plotBeatsState[targetStateKey];

        if (targetDone) this.plugin.settings.plotBeatsState[sourceStateKey] = true;
        else delete this.plugin.settings.plotBeatsState[sourceStateKey];

        if (sourceDone) this.plugin.settings.plotBeatsState[targetStateKey] = true;
        else delete this.plugin.settings.plotBeatsState[targetStateKey];

        await this.plugin.saveSettings();

        setTimeout(() => this.renderGrid(), 200);
    }

    private async reorderStorylines(sourceKey: string, targetKey: string, allFiles: TFile[]) {
        const currentOrder = this.plugin.settings.plotStorylineOrder;
        const sourceIdx = currentOrder.indexOf(sourceKey);
        const targetIdx = currentOrder.indexOf(targetKey);
        if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;

        const [moved] = currentOrder.splice(sourceIdx, 1);
        currentOrder.splice(targetIdx, 0, moved);

        await this.plugin.saveSettings();
        this.renderGrid();

        new Notice("Reordering storylines in all chapters...");
        for (const file of allFiles) {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                const newFm: Record<string, any> = {};
                currentOrder.forEach(k => { if (fm[k] !== undefined) newFm[k] = fm[k]; });
                Object.keys(fm).forEach(k => { if (!currentOrder.includes(k)) newFm[k] = fm[k]; });
                Object.keys(fm).forEach(k => delete fm[k]);
                Object.assign(fm, newFm);
            });
        }
    }

    private handleRenameStoryline(oldKey: string, allFiles: TFile[]) {
        import('../modals').then(({ InputModal }) => {
            new InputModal(this.app, `Rename storyline: ${oldKey}`, async (newKeyRaw) => {
                const newKey = newKeyRaw.replace(/\s+/g, '_');
                if (!newKey || newKey === oldKey) return;

                const currentOrder = this.plugin.settings.plotStorylineOrder;
                const idx = currentOrder.indexOf(oldKey);
                if (idx !== -1) currentOrder[idx] = newKey;

                new Notice("Renaming storyline in all chapters...", 2000);

                if (this.plugin.settings.plotColors.storylines[oldKey]) {
                    this.plugin.settings.plotColors.storylines[newKey] = this.plugin.settings.plotColors.storylines[oldKey];
                    delete this.plugin.settings.plotColors.storylines[oldKey];
                }
                Object.keys(this.plugin.settings.plotBeatsState).forEach(k => {
                    if (k.endsWith(`::${oldKey}`)) {
                        const val = this.plugin.settings.plotBeatsState[k];
                        delete this.plugin.settings.plotBeatsState[k];
                        this.plugin.settings.plotBeatsState[k.replace(`::${oldKey}`, `::${newKey}`)] = val;
                    }
                });

                // 🌟 改名時同步轉移「隱藏狀態」
                for (const folder in this.plugin.settings.plotCollapsedLines) {
                    const lines = this.plugin.settings.plotCollapsedLines[folder];
                    if (lines.includes(oldKey)) {
                        this.plugin.settings.plotCollapsedLines[folder] = lines.filter(k => k !== oldKey);
                        this.plugin.settings.plotCollapsedLines[folder].push(newKey);
                    }
                }

                await this.plugin.saveSettings();

                for (const file of allFiles) {
                    await this.app.fileManager.processFrontMatter(file, (fm) => {
                        if (fm[oldKey] !== undefined) {
                            const newFm: Record<string, any> = {};
                            Object.keys(fm).forEach(k => {
                                if (k === oldKey) newFm[newKey] = fm[oldKey];
                                else newFm[k] = fm[k];
                            });
                            Object.keys(fm).forEach(k => delete fm[k]);
                            Object.assign(fm, newFm);
                        }
                    });
                }
                setTimeout(() => this.renderGrid(), 200);
            }, oldKey).open();
        });
    }

    private async handleDeleteStoryline(storyline: string, allFiles: TFile[]) {
        new SimpleConfirmModal(this.app, `Delete storyline "${storyline}" completely?\n\nThis will remove the attribute from ALL chapters. This cannot be undone.`, async () => {

            this.plugin.settings.plotStorylineOrder = this.plugin.settings.plotStorylineOrder.filter(k => k !== storyline);
            delete this.plugin.settings.plotColors.storylines[storyline];
            Object.keys(this.plugin.settings.plotBeatsState).forEach(k => {
                if (k.endsWith(`::${storyline}`)) delete this.plugin.settings.plotBeatsState[k];
            });
            for (const folder in this.plugin.settings.plotCollapsedLines) {
                this.plugin.settings.plotCollapsedLines[folder] = this.plugin.settings.plotCollapsedLines[folder].filter(k => k !== storyline);
            }

            await this.plugin.saveSettings();

            for (const file of allFiles) {
                await this.app.fileManager.processFrontMatter(file, (fm) => { delete fm[storyline]; });
            }
            new Notice(`Storyline ${storyline} deleted.`);
            setTimeout(() => this.renderGrid(), 300);
        }).open();
    }

    private handleCreateChapter(allFiles: TFile[]) {
        import('../modals').then(({ InputModal }) => {
            new InputModal(this.app, "New Chapter Name", async (result) => {
                const cleanTitle = sanitizeFileName(result);
                if (!cleanTitle) return;

                const scanPath = this.targetFolderPath || this.plugin.settings.bookFolderPath;
                const chapterIndex = allFiles.length + 1;
                const prefix = chapterIndex < 10 ? `0${chapterIndex}_` : `${chapterIndex}_`;
                const newName = `${prefix}${cleanTitle}.md`;
                const newPath = scanPath === "/" ? newName : `${scanPath}/${newName}`;

                try {
                    await this.app.vault.create(newPath, `---\n---\n\n`);
                    new Notice("Chapter created!");
                    setTimeout(() => this.renderGrid(), 300);
                } catch (e) { new Notice("File creation failed."); }
            }).open();
        });
    }

    private handleRenameChapter(file: TFile) {
        const oldName = file.basename;
        const match = oldName.match(/^(\d+[\s_\-]+)(.*)$/);
        const prefix = match ? match[1] : "";
        const cleanTitle = match ? match[2] : oldName;

        import('../modals').then(({ InputModal }) => {
            new InputModal(this.app, "Rename Chapter", async (newName) => {
                if (!newName.trim()) return;
                const safeName = sanitizeFileName(newName);
                const finalName = `${prefix}${safeName}.md`;
                const oldPath = file.path;
                const finalPath = file.parent?.path === "/" ? finalName : `${file.parent?.path}/${finalName}`;

                try {
                    await this.app.fileManager.renameFile(file, finalPath);

                    if (this.plugin.settings.plotColors.chapters[oldPath]) {
                        this.plugin.settings.plotColors.chapters[finalPath] = this.plugin.settings.plotColors.chapters[oldPath];
                        delete this.plugin.settings.plotColors.chapters[oldPath];
                    }
                    Object.keys(this.plugin.settings.plotBeatsState).forEach(k => {
                        if (k.startsWith(`${oldPath}::`)) {
                            const val = this.plugin.settings.plotBeatsState[k];
                            delete this.plugin.settings.plotBeatsState[k];
                            this.plugin.settings.plotBeatsState[k.replace(`${oldPath}::`, `${finalPath}::`)] = val;
                        }
                    });
                    await this.plugin.saveSettings();

                    new Notice("Chapter renamed.");
                    setTimeout(() => this.renderGrid(), 300);
                } catch (e) {
                    new Notice("Failed to rename chapter.");
                }
            }, cleanTitle).open();
        });
    }

    private async handleDeleteChapter(file: TFile) {
        const content = await this.app.vault.read(file);
        const hasContent = content.includes("######") || content.includes("> [!NSmith]");

        if (hasContent) {
            new Notice("Cannot delete: Chapter contains manuscript text. Delete the text first to unlock.", 5000);
            return;
        }

        new SimpleConfirmModal(this.app, `Delete empty chapter "${file.basename}"?\n\nThis will permanently move the file to trash.`, async () => {
            const oldPath = file.path;
            await this.app.fileManager.trashFile(file);

            delete this.plugin.settings.plotColors.chapters[oldPath];
            Object.keys(this.plugin.settings.plotBeatsState).forEach(k => {
                if (k.startsWith(`${oldPath}::`)) delete this.plugin.settings.plotBeatsState[k];
            });
            await this.plugin.saveSettings();

            new Notice("Chapter deleted.");
            setTimeout(() => this.renderGrid(), 300);
        }).open();
    }

    private async reorderChapters(sourcePath: string, targetPath: string, allFiles: TFile[]) {
        const sourceIdx = allFiles.findIndex(f => f.path === sourcePath);
        const targetIdx = allFiles.findIndex(f => f.path === targetPath);
        if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;

        const [movedFile] = allFiles.splice(sourceIdx, 1);
        allFiles.splice(targetIdx, 0, movedFile);

        new Notice("Reordering chapters...", 2000);

        for (let i = 0; i < allFiles.length; i++) {
            const file = allFiles[i];
            const oldName = file.basename;
            const match = oldName.match(/^(\d+[\s_\-]+)(.*)$/);
            const cleanTitle = match ? match[2] : oldName;

            const prefixNum = i + 1;
            const prefix = prefixNum < 10 ? `0${prefixNum}_` : `${prefixNum}_`;
            const newName = `${prefix}${cleanTitle}.md`;

            if (file.name !== newName) {
                const oldPath = file.path;
                const newPath = file.parent?.path === "/" ? newName : `${file.parent?.path}/${newName}`;
                await this.app.fileManager.renameFile(file, newPath);

                if (this.plugin.settings.plotColors.chapters[oldPath]) {
                    this.plugin.settings.plotColors.chapters[newPath] = this.plugin.settings.plotColors.chapters[oldPath];
                    delete this.plugin.settings.plotColors.chapters[oldPath];
                }
                Object.keys(this.plugin.settings.plotBeatsState).forEach(k => {
                    if (k.startsWith(`${oldPath}::`)) {
                        const val = this.plugin.settings.plotBeatsState[k];
                        delete this.plugin.settings.plotBeatsState[k];
                        this.plugin.settings.plotBeatsState[k.replace(`${oldPath}::`, `${newPath}::`)] = val;
                    }
                });
            }
        }
        await this.plugin.saveSettings();
        setTimeout(() => this.renderGrid(), 500);
    }

    private addNewStoryline() {
        new StorylinePromptModal(this.app, async (name) => {
            const newKey = name.replace(/\s+/g, '_');
            if (!this.plugin.settings.plotStorylineOrder.includes(newKey)) {
                this.plugin.settings.plotStorylineOrder.push(newKey);
                await this.plugin.saveSettings();
            }
            this.renderGrid();
        }).open();
    }

    private createCell(parent: HTMLElement, cls: string) {
        return parent.createDiv({ cls: `ns-grid-base-cell ${cls}` });
    }
}