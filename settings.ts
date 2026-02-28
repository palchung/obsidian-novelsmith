import { App, PluginSettingTab, Setting } from 'obsidian';
import NovelSmithPlugin from './main';

export interface NovelSmithSettings {
    bookFolderPath: string;
    keepDraftOnSync: boolean; // 是否保留串聯草稿
    wikiFolderPath: string;
    exportFolderPath: string;
}

export const DEFAULT_SETTINGS: NovelSmithSettings = {
    bookFolderPath: '',
    keepDraftOnSync: false,
    wikiFolderPath: '',
    exportFolderPath: ''
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
        // 📚 核心設定
        // ==========================================
        containerEl.createEl('h3', { text: '📚 核心寫作區' });

        new Setting(containerEl)
            .setName('專屬寫作資料夾')
            .setDesc('指定你的小說主目錄 (例如 MyBook)。系統會自動在此目錄下建立 _Backstage (後台) 資料夾來存放所有系統檔案。')
            .addText(text => text
                .setPlaceholder('MyBook')
                .setValue(this.plugin.settings.bookFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.bookFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("🎉 初始化 NovelSmith")
            .setDesc("一鍵建立您的專屬寫作資料夾、_Backstage 系統後台，並生成新手劇情卡片範本。")
            .addButton(btn => btn
                .setButtonText("🚀 立即初始化")
                .setCta() // 變成醒目的主按鈕顏色
                .onClick(async () => {
                    const folder = this.plugin.settings.bookFolderPath;
                    if (!folder || folder.trim() === "") {
                        new Notice("⚠️ 請先在上方輸入您想要的「資料夾名稱」！");
                        return;
                    }

                    // 呼叫 main.ts 裡面的強大生成器！
                    // forceShowNotice = true, openAfterCreate = true
                    await this.plugin.ensureTemplateFileExists(true, true);
                    new Notice(`✅ 初始化成功！您的寫作基地 [${folder}] 已準備就緒！`);
                })
            );


        new Setting(containerEl)
            .setName('同步後保留草稿紀錄')
            .setDesc('開啟後，結束串聯模式時會將草稿備份至 _Backstage/Drafts。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.keepDraftOnSync)
                .onChange(async (value) => {
                    this.plugin.settings.keepDraftOnSync = value;
                    await this.plugin.saveSettings();
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
        // 🧠 自動百科
        // ==========================================
        containerEl.createEl('h3', { text: '🧠 自動百科 (AutoWiki)' });

        new Setting(containerEl)
            .setName('百科存放資料夾')
            .setDesc('新建立的人物/設定卡片會自動放入此資料夾')
            .addText(text => text
                .setPlaceholder('MyBook/Wiki')
                .setValue(this.plugin.settings.wikiFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.wikiFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // ==========================================
        // 🛠️ 系統修復 (保留手動重新生成按鈕)
        // ==========================================
        containerEl.createEl('h3', { text: '🛠️ 系統修復與重建' });
        containerEl.createEl('p', { text: '如果 _Backstage 中的系統檔案遺失，可點擊下方按鈕重新生成 (不會覆蓋現有檔案)。', cls: 'setting-item-description' });

        new Setting(containerEl)
            .setName('重新生成：劇情卡片範本')
            .addButton(button => button
                .setButtonText('🔄 重建範本')
                .onClick(async () => {
                    await this.plugin.ensureTemplateFileExists(true);
                }));

        new Setting(containerEl)
            .setName('重新生成：贅字清單')
            .addButton(button => button
                .setButtonText('🔄 重建贅字表')
                .onClick(async () => {
                    await this.plugin.writingManager.ensureRedundantListExists(true);
                }));

        new Setting(containerEl)
            .setName('重新生成：正字名單')
            .addButton(button => button
                .setButtonText('🔄 重建正字表')
                .onClick(async () => {
                    await this.plugin.writingManager.ensureFixListExists(true);
                }));

        containerEl.createEl('p', { text: 'Designed for Sword and Sheaves.' });
    }
}