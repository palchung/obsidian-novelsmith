import { ItemView, WorkspaceLeaf, Notice, setIcon, TFile, Modal, Setting, App } from 'obsidian';
import NovelSmithPlugin from '../../main';
import { getManuscriptFiles, parseContent } from '../utils';

export const VIEW_TYPE_PLOTGRID = "novelsmith-plotgrid-view";

// ============================================================
// 1. 新增：專屬嘅 Add Column 彈出視窗
// ============================================================
export class PlotColumnModal extends Modal {
    onSubmit: (name: string, type: "tracking" | "scene") => void;
    colName: string = "";
    colType: "tracking" | "scene" = "scene";

    constructor(app: App, onSubmit: (name: string, type: "tracking" | "scene") => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Add new plot column" });

        new Setting(contentEl)
            .setName("Column name (屬性名稱)")
            .setDesc("例如：主角線、反派線、地點、時間")
            .addText(text => text
                .setPlaceholder("輸入名稱...")
                .setValue(this.colName)
                .onChange(value => this.colName = value));

        new Setting(contentEl)
            .setName("Column type (屬性類別)")
            .setDesc("Scene (劇情行)：從劇情卡片中提取。tracking (追蹤行)：從章節頂部備註中提取。")
            .addDropdown(drop => drop
                .addOption("scene", "Scene (劇情行)")
                .addOption("tracking", "Tracking (追蹤行)")
                .setValue(this.colType)
                .onChange(value => this.colType = value as "tracking" | "scene"));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Add Column")
                .setCta()
                .onClick(() => {
                    if (!this.colName.trim()) {
                        new Notice("Please enter a column name.");
                        return;
                    }
                    this.close();
                    this.onSubmit(this.colName.trim(), this.colType);
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ============================================================
// 2. 主視圖：PlotGridView
// ============================================================
export class PlotGridView extends ItemView {
    plugin: NovelSmithPlugin;
    targetFolderPath: string = "";
    viewScope: "micro" | "macro" = "micro";

    // 🌟 依然係白紙一張，但準備好裝載你嘅自訂屬性
    userColumns: { name: string, type: "tracking" | "scene" }[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: NovelSmithPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_PLOTGRID; }
    getDisplayText() { return "Plot grid"; }
    getIcon() { return "table"; }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ns-plotgrid-view");

        // 頂部控制列
        const headerEl = contentEl.createDiv({ cls: "ns-plotgrid-header" });
        headerEl.setCssStyles({
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 15px", borderBottom: "1px solid var(--background-modifier-border)",
            backgroundColor: "var(--background-secondary)"
        });

        const titleGroup = headerEl.createDiv({ attr: { style: "display: flex; alignItems: center; gap: 8px;" } });
        const iconSpan = titleGroup.createSpan();
        setIcon(iconSpan, "table");
        iconSpan.setCssStyles({ color: "var(--interactive-accent)" });
        titleGroup.createEl("h3", { text: "Plot grid", attr: { style: "margin: 0;" } });

        const controlsGroup = headerEl.createDiv({ attr: { style: "display: flex; gap: 10px; alignItems: center;" } });

        const scopeSelect = controlsGroup.createEl("select", { cls: "dropdown" });
        scopeSelect.createEl("option", { value: "micro", text: "Current book" });
        scopeSelect.createEl("option", { value: "macro", text: "Entire series (god mode)" });
        scopeSelect.value = this.viewScope;

        scopeSelect.onchange = async () => {
            this.viewScope = scopeSelect.value as "micro" | "macro";
            await this.renderGrid();
        };

        // 載入儲存的屬性
        this.userColumns = this.plugin.settings.plotGridColumns || [];

        const addColBtn = controlsGroup.createEl("button");
        addColBtn.setCssStyles({ display: "flex", alignItems: "center", gap: "6px" });
        setIcon(addColBtn.createSpan(), "plus");
        addColBtn.createSpan({ text: "Add Column" });
        addColBtn.onclick = () => {
            new PlotColumnModal(this.plugin.app, async (name, type) => {
                if (this.userColumns.some(c => c.name === name)) {
                    new Notice(`Column "${name}" already exists!`);
                    return;
                }

                this.userColumns.push({ name, type });
                // 儲存到 settings
                this.plugin.settings.plotGridColumns = this.userColumns;
                await this.plugin.saveSettings();

                await this.renderGrid();
                new Notice(`Added column: ${name}`);
            }).open();
        };

        // 網格大畫布容器
        const gridWrapper = contentEl.createDiv({ cls: "ns-plotgrid-wrapper" });
        gridWrapper.setCssStyles({
            flexGrow: "1", width: "100%", height: "100%", overflow: "auto",
            backgroundColor: "var(--background-primary)", position: "relative"
        });

        gridWrapper.createDiv({ cls: "ns-plotgrid-container" });

        await this.renderGrid();
    }

    // ==========================================
    // 🎨 渲染網格邏輯
    // ==========================================
    async renderGrid() {
        const gridContainer = this.contentEl.querySelector(".ns-plotgrid-container");
        if (!gridContainer) return;
        gridContainer.empty();
        gridContainer.createDiv({ text: "Scanning manuscript...", attr: { style: "padding: 20px; opacity: 0.5;" } });

        if (!this.plugin.settings.bookFolderPath) {
            gridContainer.empty();
            gridContainer.createDiv({ text: "Please set a Book Folder Path in settings first.", attr: { style: "padding: 20px;" } });
            return;
        }

        // 智能掃描器
        const allFiles = this.plugin.app.vault.getMarkdownFiles().filter(f => {
            if (f.name.startsWith("_") || f.name.startsWith("Script_") || f.name === '${DRAFT_FILENAME}') return false;
            if (f.path.includes(`/_Backstage/`)) return false;
            if (this.plugin.settings.exportFolderPath && f.path.startsWith(this.plugin.settings.exportFolderPath)) return false;
            if (this.plugin.settings.wikiFolderPath && f.path.startsWith(this.plugin.settings.wikiFolderPath)) return false;

            if (this.viewScope === "micro") return f.parent?.path === this.targetFolderPath;
            else return f.path.startsWith(this.plugin.settings.bookFolderPath);
        });
        allFiles.sort((a, b) => a.path.localeCompare(b.path));

        const foldersMap = new Map<string, TFile[]>();
        const cellData = new Map<string, Map<string, string>>();

        for (const file of allFiles) {
            const folderName = file.parent?.name || "Root";
            if (!foldersMap.has(folderName)) foldersMap.set(folderName, []);
            foldersMap.get(folderName).push(file);

            const content = await this.plugin.app.vault.read(file);
            const parsed = parseContent(content, true, this.plugin.app, file);
            const fileRowData = new Map<string, string>();

            this.userColumns.forEach(col => {
                if (col.type === "tracking") {
                    if (parsed.preamble) {
                        const regex = new RegExp(`^>\\s*-\\s*${col.name}::\\s*(.*)`, "im");
                        const match = parsed.preamble.match(regex);
                        if (match) fileRowData.set(col.name, match[1].trim());
                    }
                } else if (col.type === "scene") {
                    const matchedCards = parsed.cards.filter(card => card.meta.some(metaLine => metaLine.includes(col.name)));
                    if (matchedCards.length > 0) {
                        const sceneText = matchedCards.map(c => `[${c.title}]`).join("\n");
                        fileRowData.set(col.name, sceneText);
                    }
                }
            });

            cellData.set(file.path, fileRowData);
        }

        gridContainer.empty();
        gridContainer.setCssStyles({
            display: "grid",
            gridTemplateColumns: this.userColumns.length > 0 ? `220px repeat(${this.userColumns.length}, 250px)` : "220px",
            width: "max-content",
        });

        // 左上角
        const cornerCell = this.createCell(gridContainer, "ns-grid-header-corner");
        setIcon(cornerCell.createSpan(), "file-text");
        cornerCell.createSpan({ text: "Chapters" });

        // 🌟 畫 X 軸表頭 ＋ 垃圾桶刪除掣
        this.userColumns.forEach(col => {
            const headCell = this.createCell(gridContainer, "ns-grid-header-top");
            headCell.style.justifyContent = "space-between"; // 等個垃圾桶去到最右邊

            const titleLeft = headCell.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px;" } });
            setIcon(titleLeft.createSpan(), col.type === "tracking" ? "tag" : "users");
            titleLeft.createSpan({ text: col.name });

            const deleteBtn = headCell.createSpan();
            setIcon(deleteBtn, "trash-2");
            deleteBtn.setCssStyles({ cursor: "pointer", opacity: "0.3", padding: "4px" });
            deleteBtn.addEventListener("mouseover", () => deleteBtn.setCssStyles({ opacity: "1", color: "var(--text-error)" }));
            deleteBtn.addEventListener("mouseout", () => deleteBtn.setCssStyles({ opacity: "0.3", color: "initial" }));

            // 點擊垃圾桶，刪除屬性並重畫網格
            deleteBtn.onclick = async () => {
                this.userColumns = this.userColumns.filter(c => c.name !== col.name);
                // 儲存到 settings
                this.plugin.settings.plotGridColumns = this.userColumns;
                await this.plugin.saveSettings();

                await this.renderGrid();
                new Notice(`Removed column: ${col.name}`);
            };
        });

        // 畫 Y 軸
        foldersMap.forEach((files, folderName) => {
            const folderDivider = this.createCell(gridContainer, "ns-grid-folder-divider");
            folderDivider.style.gridColumn = `1 / -1`;

            const folderLeft = folderDivider.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px;" } });
            setIcon(folderLeft.createSpan(), "folder-open");
            folderLeft.createSpan({ text: folderName });

            files.forEach(file => {
                const fileCell = this.createCell(gridContainer, "ns-grid-header-left");
                setIcon(fileCell.createSpan(), "file");
                fileCell.createSpan({ text: file.basename });

                this.userColumns.forEach(col => {
                    const cell = this.createCell(gridContainer, "ns-grid-cell");
                    cell.dataset.filePath = file.path;
                    cell.dataset.colName = col.name;
                    cell.dataset.colType = col.type;

                    const textContent = cellData.get(file.path)?.get(col.name) || "";
                    const textSpan = cell.createSpan({ text: textContent || "(Click to type...)" });
                    textSpan.style.color = textContent ? "var(--text-normal)" : "var(--text-muted)";

                    cell.onclick = () => this.handleInlineEdit(cell, textSpan);
                });
            });
        });

        if (this.userColumns.length === 0) {
            const emptyPrompt = gridContainer.createDiv();
            emptyPrompt.setCssStyles({
                position: "absolute", left: "250px", top: "80px",
                color: "var(--text-muted)", opacity: "0.5", fontStyle: "italic", padding: "20px"
            });
            emptyPrompt.innerText = "只有章節。請撳右上角「Add column」建立你專屬嘅大綱網格。";
        }
    }

    private createCell(parent: HTMLElement, className: string): HTMLElement {
        return parent.createDiv({ cls: `ns-grid-base-cell ${className}` });
    }

    private handleInlineEdit(cell: HTMLElement, textSpan: HTMLElement) {
        if (cell.querySelector("textarea")) return;

        let originalText = textSpan.innerText;
        if (originalText === "(Click to type...)") originalText = "";
        cell.empty();

        const input = cell.createEl("textarea", { cls: "ns-grid-auto-textarea" });
        input.value = originalText;

        const autoResize = () => {
            input.style.height = "auto";
            input.style.height = input.scrollHeight + "px";
        };
        input.addEventListener("input", autoResize);
        setTimeout(autoResize, 0);
        input.focus();

        input.onblur = async () => {
            const newText = input.value.trim();
            cell.empty();

            const newSpan = cell.createSpan();
            if (newText) {
                newSpan.innerText = newText;
                newSpan.style.color = "var(--text-normal)";
            } else {
                newSpan.innerText = "(Click to type...)";
                newSpan.style.color = "var(--text-muted)";
            }

            cell.onclick = () => this.handleInlineEdit(cell, newSpan);

            // 如果文字沒有改變，就不做任何事
            if (newText === originalText) return;

            // 執行實體檔案寫入
            const filePath = cell.dataset.filePath;
            const colName = cell.dataset.colName;
            const colType = cell.dataset.colType;

            if (!filePath || !colName) return;

            const targetFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!(targetFile instanceof TFile)) return;

            let content = await this.plugin.app.vault.read(targetFile);

            if (colType === "tracking") {
                // 處理 Tracking (寫入 Preamble)
                const regex = new RegExp(`(^>\\s*-\\s*${colName}::\\s*)(.*)`, "im");
                if (regex.test(content)) {
                    // 如果屬性已經存在，直接替換
                    content = content.replace(regex, `$1${newText}`);
                } else {
                    // 如果屬性不存在，尋找 Preamble 的結尾或插入在最前面
                    const noteMatch = content.match(/^>\s*-\s*Note::/im);
                    if (noteMatch) {
                        content = content.replace(/^>\s*-\s*Note::/im, `> - ${colName}:: ${newText}\n> - Note::`);
                    } else {
                        // 如果沒有標準格式，強制加在檔頭
                        content = `> [!info] Chapter Notes\n> - ${colName}:: ${newText}\n\n` + content;
                    }
                }
            } else if (colType === "scene") {
                // 處理 Scene (建立新的劇情卡)
                if (newText) {
                    const cleanText = newText.replace(/\n/g, " "); // 防止多行破壞標題結構
                    const newSceneCard = `\n\n###### ${cleanText}\n> [!NSmith] Scene Info\n> - ${colName}:: ${cleanText}\n> - Status:: #Writing\n> - Note:: \n\n(Write your scene here...)\n`;
                    content = content + newSceneCard;
                }
            }

            await this.plugin.app.vault.modify(targetFile, content);
            new Notice(`Saved to file: ${targetFile.basename}`);
        };
    }

    async onClose() {
        this.contentEl.empty();
    }
}