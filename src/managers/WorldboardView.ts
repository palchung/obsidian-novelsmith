import { ItemView, WorkspaceLeaf, Notice, TFolder, TFile, debounce, MarkdownRenderer, setIcon, Modal, Setting, App } from 'obsidian';
import NovelSmithPlugin from '../../main';
import { Network, Options } from 'vis-network';
import { sanitizeFileName } from '../utils';

export const VIEW_TYPE_WORLDBOARD = "novelsmith-worldboard-view";

export class WorldboardView extends ItemView {
    plugin: NovelSmithPlugin;
    activeTabName: string = "";
    network: Network | null = null;

    pendingFocusNode: string | null = null;
    showSatellites: boolean = true; // 🌟 新增：控制衛星顯示嘅全域狀態

    currentEditingFile: TFile | null = null;
    currentProperties: Record<string, any> = {};
    currentBodyContent: string = "";

    constructor(leaf: WorkspaceLeaf, plugin: NovelSmithPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_WORLDBOARD; }
    getDisplayText() { return "Worldboard"; }
    getIcon() { return "globe"; }

    getCssVar(varName: string) {
        return getComputedStyle(document.body).getPropertyValue(varName).trim();
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ns-worldboard-view");

        // 1. 頂部 Tabs 導航列
        const headerEl = contentEl.createDiv({ cls: "ns-worldboard-header" });
        headerEl.setCssStyles({
            display: "flex", gap: "10px", padding: "10px", borderBottom: "1px solid var(--background-modifier-border)",
            backgroundColor: "var(--background-secondary)", overflowX: "auto", alignItems: "center"
        });

        const categories = this.plugin.settings.wikiCategories || [];

        if (categories.length === 0) {
            // 如果空空如也，直接畀個大掣佢加
            const emptyBox = contentEl.createDiv({ attr: { style: "padding: 50px; text-align: center;" } });
            emptyBox.createEl("h3", { text: "Your world is empty", attr: { style: "color: var(--text-muted); margin-bottom: 20px;" } });
            const firstAddBtn = emptyBox.createEl("button", { text: "Add your first Worldboard category", cls: "mod-cta" });
            firstAddBtn.onclick = () => {
                new AddWikiCategoryModal(this.app, this.plugin, (newCatName) => {
                    this.activeTabName = newCatName;
                    this.onOpen();
                }).open();
            };
            return;
        }

        if (!this.activeTabName) this.activeTabName = categories[0].name.split(/[,，、]/)[0].trim();

        categories.forEach(cat => {
            const primaryName = cat.name.split(/[,，、]/)[0].trim();
            const tabBtn = headerEl.createEl("button", { text: primaryName });

            if (this.activeTabName === primaryName) {
                tabBtn.setCssStyles({ backgroundColor: "var(--interactive-accent)", color: "var(--text-on-accent)" });
            }

            tabBtn.onclick = () => {
                this.activeTabName = primaryName;
                this.onOpen();
            };
        });

        // ==========================================
        // ➕ 頂部「+ 新增屬性」按鈕
        // ==========================================
        const addTabBtn = headerEl.createEl("button", { cls: "clickable-icon" });
        setIcon(addTabBtn, "plus");
        addTabBtn.setCssStyles({ padding: "4px 8px", backgroundColor: "transparent", boxShadow: "none", color: "var(--text-muted)", cursor: "pointer" });
        addTabBtn.title = "Add new worldboard category";
        addTabBtn.onclick = () => {
            new AddWikiCategoryModal(this.app, this.plugin, (newCatName) => {
                this.activeTabName = newCatName;
                this.onOpen();
            }).open();
        };

        await this.renderWorkspace();
    }

