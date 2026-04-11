import { App, Modal, TFolder, TFile, getIcon, setIcon } from 'obsidian';
import NovelSmithPlugin from '../../main';
import { DRAFT_FILENAME } from '../utils';

// 定義文學風字體
const LIT_FONT = "font-family: 'Georgia', 'Times New Roman', serif;";

export class WordCountModal extends Modal {
    plugin: NovelSmithPlugin;
    totalWords: number = 0;

    constructor(plugin: NovelSmithPlugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ns-word-count-modal");

        // ==========================================
        // 🌟 隱藏原生標題列，營造沉浸式設計
        // ==========================================
        const titleRow = contentEl.createDiv();
        titleRow.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" });
        const titleLeft = titleRow.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px;" } });
        const titleIcon = titleLeft.createSpan();
        setIcon(titleIcon, "layout-dashboard");
        titleIcon.setCssStyles({ color: "var(--interactive-accent)" });
        titleLeft.createEl("h2", { text: "Manuscript Dashboard", attr: { style: "margin: 0; font-weight: 700; letter-spacing: -0.5px;" } });

        const loadingEl = contentEl.createDiv({ text: "Scanning your masterpiece...", attr: { style: `text-align: center; color: var(--text-muted); font-style: italic; padding: 40px; ${LIT_FONT}` } });

        // 開始掃描並獲取完整 HTML 樹及「動態總目標」
        const rootFolder = this.app.vault.getAbstractFileByPath(this.plugin.settings.bookFolderPath) as TFolder;
        const scanResult = rootFolder ? await this.buildTree(rootFolder, 0) : { words: 0, target: 0, html: "" };
        this.totalWords = scanResult.words;
        const globalTarget = scanResult.target || 1;

        loadingEl.remove();

        // ==========================================
        // 🏆 Hero Widget (文學風英雄儀表板)
        // ==========================================
        let globalPercent = Math.round((this.totalWords / globalTarget) * 100);
        if (isNaN(globalPercent)) globalPercent = 0;
        const getStatusColor = (pct: number) => pct >= 100 ? "var(--color-green)" : (pct < 30 ? "var(--color-red)" : "var(--interactive-accent)");
        const globalColor = getStatusColor(globalPercent);

        const heroBox = contentEl.createDiv();
        heroBox.setCssStyles({
            padding: "24px",
            backgroundColor: "var(--background-secondary)",
            borderRadius: "16px",
            border: "1px solid var(--background-modifier-border)",
            marginBottom: "24px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
            textAlign: "center"
        });

        heroBox.createDiv({ text: "TOTAL PROGRESS", attr: { style: "font-size: 0.85em; font-weight: 700; color: var(--text-muted); letter-spacing: 2px; margin-bottom: 12px;" } });

        // 巨大化數字顯示
        const numbersRow = heroBox.createDiv();
        numbersRow.setCssStyles({ display: "flex", justifyContent: "center", alignItems: "baseline", gap: "10px", marginBottom: "16px" });
        numbersRow.createSpan({ text: this.totalWords.toLocaleString(), attr: { style: `font-size: 3.5em; font-weight: 700; color: var(--text-normal); line-height: 1; ${LIT_FONT}` } });
        numbersRow.createSpan({ text: `/ ${globalTarget.toLocaleString()} words`, attr: { style: `font-size: 1.2em; font-weight: 500; color: var(--text-muted); ${LIT_FONT}` } });

        // 圓滑進度條
        const barContainer = heroBox.createDiv();
        barContainer.setCssStyles({ width: "100%", height: "8px", background: "var(--background-modifier-darken)", borderRadius: "999px", overflow: "hidden" });
        const barFill = barContainer.createDiv();
        barFill.setCssStyles({ width: `${Math.min(globalPercent, 100)}%`, height: "100%", background: globalColor, transition: "width 0.8s cubic-bezier(0.25, 0.8, 0.25, 1)", borderRadius: "999px" });

        // ==========================================
        // 🎯 設定列
        // ==========================================
        const settingsRow = contentEl.createDiv();
        settingsRow.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", padding: "0 4px" });

        settingsRow.createEl("h3", { text: "Chapters", attr: { style: `margin: 0; font-size: 1.2em; color: var(--text-muted); ${LIT_FONT}` } });

        const chapTarget = this.plugin.settings.defaultChapterWordTarget || 2000;
        const chapTargetBox = settingsRow.createDiv();
        chapTargetBox.setCssStyles({ display: "flex", alignItems: "center", gap: "8px", background: "var(--background-secondary)", padding: "6px 12px", borderRadius: "20px", border: "1px solid var(--background-modifier-border)" });
        const cIcon = chapTargetBox.createSpan(); setIcon(cIcon, "target");
        cIcon.setCssStyles({ color: "var(--text-muted)", width: "16px", height: "16px", display: "flex", alignItems: "center" });
        chapTargetBox.createEl("span", { text: "Default Target:", attr: { style: "font-size: 0.9em; color: var(--text-muted);" } });

        const chapInput = chapTargetBox.createEl("input", { type: "number", value: chapTarget.toString() });
        chapInput.setCssStyles({ width: "65px", padding: "0", border: "none", background: "transparent", color: "var(--text-normal)", fontSize: "1em", fontWeight: "bold", textAlign: "right", outline: "none", ...{ fontFamily: "'Georgia', serif" } });
        chapInput.onchange = async () => {
            this.plugin.settings.defaultChapterWordTarget = parseInt(chapInput.value);
            await this.plugin.saveSettings();
            this.onOpen();
        };

        // ==========================================
        // 🌟 詳細列表
        // ==========================================
        const treeContainer = contentEl.createDiv({ cls: "ns-wc-tree-container" });
        treeContainer.setCssStyles({
            maxHeight: "50vh",
            overflowY: "auto",
            paddingRight: "8px"
        });
        treeContainer.innerHTML = scanResult.html;
    }

