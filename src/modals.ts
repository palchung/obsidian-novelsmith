import { App, FuzzySuggestModal, Modal, Setting, TFile, Notice, MarkdownView } from 'obsidian';
import { SCENE_COLORS, createIconButton, replaceEntireDocument, cleanSceneTitle, extractSceneId } from './utils';
import { StructureView } from './managers/StructureView';
import Sortable from 'sortablejs';

// ============================================================
// 1. Generic Input Modal (Retained: for atomic saving)
// ============================================================
export class InputModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;
    title: string;

    constructor(app: App, title: string, onSubmit: (result: string) => void) {
        super(app);
        this.title = title;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.title });

        new Setting(contentEl)
            .setName('Name')
            .addText((text) =>
                text.onChange((value) => {
                    this.result = value;
                })
                    .inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            this.onSubmit(this.result);
                            this.close();
                        }
                    })
            );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Confirm')
                    .setCta()
                    .onClick(() => {
                        this.onSubmit(this.result);
                        this.close();
                    }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ============================================================
// 2. Generic Selection List (Suggester) (Retained: for history restoration)
// ============================================================
export class GenericSuggester<T> extends FuzzySuggestModal<T> {
    items: T[];
    getItemTextFunc: (item: T) => string;
    onChooseItemFunc: (item: T) => void;

    constructor(
        app: App,
        items: T[],
        getItemTextFunc: (item: T) => string,
        onChooseItemFunc: (item: T) => void
    ) {
        super(app);
        this.items = items;
        this.getItemTextFunc = getItemTextFunc;
        this.onChooseItemFunc = onChooseItemFunc;
    }

    getItems(): T[] {
        return this.items;
    }

    getItemText(item: T): string {
        return this.getItemTextFunc(item);
    }

    onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void {
        this.onChooseItemFunc(item);
    }
}

// ============================================================
// 3. 🔥 New: Compile Options Modal (CompileModal)
// ============================================================

export interface CompileOptions {
    removeYaml: boolean;      // Remove YAML
    removeSceneInfo: boolean; // Remove Scene Cards (Callout)
    removeComments: boolean;  // Remove %% comments %%
    removeStrikethrough: boolean; // Remove ~~ strikethrough ~~
    mergeBold: boolean;       // Merge ** bold text **
    removeHighlights: boolean;// Remove == highlights ==
    removeInternalLinks: boolean;
    insertFileNameAsHeading: string;
    hashtagAction: 'none' | 'remove-all' | 'remove-hash';
}

export class CompileModal extends Modal {
    options: CompileOptions = {
        removeYaml: true,
        removeSceneInfo: true,
        removeComments: true,
        removeStrikethrough: true,
        mergeBold: true,
        removeHighlights: true,
        removeInternalLinks: true,
        insertFileNameAsHeading: 'none',
        hashtagAction: 'none'
    };

    onSubmit: (options: CompileOptions) => void;

    constructor(app: App, onSubmit: (options: CompileOptions) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Compile & export settings' });
        contentEl.createEl('p', { text: 'Select the content to clean, these actions only affect the compiled file and will not modify your original manuscript.', cls: 'setting-item-description' });

        // ==========================================
        // 🛠️ Mobile UI Rescue: Create a "scrollable" options area
        // ==========================================
        const scrollArea = contentEl.createDiv();
        scrollArea.setCssStyles({
            maxHeight: "55vh", // Limit maximum height to 55% of the screen height
            overflowY: "auto",
            paddingRight: "10px" // Leave space for the scrollbar
        });

        new Setting(scrollArea)
            .setName("Insert file name as chapter headings")
            .setDesc("Insert corresponding level headings at the top of each chapter. To avoid conflicts with scene cards (h6), up to h5 is supported.")
            .addDropdown(drop => drop
                .addOption('none', 'Do not insert')
                .addOption('1', 'H1 (# heading)')
                .addOption('2', 'H2 (## heading)')
                .addOption('3', 'H3 (### heading)')
                .addOption('4', 'H4 (#### heading)')
                .addOption('5', 'H5 (##### heading)')
                .setValue(this.options.insertFileNameAsHeading)
                .onChange(value => this.options.insertFileNameAsHeading = value)
            );


        new Setting(scrollArea)
            .setName('Remove YAML frontmatter')
            .setDesc('Delete the --- configuration block at the beginning of the file.')
            .addToggle(toggle => toggle
                .setValue(this.options.removeYaml)
                .onChange(value => this.options.removeYaml = value));

        new Setting(scrollArea)
            .setName('Remove scene cards (callout)')
            .setDesc('Delete ###### and related callout blocks.')
            .addToggle(toggle => toggle
                .setValue(this.options.removeSceneInfo)
                .onChange(value => this.options.removeSceneInfo = value));

        new Setting(scrollArea)
            .setName('Remove comments')
            .setDesc('Delete all %% comments %%.')
            .addToggle(toggle => toggle
                .setValue(this.options.removeComments)
                .onChange(value => this.options.removeComments = value));

        new Setting(scrollArea)
            .setName('Remove strikethrough')
            .setDesc('Delete all ~~strikethrough~~ text.')
            .addToggle(toggle => toggle
                .setValue(this.options.removeStrikethrough)
                .onChange(value => this.options.removeStrikethrough = value));

        new Setting(scrollArea)
            .setName('Merge bold text (finalize)')
            .setDesc('Convert **bold text** into normal text.')
            .addToggle(toggle => toggle
                .setValue(this.options.mergeBold)
                .onChange(value => this.options.mergeBold = value));

        new Setting(scrollArea)
            .setName('Remove highlights')
            .setDesc('Remove all ==highlight symbols==.')
            .addToggle(toggle => toggle
                .setValue(this.options.removeHighlights)
                .onChange(value => this.options.removeHighlights = value));

        new Setting(scrollArea)
            .setName('Remove internal link symbols')
            .setDesc('Convert [[link|display name]] to plain text (keeping only the display name).')
            .addToggle(toggle => toggle
                .setValue(this.options.removeInternalLinks)
                .onChange(val => this.options.removeInternalLinks = val));

        // Below the removeInternalLinks Setting, add this section:
        new Setting(scrollArea)
            .setName("Hashtag processing")
            .setDesc("Process #tags in the manuscript (the system identifies accurately and will never accidentally delete # headers).")
            .addDropdown(drop => drop
                .addOption('none', 'Keep as is')
                .addOption('remove-hash', 'Remove # symbol only (e.g., #draft becomes draft)')
                .addOption('remove-all', 'Completely remove the tag and text')
                .setValue(this.options.hashtagAction)
                .onChange(value => this.options.hashtagAction = value as "none" | "remove-all" | "remove-hash")
            );

        // ==========================================
        // 🛠️ Mobile UI Rescue: Create an "always-at-bottom" button area
        // ==========================================
        const buttonArea = contentEl.createDiv();
        buttonArea.setCssStyles({
            marginTop: "20px",
            paddingTop: "10px",
            borderTop: "1px solid var(--background-modifier-border)",
            display: "flex",
            justifyContent: "flex-end" // Push buttons to the right
        });

        new Setting(buttonArea)
            .addButton(btn => btn
                .setButtonText('Start compilation')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSubmit(this.options);
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ============================================================
// 4. 🔥 New: Chapter Selection Modal (Step 1)
// ============================================================
export class ChapterSelectionModal extends Modal {
    allFiles: TFile[];
    selectedSet: Set<TFile>;
    onNext: (selected: TFile[]) => void;

    constructor(app: App, files: TFile[], onNext: (selected: TFile[]) => void) {
        super(app);
        this.allFiles = files;
        this.selectedSet = new Set(files); // Default select all
        this.onNext = onNext;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Step 1: select chapters to compile' });


        // --- Control Row: Select All / Deselect All ---
        const controlDiv = contentEl.createDiv({ cls: 'ns-chapter-controls' });
        controlDiv.setCssStyles({
            marginBottom: '10px',
            display: 'flex',
            gap: '10px'
        });

        const btnAll = createIconButton(controlDiv, "check-square", "Select all");
        btnAll.onclick = () => {
            this.allFiles.forEach(f => this.selectedSet.add(f));
            this.refreshList(listDiv);
        };

        const btnNone = createIconButton(controlDiv, "square", "Deselect all");
        btnNone.onclick = () => {
            this.selectedSet.clear();
            this.refreshList(listDiv);
        };

        // --- File List Container (Scrollable) ---
        const listDiv = contentEl.createDiv({ cls: 'ns-chapter-list' });
        listDiv.setCssStyles({
            maxHeight: '50vh',
            overflowY: 'auto',
            border: '1px solid var(--background-modifier-border)',
            padding: '10px',
            marginBottom: '20px',
            borderRadius: '4px'
        });

        // Render list
        this.refreshList(listDiv);

        // ==========================================
        // 🔥 Mobile UI Rescue: Fixed bottom button area
        // ==========================================
        const buttonArea = contentEl.createDiv();
        buttonArea.setCssStyles({
            borderTop: "1px solid var(--background-modifier-border)",
            paddingTop: "10px",
            display: "flex",
            justifyContent: "flex-end"
        });


        // --- Next Step Button ---
        new Setting(buttonArea)
            .addButton(btn => btn
                .setButtonText('Next step (set cleanup options)')
                .setCta()
                .onClick(() => {
                    // Filter out selected files (maintaining original order)
                    const finalSelection = this.allFiles.filter(f => this.selectedSet.has(f));

                    if (finalSelection.length === 0) {
                        new Notice("Please select at least one chapter!");
                        return;
                    }

                    this.close();
                    this.onNext(finalSelection); // Proceed to the next step
                }));
    }

    // Helper: Re-render list (when clicking select all/deselect all)
    refreshList(container: HTMLElement) {
        container.empty();
        this.allFiles.forEach(file => {
            new Setting(container)
                .setName(file.basename)
                .addToggle(toggle => toggle
                    .setValue(this.selectedSet.has(file))
                    .onChange(val => {
                        if (val) this.selectedSet.add(file);
                        else this.selectedSet.delete(file);
                    }));
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}


// 5. 🔥 New: Confirmation Modal (SimpleConfirmModal)
export class SimpleConfirmModal extends Modal {
    onConfirm: () => void;
    message: string;

    constructor(app: App, message: string, onConfirm: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: this.message });

        const div = contentEl.createDiv({ cls: 'modal-button-container' });

        const btnCancel = div.createEl('button', { text: 'Cancel' });
        btnCancel.onclick = () => this.close();

        const btnConfirm = div.createEl('button', { text: 'Confirm execution', cls: 'mod-cta' });
        btnConfirm.onclick = () => {
            this.close();
            this.onConfirm();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}


export interface CleanDraftOptions {
    removeComments: boolean;
    removeStrikethrough: boolean;
    removeHighlights: boolean;
    removeInternalLinks: boolean;
}

export class CleanDraftModal extends Modal {
    options: CleanDraftOptions = {
        removeComments: true,
        removeStrikethrough: true,
        removeHighlights: true,
        removeInternalLinks: true
    };
    onSubmit: (options: CleanDraftOptions) => void;

    constructor(app: App, onSubmit: (options: CleanDraftOptions) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Clean draft" });
        contentEl.createEl("p", { text: "Select the markers to clear from the current document (default is select all):", cls: "setting-item-description" });

        new Setting(contentEl).setName("Remove comments (%%...%%)").addToggle(t => t.setValue(this.options.removeComments).onChange(v => this.options.removeComments = v));
        new Setting(contentEl).setName("Remove strikethrough (~~...~~)").addToggle(t => t.setValue(this.options.removeStrikethrough).onChange(v => this.options.removeStrikethrough = v));
        new Setting(contentEl).setName("Remove highlights (==...==)").addToggle(t => t.setValue(this.options.removeHighlights).onChange(v => this.options.removeHighlights = v));
        new Setting(contentEl).setName("Remove internal links ([...])").setDesc("Keep display text, remove only the double brackets.").addToggle(t => t.setValue(this.options.removeInternalLinks).onChange(v => this.options.removeInternalLinks = v));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Confirm cleanup")
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSubmit(this.options);
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ============================================================
// 🎨 Premium Scene Card Creator (Supports color selection)
// ============================================================
export class SceneCreateModal extends Modal {
    titleText: string;
    defaultName: string;
    onSubmit: (result: string, colorId: string) => void;
    inputEl!: HTMLInputElement;
    selectedColorId: string = "default";

    constructor(app: App, titleText: string, defaultName: string = "", onSubmit: (result: string, colorId: string) => void) {
        super(app);
        this.titleText = titleText;
        this.defaultName = defaultName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: this.titleText });

        new Setting(contentEl)
            .setName("Scene name")
            .addText(text => {
                text.setValue(this.defaultName);
                text.onChange(value => { this.defaultName = value; });
                this.inputEl = text.inputEl;
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") this.submit();
                });
            });

        const colorSetting = new Setting(contentEl)
            .setName("Tag color")
            .setDesc("Select a representative color for this scene (optional).");

        // Create color picker container
        const colorContainer = colorSetting.controlEl.createDiv({ cls: "ns-color-picker-container" });
        colorContainer.setCssStyles({
            display: "flex",
            gap: "8px"
        });

        SCENE_COLORS.forEach(color => {
            const btn = colorContainer.createEl("button", { text: color.icon, title: color.name });
            btn.setCssStyles({
                width: "32px",
                height: "32px",
                padding: "0",
                borderRadius: "50%",
                border: this.selectedColorId === color.id ? "2px solid var(--interactive-accent)" : "2px solid transparent",
                backgroundColor: "transparent",
                cursor: "pointer",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
            });

            btn.onclick = () => {
                this.selectedColorId = color.id;
                // Reset all borders, highlight the selected color
                Array.from(colorContainer.children).forEach((child: HTMLElement) => {
                    child.setCssStyles({ border: "2px solid transparent" });
                });
                btn.setCssStyles({ border: "2px solid var(--interactive-accent)" });
            };
        });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Confirm")
                .setCta()
                .onClick(() => this.submit()));

        setTimeout(() => this.inputEl.focus(), 100);
    }

    submit() {
        if (!this.defaultName.trim()) {
            new Notice("Please enter a scene name!");
            return;
        }
        this.close();
        this.onSubmit(this.defaultName, this.selectedColorId);
    }

    onClose() {
        this.contentEl.empty();
    }

}

// ============================================================
// 📊 Dashboard Builder Modal ()
// ============================================================
export interface DashboardConfig {
    attributes: string[];
    chartType: 'table' | 'pie' | 'bar';
    tableStyle: 'stats' | 'progress';
    limit: number; // 0 mean All data
    flatten: boolean; // split array ? (e.g. [[A]], [[B]])
}

export class DashboardBuilderModal extends Modal {
    availableAttributes: string[];
    config: DashboardConfig = {
        attributes: [],
        chartType: 'table',
        tableStyle: 'progress',
        limit: 0,
        flatten: true
    };
    onSubmit: (config: DashboardConfig) => void;


    optionsContainer: HTMLElement;
    summaryContainer: HTMLElement;

    constructor(app: App, availableAttributes: string[], onSubmit: (config: DashboardConfig) => void) {
        super(app);
        this.availableAttributes = availableAttributes;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Insert chart (dashboard builder)' });

        // ==========================================
        // 🏷️ Step 1：Select attributes (Chips)
        // ==========================================
        contentEl.createEl('h4', { text: '1. What scene card data to be included? (can choose more than one)' });
        const chipsContainer = contentEl.createDiv({ cls: 'ns-chips-container' });
        chipsContainer.setCssStyles({ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' });

        this.availableAttributes.forEach(attr => {
            const chip = chipsContainer.createEl('button', { text: attr });

            // default format
            const updateChipStyle = () => {
                const isSelected = this.config.attributes.includes(attr);
                chip.setCssStyles({
                    borderRadius: '16px', padding: '4px 12px', cursor: 'pointer', transition: 'all 0.2s',
                    backgroundColor: isSelected ? 'var(--interactive-accent)' : 'var(--background-secondary)',
                    color: isSelected ? 'var(--text-on-accent)' : 'var(--text-normal)',
                    border: isSelected ? '1px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)'
                });
            };
            updateChipStyle();

            chip.onclick = () => {
                if (this.config.attributes.includes(attr)) {
                    this.config.attributes = this.config.attributes.filter(a => a !== attr); // exclude
                } else {
                    this.config.attributes.push(attr); // include
                }
                updateChipStyle();
                this.refreshUI();
            };
        });

        // ==========================================
        // ⚙️ Step 2：Chart type
        // ==========================================
        contentEl.createEl('h4', { text: '2. Select a chart?' });
        this.optionsContainer = contentEl.createDiv();

        // ==========================================
        // 📝 Step 3：Speak in English (Mad Libs UI)
        // ==========================================
        contentEl.createEl('h4', { text: '3. Confirm your choice' });
        this.summaryContainer = contentEl.createDiv();
        this.summaryContainer.setCssStyles({
            padding: '15px', backgroundColor: 'var(--background-secondary-alt)',
            borderRadius: '8px', borderLeft: '4px solid var(--interactive-accent)',
            marginBottom: '20px', lineHeight: '1.6', fontSize: '1.05em'
        });

        // ==========================================
        // 🚀 底部按鈕
        // ==========================================
        const btnRow = contentEl.createDiv();
        btnRow.setCssStyles({ display: 'flex', justifyContent: 'flex-end', gap: '10px' });

        btnRow.createEl('button', { text: 'Cancel' }).onclick = () => this.close();

        const btnSubmit = btnRow.createEl('button', { text: 'Insert chart here', cls: 'mod-cta' });
        btnSubmit.onclick = () => {
            if (this.config.attributes.length === 0) {
                new Notice("Please at least pick one.");
                return;
            }
            this.close();
            this.onSubmit(this.config);
        };


        this.refreshUI();
    }


    refreshUI() {
        this.optionsContainer.empty();

        // 1. Chart options
        new Setting(this.optionsContainer)
            .setName('Chart type')
            .addDropdown(drop => drop
                .addOption('table', 'Table')
                .addOption('bar', 'Bar chart')
                .addOption('pie', 'Pie chart')
                .setValue(this.config.chartType)
                .onChange(val => {
                    this.config.chartType = val as 'table' | 'pie' | 'bar';
                    this.refreshUI();
                })
            );

        // Table
        if (this.config.chartType === 'table') {
            new Setting(this.optionsContainer)
                .setName('Table style')
                .setDesc('Process table (group by chapters; stats table (group by scene card data).')
                .addDropdown(drop => drop
                    .addOption('progress', 'Progress table (group by chapters)')
                    .addOption('stats', 'Stats table (group by scene card data)')
                    .setValue(this.config.tableStyle)
                    .onChange(val => {
                        this.config.tableStyle = val as 'stats' | 'progress';
                        this.refreshUI();
                    })
                );
        }

        // 2. Split items
        new Setting(this.optionsContainer)
            .setName('Split scene card data')
            .setDesc('Split scene card items automatically, e.g character:: alice, bob.')
            .addToggle(toggle => toggle
                .setValue(this.config.flatten)
                .onChange(val => { this.config.flatten = val; this.refreshUI(); })
            );

        // 3. Table and Bar chart only
        if (this.config.chartType === 'bar' || (this.config.chartType === 'table' && this.config.tableStyle === 'stats')) {
            new Setting(this.optionsContainer)
                .setName('How scenes to track')
                .addDropdown(drop => drop
                    .addOption('0', 'All')
                    .addOption('3', 'Last 3 scenes')
                    .addOption('5', 'Last 5 scenes')
                    .addOption('10', 'Last 10 scenes')
                    .setValue(this.config.limit.toString())
                    .onChange(val => { this.config.limit = parseInt(val); this.refreshUI(); })
                );
        }

        // 4. 📝 Plain English
        const attrText = this.config.attributes.length > 0 ? `**[${this.config.attributes.join(', ')}]**` : '**[null]**';
        let chartText = '**[Table]**';
        if (this.config.chartType === 'pie') chartText = '**[Pie chart]**';
        if (this.config.chartType === 'bar') chartText = '**[Bar chart]**';
        if (this.config.chartType === 'table' && this.config.tableStyle === 'progress') chartText = '**[progress table (group by chapters)]**';

        // eslint-disable-next-line @microsoft/sdl/no-inner-html
        this.summaryContainer.innerHTML = `
            💡 <b>A chart to be insert:</b><br>
            novelsmith will read all scene data from ${attrText}, and shown as ${chartText}<br>
            ${this.config.chartType === 'table' ? '<span style="color:var(--text-accent)">Hint: it is DQL code, try customize yourself.</span>' : ''}
        `;
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ============================================================
// 📌 軟木板模式 (Corkboard View Modal)
// ============================================================

export class CorkboardModal extends Modal {
    view: StructureView;
    editorView: MarkdownView;
    sortables: Sortable[] = [];

    constructor(app: App, view: StructureView, editorView: MarkdownView) {
        super(app);
        this.view = view;
        this.editorView = editorView;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.modalEl.setCssStyles({
            width: "90vw",
            height: "90vh",
            maxWidth: "none",
            maxHeight: "none"
        });

        contentEl.setCssStyles({ display: "flex", flexDirection: "column", height: "100%" });
        this.modalEl.addClass("ns-corkboard-modal");

        const header = contentEl.createDiv({ cls: "ns-corkboard-header" });
        header.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--background-modifier-border)", paddingBottom: "10px", marginBottom: "20px" });

        header.createEl("h2", { text: "📌 軟木板大綱 (Corkboard)", attr: { style: "margin: 0; color: var(--text-accent);" } });
        header.createSpan({ text: "💡 提示：長按卡片即可隨意拖曳調位 (即將推出)", attr: { style: "opacity: 0.6; font-size: 0.9em;" } });

        const gridContainer = contentEl.createDiv({ cls: "ns-corkboard-grid" });
        gridContainer.setCssStyles({
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: "20px", padding: "10px", alignItems: "start", alignContent: "start",
            flexGrow: "1", overflowY: "auto"
        });

        // 🌟 呼叫全新嘅真實卡片渲染器！
        this.renderCards(gridContainer);
    }

    // ==========================================
    // 🃏 核心魔法：看板模式 (Kanban / Swimlanes)
    // ==========================================
    renderCards(container: HTMLElement) {
        // 清理舊引擎
        this.sortables.forEach(s => s.destroy());
        this.sortables = [];
        container.empty();

        const activeView = this.editorView;
        if (!activeView) return;

        const text = activeView.editor.getValue();
        const tree = this.view.parseDocument(text);
        const isScrivenings = text.includes('++ FILE_ID:');

        // 🌟 改變容器排版：變成橫向滑動嘅看板大畫布
        container.setCssStyles({
            display: "flex",
            flexDirection: "row", // 打橫排
            gap: "20px",
            padding: "10px",
            alignItems: "stretch",
            overflowX: "auto", // iPad 橫向滑動神器
            overflowY: "hidden",
            height: "100%"
        });

        let sceneCount = 0;
        const renderNameCount = new Map<string, number>();

        // 🌟 遍歷每個章節 (Chapter)，建立獨立直欄 (Column)
        tree.forEach((chapter, chapterIndex) => {
            let chapterTitle = chapter.name.replace(/# 📄 |<span.*?<\/span>/g, "").trim();

            // 🌟 修正 1：隱藏 Scrivenings 模式下頂部嗰個無用嘅 root 區塊
            if (isScrivenings && chapterIndex === 0 && chapterTitle.toLowerCase() === "root" && chapter.scenes.length === 0) {
                return; // 直接跳過，唔好畫個空直欄出嚟！
            }

            // 🌟 修正 2：如果係普通草稿，將 root 改個好聽啲嘅名
            if (!chapterTitle || chapterTitle.toLowerCase() === "root") {
                chapterTitle = isScrivenings ? "未分類區塊" : "當前草稿";
            }

            // 建立直欄
            const col = container.createDiv({ cls: "ns-corkboard-column" });
            col.setCssStyles({
                display: "flex", flexDirection: "column",
                minWidth: "320px", maxWidth: "320px",
                backgroundColor: "var(--background-secondary-alt)",
                borderRadius: "10px", padding: "12px",
                maxHeight: "100%", border: "1px solid var(--background-modifier-border)"
            });

            col.createEl("h3", {
                text: `📁 ${chapterTitle}`,
                attr: { style: "margin: 0 0 15px 0; font-size: 1.1em; color: var(--text-normal); text-align: center; border-bottom: 2px solid var(--background-modifier-border); padding-bottom: 10px;" }
            });










            // 建立卡片放置區 (List Container)
            const listContainer = col.createDiv({ cls: "ns-corkboard-list" });
            listContainer.setCssStyles({
                display: "flex", flexDirection: "column", gap: "15px",
                overflowY: "auto", flexGrow: "1", minHeight: "100px", paddingRight: "5px"
            });
            listContainer.dataset.chapterIndex = chapterIndex.toString(); // 記低屬於邊個章節

            // 遍歷章節內嘅場景，生成卡片
            chapter.scenes.forEach(scene => {
                sceneCount++;
                let safeKey = scene.id;
                if (!safeKey) {
                    const count = renderNameCount.get(scene.name) || 0;
                    safeKey = `NO_ID_${scene.name}_${count}`;
                    renderNameCount.set(scene.name, count + 1);
                }

                const card = listContainer.createDiv({ cls: "ns-corkboard-card" });
                card.setCssStyles({
                    backgroundColor: "var(--background-primary)",
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "8px", padding: "15px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    display: "flex", flexDirection: "column", gap: "10px",
                    cursor: "grab", position: "relative"
                });
                card.dataset.safeKey = safeKey;

                // 卡片標題
                card.createEl("h4", { text: `🎬 ${scene.name.replace(/<span.*?<\/span>/g, "")}`, attr: { style: "margin: 0; color: var(--text-accent); font-size: 1.05em;" } });

                // 動態屬性提取
                let noteText = "📝 (未填寫大綱筆記)";
                const dynamicTags: { key: string, value: string }[] = [];
                const lines = scene.content.split('\n');
                for (let line of lines) {
                    const clean = line.trim();
                    if (clean.startsWith('> - ')) {
                        const match = clean.match(/> -\s*(.*?)::\s*(.*)/);
                        if (match) {
                            const key = match[1].trim();
                            const value = match[2].trim();
                            if (key.toLowerCase() === 'note' || key === '備註') noteText = value;
                            else dynamicTags.push({ key, value });
                        }
                    }
                }

                // 內文
                const noteEl = card.createDiv({ text: noteText });
                noteEl.setCssStyles({
                    flexGrow: "1", fontSize: "0.9em", opacity: noteText.includes("(未填寫") ? "0.4" : "0.8",
                    whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "hidden", textOverflow: "ellipsis"
                });

                // 標籤
                const footer = card.createDiv();
                footer.setCssStyles({ display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "0.8em", marginTop: "auto", paddingTop: "10px", borderTop: "1px solid var(--background-modifier-border)" });
                dynamicTags.forEach(tag => {
                    let icon = "🏷️";
                    if (tag.key.toLowerCase().includes("pov") || tag.key.includes("視角")) icon = "👁️";
                    if (tag.key.toLowerCase().includes("status") || tag.key.includes("狀態")) icon = "📌";
                    footer.createSpan({ text: `${icon} ${tag.key}: ${tag.value.replace(/[[\]]/g, '')}`, attr: { style: "background: var(--background-secondary); padding: 2px 6px; border-radius: 4px; opacity: 0.8;" } });
                });
            });

            // 🌟 為每個章節嘅直欄獨立啟動 SortableJS，並設定 Group 允許跨欄拖曳！
            this.sortables.push(new Sortable(listContainer, {
                group: 'kanban-board',  // 🔥 關鍵魔法：相同 group 就可以互相拉來拉去！
                animation: 150,
                delay: 100, delayOnTouchOnly: true,
                ghostClass: 'ns-sortable-ghost',
                onEnd: () => {
                    // 任何拖曳放手後，觸發全域儲存
                    this.saveCorkboardOrder(container);
                }
            }));
        });

        if (sceneCount === 0) {
            container.createDiv({ text: "找不到任何場景卡片。", attr: { style: "opacity: 0.6; padding: 20px;" } });
        }
    }

    // ==========================================
    // 💾 儲存跨章節拖曳後的新順序 (雙引擎終極版)
    // ==========================================
    saveCorkboardOrder(container: HTMLElement) {
        const editor = this.editorView.editor;
        const liveText = editor.getValue();
        const isScrivenings = liveText.includes('++ FILE_ID:');

        new Notice("🔄 更新草稿結構中...");

        if (!isScrivenings) {
            // =========================================================
            // 🌟 引擎 A：單獨章節模式 (100% 精準嘅 AST 解析器)
            // =========================================================
            const liveTree = this.view.parseDocument(liveText);
            const liveSceneMap = new Map<string, string>();
            const liveNameCount = new Map<string, number>();

            // 1. 建立精準嘅場景緩存
            liveTree.forEach(ch => {
                ch.scenes.forEach(sc => {
                    let safeKey = sc.id;
                    if (!safeKey) {
                        const count = liveNameCount.get(sc.name) || 0;
                        safeKey = `NO_ID_${sc.name}_${count}`;
                        liveNameCount.set(sc.name, count + 1);
                    }
                    liveSceneMap.set(safeKey, sc.content);
                });
            });

            const chunks: string[] = [];
            // 2. 放入頂部前言 (例如 YAML 等)
            if (liveTree[0] && liveTree[0].preamble) {
                chunks.push(liveTree[0].preamble.trimEnd());
            }

            // 3. 根據軟木板的新順序，完美重組
            const cards = container.querySelectorAll(".ns-corkboard-card");
            cards.forEach(card => {
                const safeKey = (card as HTMLElement).dataset.safeKey;
                if (safeKey && liveSceneMap.has(safeKey)) {
                    chunks.push("\n\n" + liveSceneMap.get(safeKey)!.trimEnd());
                }
            });

            // 4. 無痕寫入
            const finalText = chunks.join("").trim() + "\n";
            replaceEntireDocument(editor, finalText);
            this.view.lastOutlineHash = ""; // 觸發側邊欄刷新
            return; // 搞掂！提早結束！
        }

        // =========================================================
        // 🌟 引擎 B：串聯草稿模式 (保留 FILE ID 嘅正則切割器)
        // =========================================================
        const chapterParts = liveText.split(/(?=^[ \t]*# 📄 )/m);
        const preambles: string[] = [];
        const liveSceneMap = new Map<string, string>();
        const liveNameCount = new Map<string, number>();

        chapterParts.forEach(part => {
            const sceneParts = part.split(/(?=^[ \t]*######\s)/m);
            preambles.push(sceneParts[0]);

            for (let i = 1; i < sceneParts.length; i++) {
                const scText = sceneParts[i];
                const titleMatch = scText.match(/^[ \t]*######\s+(.*)$/m);
                if (titleMatch) {
                    const fullHeader = `###### ${titleMatch[1]}`;
                    let safeKey = extractSceneId(fullHeader);

                    if (!safeKey) {
                        const cleanName = cleanSceneTitle(fullHeader);
                        const count = liveNameCount.get(cleanName) || 0;
                        safeKey = `NO_ID_${cleanName}_${count}`;
                        liveNameCount.set(cleanName, count + 1);
                    }
                    liveSceneMap.set(safeKey, scText);
                }
            }
        });

        const chunks: string[] = [];
        if (preambles[0]) chunks.push(preambles[0].trimEnd());

        const columns = container.querySelectorAll(".ns-corkboard-list");
        columns.forEach((listEl) => {
            const originalIndex = parseInt((listEl as HTMLElement).dataset.chapterIndex || "0");

            if (originalIndex > 0 && originalIndex < preambles.length) {
                chunks.push("\n\n" + preambles[originalIndex].trimEnd());
            }

            const cards = listEl.querySelectorAll(".ns-corkboard-card");
            cards.forEach(card => {
                const safeKey = (card as HTMLElement).dataset.safeKey;
                if (safeKey && liveSceneMap.has(safeKey)) {
                    chunks.push("\n\n" + liveSceneMap.get(safeKey)!.trimEnd());
                }
            });
        });

        const finalText = chunks.join("") + "\n";
        replaceEntireDocument(editor, finalText);
        this.view.lastOutlineHash = "";
    }

    onClose() {
        const { contentEl } = this;
        this.sortables.forEach(s => s.destroy()); // 🌟 銷毀所有直欄引擎
        this.sortables = [];
        contentEl.empty();
        this.view.lastOutlineHash = "";
        void this.view.parseAndRender();
    }
}