    async renderWorkspace() {
        let workspaceEl = this.contentEl.querySelector(".ns-worldboard-workspace");
        if (workspaceEl) workspaceEl.remove();

        workspaceEl = this.contentEl.createDiv({ cls: "ns-worldboard-workspace" });
        workspaceEl.setCssStyles({ display: "flex", height: "calc(100% - 50px)", width: "100%", position: "relative", overflow: "hidden" });

        const canvasContainer = workspaceEl.createDiv({ cls: "ns-worldboard-canvas" });
        canvasContainer.setCssStyles({ width: "100%", height: "100%", position: "absolute", top: "0", left: "0", backgroundColor: "var(--background-primary)" });

        const panelContainer = workspaceEl.createDiv({ cls: "ns-worldboard-panel" });
        panelContainer.setCssStyles({
            width: "450px", borderLeft: "1px solid var(--background-modifier-border)",
            backgroundColor: "var(--background-secondary)", padding: "15px", overflowY: "auto",
            display: "flex", flexDirection: "column", gap: "15px", position: "absolute",
            right: "0", top: "0", height: "100%", zIndex: "50",
            boxShadow: "-5px 0 15px rgba(0,0,0,0.1)", transform: "translateX(100%)",
            transition: "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)"
        });

        const currentCategory = this.plugin.settings.wikiCategories.find(c => c.name.split(/[,，、]/)[0].trim() === this.activeTabName);
        if (!currentCategory || !currentCategory.folderPath) return;

        const cleanFolderPath = currentCategory.folderPath.replace(/^\/+|\/+$/g, '');
        const folder = this.app.vault.getAbstractFileByPath(cleanFolderPath);
        if (!(folder instanceof TFolder)) return;

        const primaryName = currentCategory.name.split(/[,，、]/)[0].trim();
        const addBtn = workspaceEl.createEl("button", { text: `+ New ${primaryName}`, cls: "mod-cta" });
        addBtn.setCssStyles({ position: "absolute", bottom: "30px", left: "30px", zIndex: "40", boxShadow: "0 4px 10px rgba(0,0,0,0.3)", padding: "10px 20px", borderRadius: "20px" });
        addBtn.onclick = () => {
            import('../modals').then(({ InputModal }) => {
                new InputModal(this.app, `Create new ${primaryName}`, async (name) => {
                    if (!name.trim()) return;
                    const safeName = sanitizeFileName(name);
                    const path = `${cleanFolderPath}/${safeName}.md`;

                    await this.plugin.app.vault.adapter.mkdir(cleanFolderPath);

                    const tplPath = `${this.plugin.settings.bookFolderPath}/_Backstage/Templates/${primaryName}.md`;
                    const tplFile = this.app.vault.getAbstractFileByPath(tplPath);
                    let content = `---\ntags:\n  - ${primaryName}\n---\n# ${safeName}\n\n`;

                    if (tplFile instanceof TFile) {
                        content = await this.app.vault.read(tplFile);
                        content = content.replace(/\{\{WikiName\}\}/g, safeName);
                    }
                    try {
                        await this.app.vault.create(path, content);
                        new Notice(`${safeName} created!`);
                        this.onOpen();
                    } catch (e) { new Notice("File already exists or invalid name."); }
                }).open();
            });
        };

        // ==========================================
        // 🛠️ 畫布右上角：重新整理與衛星開關掣
        // ==========================================
        const toolsBox = canvasContainer.createDiv();
        toolsBox.setCssStyles({ position: "absolute", top: "15px", right: "15px", zIndex: "40", display: "flex", gap: "8px", backgroundColor: "var(--background-secondary)", padding: "6px", borderRadius: "8px", border: "1px solid var(--background-modifier-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" });

        const btnToggleSat = toolsBox.createEl("button", { cls: "clickable-icon" });
        setIcon(btnToggleSat, this.showSatellites ? "eye" : "eye-off");
        btnToggleSat.title = this.showSatellites ? "Hide satellite nodes" : "Show satellite nodes";
        btnToggleSat.setCssStyles({ padding: "4px 8px", backgroundColor: "transparent", boxShadow: "none" });
        btnToggleSat.onclick = () => {
            this.showSatellites = !this.showSatellites;
            this.renderWorkspace(); // 一撳即刻重畫！
        };

        const btnRefresh = toolsBox.createEl("button", { cls: "clickable-icon" });
        setIcon(btnRefresh, "refresh-cw");
        btnRefresh.title = "Refresh canvas";
        btnRefresh.setCssStyles({ padding: "4px 8px", backgroundColor: "transparent", boxShadow: "none" });
        btnRefresh.onclick = () => {
            new Notice("Canvas refreshed");
            this.renderWorkspace(); // 手動更新最新筆記關係！
        };

        const files = folder.children.filter(f => f instanceof TFile && f.extension === "md") as TFile[];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache || !cache.frontmatter) {
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    if (!fm.tags) fm.tags = [];
                    if (!fm.tags.includes(primaryName)) fm.tags.push(primaryName);
                });
            }
        }

        const bgColor = this.getCssVar('--background-secondary-alt') || '#2a2a2a';
        const borderColor = this.getCssVar('--interactive-accent') || '#7b61ff';
        const textColor = this.getCssVar('--text-normal') || '#cccccc';
        const satColor = this.getCssVar('--background-modifier-border') || '#444444';
        const satText = this.getCssVar('--text-muted') || '#888888';

        const nodesData: any[] = [];
        const edgesData: any[] = [];
        const existingNodeIds = new Set<string>();

        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter || {};

            let imageUrl = null;
            if (fm.image || fm.avatar || fm.cover || fm.圖片) {
                const imgName = String(fm.image || fm.avatar || fm.cover || fm.圖片).replace(/[\[\]]/g, '');
                const imgFile = this.app.metadataCache.getFirstLinkpathDest(imgName, file.path);
                if (imgFile) imageUrl = this.app.vault.getResourcePath(imgFile);
            } else if (cache?.embeds && cache.embeds.length > 0) {
                const imgFile = this.app.metadataCache.getFirstLinkpathDest(cache.embeds[0].link, file.path);
                if (imgFile) imageUrl = this.app.vault.getResourcePath(imgFile);
            }

            const nodeObj: any = {
                id: file.basename,
                label: file.basename,
                size: 20,
                color: { background: bgColor, border: borderColor },
                font: { color: textColor, face: 'var(--font-text)', size: 14 }
            };

            if (imageUrl) {
                nodeObj.shape = 'circularImage';
                nodeObj.image = imageUrl;
                nodeObj.size = 30;
            } else {
                nodeObj.shape = 'dot';
            }

            if (fm.canvas_x !== undefined && fm.canvas_y !== undefined) {
                nodeObj.x = fm.canvas_x;
                nodeObj.y = fm.canvas_y;
                nodeObj.physics = false; // 📌 本地 Node 絕對釘死！
            }

            nodesData.push(nodeObj);
            existingNodeIds.add(file.basename);
        });

        // ==========================================
        // 🌟 衛星隱藏與顯示邏輯
        // ==========================================
        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache && cache.frontmatterLinks) {
                cache.frontmatterLinks.forEach(linkObj => {
                    const target = linkObj.link.split('|')[0].trim();
                    const key = linkObj.key.split('.')[0];

                    const isLocal = files.some(f => f.basename === target);

                    // 如果唔係本地波波 (即係衛星)，而且用家撳咗隱藏，就直接 Skip 唔畫！
                    if (!isLocal && !this.showSatellites) return;

                    if (!existingNodeIds.has(target)) {
                        nodesData.push({
                            id: target, label: target, shape: 'dot', size: 10,
                            color: { background: satColor, border: satText }, font: { color: satText, size: 12 }
                            // 🪐 衛星冇座標，所以預設 physics=true，佢哋會完美公轉！
                        });
                        existingNodeIds.add(target);
                    }

                    edgesData.push({
                        from: file.basename, to: target, label: key,
                        font: { align: 'middle', color: satText, size: 11, strokeWidth: 2, strokeColor: bgColor },
                        arrows: 'to', color: { color: satText }
                    });
                });
            }
        });

        const isHierarchy = currentCategory.layoutMode === 'hierarchy';
        const options: Options = {
            nodes: { borderWidth: 2, shadow: true },
            layout: { hierarchical: isHierarchy ? { enabled: true, direction: 'UD', sortMethod: 'directed', nodeSpacing: 150, levelSeparation: 150 } : false },
            physics: isHierarchy ? false : { forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.005, springLength: 100, springConstant: 0.08 }, solver: 'forceAtlas2Based', stabilization: { iterations: 150 } }
        };

        this.network = new Network(canvasContainer, { nodes: nodesData, edges: edgesData }, options);

        if (this.pendingFocusNode) {
            const targetId = this.pendingFocusNode;
            this.pendingFocusNode = null;
            this.network.once("afterDrawing", () => {
                this.network?.selectNodes([targetId]);
                this.network?.focus(targetId, {
                    scale: 1.5,
                    animation: { duration: 800, easingFunction: "easeInOutQuad" }
                });

                const targetFile = files.find(f => f.basename === targetId);
                if (targetFile) {
                    panelContainer.setCssStyles({ transform: "translateX(0)" });
                    this.renderPanel(targetFile, panelContainer, false);
                }
            });
        }

        this.network.on("dragEnd", async (params) => {
            if (params.nodes && params.nodes.length > 0) {
                const updates = params.nodes.map((id: string) => ({ id: id, physics: false }));
                (this.network as any).body.data.nodes.update(updates);

                const positions = this.network?.getPositions(params.nodes);
                if (!positions) return;

                for (const nodeId of params.nodes) {
                    const pos = positions[nodeId];
                    const file = files.find(f => f.basename === nodeId);
                    if (file) {
                        await this.app.fileManager.processFrontMatter(file, (fm) => {
                            fm.canvas_x = Math.round(pos.x);
                            fm.canvas_y = Math.round(pos.y);
                        });
                    }
                }
            }
        });

        this.network.on("selectNode", async (params) => {
            const nodeId = params.nodes[0];
            let file = files.find(f => f.basename === nodeId);
            let isSatellite = false;

            if (!file) {
                file = this.app.metadataCache.getFirstLinkpathDest(String(nodeId), "");
                if (file) isSatellite = true;
            }

            if (file) {
                panelContainer.setCssStyles({ transform: "translateX(0)" });
                await this.renderPanel(file, panelContainer, isSatellite);
            } else {
                panelContainer.setCssStyles({ transform: "translateX(0)" });
                panelContainer.empty();
                panelContainer.createEl("h3", { text: String(nodeId) });
                panelContainer.createDiv({ text: "This node doesn't exist as a file yet. You can create it using the + New button in its respective category.", attr: { style: "color: var(--text-muted);" } });
                const closeBtn = panelContainer.createEl("button", { text: "Close", cls: "mod-cta" });
                closeBtn.onclick = () => panelContainer.setCssStyles({ transform: "translateX(100%)" });
            }
        });

        this.network.on("click", (params) => {
            if (params.nodes.length === 0) panelContainer.setCssStyles({ transform: "translateX(100%)" });
        });
    }

    async renderPanel(file: TFile, container: HTMLElement, isSatellite: boolean = false) {
        this.currentEditingFile = file;
        container.empty();

        if (isSatellite) {
            const parentPath = file.parent ? file.parent.path : "";
            const cat = this.plugin.settings.wikiCategories.find(c => {
                if (!c.folderPath) return false;
                const cleanFolder = c.folderPath.replace(/^\/+|\/+$/g, '');
                return parentPath === cleanFolder || parentPath.startsWith(cleanFolder + "/");
            });

            if (cat) {
                const primaryName = cat.name.split(/[,，、]/)[0].trim();
                const jumpBox = container.createDiv();
                jumpBox.setCssStyles({ padding: "12px", backgroundColor: "var(--background-modifier-error-hover)", borderRadius: "8px", marginBottom: "15px", border: "1px solid var(--interactive-accent)" });

                jumpBox.createDiv({ text: `🚀 This is a satellite node from [${primaryName}].`, attr: { style: "color: var(--text-normal); margin-bottom: 8px; font-weight: bold; font-size: 0.9em;" } });

                const jumpBtn = jumpBox.createEl("button", { text: `Jump to ${primaryName} Canvas`, cls: "mod-cta" });
                jumpBtn.setCssStyles({ width: "100%", fontWeight: "bold" });
                jumpBtn.onclick = () => {
                    this.activeTabName = primaryName;
                    this.pendingFocusNode = file.basename;
                    this.onOpen();
                };
            }
        }

        const header = container.createDiv();
        header.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "10px", marginBottom: "15px" });
        header.createEl("h2", { text: file.basename, attr: { style: "margin: 0; color: var(--interactive-accent);" } });

        const btnGroup = header.createDiv({ attr: { style: "display: flex; gap: 8px;" } });

        const openBtn = btnGroup.createEl("button", { text: "Edit file", cls: "mod-cta" });
        openBtn.setCssStyles({ padding: "4px 8px", fontSize: "0.8em" });
        openBtn.onclick = () => { this.app.workspace.getLeaf('split', 'vertical').openFile(file); };

        const closeBtn = btnGroup.createEl("button", { text: "X" });
        closeBtn.setCssStyles({ padding: "4px 8px", fontSize: "0.8em", backgroundColor: "transparent", boxShadow: "none" });
        closeBtn.onclick = () => { container.setCssStyles({ transform: "translateX(100%)" }); };

        const content = await this.app.vault.read(file);
        const cache = this.app.metadataCache.getFileCache(file);

        this.currentProperties = Object.assign({}, cache?.frontmatter || {});

        let bodyText = content;
        if (cache?.frontmatterPosition) {
            bodyText = content.substring(cache.frontmatterPosition.end.offset).trimStart();
        }
        this.currentBodyContent = bodyText;

        container.createEl("strong", { text: "Relations & Attributes" });
        const propsDiv = container.createDiv({ cls: "ns-panel-props" });
        propsDiv.setCssStyles({ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px", backgroundColor: "var(--background-primary)", padding: "12px", borderRadius: "8px" });

        let hasProps = false;
        for (const key in this.currentProperties) {
            if (['tags', 'aliases', 'cssclasses', 'canvas_x', 'canvas_y', 'position'].includes(key)) continue;
            hasProps = true;

            const row = propsDiv.createDiv();
            row.setCssStyles({ display: "flex", gap: "10px", alignItems: "baseline", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "6px" });
            row.createSpan({ text: key, attr: { style: "font-weight: bold; color: var(--text-muted); min-width: 80px;" } });

            let valStr = this.currentProperties[key];
            if (Array.isArray(valStr)) valStr = valStr.map(v => typeof v === 'string' && !v.includes('[[') ? `[[${v}]]` : v).join(", ");
            row.createSpan({ text: String(valStr || "--"), attr: { style: "color: var(--text-normal); word-break: break-word;" } });
        }
        if (!hasProps) propsDiv.createDiv({ text: "No custom attributes.", attr: { style: "color: var(--text-muted); font-style: italic;" } });

        container.createEl("strong", { text: "Content preview" });
        const contentWrapper = container.createDiv({ cls: "ns-worldboard-preview" });
        contentWrapper.setCssStyles({ padding: "15px", backgroundColor: "var(--background-primary)", borderRadius: "6px", border: "1px solid var(--background-modifier-border)", userSelect: "text" });

        if (!this.currentBodyContent.trim()) {
            contentWrapper.createDiv({ text: "Empty content. Click 'Edit file' to write something.", attr: { style: "color: var(--text-muted); font-style: italic; text-align: center;" } });
        } else {
            await MarkdownRenderer.render(this.app, this.currentBodyContent, contentWrapper, file.path, this);
        }
    }

    async onClose() {
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
        this.contentEl.empty();
    }
}

