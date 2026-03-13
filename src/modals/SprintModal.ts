// src/modals/SprintModal.ts
import { App, Modal, Setting } from 'obsidian';

// ============================================================
// ⏱️ Word Sprint Setup Modal
// ============================================================
export class SprintSetupModal extends Modal {
    onSubmit: (minutes: number) => void;
    minutes: number = 20; // 預設 20 分鐘

    constructor(app: App, onSubmit: (minutes: number) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Writing sprint (zen mode)' });
        contentEl.createEl('p', { text: 'Set a timer, ignore all distractions, and write as much as you can. The sidebar will enter focus mode.', cls: 'setting-item-description' });

        new Setting(contentEl)
            .setName('Sprint duration (minutes)')
            .addSlider(slider => slider
                .setLimits(5, 60, 5) // 最少 5 分鐘，最多 60 分鐘
                .setValue(this.minutes)
                .setDynamicTooltip()
                .onChange(val => this.minutes = val)
            );

        const btnRow = contentEl.createDiv({ attr: { style: "display: flex; justify-content: flex-end; margin-top: 20px;" } });
        btnRow.createEl('button', { text: 'Start sprinting!', cls: 'mod-cta' }).onclick = () => {
            this.close();
            this.onSubmit(this.minutes);
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}