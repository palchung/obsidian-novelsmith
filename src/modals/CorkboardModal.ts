// src/modals/CorkboardModal.ts
import { App, TFolder, Menu, setIcon, Modal, TFile, Notice, MarkdownView, MarkdownRenderer } from 'obsidian';
import Sortable from 'sortablejs';
import NovelSmithPlugin from '../../main';
import { extractSynopsisAndTags, TEMPLATES_DIR, getColorById, generateSceneId, SCENE_COLORS, createIconButton, getManuscriptFiles, parseUniversalScenes, parseContent } from '../utils';
import { InputModal, SimpleConfirmModal, SceneCreateModal } from '../modals';

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

        contentEl.createEl('h2', { text: "Scrivenings mode active" });
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
            text: "Sync & open corkboard",
            cls: "mod-cta"
        });
        btnSync.onclick = () => {
            this.close();
            this.onSyncAndOpen();
        };

        // Option B: Discard & Open
        const btnDiscard = btnGroup.createEl('button', {
            text: "Discard draft & open corkboard"
        });
        btnDiscard.setCssStyles({
            backgroundColor: "var(--background-modifier-error)", color: "white"
        });
        btnDiscard.onclick = () => {
            this.close();
            this.onDiscardAndOpen();
        };

        // Option C: Cancel
        const btnCancel = btnGroup.createEl('button', { text: "Cancel" });
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
    workingFolderPath: string;
    isFromScrivenings: boolean;
    sortables: Sortable[] = [];
    wikiPanel: HTMLElement;

    // 🌟 終極沙盒記憶體
    liveSceneMap: Map<string, string> = new Map();
    pendingEdits: Map<string, string> = new Map();

    // 🌟 雷達專屬變數
    activeRadarTokens: { key: string, value: string }[] = [];
    isRadarMode: boolean = false;
    radarDrawer: HTMLElement;
    tokenContainer: HTMLElement;

    constructor(plugin: NovelSmithPlugin, anchorSceneId: string | null = null, workingFolderPath: string, isFromScrivenings: boolean = false) {
        super(plugin.app);
        this.plugin = plugin;
        this.anchorSceneId = anchorSceneId;
        this.workingFolderPath = workingFolderPath;
        this.isFromScrivenings = isFromScrivenings;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.modalEl.setCssStyles({ width: "95vw", height: "95vh", maxWidth: "none", maxHeight: "none" });
        contentEl.setCssStyles({ display: "flex", flexDirection: "column", height: "100%" });
        this.modalEl.addClass("ns-corkboard-modal");

        // 🌟 隱藏 Obsidian 原生嘅右上角 X 關閉掣
        const defaultCloseBtn = this.modalEl.querySelector('.modal-close-button');
        if (defaultCloseBtn) defaultCloseBtn.setCssStyles({ display: "none" });

        const folderName = this.workingFolderPath.split('/').pop() || "Global";

        // ==========================================
        // 🌟 完美重構：三合一頂部 Header
        // ==========================================
        const headerRow = contentEl.createDiv({ cls: "ns-corkboard-header-row" });

        // 👈 左邊：原生 Icon + 標題 + 資料夾名
        const titleLeft = headerRow.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-top: 4px;" } });
        const titleIcon = titleLeft.createSpan();
        setIcon(titleIcon, "layout-dashboard");
        titleIcon.setCssStyles({ color: "var(--interactive-accent)" });
        titleLeft.createEl("h2", { text: "Corkboard", attr: { style: "margin: 0;" } });

        titleLeft.createSpan({ text: `/ ${folderName}`, cls: "ns-corkboard-folder-name" });

        // 🎯 中間：雷達追蹤器
        const radarConsole = headerRow.createDiv({ cls: "ns-radar-console" });

        // 👉 右邊：控制按鈕區
        const headerControls = headerRow.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center; flex-shrink: 0; margin-top: 4px;" } });
        const btnSave = headerControls.createEl("button", { text: "Save & close", cls: "mod-cta ns-save-btn" });
        const btnCancel = headerControls.createEl("button", { text: "Cancel" });

        btnSave.onclick = async () => {
            btnSave.disabled = true;
            btnSave.innerText = "Saving...";
            await this.saveGlobalCorkboard(gridContainer, btnSave);
        };
        btnCancel.onclick = () => this.cancelCorkboard();

        const gridContainer = contentEl.createDiv({ cls: "ns-corkboard-grid" });
        gridContainer.createEl("h3", { text: "Loading manuscript data...", attr: { style: "opacity: 0.6; margin: auto;" } });

        await this.renderGlobalCards(gridContainer);

        // 🌟 喺讀取完所有卡片之後，先至構建雷達
        this.buildRadarConsole(radarConsole);

        // 🌟 構建「側滑資料面板」
        this.wikiPanel = contentEl.createDiv({ cls: "ns-corkboard-wiki-panel" });
    }

    // ==========================================
    // 🎨 UI Builders
    // ==========================================
    buildCardDOM(listContainer: HTMLElement, scene: unknown) {
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

        this.populateCardInnerDOM(card, scene);

        card.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.closest(".ns-scene-actions, .ns-scene-footer")) return;

            const safeKey = scene.safeKey || card.dataset.sceneId || card.dataset.sceneTitle || "";
            const content = this.pendingEdits.get(safeKey) || this.liveSceneMap.get(safeKey) || "";
            const parsed = parseUniversalScenes(content);
            const latestScene = parsed.length > 0 ? parsed[0] : scene;

            this.openScenePanel(card, latestScene);
        });
    }

    populateCardInnerDOM(card: HTMLElement, scene: unknown) {
        const colorObj = getColorById(card.dataset.colorId);
        const hexColor = colorObj?.color || "var(--background-modifier-border)";
        card.setCssStyles({ borderLeft: `6px solid ${hexColor}` });

        const titleRow = card.createDiv();
        titleRow.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "flex-start" });

        const titleLeft = titleRow.createDiv();
        titleLeft.setCssStyles({ display: "flex", alignItems: "flex-start", gap: "6px", flex: "1" });

        const iconEl = titleLeft.createSpan();
        setIcon(iconEl, "clapperboard");
        iconEl.setCssStyles({ opacity: "0.6", display: "flex", alignItems: "center", flexShrink: "0", marginTop: "2px" });

        titleLeft.createEl("h4", {
            text: card.dataset.sceneTitle,
            attr: { style: "margin: 0; color: var(--text-accent); font-size: 1.05em; line-height: 1.3; flex: 1; word-break: break-word; white-space: normal;" }
        });

        const jumpBtn = titleLeft.createDiv();
        setIcon(jumpBtn, "external-link");
        jumpBtn.setCssStyles({ cursor: "pointer", opacity: "0.4", display: "flex", alignItems: "center", justifyContent: "center", padding: "2px", flexShrink: "0", marginTop: "2px" });

        const jumpSvg = jumpBtn.querySelector("svg");
        if (jumpSvg) { jumpSvg.style.width = "14px"; jumpSvg.style.height = "14px"; }
        jumpBtn.addEventListener("mouseover", () => jumpBtn.setCssStyles({ opacity: "1", color: "var(--interactive-accent)" }));
        jumpBtn.addEventListener("mouseout", () => jumpBtn.setCssStyles({ opacity: "0.4", color: "initial" }));
        jumpBtn.onclick = (e) => {
            e.stopPropagation();
            new SimpleConfirmModal(this.app, "Save corkboard and jump to this scene?", async () => {
                this.anchorSceneId = card.dataset.sceneId || card.dataset.sceneTitle || null;
                const saveBtn = this.contentEl.querySelector(".ns-save-btn");
                if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = "Saving & jumping..."; }
                const gridContainer = this.contentEl.querySelector(".ns-corkboard-grid");
                await this.saveGlobalCorkboard(gridContainer, saveBtn);
            }).open();
        };

        const titleRight = titleRow.createDiv({ cls: "ns-scene-actions" });
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

        const { foundSynopsis, dynamicTags } = extractSynopsisAndTags(scene.meta || []);

        const noteText = foundSynopsis || (card.dataset.isNew === "true" ? "(New scene, edit later)" : "(No synopsis)");
        const noteEl = card.createDiv({ text: noteText, cls: "ns-scene-note" });
        noteEl.setCssStyles({ flexGrow: "1", fontSize: "0.9em", opacity: foundSynopsis ? "0.8" : "0.4", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "hidden", textOverflow: "ellipsis" });

        const footer = card.createDiv({ cls: "ns-scene-footer" });
        footer.setCssStyles({ display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "0.8em", marginTop: "auto", paddingTop: "10px", borderTop: "1px solid var(--background-modifier-border)" });

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
                const rawItems = tag.value.replace(/[\[\]]/g, '').split(/(?=#)|[,，、;；]+/).map(i => i.trim()).filter(i => i);
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

    buildColumnDOM(container: HTMLElement, colTitle: string, filePath: string | null, scenes: unknown[], insertBeforeEl?: HTMLElement) {
        const col = container.createDiv({ cls: "ns-corkboard-column" });
        const headerEl = col.createEl("h3");
        const listContainer = col.createDiv({ cls: "ns-corkboard-list" });
        if (filePath) listContainer.dataset.filePath = filePath;

        const match = colTitle.match(/^(\d+[\s_\-]+)(.*)$/);
        listContainer.dataset.prefix = match ? match[1] : "";
        listContainer.dataset.cleanTitle = match ? match[2] : colTitle;

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

        const rightControls = headerEl.createDiv();
        rightControls.setCssStyles({ display: "flex", gap: "4px", alignItems: "center" });

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
                listContainer.dataset.cleanTitle = safeName;
                titleTextContainer.empty();
                if (listContainer.dataset.prefix) {
                    titleTextContainer.createSpan({ text: listContainer.dataset.prefix, attr: { style: "opacity: 0.3; font-weight: normal;" } });
                }
                titleTextContainer.createSpan({ text: safeName });
            }, listContainer.dataset.cleanTitle).open();
        };

        const btnDeleteCol = rightControls.createDiv();
        setIcon(btnDeleteCol, "trash-2");
        btnDeleteCol.setCssStyles({ cursor: "pointer", opacity: "0.4", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "4px" });
        btnDeleteCol.addEventListener("mouseover", () => btnDeleteCol.setCssStyles({ opacity: "1", color: "var(--text-error)", backgroundColor: "var(--background-modifier-error-hover)" }));
        btnDeleteCol.addEventListener("mouseout", () => btnDeleteCol.setCssStyles({ opacity: "0.4", color: "initial", backgroundColor: "transparent" }));

        btnDeleteCol.onclick = async (e) => {
            e.stopPropagation();
            const cardsCount = listContainer.querySelectorAll(".ns-corkboard-card").length;
            if (cardsCount > 0) {
                new Notice("Cannot delete: this chapter still contains scenes. Please move them first.", 4000);
                return;
            }
            new SimpleConfirmModal(this.app, "Delete this empty chapter?", () => {
                col.remove();
                new Notice("Chapter removed from board (will be trashed on save).");
            }).open();
        };

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

        const btnAddScene = col.createEl("button", { text: "+ Add scene card" });
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
        const files = getManuscriptFiles(this.app, this.workingFolderPath, this.plugin.settings.exportFolderPath);
        container.empty();

        const titleCollisionCount = new Map<string, number>();

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const content = await this.app.vault.read(file);

            const parsedData = parseContent(content, true, this.app, file);
            for (const card of parsedData.cards) {
                let sceneFullText = card.rawHeader + "\n";
                if (card.meta && card.meta.length > 0) sceneFullText += card.meta.join("\n") + "\n";
                sceneFullText += "\n" + card.body;

                let safeKey = card.id || card.key;
                if (!safeKey) {
                    const count = titleCollisionCount.get(card.title) || 0;
                    safeKey = count === 0 ? card.title : `${card.title}_${count}`;
                    titleCollisionCount.set(card.title, count + 1);
                }
                this.liveSceneMap.set(safeKey, sceneFullText.trimEnd());
            }

            const scenes = parseUniversalScenes(content);
            const scenesWithSafeKey = scenes.map(s => {
                let sKey = s.id;
                if (!sKey) {
                    const c = titleCollisionCount.get(s.title + "_ui") || 0;
                    sKey = c === 0 ? s.title : `${s.title}_${c}`;
                    titleCollisionCount.set(s.title + "_ui", c + 1);
                }
                return { ...s, safeKey: sKey };
            });

            this.buildColumnDOM(container, file.basename, file.path, scenesWithSafeKey);
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
        this.wikiPanel.setCssStyles({ width: "450px", transform: "translateX(0)" });

        const headerRow = this.wikiPanel.createDiv({ cls: "ns-wiki-panel-header" });
        headerRow.createEl("h3", { text: noteName });

        const controls = headerRow.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center;" } });

        const btnEdit = createIconButton(controls, "pencil", "");
        btnEdit.onclick = async () => {
            const exactPath = folderPath ? `${folderPath}/${noteName}.md` : `${noteName}.md`;
            let file = this.app.vault.getAbstractFileByPath(exactPath);
            if (!file || !(file instanceof TFile)) {
                file = this.app.metadataCache.getFirstLinkpathDest(noteName, folderPath || "");
            }
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

        const contentWrapper = this.wikiPanel.createDiv({ cls: "ns-wiki-panel-content markdown-rendered" });

        const exactPath = folderPath ? `${folderPath}/${noteName}.md` : `${noteName}.md`;
        let file: TFile | null = this.app.vault.getAbstractFileByPath(exactPath) as TFile | null;
        if (!file || !(file instanceof TFile)) {
            file = this.app.metadataCache.getFirstLinkpathDest(noteName, folderPath || "");
        }
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
    async openScenePanel(cardEl: HTMLElement, scene: unknown) {
        this.wikiPanel.empty();
        this.wikiPanel.setCssStyles({ width: "450px", transform: "translateX(0)" });

        const safeKey = cardEl.dataset.sceneId || cardEl.dataset.sceneTitle || "";
        let currentText = this.pendingEdits.get(safeKey) || this.liveSceneMap.get(safeKey) || "";

        if (!currentText && cardEl.dataset.isNew === "true") {
            const newColor = cardEl.dataset.colorId || "default";
            const calloutType = newColor === "default" ? "NSmith" : `NSmith-${newColor}`;

            let metaBlock = `> [!${calloutType}] Scene Info\n> - Status:: #Writing\n> - Note:: `;
            if (TEMPLATES_DIR) {
                const tplFile = this.app.vault.getAbstractFileByPath(`${this.plugin.settings.bookFolderPath}/${TEMPLATES_DIR}/NovelSmith_Template.md`);
                if (tplFile && tplFile instanceof TFile) {
                    const cachedTemplateText = await this.app.vault.read(tplFile);
                    const metaBlockMatch = cachedTemplateText.match(/> \[!NSmith\][\s\S]*?(?=\n[^>]|$)/);
                    if (metaBlockMatch) {
                        metaBlock = metaBlockMatch[0].replace(/> \[!NSmith[^\]]*\]/, `> [!${calloutType}]`);
                    }
                }
            }

            currentText = `###### ${scene.title} <span class="ns-id" data-scene-id="${cardEl.dataset.sceneId}" data-color="${newColor}" data-warning="⛔️ ID (Do not edit)"></span>\n${metaBlock}\n\n(Write your scene here...)\n`;
        }

        let metaLines: string[] = [];
        let bodyLines: string[] = [];
        let isBody = false;

        const lines = currentText.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimLine = line.trim();
            if (!isBody) {
                if (trimLine.startsWith('######') || trimLine.startsWith('>')) {
                    metaLines.push(line);
                } else if (trimLine === "") {
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

        const displayMetaText = metaLines.join('\n');
        const hiddenBodyText = bodyLines.join('\n');

        const headerRow = this.wikiPanel.createDiv({ cls: "ns-wiki-panel-header" });
        headerRow.createEl("h3", { text: scene.title });

        const controls = headerRow.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center;" } });

        const btnEdit = createIconButton(controls, "pencil", "");
        btnEdit.onclick = () => {
            const spanRegex = /(<span class="ns-id"[^>]*><\/span>)/;
            const match = displayMetaText.match(spanRegex);
            let hiddenSpan = "";
            let editMarkdown = displayMetaText;

            if (match) {
                hiddenSpan = match[1];
                editMarkdown = editMarkdown.replace(hiddenSpan, "");
                editMarkdown = editMarkdown.replace(/(######.*?)\s+\n/, "$1\n");
                editMarkdown = editMarkdown.replace(/######\s*🎬\s*/, "###### ");
            }

            this.renderEditMode(`Edit: ${scene.title}`, editMarkdown, (newMetaText) => {
                let finalMetaMarkdown = newMetaText;

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

                let safeBody = hiddenBodyText.replace(/^\s+/, "");
                let finalFullText = finalMetaMarkdown.trimEnd();

                if (safeBody) {
                    finalFullText += "\n\n" + safeBody;
                } else {
                    finalFullText += "\n";
                }

                this.pendingEdits.set(safeKey, finalFullText);
                this.liveSceneMap.set(safeKey, finalFullText);

                const parsedScenes = parseUniversalScenes(finalFullText);
                let updatedScene = scene;
                if (parsedScenes.length > 0) {
                    updatedScene = parsedScenes[0];
                    cardEl.dataset.sceneTitle = updatedScene.title;
                    cardEl.empty();
                    this.populateCardInnerDOM(cardEl, updatedScene);
                }

                new Notice("Edits saved to memory. Press save & close board to keep.", 3000);
                this.openScenePanel(cardEl, updatedScene);
                if (this.isRadarMode) this.applyRadarMode();
            });
        };

        const btnClose = createIconButton(controls, "arrow-right", "");
        btnClose.onclick = () => this.wikiPanel.setCssStyles({ transform: "translateX(100%)" });

        const contentWrapper = this.wikiPanel.createDiv({ cls: "ns-wiki-panel-content markdown-rendered" });
        await MarkdownRenderer.render(this.app, displayMetaText, contentWrapper, "", this);
    }

    renderEditMode(title: string, rawMarkdown: string, onSave: (newText: string) => void) {
        this.wikiPanel.empty();
        this.wikiPanel.setCssStyles({ width: "600px", transform: "translateX(0)" });

        const headerRow = this.wikiPanel.createDiv({ cls: "ns-wiki-panel-header" });
        headerRow.createEl("h3", { text: title });

        const btnRow = headerRow.createDiv({ attr: { style: "display: flex; gap: 8px;" } });

        const btnCancel = btnRow.createEl("button", { text: "Cancel" });
        btnCancel.onclick = () => {
            this.wikiPanel.setCssStyles({ transform: "translateX(100%)" });
        };

        const btnSave = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });

        const contentWrapper = this.wikiPanel.createDiv({ cls: "ns-wiki-panel-content" });
        contentWrapper.setCssStyles({ display: "flex", flexDirection: "column" });

        const textArea = contentWrapper.createEl("textarea");
        textArea.value = rawMarkdown;
        textArea.setCssStyles({ width: "100%", flexGrow: "1", resize: "none", padding: "15px", fontFamily: "var(--font-monospace)", fontSize: "14px", border: "1px solid var(--background-modifier-border)", borderRadius: "8px", backgroundColor: "var(--background-primary-alt)" });

        textArea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const cursorPos = textArea.selectionStart;
                const textBefore = textArea.value.substring(0, cursorPos);
                const textAfter = textArea.value.substring(textArea.selectionEnd);

                const lines = textBefore.split('\n');
                const currentLine = lines[lines.length - 1];

                const match = currentLine.match(/^(>\s*-\s*|>\s*|-\s*)/);

                if (match) {
                    e.preventDefault();
                    const prefix = match[1];

                    if (currentLine === prefix) {
                        const newTextBefore = textBefore.substring(0, textBefore.length - prefix.length);
                        textArea.value = newTextBefore + '\n' + textAfter;
                        const newPos = newTextBefore.length + 1;
                        textArea.selectionStart = textArea.selectionEnd = newPos;
                    } else {
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
    // 🔍 終極追蹤雷達引擎 (Dynamic Tracker)
    // ==========================================
    buildRadarConsole(container: HTMLElement) {
        const topRow = container.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center; width: 100%;" } });

        const catSelect = topRow.createEl("select");
        catSelect.setCssStyles({ width: "160px", padding: "6px" });
        catSelect.createEl("option", { text: "Select to track..." });

        const btnControls = topRow.createDiv({ attr: { style: "display: flex; gap: 4px;" } });

        const btnConfirm = btnControls.createDiv();
        setIcon(btnConfirm, "check");
        btnConfirm.setCssStyles({ cursor: "pointer", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center", opacity: "0.7", borderRadius: "4px", transition: "all 0.2s" });
        btnConfirm.addEventListener("mouseover", () => btnConfirm.setCssStyles({ opacity: "1", backgroundColor: "var(--background-modifier-hover)", color: "var(--interactive-accent)" }));
        btnConfirm.addEventListener("mouseout", () => btnConfirm.setCssStyles({ opacity: "0.7", backgroundColor: "transparent", color: "initial" }));

        const btnClear = btnControls.createDiv();
        setIcon(btnClear, "x");
        btnClear.setCssStyles({ cursor: "pointer", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center", opacity: "0.5", borderRadius: "4px", transition: "all 0.2s" });
        btnClear.addEventListener("mouseover", () => btnClear.setCssStyles({ opacity: "1", backgroundColor: "var(--background-modifier-hover)", color: "var(--text-error)" }));
        btnClear.addEventListener("mouseout", () => btnClear.setCssStyles({ opacity: "0.5", backgroundColor: "transparent", color: "initial" }));

        this.tokenContainer = topRow.createDiv();
        this.tokenContainer.setCssStyles({ display: "flex", gap: "8px", flexWrap: "wrap", flexGrow: "1", padding: "6px", minHeight: "36px", border: "1px dashed var(--background-modifier-border)", borderRadius: "6px", alignItems: "center" });
        this.renderTokens();

        this.radarDrawer = container.createDiv({ cls: "ns-radar-drawer" });

        const { categories, valueMap } = this.scanAllAttributes();
        categories.forEach(cat => catSelect.createEl("option", { value: cat, text: cat }));

        catSelect.onchange = () => {
            const selectedCat = catSelect.value;
            if (!selectedCat || !categories.includes(selectedCat)) {
                this.radarDrawer.setCssStyles({ display: "none" }); return;
            }
            this.radarDrawer.empty();
            this.radarDrawer.setCssStyles({ display: "flex" });

            const values = valueMap.get(selectedCat) || [];
            values.forEach(val => {
                const chip = this.radarDrawer.createEl("button", { text: val, cls: "ns-chip" });

                chip.onclick = () => {
                    if (!this.activeRadarTokens.some(t => t.key === selectedCat && t.value === val)) {
                        this.activeRadarTokens.push({ key: selectedCat, value: val });
                        this.renderTokens();
                        this.applyRadarMode();
                    }
                };
            });
        };

        btnConfirm.onclick = () => {
            this.radarDrawer.setCssStyles({ display: "none" });
            catSelect.selectedIndex = 0;
        };

        btnClear.onclick = () => {
            this.activeRadarTokens = [];
            this.renderTokens();
            this.isRadarMode = false;
            this.applyRadarMode();
            this.radarDrawer.setCssStyles({ display: "none" });
            catSelect.selectedIndex = 0;
        };
    }

    scanAllAttributes() {
        const valueMap = new Map<string, Set<string>>();
        const effectiveMap = new Map<string, string>();
        for (const [k, v] of this.liveSceneMap.entries()) effectiveMap.set(k, v);
        for (const [k, v] of this.pendingEdits.entries()) effectiveMap.set(k, v);

        for (const text of effectiveMap.values()) {
            const parsed = parseUniversalScenes(text);
            if (parsed.length > 0 && parsed[0].meta) {
                parsed[0].meta.forEach((metaLine: string) => {
                    const clean = metaLine.replace(/^>\s*/, "").trim();
                    if (clean.startsWith('- ')) {
                        const match = clean.match(/^-\s*(.*?)::\s*(.*)/);
                        if (match) {
                            const key = match[1].trim(); const value = match[2].trim();
                            if (["synopsis", "description", "summary", "note", "大綱", "備註", "簡介"].includes(key.toLowerCase())) return;

                            if (!valueMap.has(key)) valueMap.set(key, new Set());
                            const items = value.replace(/[\[\]]/g, '').split(/(?=#)|[,，、;；]+/).map(i => i.trim()).filter(i => i);
                            items.forEach(i => valueMap.get(key).add(i));
                        }
                    }
                });
            }
        }
        return { categories: Array.from(valueMap.keys()).sort(), valueMap: new Map(Array.from(valueMap.entries()).map(([k, v]) => [k, Array.from(v).sort()])) };
    }

    renderTokens() {
        this.tokenContainer.empty();
        if (this.activeRadarTokens.length === 0) {
            this.tokenContainer.createSpan({ text: "No attributes selected...", attr: { style: "opacity: 0.5; font-style: italic; padding: 2px;" } }); return;
        }
        this.activeRadarTokens.forEach((token, index) => {
            const tEl = this.tokenContainer.createDiv({ cls: "ns-radar-token" });
            tEl.createSpan({ text: `${token.key}: ${token.value}` });
            const xBtn = tEl.createSpan({ text: "✕", cls: "ns-radar-token-close" });
            xBtn.onclick = () => {
                this.activeRadarTokens.splice(index, 1);
                this.renderTokens();
                if (this.isRadarMode) this.applyRadarMode();
            };
        });
    }

    applyRadarMode() {
        const grid = this.contentEl.querySelector(".ns-corkboard-grid");
        if (!grid) return;

        if (this.activeRadarTokens.length === 0) {
            this.isRadarMode = false; grid.removeClass("is-radar-mode");
            grid.querySelectorAll(".ns-corkboard-card").forEach(c => { c.removeClass("is-highlighted"); c.removeClass("is-dimmed"); });
            return;
        }

        this.isRadarMode = true; grid.addClass("is-radar-mode");

        grid.querySelectorAll(".ns-corkboard-card").forEach(card => {
            const cardEl = card as HTMLElement;
            const safeKey = cardEl.dataset.sceneId || cardEl.dataset.sceneTitle || "";
            const content = this.pendingEdits.get(safeKey) || this.liveSceneMap.get(safeKey) || "";
            let hasMatch = false;

            const parsed = parseUniversalScenes(content);
            if (parsed.length > 0 && parsed[0].meta) {
                parsed[0].meta.forEach((metaLine: string) => {
                    const clean = metaLine.replace(/^>\s*/, "").trim();
                    if (clean.startsWith('- ')) {
                        const match = clean.match(/^-\s*(.*?)::\s*(.*)/);
                        if (match) {
                            const cardKey = match[1].trim();
                            const cardItems = match[2].trim().replace(/[\[\]]/g, '').split(/(?=#)|[,，、;；]+/).map(i => i.trim()).filter(i => i);

                            this.activeRadarTokens.forEach(token => {
                                if (token.key === cardKey && cardItems.includes(token.value)) {
                                    hasMatch = true;
                                }
                            });
                        }
                    }
                });
            }
            if (hasMatch) {
                cardEl.removeClass("is-dimmed");
                cardEl.addClass("is-highlighted");
            } else {
                cardEl.removeClass("is-highlighted");
                cardEl.addClass("is-dimmed");
            }
        });
    }

    // ==========================================
    // 💾 🌟 Ultimate Settlement Engine
    // ==========================================
    async saveGlobalCorkboard(container: HTMLElement, btnSaveEl?: HTMLButtonElement) {
        try {
            new Notice("Saving manuscript structure...", 2000);

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

            const keptFilePaths = new Set<string>();
            columns.forEach(listEl => {
                const path = (listEl as HTMLElement).dataset.filePath;
                if (path) keptFilePaths.add(path);
            });

            const filesToTrash: TFile[] = [];

            for (const file of allFiles) {
                if (!keptFilePaths.has(file.path)) {
                    filesToTrash.push(file);
                    fileObjMap.delete(file.path);
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
                        let sceneMd = this.pendingEdits.get(safeKey) || liveSceneMap.get(safeKey);
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

                        const newCardMd = `###### ${sceneTitle} <span class="ns-id" data-scene-id="${sceneId}" data-color="${newColor}" data-warning="⛔️ ID (Do not edit)"></span>\n${metaBlock}\n\n(Write your scene here...)\n`;
                        chunks.push("\n\n" + newCardMd);
                    }
                }

                const newContent = chunks.join("").trim() + "\n";

                const rawTitle = el.dataset.cleanTitle || "Untitled_Chapter";
                const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_");
                const prefix = chapterIndex < 10 ? `0${chapterIndex}_` : `${chapterIndex}_`;
                const newName = `${prefix}${cleanTitle}.md`;

                const parentPath = fileObjMap.has(originalFilePath) ? fileObjMap.get(originalFilePath).parent?.path : "";
                const safeParentPath = parentPath === "/" ? "" : parentPath;
                const safeWorkingPath = this.workingFolderPath === "/" ? "" : this.workingFolderPath;

                if (originalFilePath && fileObjMap.has(originalFilePath)) {
                    const file = fileObjMap.get(originalFilePath);
                    const oldContent = await this.app.vault.read(file);
                    if (newContent !== oldContent.trim() + "\n") {
                        await this.app.vault.modify(file, newContent);
                    }

                    const newPath = safeParentPath ? `${safeParentPath}/${newName}` : newName;
                    if (file.path !== newPath) {
                        try { await this.app.fileManager.renameFile(file, newPath); } catch (e) { /* ignore */ }
                    }
                } else {
                    const newPath = safeWorkingPath ? `${safeWorkingPath}/${newName}` : newName;
                    try { await this.app.vault.create(newPath, newContent); }
                    catch (e) { console.error("Create new file failed", e); }
                }
                chapterIndex++;
            }

            for (const file of filesToTrash) {
                console.log("Trashing deleted chapter safely:", file.path);
                await this.app.fileManager.trashFile(file);
            }

            await this.plugin.statsManager.recordActivity(0);

            new Notice("Corkboard saved successfully!");
            this.close();

        } catch (error) {
            console.error("Corkboard save error:", error);
            new Notice("Error saving corkboard. Please try again.", 5000);
            if (btnSaveEl) {
                btnSaveEl.innerText = "Save & close";
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
                new Notice("Restoring scrivenings mode...", 1500);
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
                new Notice("Jumping to scene...", 1000);
                setTimeout(async () => {
                    const files = getManuscriptFiles(this.app, this.workingFolderPath, this.plugin.settings.exportFolderPath);
                    for (const file of files) {
                        const content = await this.app.vault.read(file);
                        if (content.includes(`data-scene-id="${this.anchorSceneId}"`) || content.includes(`###### 🎬 ${this.anchorSceneId}`)) {
                            const leaf = this.app.workspace.getLeaf(false);
                            await leaf.openFile(file);

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
                }, 300);
            }
        }
    }
}