    onClose() { this.contentEl.empty(); }

    async buildTree(folder: TFolder, depth: number = 0): Promise<{ words: number, target: number, html: string }> {
        let folderWords = 0;
        let folderTargetSum = 0;
        let childrenHTML = "";

        const folderIcon = getIcon("folder-open")?.outerHTML || "";

        const children = folder.children.sort((a, b) => {
            if (a instanceof TFolder && b instanceof TFile) return -1;
            if (a instanceof TFile && b instanceof TFolder) return 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        for (const child of children) {
            if (child.name.startsWith("_") || child.name === DRAFT_FILENAME || child.name.includes("Script")) continue;

            if (child instanceof TFolder) {
                const sub = await this.buildTree(child, depth + 1);
                folderWords += sub.words;

                const effectiveTarget = sub.target;
                folderTargetSum += effectiveTarget;

                let pct = effectiveTarget > 0 ? Math.min(Math.round((sub.words / effectiveTarget) * 100), 100) : 0;
                let color = pct >= 100 ? "var(--color-green)" : (pct < 30 && effectiveTarget > 0 ? "var(--color-red)" : "var(--interactive-accent)");

                // 📁 部曲資料夾卡片
                childrenHTML += `
                    <div style="background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 12px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); overflow: hidden;">
                        
                        <div style="background: var(--background-secondary); padding: 16px 20px; border-bottom: 1px solid var(--background-modifier-border);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span style="display: flex; color: var(--interactive-accent); width: 18px; height: 18px;">${folderIcon}</span>
                                    <span style="font-weight: 700; font-size: 1.25em; color: var(--text-normal); letter-spacing: 0.5px; ${LIT_FONT}">${child.name}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 16px;">
                                    <span style="font-size: 1.05em; color: var(--text-muted); ${LIT_FONT}">
                                        ${sub.words.toLocaleString()} <span style="opacity: 0.6;">/ ${effectiveTarget.toLocaleString()}</span>
                                    </span>
                                    <span style="font-weight: 700; font-size: 1.05em; color: ${color}; width: 45px; text-align: right; ${LIT_FONT}">${pct}%</span>
                                </div>
                            </div>
                            ${effectiveTarget > 0 ? `<div style="margin-top: 12px; width: 100%; background: var(--background-modifier-darken); height: 5px; border-radius: 999px; overflow: hidden;"><div style="width: ${pct}%; background: ${color}; height: 100%; border-radius: 999px;"></div></div>` : ''}
                        </div>

                        <div style="padding: 8px 16px 12px 16px; display: flex; flex-direction: column; gap: 4px;">
                            ${sub.html}
                        </div>
                    </div>
                `;
            } else if (child instanceof TFile && child.extension === "md") {
                const content = await this.app.vault.cachedRead(child);
                let pureText = content.replace(/%%[\s\S]*?%%/g, "").replace(/~~[\s\S]*?~~/g, "");
                const wordsMatch = pureText.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9]+/g);
                const fileWords = wordsMatch ? wordsMatch.length : 0;
                folderWords += fileWords;

                const fileTarget = this.plugin.settings.wordTargets[child.path] || this.plugin.settings.defaultChapterWordTarget || 2000;
                folderTargetSum += fileTarget;

                const pct = fileTarget > 0 ? Math.min(Math.round((fileWords / fileTarget) * 100), 100) : 0;
                const color = pct >= 100 ? "var(--color-green)" : (pct < 30 ? "var(--color-red)" : "var(--interactive-accent)");

                const displayName = child.basename.replace(/^[0-9_]+/, "").trim();

                // 📄 章節列 (🌟 收緊咗行距: padding 改為 8px 10px)
                childrenHTML += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 8px; transition: background 0.2s;">
                        <div style="display: flex; align-items: center; gap: 14px; overflow: hidden;">
                            <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${color}; box-shadow: 0 0 6px ${color}66; flex-shrink: 0;"></div>
                            <span style="font-size: 1.1em; font-weight: 500; color: var(--text-normal); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${LIT_FONT}">${displayName}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 18px; flex-shrink: 0;">
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                                <span style="font-size: 1em; color: var(--text-muted); ${LIT_FONT}">${fileWords.toLocaleString()} <span style="opacity: 0.5;">/ ${fileTarget.toLocaleString()}</span></span>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="width: 70px; background: var(--background-modifier-darken); height: 4px; border-radius: 999px; overflow: hidden;"><div style="width: ${pct}%; background: ${color}; height: 100%; border-radius: 999px;"></div></div>
                                    <span style="font-size: 0.95em; font-weight: 700; color: ${color}; width: 38px; text-align: right; ${LIT_FONT}">${pct}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        return { words: folderWords, target: folderTargetSum, html: childrenHTML };
    }
}