// ==========================================
// 🚀 新增：一鍵新增 Worldboard 分類對話框
// ==========================================
class AddWikiCategoryModal extends Modal {
    plugin: NovelSmithPlugin;
    onSuccess: (catName: string) => void;

    catName = "";
    folderPath = "";
    layoutMode: 'network' | 'hierarchy' = 'network';
    parentKey = "";

    constructor(app: App, plugin: NovelSmithPlugin, onSuccess: (catName: string) => void) {
        super(app);
        this.plugin = plugin;
        this.onSuccess = onSuccess;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Add new worldboard category" });

        new Setting(contentEl)
            .setName("Category name")
            .setDesc("e.g., Magic, Factions")
            .addText(t => t.onChange(v => this.catName = v));

        new Setting(contentEl)
            .setName("Storage folder")
            .setDesc("e.g., MyBook/Magic")
            .addText(t => t.onChange(v => this.folderPath = v));

        new Setting(contentEl)
            .setName("Layout mode")
            .addDropdown(d => d.addOption("network", "Network (Free form)").addOption("hierarchy", "Hierarchy (Tree)")
                .onChange(v => this.layoutMode = v as 'network' | 'hierarchy'));

        new Setting(contentEl)
            .setName("Parent attribute (for Hierarchy)")
            .addText(t => t.onChange(v => this.parentKey = v));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Generate template & Add")
                .setCta()
                .onClick(async () => {
                    if (!this.catName || !this.folderPath) {
                        new Notice("Name and folder path are required!");
                        return;
                    }
                    this.plugin.settings.wikiCategories.push({
                        name: this.catName,
                        folderPath: this.folderPath,
                        layoutMode: this.layoutMode,
                        parentKey: this.parentKey
                    });
                    await this.plugin.saveSettings();
                    await this.plugin.ensureWikiTemplateExists(this.catName);
                    this.onSuccess(this.catName);
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}