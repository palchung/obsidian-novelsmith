import { App, FuzzySuggestModal, Modal, Setting, TFile, Notice } from 'obsidian';
import { SCENE_COLORS, createIconButton } from './utils'; // Ensure path is correct

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
                .onChange(value => this.options.hashtagAction = value as unknown)
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