import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import NovelSmithPlugin from './main';

export interface NovelSmithSettings {
    bookFolderPath: string;
    keepDraftOnSync: boolean; // Keep drafts during scrivenings sync
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
        containerEl.createEl('h2', { text: '⚔️ NovelSmith Settings' });

        // ==========================================
        // 📚 Core Settings
        // ==========================================
        containerEl.createEl('h3', { text: '📚 Core Writing Workspace' });

        new Setting(containerEl)
            .setName('Dedicated Writing Folder')
            .setDesc('Designate your novel\'s root directory (e.g., MyBook). The system will automatically create a _Backstage folder inside to store all system files.')
            .addText(text => text
                .setPlaceholder('MyBook')
                .setValue(this.plugin.settings.bookFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.bookFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("🎉 Initialize NovelSmith")
            .setDesc("One-click setup for your dedicated writing folder, the _Backstage system directory, and a default Scene Card template.")
            .addButton(btn => btn
                .setButtonText("🚀 Initialize Now")
                .setCta() // Turn into a prominent CTA button color
                .onClick(async () => {
                    const folder = this.plugin.settings.bookFolderPath;
                    if (!folder || folder.trim() === "") {
                        new Notice("⚠️ Please enter your desired 'Folder Name' above first!");
                        return;
                    }

                    // Call the powerful generator in main.ts!
                    // forceShowNotice = true, openAfterCreate = true
                    await this.plugin.ensureTemplateFileExists(true, true);
                    new Notice(`✅ Initialization successful! Your writing workspace [${folder}] is ready!`);
                })
            );


        new Setting(containerEl)
            .setName('Keep Draft History After Sync')
            .setDesc('When enabled, ending Scrivenings Mode will backup the draft to _Backstage/Drafts.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.keepDraftOnSync)
                .onChange(async (value) => {
                    this.plugin.settings.keepDraftOnSync = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Compile Export Path')
            .setDesc('Fully compiled manuscripts will be saved here (e.g., Output).')
            .addText(text => text
                .setPlaceholder('Output')
                .setValue(this.plugin.settings.exportFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.exportFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // ==========================================
        // 🧠 AutoWiki
        // ==========================================
        containerEl.createEl('h3', { text: '🧠 AutoWiki' });

        new Setting(containerEl)
            .setName('Wiki Storage Folder')
            .setDesc('Newly created Character/Setting cards will automatically be placed in this folder.')
            .addText(text => text
                .setPlaceholder('MyBook/Wiki')
                .setValue(this.plugin.settings.wikiFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.wikiFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // ==========================================
        // 🛠️ System Repair (Keep manual regeneration buttons)
        // ==========================================
        containerEl.createEl('h3', { text: '🛠️ System Repair and Rebuild' });
        containerEl.createEl('p', { text: 'If system files in _Backstage are lost, click the buttons below to regenerate them (will not overwrite existing files).', cls: 'setting-item-description' });

        new Setting(containerEl)
            .setName('Regenerate: Scene Card Template')
            .addButton(button => button
                .setButtonText('🔄 Rebuild Template')
                .onClick(async () => {
                    await this.plugin.ensureTemplateFileExists(true);
                }));

        new Setting(containerEl)
            .setName('Regenerate: Redundant Words List')
            .addButton(button => button
                .setButtonText('🔄 Rebuild Redundant List')
                .onClick(async () => {
                    await this.plugin.writingManager.ensureRedundantListExists(true);
                }));

        new Setting(containerEl)
            .setName('Regenerate: Correction List')
            .addButton(button => button
                .setButtonText('🔄 Rebuild Correction List')
                .onClick(async () => {
                    await this.plugin.writingManager.ensureFixListExists(true);
                }));

        containerEl.createEl('p', { text: 'Designed for Sword and Sheaves.' });
    }
}