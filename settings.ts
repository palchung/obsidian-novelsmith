import { App, PluginSettingTab, Setting } from 'obsidian';
import NovelSmithPlugin from './main';

export interface NovelSmithSettings {
    bookFolderPath: string;
    draftFilename: string;
    keepDraftOnSync: boolean; // 🔥 新增：是否保留草稿
    keptDraftPath: string;    // 🔥 新增：草稿封存路徑
    historyFolderPath: string; // 🔥 修改：合併後的原子存檔路徑
    redundantListPath: string;
    fixListPath: string;
    wikiFolderPath: string;
    exportFolderPath: string;
    templateFilePath: string;
}

export const DEFAULT_SETTINGS: NovelSmithSettings = {
    bookFolderPath: 'MyBook',
    draftFilename: '_Full_Draft_Edit.md',
    keepDraftOnSync: false,
    keptDraftPath: 'MyBook/_Archived_Drafts',
    historyFolderPath: '終焉與破曉/04_其他/_History/Scenes',
    redundantListPath: '終焉與破曉/04_其他/_贅字清單.md',
    fixListPath: 'FixList.md',
    wikiFolderPath: '終焉與破曉/03_參考資料/設定集/人物角色',
    exportFolderPath: 'Output',
    templateFilePath: '終焉與破曉/NovelSmith_Template.md'
}

export class NovelSmithSettingTab extends PluginSettingTab {
    plugin: NovelSmithPlugin;

    constructor(app: App, plugin: NovelSmithPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: '⚔️ NovelSmith 系統設定' });

        // ==========================================
        // 📚 核心與串聯
        // ==========================================
        containerEl.createEl('h3', { text: '📚 核心' });

        new Setting(containerEl)
            .setName('專屬寫作資料夾')
            .setDesc('指定你的小說主目錄 (例如 MyBook)。系統只會在此目錄下生效。')
            .addText(text => text
                .setPlaceholder('MyBook')
                .setValue(this.plugin.settings.bookFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.bookFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('劇情卡片範本路徑')
            .setDesc('指定範本 Markdown 檔案的路徑 (預設: NovelSmith_Template.md)。')
            .addText(text => text
                .setPlaceholder('NovelSmith_Template.md')
                .setValue(this.plugin.settings.templateFilePath)
                .onChange(async (value) => {
                    this.plugin.settings.templateFilePath = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText('🔄 重新生成範本')
                .setTooltip('如果範本遺失，點擊此處重新生成 (不會覆蓋現有檔案)')
                .onClick(async () => {
                    await this.plugin.ensureTemplateFileExists(true);
                }));


        new Setting(containerEl)
            .setName('編譯匯出路徑')
            .setDesc('一鍵編譯後的完整稿件會儲存在這裡 (例如 Output)。')
            .addText(text => text
                .setPlaceholder('Output')
                .setValue(this.plugin.settings.exportFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.exportFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // ==========================================
        // 💾 串聯
        // ==========================================

        containerEl.createEl('h3', { text: 'Scrivenering Mode' });

        new Setting(containerEl)
            .setName('串聯草稿檔名')
            .setDesc('指定串聯模式時生成的檔案名稱 (記得保留 .md)。系統儲存草稿版本時，會自動在檔名後方加上時間戳記 (例如 _20260101_1200.md)，以免覆蓋舊檔。')
            .addText(text => text
                .setPlaceholder('_Full_Draft_Edit.md')
                .setValue(this.plugin.settings.draftFilename)
                .onChange(async (value) => {
                    this.plugin.settings.draftFilename = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('同步後保留草稿紀錄')
            .setDesc('開啟後，結束串聯模式時不會刪除草稿，而是將其封存備份。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.keepDraftOnSync)
                .onChange(async (value) => {
                    this.plugin.settings.keepDraftOnSync = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('草稿封存資料夾')
            .setDesc('如果開啟了「保留草稿紀錄」，請指定草稿備份存放的資料夾路徑。')
            .addText(text => text
                .setPlaceholder('MyBook/_Archived_Drafts')
                .setValue(this.plugin.settings.keptDraftPath)
                .onChange(async (value) => {
                    this.plugin.settings.keptDraftPath = value;
                    await this.plugin.saveSettings();
                }));



        // ==========================================
        // 💾 原子存檔
        // ==========================================
        containerEl.createEl('h3', { text: '💾 原子存檔 (Version Control)' });

        new Setting(containerEl)
            .setName('歷史檔案存放目錄')
            .setDesc('指定所有情節歷史版本存放的完整路徑 (例如：終焉與破曉/04_其他/_History/Scenes)')
            .addText(text => text
                .setPlaceholder('終焉與破曉/04_其他/_History/Scenes')
                .setValue(this.plugin.settings.historyFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.historyFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // ==========================================
        // 🛠️ 寫作輔助
        // ==========================================
        containerEl.createEl('h3', { text: '🛠️ 寫作輔助 (Aids)' });

        new Setting(containerEl)
            .setName('贅字清單路徑')
            .setDesc('指定 _贅字清單.md 的完整路徑')
            .addText(text => text
                .setPlaceholder('終焉與破曉/04_其他/_贅字清單.md')
                .setValue(this.plugin.settings.redundantListPath)
                .onChange(async (value) => {
                    this.plugin.settings.redundantListPath = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText('🔄 重新生成')
                .onClick(async () => {
                    await this.plugin.writingManager.ensureRedundantListExists(true);
                }));

        new Setting(containerEl)
            .setName('正字名單路徑')
            .setDesc('指定 FixList.md 的完整路徑 (用於 CorrectName)')
            .addText(text => text
                .setPlaceholder('FixList.md')
                .setValue(this.plugin.settings.fixListPath)
                .onChange(async (value) => {
                    this.plugin.settings.fixListPath = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText('🔄 重新生成')
                .onClick(async () => {
                    await this.plugin.writingManager.ensureFixListExists(true);
                }));

        // ==========================================
        // 🧠 自動百科
        // ==========================================
        containerEl.createEl('h3', { text: '🧠 自動百科 (AutoWiki)' });

        new Setting(containerEl)
            .setName('百科存放資料夾')
            .setDesc('新建立的人物/設定卡片會自動放入此資料夾')
            .addText(text => text
                .setPlaceholder('終焉與破曉/03_參考資料/設定集/人物角色')
                .setValue(this.plugin.settings.wikiFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.wikiFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('p', { text: 'Designed for Sword and Sheaves.' });
    }
}