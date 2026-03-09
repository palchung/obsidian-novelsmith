import { App, TFolder, Menu, setIcon, FuzzySuggestModal, Modal, Setting, TFile, Notice, MarkdownView, MarkdownRenderer } from 'obsidian';
import { extractSynopsisAndTags, TEMPLATES_DIR, getColorById, generateSceneId, SCENE_COLORS, createIconButton, replaceEntireDocument, cleanSceneTitle, extractSceneId, getManuscriptFiles, parseUniversalScenes, parseContent } from './utils';
import { StructureView } from './managers/StructureView';
import Sortable from 'sortablejs';
import NovelSmithPlugin from '../main';

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
// 🚨 Draft Action Modal (Intercept before entering Corkboard)
// ============================================================
export class CorkboardDraftActionModal extends Modal {
    onSyncAndOpen: () => void;
    onDiscardAndOpen: () => void;

    constructor(app: App, onSyncAndOpen: () => void, onDiscardAndOpen: () => void) {
        super(app);
        this.onSyncAndOpen = onSyncAndOpen;
        this.onDiscardAndOpen = onDiscardAndOpen;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: "⚠️ Scrivenings Mode Active" });
        contentEl.createEl('p', {
            text: "To protect your manuscript structure, please handle the current draft before opening the global corkboard:",
            cls: "setting-item-description"
        });

        const btnGroup = contentEl.createDiv({ cls: 'ns-modal-button-group' });
        btnGroup.setCssStyles({
            display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px'
        });

        // Option A: Sync & Open
        const btnSync = btnGroup.createEl('button', {
            text: "💾 Sync & Open Corkboard",
            cls: "mod-cta"
        });
        btnSync.onclick = () => {
            this.close();
            this.onSyncAndOpen();
        };

        // Option B: Discard & Open
        const btnDiscard = btnGroup.createEl('button', {
            text: "🗑️ Discard Draft & Open Corkboard"
        });
        btnDiscard.setCssStyles({
            backgroundColor: "var(--background-modifier-error)", color: "white"
        });
        btnDiscard.onclick = () => {
            this.close();
            this.onDiscardAndOpen();
        };

        // Option C: Cancel
        const btnCancel = btnGroup.createEl('button', { text: "❌ Cancel" });
        btnCancel.onclick = () => { this.close(); };
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ============================================================
// 📌 Global Corkboard View Modal (Ultimate Edition with CRUD & Colors)
// ============================================================
export class CorkboardModal extends Modal {
    plugin: NovelSmithPlugin;
    anchorSceneId: string | null;
    workingFolderPath: string; // 🌟 記住當前嘅資料夾 (例如 MySeries/Book1)
    isFromScrivenings: boolean;
    sortables: Sortable[] = [];
    wikiPanel: HTMLElement;

    // 🌟 終極沙盒記憶體
    liveSceneMap: Map<string, string> = new Map(); // 記住硬碟最原始嘅字
    pendingEdits: Map<string, string> = new Map(); // 記住你啱啱喺面板改嘅字

    constructor(plugin: NovelSmithPlugin, anchorSceneId: string | null = null, workingFolderPath: string, isFromScrivenings: boolean = false) {
        super(plugin.app);
        this.plugin = plugin;
        this.anchorSceneId = anchorSceneId;
        this.workingFolderPath = workingFolderPath;
        this.isFromScrivenings = isFromScrivenings; // 🌟 儲存標記
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.modalEl.setCssStyles({ width: "95vw", height: "95vh", maxWidth: "none", maxHeight: "none" });
        contentEl.setCssStyles({ display: "flex", flexDirection: "column", height: "100%" });
        this.modalEl.addClass("ns-corkboard-modal");

        const header = contentEl.createDiv({ cls: "ns-corkboard-header" });
        header.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--background-modifier-border)", paddingBottom: "10px", marginBottom: "20px" });

        // 顯示當前嘅資料夾名，等用家清楚知道自己改緊邊本書
        const folderName = this.workingFolderPath.split('/').pop() || "Global";
        header.createEl("h2", { text: `📌 Corkboard (${folderName})`, attr: { style: "margin: 0; color: var(--text-accent);" } });

        const controls = header.createDiv();
        controls.setCssStyles({ display: "flex", gap: "10px" });

        const btnCancel = controls.createEl("button", { text: "Cancel" });
        btnCancel.onclick = () => this.cancelCorkboard(); // 🌟 攔截 Cancel 動作！

        const btnSave = controls.createEl("button", { text: "Save & Close", cls: "mod-cta ns-save-btn" });
        btnSave.onclick = async () => {
            btnSave.disabled = true;
            btnSave.innerText = "⏳ Saving...";
            await this.saveGlobalCorkboard(gridContainer, btnSave);
        };

        const gridContainer = contentEl.createDiv({ cls: "ns-corkboard-grid" });
        gridContainer.setCssStyles({
            display: "flex", flexDirection: "row", gap: "20px", padding: "10px",
            alignItems: "stretch", overflowX: "auto", overflowY: "hidden", height: "100%"
        });

        gridContainer.createEl("h3", { text: "Loading manuscript data...", attr: { style: "opacity: 0.6; margin: auto;" } });

