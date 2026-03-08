import { App, PluginSettingTab, Setting, Notice, setIcon } from 'obsidian';
import NovelSmithPlugin from './../main';



export interface WikiCategory {
    name: string;       // e.g Location
    folderPath: string; // path to Location
}


export interface NovelSmithSettings {
    bookFolderPath: string;
    keepDraftOnSync: boolean; // Keep drafts during scrivenings sync
    wikiFolderPath: string;
    exportFolderPath: string;
    wikiCategories: WikiCategory[];
}

export const DEFAULT_SETTINGS: NovelSmithSettings = {
    bookFolderPath: '',
    keepDraftOnSync: false,
    exportFolderPath: '',
    wikiFolderPath: '',
    wikiCategories: []
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
        ;

        // ==========================================
        // 📚 Core Settings
        // ==========================================
        new Setting(containerEl).setName("Core writing workspace").setHeading();

        new Setting(containerEl)
            .setName('Dedicated writing folder')
            .setDesc('Designate your novel\'s root directory (e.g., mybook). The system will automatically create a _backstage folder inside to store all system files.')
            .addText(text => text
                .setPlaceholder('Mybook')
                .setValue(this.plugin.settings.bookFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.bookFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Initialize novelsmith")
            .setDesc("One-click setup for your dedicated writing folder, the _backstage system directory, and a default scene card template.")
            .addButton(btn => btn
                .setButtonText("Initialize now")
                .setCta() // Turn into a prominent CTA button color
                .onClick(() => {
                    const folder = this.plugin.settings.bookFolderPath;
                    if (!folder || folder.trim() === "") {
                        new Notice("Please enter your desired 'folder name' above first!");
                        return;
                    }

                    // Call the powerful generator in main.ts!
                    // forceShowNotice = true, openAfterCreate = true
                    void this.plugin.ensureTemplateFileExists(true, true).then(() => {
                        new Notice(`Initialization successful! Your writing workspace [${folder}] is ready!`);
                    });

                })
            );


        new Setting(containerEl)
            .setName('Keep draft history after sync')
            .setDesc('When enabled, ending scrivenings mode will backup the draft to _backstage/drafts.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.keepDraftOnSync)
                .onChange(async (value) => {
                    this.plugin.settings.keepDraftOnSync = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Compile export path')
            .setDesc('Fully compiled manuscripts will be saved here (e.g., output).')
            .addText(text => text
                .setPlaceholder('Output')
                .setValue(this.plugin.settings.exportFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.exportFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // ==========================================
        // AutoWiki (Dynamic World Bible)
        // ==========================================
        new Setting(containerEl).setName("Auto wiki categories").setHeading();
        containerEl.createEl('p', {
            text: 'Configure your worldbuilding categories here. The "category name" must match exactly the attribute key in your scene cards (e.g., "player" or "character").',
            cls: 'setting-item-description'
        });


        this.plugin.settings.wikiCategories.forEach((category, index) => {
            const box = containerEl.createDiv({ cls: "ns-wiki-category-box" });
            box.setCssStyles({
                border: "1px solid var(--background-modifier-border)",
                padding: "15px",
                marginBottom: "15px",
                borderRadius: "8px",
                backgroundColor: "var(--background-secondary-alt)"
            });

            const headerRow = box.createDiv();
            headerRow.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" });
            new Setting(headerRow).setName("").setHeading();

            const btnDelete = headerRow.createEl("button");
            setIcon(btnDelete, "trash-2");
            btnDelete.setCssStyles({ color: "var(--text-error)", backgroundColor: "transparent", boxShadow: "none" });
            btnDelete.onclick = async () => {
                this.plugin.settings.wikiCategories.splice(index, 1);
                await this.plugin.saveSettings();
                this.display();
            };

            // input field
            new Setting(box)
                .setName('Category name')
                .setDesc('E.g., characters, location, magic')
                .addText(text => text
                    .setPlaceholder('Characters')
                    .setValue(category.name)
                    .onChange(async (value) => {
                        category.name = value;
                        await this.plugin.saveSettings();
                    }));


            new Setting(box)
                .setName('Storage folder')
                .setDesc('Any path in your vault (e.g., mybook/characters)')
                .addText(text => text
                    .setPlaceholder('Mybook/characters')
                    .setValue(category.folderPath)
                    .onChange(async (value) => {
                        category.folderPath = value;
                        await this.plugin.saveSettings();
                    }));


            const btnRow = box.createDiv();
            btnRow.setCssStyles({ display: "flex", justifyContent: "flex-end", marginTop: "10px" });
            const btnTemplate = btnRow.createEl("button", { text: "Generate template" });
            btnTemplate.onclick = () => {
                void this.plugin.ensureWikiTemplateExists(category.name);
            };
        });


        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Add wiki category')
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.wikiCategories.push({ name: "", folderPath: "" });
                    await this.plugin.saveSettings();
                    this.display();
                }));

        // ==========================================
        // 🛠️ System Repair (Keep manual regeneration buttons)
        // ==========================================
        new Setting(containerEl).setName("System repair and rebuild").setHeading();
        containerEl.createEl('p', { text: 'If system files in _backstage are lost, click the buttons below to regenerate them (will not overwrite existing files).', cls: 'setting-item-description' });

        new Setting(containerEl)
            .setName('Regenerate: scene card template')
            .addButton(button => button
                .setIcon('refresh-cw')  // 
                .setButtonText('Rebuild template')
                .onClick(() => {
                    void this.plugin.ensureTemplateFileExists(true);
                }));

        new Setting(containerEl)
            .setName('Regenerate: redundant words list')
            .addButton(button => button
                .setIcon('refresh-cw')
                .setButtonText('Rebuild redundant list')
                .onClick(() => {
                    void this.plugin.writingManager.ensureRedundantListExists(true);
                }));

        new Setting(containerEl)
            .setName('Regenerate: correction list')
            .addButton(button => button
                .setIcon('refresh-cw')
                .setButtonText('Rebuild correction list')
                .onClick(() => {
                    void this.plugin.writingManager.ensureFixListExists(true);
                }));





        // ==========================================
        // Donation Section (Buy Me A Coffee)
        // ==========================================
        const donationDiv = containerEl.createDiv({
            attr: {
                style: 'margin-top: 50px; text-align: center; padding: 20px; background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-modifier-border);'
            }
        });

        donationDiv.createEl('p', {
            text: "If novelsmith has smoothed out your writing workflow and you'd like to support its continuous development, consider buying me a coffee! Your support means the world to me.",
            attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 15px; line-height: 1.5;' }
        });


        const bmacLink = donationDiv.createEl('a', {
            href: 'https://buymeacoffee.com/palchung',
            target: '_blank'
        });

        bmacLink.createEl('img', {
            attr: {
                src: 'https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png',
                alt: 'Buy Me A Coffee',
                style: 'height: 40px; border-radius: 5px;'
            }
        });



        // ==========================================
        // Slogan 
        // ==========================================
        const sloganContainer = containerEl.createDiv();
        sloganContainer.setCssStyles({
            marginTop: "50px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            color: "var(--text-muted)",
            fontStyle: "italic",
            fontSize: "1em",
            opacity: "0.8"
        });


        const iconSpan = sloganContainer.createSpan();
        setIcon(iconSpan, "feather");

        sloganContainer.createSpan({ text: "By writers, for writers." });
    }
}