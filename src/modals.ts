import { App, FuzzySuggestModal, Modal, Setting, TFile, Notice } from 'obsidian';
import { SCENE_COLORS, createIconButton } from './utils';

// 🌟 將抽離出去嘅 Modal 重新由呢度 Export，確保其他檔案唔會炒車！
export { SprintSetupModal } from './modals/SprintModal';
export { StatsDashboardModal } from './modals/StatsModal';
export { CorkboardModal, CorkboardDraftActionModal } from './modals/CorkboardModal';
export { WordCountModal } from './modals/WordCountModal';

// ============================================================
// 1. Generic Input Modal (Upgraded with Default Value)
// ============================================================
export class InputModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;
    title: string;
    defaultValue: string;

    constructor(app: App, title: string, onSubmit: (result: string) => void, defaultValue: string = "") {
        super(app);
        this.title = title;
        this.onSubmit = onSubmit;
        this.defaultValue = defaultValue;
        this.result = defaultValue;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.title });

        new Setting(contentEl)
            .setName('Name')
            .addText((text) => {
                text.setValue(this.defaultValue); // 🌟 載入預設文字
                text.onChange((value) => {
                    this.result = value;
                });
                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        this.onSubmit(this.result);
                        this.close();
                    }
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Submit")
                    .setCta()
                    .onClick(() => {
                        this.onSubmit(this.result);
                        this.close();
                    }));
    }

    onClose() {
        this.contentEl.empty();
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

    // 🌟 新增 format 參數，分辨用家揀咗 MD 定 HTML
    onSubmit: (options: CompileOptions, format: 'md' | 'html') => void;

    constructor(app: App, onSubmit: (options: CompileOptions, format: 'md' | 'html') => void) {
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
        // 🛠️ 升級版雙按鈕區：支援 Markdown 與 HTML 匯出
        // ==========================================
        const buttonArea = contentEl.createDiv();
        buttonArea.setCssStyles({
            marginTop: "20px",
            paddingTop: "15px",
            borderTop: "1px solid var(--background-modifier-border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px" // 🌟 兩個掣之間留白
        });

        new Setting(buttonArea)
            .addButton(btn => btn
                .setButtonText('Export as HTML (beta reader)')
                .onClick(() => {
                    this.close();
                    this.onSubmit(this.options, 'html');
                }))
            .addButton(btn => btn
                .setButtonText('Export as Markdown')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSubmit(this.options, 'md');
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
    confirmText: string;

    constructor(
        app: App,
        files: TFile[],
        onNext: (selected: TFile[]) => void,
        confirmText: string = "Next step (set cleanup options)" // 👈 就係加咗呢度！
    ) {
        super(app);
        this.allFiles = files;
        this.selectedSet = new Set(files);
        this.onNext = onNext;
        this.confirmText = confirmText;
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
                .setButtonText(this.confirmText)
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
    removeBold: boolean;
}

export class CleanDraftModal extends Modal {
    options: CleanDraftOptions = {
        removeComments: true,
        removeStrikethrough: true,
        removeHighlights: true,
        removeInternalLinks: true,
        removeBold: true
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
        new Setting(contentEl).setName("Remove bold ( ** )").setDesc("Remove the ** symbols but keep the text inside.").addToggle(toggle => toggle.setValue(this.options.removeBold).onChange(v => { this.options.removeBold = v; }));

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

        this.summaryContainer.empty();
        this.summaryContainer.createEl("b", { text: "A chart to be insert:" });
        this.summaryContainer.createEl("br");
        this.summaryContainer.createSpan({ text: "Novelsmith will read all scene data from " });
        this.summaryContainer.createSpan({ text: attrText, attr: { style: "font-weight: bold;" } });
        this.summaryContainer.createSpan({ text: " and shown as " });
        this.summaryContainer.createSpan({ text: chartText, attr: { style: "font-weight: bold;" } });

        if (this.config.chartType === 'table') {
            this.summaryContainer.createEl("br");
            this.summaryContainer.createSpan({ text: "Hint: it is DQL code, try customize yourself.", attr: { style: "color:var(--text-accent)" } });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}