        await this.renderGlobalCards(gridContainer);
        // 🌟 構建「側滑資料面板 (Slide-over Drawer)」
        this.wikiPanel = contentEl.createDiv({ cls: "ns-corkboard-wiki-panel" });
        this.wikiPanel.setCssStyles({
            position: "absolute", top: "0", right: "0",
            width: "450px", maxWidth: "90%", height: "100%", // iPad 友善寬度
            backgroundColor: "var(--background-primary)",
            borderLeft: "1px solid var(--background-modifier-border)",
            boxShadow: "-5px 0 20px rgba(0,0,0,0.15)",
            transform: "translateX(100%)", // 預設隱藏喺螢幕右邊出面
            transition: "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)", // 順滑動畫
            zIndex: "100", display: "flex", flexDirection: "column"
        });
    }

    // ==========================================
    // 🎨 UI Builders (Fix Colors & Icons)
    // ==========================================
    // 🌟 外殼構建器
    buildCardDOM(listContainer: HTMLElement, scene: any) {
        const card = listContainer.createDiv({ cls: "ns-corkboard-card" });
        card.setCssStyles({
            backgroundColor: "var(--background-primary)", border: "1px solid var(--background-modifier-border)",
            borderRadius: "8px", padding: "15px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            display: "flex", flexDirection: "column", gap: "10px", cursor: "grab", position: "relative"
        });

        card.dataset.sceneId = scene.id || "";
        card.dataset.sceneTitle = scene.title || "";
        card.dataset.colorId = scene.colorId || "default";
        if (scene.isNew) card.dataset.isNew = "true";

        this.populateCardInnerDOM(card, scene); // 🚀 呼叫內部渲染器
    }

    // 🌟 內部渲染器 (方便隨時清空重畫！)
    populateCardInnerDOM(card: HTMLElement, scene: any) {
        const colorObj = getColorById(card.dataset.colorId);
        const hexColor = colorObj?.color || "var(--background-modifier-border)";
        card.setCssStyles({ borderLeft: `6px solid ${hexColor}` });

        const titleRow = card.createDiv();
        titleRow.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "flex-start" });

        const titleLeft = titleRow.createDiv();
        titleLeft.setCssStyles({ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", flex: "1" });

        const iconEl = titleLeft.createSpan();
        setIcon(iconEl, "clapperboard");
        iconEl.setCssStyles({ opacity: "0.6", display: "flex", alignItems: "center" });

        // 🌟 即時顯示最新標題
        titleLeft.createEl("h4", { text: card.dataset.sceneTitle, attr: { style: "margin: 0; color: var(--text-accent); font-size: 1.05em; line-height: 1.2;" } });

        const jumpBtn = titleLeft.createDiv();
        setIcon(jumpBtn, "external-link");
        jumpBtn.setCssStyles({ cursor: "pointer", opacity: "0.4", display: "flex", alignItems: "center", justifyContent: "center", padding: "2px" });
        const jumpSvg = jumpBtn.querySelector("svg");
        if (jumpSvg) { jumpSvg.style.width = "14px"; jumpSvg.style.height = "14px"; }
        jumpBtn.addEventListener("mouseover", () => jumpBtn.setCssStyles({ opacity: "1", color: "var(--interactive-accent)" }));
        jumpBtn.addEventListener("mouseout", () => jumpBtn.setCssStyles({ opacity: "0.4", color: "initial" }));
        jumpBtn.onclick = (e) => {
            e.stopPropagation();
            new SimpleConfirmModal(this.app, "Save corkboard and jump to this scene?", async () => {
                this.anchorSceneId = card.dataset.sceneId || card.dataset.sceneTitle || null;
                const saveBtn = this.contentEl.querySelector(".ns-save-btn") as HTMLButtonElement;
                if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = "⏳ Saving & Jumping..."; }
                const gridContainer = this.contentEl.querySelector(".ns-corkboard-grid") as HTMLElement;
                await this.saveGlobalCorkboard(gridContainer, saveBtn);
            }).open();
        };

        const titleRight = titleRow.createDiv();
        titleRight.setCssStyles({ display: "flex", alignItems: "center", gap: "6px" });

        if (card.dataset.isNew === "true") {
            const deleteBtn = titleRight.createDiv();
            setIcon(deleteBtn, "trash-2");
            deleteBtn.setCssStyles({ cursor: "pointer", opacity: "0.4", display: "flex", alignItems: "center", justifyContent: "center", padding: "2px" });
            const delSvg = deleteBtn.querySelector("svg");
            if (delSvg) { delSvg.style.width = "16px"; delSvg.style.height = "16px"; }

            deleteBtn.addEventListener("mouseover", () => deleteBtn.setCssStyles({ opacity: "1", color: "var(--text-error)" }));
            deleteBtn.addEventListener("mouseout", () => deleteBtn.setCssStyles({ opacity: "0.4", color: "initial" }));
            deleteBtn.onclick = (e) => { e.stopPropagation(); card.remove(); };
        }

        const editBtn = titleRight.createDiv();
        setIcon(editBtn, "pencil");
        editBtn.setCssStyles({ cursor: "pointer", opacity: "0.4", display: "flex", alignItems: "center", justifyContent: "center", padding: "2px" });
        const editSvg = editBtn.querySelector("svg");
        if (editSvg) { editSvg.style.width = "14px"; editSvg.style.height = "14px"; }
        editBtn.addEventListener("mouseover", () => editBtn.setCssStyles({ opacity: "1", color: "var(--interactive-accent)" }));
        editBtn.addEventListener("mouseout", () => editBtn.setCssStyles({ opacity: "0.4", color: "initial" }));
        editBtn.onclick = (e) => {
            e.stopPropagation();
            this.openScenePanel(card, scene);
        };

        const colorBtn = titleRight.createDiv();
        setIcon(colorBtn, "palette");
        colorBtn.setCssStyles({ cursor: "pointer", opacity: "0.3", display: "flex", alignItems: "center", justifyContent: "center", padding: "2px" });
        colorBtn.addEventListener("mouseover", () => colorBtn.setCssStyles({ opacity: "1" }));
        colorBtn.addEventListener("mouseout", () => colorBtn.setCssStyles({ opacity: "0.3" }));
        colorBtn.onclick = (e) => {
            e.stopPropagation();
            const menu = new Menu();
            SCENE_COLORS.forEach(c => {
                menu.addItem((item) => {
                    item.setTitle(c.name).setIcon("palette").onClick(() => {
                        card.dataset.colorId = c.id;
                        card.dataset.colorModified = "true";
                        card.setCssStyles({ borderLeft: `6px solid ${c.color || 'var(--background-modifier-border)'}` });
                    });
                });
            });
            menu.showAtMouseEvent(e);
        };






        // 🌟 Refactored: 使用 utils.ts 的共用雷達，一行抽齊大綱同標籤！
        const { foundSynopsis, dynamicTags } = extractSynopsisAndTags(scene.meta || []);

        const noteText = foundSynopsis || (card.dataset.isNew === "true" ? "(New scene, edit later)" : "(No synopsis)");
        const noteEl = card.createDiv({ text: noteText });
        noteEl.setCssStyles({ flexGrow: "1", fontSize: "0.9em", opacity: foundSynopsis ? "0.8" : "0.4", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "hidden", textOverflow: "ellipsis" });

        const footer = card.createDiv();
        footer.setCssStyles({ display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "0.8em", marginTop: "auto", paddingTop: "10px", borderTop: "1px solid var(--background-modifier-border)" });

        // 即時反映 ✅ 完成狀態！
        if (dynamicTags.some(t => t.key.toLowerCase().includes('status') && (t.value.toLowerCase().includes('done') || t.value.includes('完成') || t.value.includes('完稿')))) {
            const doneBadge = footer.createSpan({ text: "✅" });
            doneBadge.setCssStyles({ marginRight: "auto" });
        }

        dynamicTags.forEach(tag => {
            const tagSpan = footer.createSpan();
            tagSpan.setCssStyles({ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", background: "var(--background-secondary)", padding: "4px 8px", borderRadius: "6px", opacity: "0.9" });
            const iconEl = tagSpan.createSpan();
            setIcon(iconEl, "tag");
            iconEl.setCssStyles({ opacity: "0.5", display: "flex", alignItems: "center" });
            const svg = iconEl.querySelector("svg");
            if (svg) { svg.style.width = "12px"; svg.style.height = "12px"; }

            tagSpan.createSpan({ text: `${tag.key}: `, attr: { style: "color: var(--text-muted);" } });

            const wikiCategory = this.plugin.settings.wikiCategories?.find(c => c.name.split(/[,，、]/).map(s => s.trim()).includes(tag.key));
            if (wikiCategory && tag.value) {
                const rawItems = tag.value.replace(/[\[\]]/g, '').split(/[,，、/|\\;；]+/).map(i => i.trim()).filter(i => i);
                rawItems.forEach((item, index) => {
                    const chip = tagSpan.createSpan({ text: item });
                    chip.setCssStyles({ color: "var(--interactive-accent)", cursor: "pointer", fontWeight: "bold", transition: "filter 0.2s" });
                    chip.addEventListener("mouseover", () => chip.setCssProps({ filter: "brightness(1.3)" }));
                    chip.addEventListener("mouseout", () => chip.setCssProps({ filter: "brightness(1)" }));
                    chip.onclick = (e) => { e.stopPropagation(); this.openWikiPanel(item, wikiCategory.folderPath); };
                    if (index < rawItems.length - 1) tagSpan.createSpan({ text: ", ", attr: { style: "opacity: 0.5;" } });
                });
            } else {
                tagSpan.createSpan({ text: tag.value.replace(/[[\]]/g, '') });
            }
        });
    }

    buildColumnDOM(container: HTMLElement, colTitle: string, filePath: string | null, scenes: any[], insertBeforeEl?: HTMLElement) {
        const col = container.createDiv({ cls: "ns-corkboard-column" });
        col.setCssStyles({
            display: "flex", flexDirection: "column", minWidth: "320px", maxWidth: "320px",
            backgroundColor: "var(--background-secondary-alt)", borderRadius: "10px", padding: "12px",
            maxHeight: "100%", border: "1px solid var(--background-modifier-border)"
        });

        // 🌟 升級版：章節標題區變成 Flex 容器，容納左右兩邊元素
        const headerEl = col.createEl("h3");
        headerEl.setCssStyles({
            margin: "0 0 15px 0", fontSize: "1.1em", color: "var(--text-normal)",
            display: "flex", alignItems: "center", justifyContent: "space-between", // 改為 space-between
            borderBottom: "2px solid var(--background-modifier-border)", paddingBottom: "10px"
        });

        const listContainer = col.createDiv({ cls: "ns-corkboard-list" });
        listContainer.setCssStyles({ display: "flex", flexDirection: "column", gap: "15px", overflowY: "auto", flexGrow: "1", paddingRight: "5px" });
        if (filePath) listContainer.dataset.filePath = filePath;

        // 🌟 記低前綴同埋乾淨標題，方便等陣儲存嗰陣用
        const match = colTitle.match(/^(\d+[\s_\-]+)(.*)$/);
        listContainer.dataset.prefix = match ? match[1] : "";
        listContainer.dataset.cleanTitle = match ? match[2] : colTitle;



        // 👈 左邊：Icon ＋ 標題
        const titleLeft = headerEl.createDiv();
        titleLeft.setCssStyles({ display: "flex", alignItems: "center", gap: "8px", cursor: "grab", flexGrow: "1" });
        titleLeft.addClass("ns-column-drag-handle");

        const folderIcon = titleLeft.createSpan();
        setIcon(folderIcon, "folder-open");
        folderIcon.setCssStyles({ display: "flex", alignItems: "center", opacity: "0.7" });

        const titleTextContainer = titleLeft.createSpan();
        if (listContainer.dataset.prefix) {
            titleTextContainer.createSpan({ text: listContainer.dataset.prefix, attr: { style: "opacity: 0.3; font-weight: normal;" } });
        }
        titleTextContainer.createSpan({ text: listContainer.dataset.cleanTitle });

        // 👉 🌟 右邊：按鈕群組容器
        const rightControls = headerEl.createDiv();
        rightControls.setCssStyles({ display: "flex", gap: "4px", alignItems: "center" });


        // 🌟 新增：就地改名按鈕 (鉛筆)
        const btnEditCol = rightControls.createDiv();
        setIcon(btnEditCol, "pencil");
        btnEditCol.setCssStyles({ cursor: "pointer", opacity: "0.4", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "4px" });
        btnEditCol.addEventListener("mouseover", () => btnEditCol.setCssStyles({ opacity: "1", color: "var(--interactive-accent)" }));
        btnEditCol.addEventListener("mouseout", () => btnEditCol.setCssStyles({ opacity: "0.4", color: "initial" }));

        btnEditCol.onclick = (e) => {
            e.stopPropagation();
            new InputModal(this.app, "Rename Chapter", (newName) => {
                if (!newName.trim()) return;
                const safeName = newName.trim();

                // 1. 更新 Dataset (俾等陣 Save 用)
                listContainer.dataset.cleanTitle = safeName;

                // 2. 即時更新畫面
                titleTextContainer.empty();
                if (listContainer.dataset.prefix) {
                    titleTextContainer.createSpan({ text: listContainer.dataset.prefix, attr: { style: "opacity: 0.3; font-weight: normal;" } });
                }
                titleTextContainer.createSpan({ text: safeName });
            }, listContainer.dataset.cleanTitle).open(); // 🌟 傳入舊名做預設值！
        };


        // 🌟 1. 先放：智能刪除空章節按鈕 (垃圾桶喺左)
        const btnDeleteCol = rightControls.createDiv();
        setIcon(btnDeleteCol, "trash-2");
        btnDeleteCol.setCssStyles({ cursor: "pointer", opacity: "0.4", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "4px" });
        btnDeleteCol.addEventListener("mouseover", () => btnDeleteCol.setCssStyles({ opacity: "1", color: "var(--text-error)", backgroundColor: "var(--background-modifier-error-hover)" }));
        btnDeleteCol.addEventListener("mouseout", () => btnDeleteCol.setCssStyles({ opacity: "0.4", color: "initial", backgroundColor: "transparent" }));

        btnDeleteCol.onclick = async (e) => {
            e.stopPropagation();
            const cardsCount = listContainer.querySelectorAll(".ns-corkboard-card").length;

            // 🛡️ 防禦機制：有卡片絕對唔畀刪除！
            if (cardsCount > 0) {
                new Notice("Cannot delete: This chapter still contains scenes. Please move them first.", 4000);
                return;
            }

            new SimpleConfirmModal(this.app, "Delete this empty chapter?", () => {
                // 🌟 魔法沙盒：只喺畫面上移除，唔觸碰實體檔案！
                col.remove();
                new Notice("Chapter removed from board (Will be trashed on Save).");
            }).open();
        };

        // 🌟 2. 後放：就地插入新章節按鈕 (➕號喺右)
        const btnAddColHere = rightControls.createDiv();
        setIcon(btnAddColHere, "plus");
        btnAddColHere.setCssStyles({ cursor: "pointer", opacity: "0.4", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "4px" });
        btnAddColHere.addEventListener("mouseover", () => btnAddColHere.setCssStyles({ opacity: "1", backgroundColor: "var(--background-modifier-hover)" }));
        btnAddColHere.addEventListener("mouseout", () => btnAddColHere.setCssStyles({ opacity: "0.4", backgroundColor: "transparent" }));

        btnAddColHere.onclick = (e) => {
            e.stopPropagation();
            new InputModal(this.app, "Insert New Chapter Here", (result) => {
                if (!result.trim()) return;
                this.buildColumnDOM(container, result, null, [], col.nextElementSibling as HTMLElement);
            }).open();
        };







        scenes.forEach(scene => this.buildCardDOM(listContainer, scene));

        const btnAddScene = col.createEl("button", { text: "+ Add Scene Card" });
        btnAddScene.setCssStyles({ marginTop: "15px", backgroundColor: "transparent", border: "1px dashed var(--background-modifier-border)", color: "var(--text-muted)", cursor: "pointer", padding: "8px", borderRadius: "6px" });

        btnAddScene.onclick = () => {
            new SceneCreateModal(this.app, "Create New Scene", "", (result, colorId) => {
                const newScene = { id: generateSceneId(), title: result, colorId: colorId, meta: [], isNew: true };
                this.buildCardDOM(listContainer, newScene);
                listContainer.scrollTop = listContainer.scrollHeight;
            }).open();
        };

        if (insertBeforeEl) container.insertBefore(col, insertBeforeEl);
        else container.appendChild(col);

        this.sortables.push(new Sortable(listContainer, {
            group: 'global-kanban-board',
            animation: 150, handle: '.ns-corkboard-card', delay: 100, delayOnTouchOnly: true, ghostClass: 'ns-sortable-ghost'
        }));
    }

    async renderGlobalCards(container: HTMLElement) {
        // 🌟 傳入 workingFolderPath，只讀取當前部曲嘅檔案！
        const files = getManuscriptFiles(this.app, this.workingFolderPath, this.plugin.settings.exportFolderPath);
        container.empty();

        // 🌟 修正點 1：打開軟木板時，即刻將所有卡片嘅真實文字載入記憶體！
        for (const file of files) {
            const content = await this.app.vault.read(file);
            const parsedData = parseContent(content, true, this.app, file);
            for (const card of parsedData.cards) {
                let sceneFullText = card.rawHeader + "\n";
                if (card.meta && card.meta.length > 0) sceneFullText += card.meta.join("\n") + "\n";
                sceneFullText += "\n" + card.body;
                const safeKey = card.id || card.key;
                this.liveSceneMap.set(safeKey, sceneFullText.trimEnd()); // 存入記憶體
            }
        }


        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const content = await this.app.vault.read(file);
            const scenes = parseUniversalScenes(content);
            this.buildColumnDOM(container, file.basename, file.path, scenes);
        }

        const addColBtn = container.createDiv({ cls: "ns-corkboard-column" });
        addColBtn.setCssStyles({
            display: "flex", alignItems: "center", justifyContent: "center",
            minWidth: "320px", maxWidth: "320px", backgroundColor: "transparent",
            border: "2px dashed var(--background-modifier-border)", borderRadius: "10px",
            cursor: "pointer", color: "var(--text-muted)", fontSize: "1.2em", transition: "all 0.2s"
        });
        addColBtn.createSpan({ text: "＋ Add New Chapter" });
        addColBtn.addEventListener("mouseover", () => addColBtn.setCssStyles({ backgroundColor: "var(--background-secondary)" }));
        addColBtn.addEventListener("mouseout", () => addColBtn.setCssStyles({ backgroundColor: "transparent" }));
        addColBtn.onclick = () => {
            new InputModal(this.app, "New Chapter Name", (result) => {
                if (!result.trim()) return;
                this.buildColumnDOM(container, result, null, [], addColBtn);
            }).open();
        };

        this.sortables.push(new Sortable(container, {
            animation: 150, handle: '.ns-column-drag-handle', delay: 100, delayOnTouchOnly: true, ghostClass: 'ns-sortable-ghost'
        }));
    }

    // ==========================================
    // 📖 側滑面板：Wiki 雙模式
    // ==========================================
    async openWikiPanel(noteName: string, folderPath: string) {
        this.wikiPanel.empty();
        this.wikiPanel.setCssStyles({ width: "450px", transform: "translateX(0)" }); // 預設：窄面板 (閱讀)

        const headerRow = this.wikiPanel.createDiv();
        headerRow.setCssStyles({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 20px", borderBottom: "1px solid var(--background-modifier-border)" });

        headerRow.createEl("h3", { text: noteName, attr: { style: "margin: 0; color: var(--interactive-accent);" } });

        const controls = headerRow.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center;" } });

        // Wiki 鉛筆按鈕
        const btnEdit = createIconButton(controls, "pencil", "");
        btnEdit.onclick = async () => {
            const file = this.app.metadataCache.getFirstLinkpathDest(noteName, folderPath || "");
            // 🌟 修正點 2：移除 import('obsidian') 毒藥，直接用 TFile！
            if (file && file instanceof TFile) {
                const content = await this.app.vault.read(file);
                this.renderEditMode(noteName, content, async (newText) => {
                    await this.app.vault.modify(file, newText);
                    new Notice("Wiki updated!");
                    this.openWikiPanel(noteName, folderPath);
                });
            }
        };

        const btnClose = createIconButton(controls, "arrow-right", "");
        btnClose.onclick = () => this.wikiPanel.setCssStyles({ transform: "translateX(100%)" });

        const contentWrapper = this.wikiPanel.createDiv({ cls: "markdown-rendered" });
        contentWrapper.setCssStyles({ padding: "20px", overflowY: "auto", flexGrow: "1", fontSize: "0.95em" });

        const file = this.app.metadataCache.getFirstLinkpathDest(noteName, folderPath || "");
        if (file && file instanceof TFile) {
            const content = await this.app.vault.read(file);
            await MarkdownRenderer.render(this.app, content, contentWrapper, file.path, this);
        } else {
            contentWrapper.createDiv({ text: `Cannot find note: ${noteName}` });
        }
    }

    // ==========================================
    // 🎬 側滑面板：劇情卡片雙模式 (先閱讀，後編輯)
    // ==========================================
    async openScenePanel(cardEl: HTMLElement, scene: any) {
        this.wikiPanel.empty();
        this.wikiPanel.setCssStyles({ width: "450px", transform: "translateX(0)" }); // 預設：窄面板 (閱讀)

        const safeKey = cardEl.dataset.sceneId || cardEl.dataset.sceneTitle || "";
        let currentText = this.pendingEdits.get(safeKey) || this.liveSceneMap.get(safeKey) || "";

        // 全新卡片俾 Default Template
        if (!currentText && cardEl.dataset.isNew === "true") {
            const newColor = cardEl.dataset.colorId || "default";
            const calloutType = newColor === "default" ? "NSmith" : `NSmith-${newColor}`;
            currentText = `###### ${scene.title} <span class="ns-id" data-scene-id="${cardEl.dataset.sceneId}" data-color="${newColor}" data-warning="⛔️ ID (Do not edit)"></span>\n> [!${calloutType}] Scene Info\n> - Status:: #Writing\n> - Note:: \n\n(Write your scene here...)\n`;
        }

        // ==========================================
        // 🪄 魔法 1：分離 Callout 屬性區 (Meta) 與 內文區 (Body)
        // ==========================================
        let metaLines: string[] = [];
        let bodyLines: string[] = [];
        let isBody = false;

        const lines = currentText.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimLine = line.trim();
            if (!isBody) {
                // 如果係標題，或者係 Callout (以 > 開頭)
                if (trimLine.startsWith('######') || trimLine.startsWith('>')) {
                    metaLines.push(line);
                } else if (trimLine === "") {
                    // 遇到第一個空行，開始當作內文
                    bodyLines.push(line);
                    isBody = true;
                } else {
                    bodyLines.push(line);
                    isBody = true;
                }
            } else {
                bodyLines.push(line);
            }
        }

        // 呢兩舊就係分離出嚟嘅字！
        const displayMetaText = metaLines.join('\n');
        const hiddenBodyText = bodyLines.join('\n');


        const headerRow = this.wikiPanel.createDiv();
        headerRow.setCssStyles({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 20px", borderBottom: "1px solid var(--background-modifier-border)" });

        headerRow.createEl("h3", { text: scene.title, attr: { style: "margin: 0; color: var(--interactive-accent);" } });

        const controls = headerRow.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center;" } });

        // 🌟 劇情卡鉛筆按鈕
        const btnEdit = createIconButton(controls, "pencil", "");
        btnEdit.onclick = () => {
            const spanRegex = /(<span class="ns-id"[^>]*><\/span>)/;
            // 🌟 只對 displayMetaText 進行剝殼操作
            const match = displayMetaText.match(spanRegex);
            let hiddenSpan = "";
            let editMarkdown = displayMetaText;

            if (match) {
                hiddenSpan = match[1];
                editMarkdown = editMarkdown.replace(hiddenSpan, "");
                editMarkdown = editMarkdown.replace(/(######.*?)\s+\n/, "$1\n");
                editMarkdown = editMarkdown.replace(/######\s*🎬\s*/, "###### ");
            }

            // 🌟 編輯模式：只傳入 Callout 屬性區！
            this.renderEditMode(`Edit: ${scene.title}`, editMarkdown, (newMetaText) => {
                let finalMetaMarkdown = newMetaText;

                // 還原標題同 ID
                if (hiddenSpan) {
                    const editLines = newMetaText.split('\n');
                    let injected = false;
                    for (let i = 0; i < editLines.length; i++) {
                        const headerMatch = editLines[i].match(/^(#{1,6})\s*(.*)/);
                        if (headerMatch) {
                            let cleanNewTitle = headerMatch[2].replace(/^🎬\s*/, '').trim();
                            if (!cleanNewTitle) cleanNewTitle = "Untitled Scene";
                            editLines[i] = `###### ${cleanNewTitle} ${hiddenSpan}`;
                            injected = true;
                            break;
                        }
                    }
                    if (!injected) {
                        let safeTitle = scene.title.replace(/^🎬\s*/, '').trim();
                        finalMetaMarkdown = `###### ${safeTitle} ${hiddenSpan}\n` + newMetaText;
                    } else {
                        finalMetaMarkdown = editLines.join('\n');
                    }
                }

                // ==========================================
                // 🪄 魔法 2：將改好嘅 屬性區 同 隱藏嘅文稿 重新黐返埋一齊！
                // ==========================================
                let safeBody = hiddenBodyText.replace(/^\s+/, ""); // 清除開頭多餘空行
                let finalFullText = finalMetaMarkdown.trimEnd();

                if (safeBody) {
                    finalFullText += "\n\n" + safeBody;
                } else {
                    finalFullText += "\n";
                }

                // 將完整文稿寫入沙盒記憶體
                this.pendingEdits.set(safeKey, finalFullText);
                this.liveSceneMap.set(safeKey, finalFullText);

                // 即時解析新文字，並刷新卡片 UI
                const parsedScenes = parseUniversalScenes(finalFullText);
                let updatedScene = scene;
                if (parsedScenes.length > 0) {
                    updatedScene = parsedScenes[0];
                    cardEl.dataset.sceneTitle = updatedScene.title;
                    cardEl.empty();
                    this.populateCardInnerDOM(cardEl, updatedScene);
                }

                new Notice("Edits saved to memory. Press Save & Close board to keep.", 3000);
                this.openScenePanel(cardEl, updatedScene);
            });
        };

        const btnClose = createIconButton(controls, "arrow-right", "");
        btnClose.onclick = () => this.wikiPanel.setCssStyles({ transform: "translateX(100%)" });

        const contentWrapper = this.wikiPanel.createDiv({ cls: "markdown-rendered" });
        contentWrapper.setCssStyles({ padding: "20px", overflowY: "auto", flexGrow: "1", fontSize: "0.95em" });

        // 🌟 完美渲染 Callout 閱讀模式 (魔法 3：只 Render 屬性區！)
        await MarkdownRenderer.render(this.app, displayMetaText, contentWrapper, "", this);
    }

    renderEditMode(title: string, rawMarkdown: string, onSave: (newText: string) => void) {
        this.wikiPanel.empty();
        // 🌟 順滑動畫：變闊為 600px！
        this.wikiPanel.setCssStyles({ width: "600px", transform: "translateX(0)" });

        const headerRow = this.wikiPanel.createDiv();
        headerRow.setCssStyles({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 20px", borderBottom: "1px solid var(--background-modifier-border)" });

        headerRow.createEl("h3", { text: title, attr: { style: "margin: 0; color: var(--interactive-accent);" } });

        const btnRow = headerRow.createDiv({ attr: { style: "display: flex; gap: 8px;" } });

        const btnCancel = btnRow.createEl("button", { text: "Cancel" });
        btnCancel.onclick = () => {
            this.wikiPanel.setCssStyles({ transform: "translateX(100%)" });
        };

        const btnSave = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });

        const contentWrapper = this.wikiPanel.createDiv();
        contentWrapper.setCssStyles({ padding: "20px", display: "flex", flexDirection: "column", flexGrow: "1" });

        // iPad 友善嘅超大 Textarea
        const textArea = contentWrapper.createEl("textarea");
        textArea.value = rawMarkdown;
        textArea.setCssStyles({ width: "100%", flexGrow: "1", resize: "none", padding: "15px", fontFamily: "var(--font-monospace)", fontSize: "14px", border: "1px solid var(--background-modifier-border)", borderRadius: "8px", backgroundColor: "var(--background-primary-alt)" });

        // 🌟 魔法引擎：模擬 Obsidian 原生編輯器嘅 Auto-continue 功能
        textArea.addEventListener('keydown', (e: KeyboardEvent) => {
            // 只有禁單獨 Enter 先觸發 (Shift+Enter 容許正常換行)
            if (e.key === 'Enter' && !e.shiftKey) {
                const cursorPos = textArea.selectionStart;
                const textBefore = textArea.value.substring(0, cursorPos);
                const textAfter = textArea.value.substring(textArea.selectionEnd);

                const lines = textBefore.split('\n');
                const currentLine = lines[lines.length - 1];

                // 🔍 雷達：認得 Callout List (> - )、Callout (> ) 或者普通 List (- )
                const match = currentLine.match(/^(>\s*-\s*|>\s*|-\s*)/);

                if (match) {
                    e.preventDefault(); // 攔截預設嘅普通換行
                    const prefix = match[1];

                    // 🚪 智能逃脫 (Escape)：如果嗰行淨係得個符號 (即係用家喺空 List 撳 Enter)，就自動刪除佢跳出框框
                    if (currentLine === prefix) {
                        const newTextBefore = textBefore.substring(0, textBefore.length - prefix.length);
                        textArea.value = newTextBefore + '\n' + textAfter;
                        const newPos = newTextBefore.length + 1;
                        textArea.selectionStart = textArea.selectionEnd = newPos;
                    } else {
                        // ✍️ 自動補全：換行並自動加上同一個符號
                        const insertStr = '\n' + prefix;
                        textArea.value = textBefore + insertStr + textAfter;
                        const newPos = cursorPos + insertStr.length;
                        textArea.selectionStart = textArea.selectionEnd = newPos;
                    }
                }
            }
        });

        btnSave.onclick = () => onSave(textArea.value);
    }

    // ==========================================
    // 🛡️ 智能取消與賬本結算引擎
    // ==========================================
    async cancelCorkboard() {
        const hasNewCards = Array.from(this.contentEl.querySelectorAll(".ns-corkboard-card")).some(c => (c as HTMLElement).dataset.isNew === "true");

        const doCancel = async () => {
            if (this.pendingEdits.size > 0) {
                new Notice("Saving text edits to original files...", 2000);
                const allFiles = getManuscriptFiles(this.app, this.workingFolderPath, this.plugin.settings.exportFolderPath);
                for (const file of allFiles) {
                    let content = await this.app.vault.read(file);
                    let changed = false;
                    for (const [id, newText] of this.pendingEdits.entries()) {
                        const parsedData = parseContent(content, true, this.app, file);
                        const card = parsedData.cards.find(c => c.id === id || c.key === id);
                        if (card) {
                            const oldBlock = card.rawHeader + "\n" + (card.meta.length > 0 ? card.meta.join("\n") + "\n" : "") + "\n" + card.body;
                            content = content.replace(oldBlock.trimEnd(), newText.trimEnd());
                            changed = true;
                        }
                    }
                    if (changed) await this.app.vault.modify(file, content);
                }
                new Notice("Edits saved. Layout changes discarded.");
            }
            this.close();
        };

        if (hasNewCards) {
            new SimpleConfirmModal(this.app, "⚠️ 警告：您有全新建立的劇情卡片！\n取消將放棄排版並永久遺失新卡片（現有舊卡片的文字修改則會被安全保留）。確定放棄嗎？", () => {
                doCancel();
            }).open();
        } else {
            doCancel();
        }
    }

    // ==========================================
    // 💾 🌟 Ultimate Settlement Engine (With Crash Protection)
    // ==========================================
    async saveGlobalCorkboard(container: HTMLElement, btnSaveEl?: HTMLButtonElement) {
        try {
            new Notice("🔄 Saving manuscript structure...", 2000);

            let cachedTemplateText: string | null = null;
            if (TEMPLATES_DIR) {
                const tplFile = this.app.vault.getAbstractFileByPath(`${this.plugin.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`);
                if (tplFile && tplFile instanceof TFile) {
                    cachedTemplateText = await this.app.vault.read(tplFile);
                }
            }

            const allFiles = getManuscriptFiles(this.app, this.workingFolderPath, this.plugin.settings.exportFolderPath);
            const liveSceneMap = new Map<string, string>();
            const chapterPreambles = new Map<string, string>();
            const fileObjMap = new Map<string, TFile>();

            for (const file of allFiles) {
                fileObjMap.set(file.path, file);
                const content = await this.app.vault.read(file);
                const parsedData = parseContent(content, true, this.app, file);

                let fullPreamble = "";
                if (parsedData.yaml) fullPreamble += parsedData.yaml + "\n";
                if (parsedData.preamble) fullPreamble += parsedData.preamble + "\n";
                chapterPreambles.set(file.path, fullPreamble.trimEnd());

                for (const card of parsedData.cards) {
                    let sceneFullText = card.rawHeader + "\n";
                    if (card.meta && card.meta.length > 0) sceneFullText += card.meta.join("\n") + "\n";
                    sceneFullText += "\n" + card.body;

                    const safeKey = card.id || card.key;
                    liveSceneMap.set(safeKey, sceneFullText.trimEnd());
                }
            }

            const columns = container.querySelectorAll(".ns-corkboard-list");

            // ==========================================
            // 🗑️ 🌟 智能垃圾桶結算：對比畫面與硬碟
            // ==========================================
            const keptFilePaths = new Set<string>();
            columns.forEach(listEl => {
                const path = (listEl as HTMLElement).dataset.filePath;
                if (path) keptFilePaths.add(path);
            });

            for (const file of allFiles) {
                // 如果硬碟有呢個檔案，但畫面上已經搵唔到佢個 path，證明用家喺板上 Delete 咗佢！
                if (!keptFilePaths.has(file.path)) {
                    console.log("Trashing deleted chapter:", file.path);
                    await this.app.fileManager.trashFile(file); // 實體掉落垃圾桶
                    fileObjMap.delete(file.path); // 喺 Map 移除，等陣唔好再處理佢
                }
            }




            let chapterIndex = 1;

            for (const listEl of Array.from(columns)) {
                const el = listEl as HTMLElement;
                const originalFilePath = el.dataset.filePath;
                const chunks: string[] = [];

                if (originalFilePath && fileObjMap.has(originalFilePath)) {
                    const preamble = chapterPreambles.get(originalFilePath);
                    if (preamble) chunks.push(preamble);
                }

                const cards = el.querySelectorAll(".ns-corkboard-card");
                for (const card of Array.from(cards)) {
                    const cardEl = card as HTMLElement;
                    const sceneId = cardEl.dataset.sceneId;
                    const sceneTitle = cardEl.dataset.sceneTitle;
                    const safeKey = sceneId || sceneTitle || "";

                    if (liveSceneMap.has(safeKey)) {
                        // 🌟 優先使用面板修改過嘅字，冇修改過先用硬碟原本嘅字！
                        let sceneMd = this.pendingEdits.get(safeKey) || liveSceneMap.get(safeKey)!;
                        if (cardEl.dataset.colorModified === "true") {
                            const newColor = cardEl.dataset.colorId || "default";
                            if (sceneMd.includes('data-color="')) sceneMd = sceneMd.replace(/data-color="[^"]*"/, `data-color="${newColor}"`);
                            else if (sceneMd.includes('data-scene-id="')) sceneMd = sceneMd.replace(/"><\/span>/, `" data-color="${newColor}"></span>`);
                            const calloutType = newColor === "default" ? "NSmith" : `NSmith-${newColor}`;
                            sceneMd = sceneMd.replace(/> \[!NSmith[^\]]*\]/, `> [!${calloutType}]`);
                        }
                        chunks.push("\n\n" + sceneMd);
                    }
                    else if (cardEl.dataset.isNew === "true") {
                        const newColor = cardEl.dataset.colorId || "default";
                        const calloutType = newColor === "default" ? "NSmith" : `NSmith-${newColor}`;

                        let metaBlock = `> [!${calloutType}] Scene Info\n> - Time:: \n> - POV:: \n> - Status:: #Writing\n> - Note:: \n`;
                        if (cachedTemplateText) {
                            const metaBlockMatch = cachedTemplateText.match(/> \[!NSmith\][\s\S]*?(?=\n[^>]|$)/);
                            if (metaBlockMatch) metaBlock = metaBlockMatch[0].replace(/> \[!NSmith[^\]]*\]/, `> [!${calloutType}]`);
                        }

                        // 🌟 修正點 3：移除 Markdown 入面硬編碼嘅 🎬 emoji
                        const newCardMd = `###### ${sceneTitle} <span class="ns-id" data-scene-id="${sceneId}" data-color="${newColor}" data-warning="⛔️ ID (Do not edit)"></span>\n${metaBlock}\n\n(Write your scene here...)\n`;
                        chunks.push("\n\n" + newCardMd);
                    }
                }

                const newContent = chunks.join("").trim() + "\n";


                const cleanTitle = el.dataset.cleanTitle || "Untitled_Chapter";
                const prefix = chapterIndex < 10 ? `0${chapterIndex}_` : `${chapterIndex}_`;
                const newName = `${prefix}${cleanTitle}.md`;
                // 🌟 修正點 3：智能過濾路徑，防止出現 // 雙斜線崩潰
                const parentPath = fileObjMap.has(originalFilePath!) ? fileObjMap.get(originalFilePath!)!.parent?.path : "";
                const safeParentPath = parentPath === "/" ? "" : parentPath;
                const safeWorkingPath = this.workingFolderPath === "/" ? "" : this.workingFolderPath;

                if (originalFilePath && fileObjMap.has(originalFilePath)) {
                    const file = fileObjMap.get(originalFilePath)!;
                    const oldContent = await this.app.vault.read(file);
                    if (newContent !== oldContent.trim() + "\n") {
                        await this.app.vault.modify(file, newContent);
                    }


                    // 🌟 完美改名！
                    const newPath = `${safeParentPath}/${newName}`;
                    if (file.path !== newPath) {
                        try { await this.app.fileManager.renameFile(file, newPath); } catch (e) { /* ignore */ }
                    }
                } else {
                    const newPath = `${safeWorkingPath}/${newName}`;
                    try { await this.app.vault.create(newPath, newContent); }
                    catch (e) { console.error("Create new file failed", e); }
                }
                chapterIndex++;
            }

            new Notice("✅ Corkboard saved successfully!");
            this.close();

        } catch (error) {
            // 🛡️ 防死機保護罩：如果出錯，解除鎖定，彈出警告！
            console.error("Corkboard save error:", error);
            new Notice("❌ Error saving corkboard. Please try again.", 5000);
            if (btnSaveEl) {
                btnSaveEl.innerText = "Save & Close";
                btnSaveEl.disabled = false;
            }
        }
    }

    onClose() {
        this.sortables.forEach(s => s.destroy());
        this.sortables = [];
        this.contentEl.empty();

        if (this.anchorSceneId) {
            if (this.isFromScrivenings) {
                // 來自串聯草稿，無痕重建並跳轉
                new Notice("Restoring Scrivenings mode...", 1500);
                const folder = this.app.vault.getAbstractFileByPath(this.workingFolderPath);
                if (folder && folder instanceof TFolder) {
                    setTimeout(() => {
                        void this.plugin.sceneManager.assignIDsToAllFiles(folder).then(() => {
                            if (typeof this.plugin.scrivenerManager.rebuildScriveningsSilent === 'function') {
                                void this.plugin.scrivenerManager.rebuildScriveningsSilent(folder, this.anchorSceneId);
                            } else {
                                void this.plugin.scrivenerManager.toggleScrivenings();
                            }
                        });
                    }, 300);
                }
            } else {
                // 🌟 來自普通大綱，全域搜尋並跳轉！
                new Notice("Jumping to scene...", 1000);
                setTimeout(async () => {
                    const files = getManuscriptFiles(this.app, this.workingFolderPath, this.plugin.settings.exportFolderPath);
                    for (const file of files) {
                        const content = await this.app.vault.read(file);
                        // 搵吓邊個實體檔案包含呢個 ID 或者 Title
                        if (content.includes(`data-scene-id="${this.anchorSceneId}"`) || content.includes(`###### 🎬 ${this.anchorSceneId}`)) {
                            const leaf = this.app.workspace.getLeaf(false);
                            await leaf.openFile(file); // 打開該章節

                            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                            if (view) {
                                const editor = view.editor;
                                for (let i = 0; i < editor.lineCount(); i++) {
                                    const line = editor.getLine(i);
                                    if (line.includes(`data-scene-id="${this.anchorSceneId}"`) || line.includes(`###### 🎬 ${this.anchorSceneId}`)) {
                                        editor.setCursor({ line: i, ch: 0 });
                                        editor.scrollIntoView({ from: { line: i, ch: 0 }, to: { line: i, ch: 0 } }, true);
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }, 300); // 畀系統少少時間 Save 完
            }
        }
    }
}