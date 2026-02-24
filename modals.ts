import { App, FuzzySuggestModal, Modal, Setting, TFile, Notice } from 'obsidian';

// ============================================================
// 1. 通用的輸入框 Modal (保留：給原子存檔用)
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
            .setName('名稱')
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
                    .setButtonText('確認')
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
// 2. 通用的選擇清單 (Suggester) (保留：給歷史還原用)
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
// 3. 🔥 新增：編譯選項視窗 (CompileModal)
// ============================================================

export interface CompileOptions {
    removeYaml: boolean;      // 移除 YAML
    removeSceneInfo: boolean; // 移除情節卡片 (Callout)
    removeComments: boolean;  // 移除 %% 註釋 %%
    removeStrikethrough: boolean; // 移除 ~~ 刪除線 ~~
    mergeBold: boolean;       // 合併 ** 粗體 **
    removeHighlights: boolean;// 移除 == 高亮 ==
    removeInternalLinks: boolean;
}

export class CompileModal extends Modal {
    options: CompileOptions = {
        removeYaml: true,
        removeSceneInfo: true,
        removeComments: true,
        removeStrikethrough: true,
        mergeBold: true,
        removeHighlights: true
    };

    onSubmit: (options: CompileOptions) => void;

    constructor(app: App, onSubmit: (options: CompileOptions) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: '📤 匯出編譯設定' });
        contentEl.createEl('p', { text: '請選擇要清理的內容，這些操作只會影響輸出檔，不會修改原稿。', cls: 'setting-item-description' });

        new Setting(contentEl)
            .setName('移除 YAML Frontmatter')
            .setDesc('刪除檔案開頭的 --- 設定區塊')
            .addToggle(toggle => toggle
                .setValue(this.options.removeYaml)
                .onChange(value => this.options.removeYaml = value));

        new Setting(contentEl)
            .setName('移除情節卡片 (Callout)')
            .setDesc('刪除 ###### 🎬 及相關引用塊')
            .addToggle(toggle => toggle
                .setValue(this.options.removeSceneInfo)
                .onChange(value => this.options.removeSceneInfo = value));

        new Setting(contentEl)
            .setName('移除註釋')
            .setDesc('刪除所有 %% 註釋內容 %%')
            .addToggle(toggle => toggle
                .setValue(this.options.removeComments)
                .onChange(value => this.options.removeComments = value));

        new Setting(contentEl)
            .setName('移除刪除線內容')
            .setDesc('刪除所有 ~~ 被刪除的文字 ~~')
            .addToggle(toggle => toggle
                .setValue(this.options.removeStrikethrough)
                .onChange(value => this.options.removeStrikethrough = value));

        new Setting(contentEl)
            .setName('合併粗體 (定稿)')
            .setDesc('將 **粗體文字** 轉為普通文字')
            .addToggle(toggle => toggle
                .setValue(this.options.mergeBold)
                .onChange(value => this.options.mergeBold = value));

        new Setting(contentEl)
            .setName('移除高亮')
            .setDesc('移除所有 == 高亮符號 ==')
            .addToggle(toggle => toggle
                .setValue(this.options.removeHighlights)
                .onChange(value => this.options.removeHighlights = value));

        new Setting(contentEl)
            .setName('移除內部連結符號')
            .setDesc('將 [[連結|顯示名稱]] 轉換為純文字 (只保留顯示名稱)')
            .addToggle(toggle => toggle
                .setValue(this.options.removeInternalLinks)
                .onChange(val => this.options.removeInternalLinks = val));





        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('開始編譯')
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
// 4. 🔥 新增：章節選擇視窗 (Step 1)
// ============================================================
export class ChapterSelectionModal extends Modal {
    allFiles: TFile[];
    selectedSet: Set<TFile>;
    onNext: (selected: TFile[]) => void;

    constructor(app: App, files: TFile[], onNext: (selected: TFile[]) => void) {
        super(app);
        this.allFiles = files;
        this.selectedSet = new Set(files); // 預設全選
        this.onNext = onNext;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: '📚 Step 1: 選擇要合併的章節' });

        // --- 控制列：全選/全不選 ---
        const controlDiv = contentEl.createDiv({ cls: 'ns-chapter-controls' });
        controlDiv.style.marginBottom = '10px';
        controlDiv.style.display = 'flex';
        controlDiv.style.gap = '10px';

        const btnAll = controlDiv.createEl('button', { text: '✅ 全選' });
        btnAll.onclick = () => {
            this.allFiles.forEach(f => this.selectedSet.add(f));
            this.refreshList(listDiv);
        };

        const btnNone = controlDiv.createEl('button', { text: '⬜️ 全不選' });
        btnNone.onclick = () => {
            this.selectedSet.clear();
            this.refreshList(listDiv);
        };

        // --- 檔案列表容器 (可滾動) ---
        const listDiv = contentEl.createDiv({ cls: 'ns-chapter-list' });
        listDiv.style.maxHeight = '300px';
        listDiv.style.overflowY = 'auto';
        listDiv.style.border = '1px solid var(--background-modifier-border)';
        listDiv.style.padding = '10px';
        listDiv.style.marginBottom = '20px';
        listDiv.style.borderRadius = '4px';

        // 渲染列表
        this.refreshList(listDiv);

        // --- 下一步按鈕 ---
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('下一步 (設定清理選項) 👉')
                .setCta()
                .onClick(() => {
                    // 過濾出選擇的檔案 (保持原始排序)
                    const finalSelection = this.allFiles.filter(f => this.selectedSet.has(f));

                    if (finalSelection.length === 0) {
                        new Notice("⚠️ 請至少選擇一個章節！");
                        return;
                    }

                    this.close();
                    this.onNext(finalSelection); // 進入下一步
                }));
    }

    // 輔助：重新渲染列表 (當點擊全選/全不選時)
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


// 5. 🔥 新增：確認視窗 (SimpleConfirmModal)
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

        const btnCancel = div.createEl('button', { text: '取消' });
        btnCancel.onclick = () => this.close();

        const btnConfirm = div.createEl('button', { text: '確認執行', cls: 'mod-cta' });
        btnConfirm.onclick = () => {
            this.close();
            this.onConfirm();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}