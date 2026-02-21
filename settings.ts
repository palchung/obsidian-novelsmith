import { App, PluginSettingTab, Setting } from 'obsidian';
import NovelSmithPlugin from './main';

// 1. 定義設定的「形狀」 (Interface)
export interface NovelSmithSettings {
    // 核心功能
    draftFilename: string;

    // 原子存檔 (Save/Restore)
    historyBasePath: string;
    scenesSubfolder: string;

    // 寫作輔助 (Redundant/Correct)
    redundantListPath: string;
    fixListPath: string;

    // 自動百科 (AutoWiki)
    wikiFolderPath: string;

    // 🔥 新增：匯出路徑 (Export)
    exportFolderPath: string;
}

// 2. 設定預設值 (Default)
export const DEFAULT_SETTINGS: NovelSmithSettings = {
    draftFilename: '_Full_Draft_Edit.md',
    historyBasePath: '終焉與破曉/04_其他/_History',
    scenesSubfolder: 'Scenes',
    redundantListPath: '終焉與破曉/04_其他/_贅字清單.md',
    fixListPath: 'FixList.md',
    wikiFolderPath: '終焉與破曉/03_參考資料/設定集/人物角色',
    exportFolderPath: 'Output' // 🔥 預設值
}

// 3. 建立設定頁面 (UI)
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

        // ============================================================
        // 核心功能設定
        // ============================================================
        containerEl.createEl('h3', { text: '📚 核心與串聯' });

        new Setting(containerEl)
            .setName('串聯草稿檔名')
            .setDesc('指定串聯模式時生成的檔案名稱 (記得保留 .md)')
            .addText(text => text
                .setPlaceholder('_Full_Draft_Edit.md')
                .setValue(this.plugin.settings.draftFilename)
                .onChange(async (value) => {
                    this.plugin.settings.draftFilename = value;
                    await this.plugin.saveSettings();
                }));

        // 🔥 新增：匯出設定
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

        // ============================================================
        // 原子存檔設定
        // ============================================================
        containerEl.createEl('h3', { text: '💾 原子存檔 (Version Control)' });

        new Setting(containerEl)
            .setName('歷史檔案根目錄')
            .setDesc('存放所有歷史版本的根目錄位置')
            .addText(text => text
                .setPlaceholder('終焉與破曉/04_其他/_History')
                .setValue(this.plugin.settings.historyBasePath)
                .onChange(async (value) => {
                    this.plugin.settings.historyBasePath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('情節子目錄名稱')
            .setDesc('在根目錄下，存放情節版本的資料夾名稱')
            .addText(text => text
                .setPlaceholder('Scenes')
                .setValue(this.plugin.settings.scenesSubfolder)
                .onChange(async (value) => {
                    this.plugin.settings.scenesSubfolder = value;
                    await this.plugin.saveSettings();
                }));

        // ============================================================
        // 寫作輔助設定
        // ============================================================
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
                }));

        // ============================================================
        // 自動百科設定
        // ============================================================
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

        containerEl.createEl('p', { text: 'Designed for "Sword and Sheaves".' });
    }
}