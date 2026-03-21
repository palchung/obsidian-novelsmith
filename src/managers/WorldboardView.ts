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
    showSatellites: boolean = true;

    // 🌟 新增：雙向跳躍記憶系統
    lastSelectedLocalNode: string | null = null;
    returnJumpTarget: { tab: string, node: string, label: string } | null = null;

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
            backgroundColor: "var(--background-primary)", overflowX: "auto", alignItems: "center"
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

        // ==========================================
        // 🛠️ 最左邊工具列：重新整理、衛星開關、新增屬性 (三位一體)
        // ==========================================
        const leftToolsBox = headerEl.createDiv();
        leftToolsBox.setCssStyles({ display: "flex", gap: "4px", borderRight: "1px solid var(--background-modifier-border)", paddingRight: "10px", marginRight: "5px" });

        // 1. 🔄 重新整理
        const btnRefresh = leftToolsBox.createEl("button", { cls: "clickable-icon" });
        setIcon(btnRefresh, "refresh-cw");
        btnRefresh.title = "Refresh canvas";
        btnRefresh.setCssStyles({ padding: "4px 8px", backgroundColor: "transparent", boxShadow: "none", cursor: "pointer" });
        btnRefresh.onclick = () => {
            new Notice("Canvas refreshed");
            this.renderWorkspace();
        };

        // 2. 👁️ 衛星開關
        const btnToggleSat = leftToolsBox.createEl("button", { cls: "clickable-icon" });
        setIcon(btnToggleSat, this.showSatellites ? "eye" : "eye-off");
        btnToggleSat.title = this.showSatellites ? "Hide satellite nodes" : "Show satellite nodes";
        btnToggleSat.setCssStyles({ padding: "4px 8px", backgroundColor: "transparent", boxShadow: "none", cursor: "pointer" });
        btnToggleSat.onclick = () => {
            this.showSatellites = !this.showSatellites;
            setIcon(btnToggleSat, this.showSatellites ? "eye" : "eye-off");
            btnToggleSat.title = this.showSatellites ? "Hide satellite nodes" : "Show satellite nodes";
            this.renderWorkspace();
        };

        // 3. ➕ 新增屬性 (搬咗嚟呢度！)
        const addTabBtn = leftToolsBox.createEl("button", { cls: "clickable-icon" });
        setIcon(addTabBtn, "plus");
        addTabBtn.setCssStyles({ padding: "4px 8px", backgroundColor: "transparent", boxShadow: "none", color: "var(--text-muted)", cursor: "pointer" });
        addTabBtn.title = "Add new worldboard category";
        addTabBtn.onclick = () => {
            new AddWikiCategoryModal(this.app, this.plugin, (newCatName) => {
                this.activeTabName = newCatName;
                this.onOpen();
            }).open();
        };

        // ==========================================
        // 🗂️ 右邊：分類 Tabs (依家佢哋會緊貼住工具列)
        // ==========================================
        if (!this.activeTabName) this.activeTabName = categories[0].name.split(/[,，、]/)[0].trim();

        categories.forEach(cat => {
            const primaryName = cat.name.split(/[,，、]/)[0].trim();
            const tabBtn = headerEl.createEl("button", { text: primaryName });

            if (this.activeTabName === primaryName) {
                tabBtn.setCssStyles({ backgroundColor: "var(--interactive-accent)", color: "var(--text-on-accent)" });
            }

            tabBtn.onclick = () => {
                this.activeTabName = primaryName;
                this.returnJumpTarget = null; // 🌟 如果手動轉 Tab，清除返回記憶
                this.onOpen();
            };
        });

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
            backgroundColor: "var(--background-primary)", padding: "15px", overflowY: "auto",
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

            const savedCoords = this.plugin.settings.worldboardCoords?.[file.path];
            if (savedCoords) {
                nodeObj.x = savedCoords.x;
                nodeObj.y = savedCoords.y;
                nodeObj.physics = false; // 📌 有座標就釘死
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

                if (!this.plugin.settings.worldboardCoords) this.plugin.settings.worldboardCoords = {};

                for (const nodeId of params.nodes) {
                    const pos = positions[nodeId];
                    const file = files.find(f => f.basename === nodeId);
                    if (file) {
                        // 🌟 靜靜雞寫入 data.json，唔再去污染用家嘅 Markdown！
                        this.plugin.settings.worldboardCoords[file.path] = {
                            x: Math.round(pos.x),
                            y: Math.round(pos.y)
                        };
                    }
                }
                await this.plugin.saveSettings(); // 儲存設定
            }
        });

        this.network.on("selectNode", async (params) => {
            const nodeId = params.nodes[0];
            let file = files.find(f => f.basename === nodeId);
            let isSatellite = false;

            if (file) {
                // 🌟 記錄最後點擊嘅「本地波波」(用來做返回點)
                this.lastSelectedLocalNode = String(nodeId);
            } else {
                file = this.app.metadataCache.getFirstLinkpathDest(String(nodeId), "");
                if (file) isSatellite = true;
            }

            // 🌟 如果正常點擊另一個本地波波，清除返回按鈕
            if (!this.pendingFocusNode && !isSatellite) {
                this.returnJumpTarget = null;
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

        // --- 1. 原生 Icon Header ---
        const header = container.createDiv();
        header.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "10px", marginBottom: "15px" });

        const titleContainer = header.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px;" } });
        const docIcon = titleContainer.createSpan();
        setIcon(docIcon, "file-text");
        docIcon.setCssStyles({ color: "var(--text-muted)" });
        titleContainer.createEl("h2", { text: file.basename, attr: { style: "margin: 0; color: var(--text-normal); font-size: 1.2em;" } });

        // 🌟 按鈕群組 (跳躍、返回、編輯、關閉 全部位於此)
        const btnGroup = header.createDiv({ attr: { style: "display: flex; gap: 4px;" } });

        // 🚀 衛星節點專用：跳躍至所屬畫布 (External Link Icon)
        if (isSatellite) {
            const parentPath = file.parent ? file.parent.path : "";
            const cat = this.plugin.settings.wikiCategories.find(c => {
                if (!c.folderPath) return false;
                const cleanFolder = c.folderPath.replace(/^\/+|\/+$/g, '');
                return parentPath === cleanFolder || parentPath.startsWith(cleanFolder + "/");
            });

            if (cat) {
                const primaryName = cat.name.split(/[,，、]/)[0].trim();
                const btnJump = btnGroup.createEl("button", { cls: "clickable-icon" });
                setIcon(btnJump, "external-link");
                btnJump.title = `Jump to ${primaryName} canvas`;
                btnJump.setCssStyles({ padding: "6px", backgroundColor: "transparent", boxShadow: "none", color: "var(--interactive-accent)" });
                btnJump.onclick = () => {
                    // 🌟 記低出發點：如果用家跳走，記低當前 Tab 同埋最後點擊嘅人物
                    this.returnJumpTarget = { tab: this.activeTabName, node: this.lastSelectedLocalNode || file.basename, label: this.activeTabName };

                    this.activeTabName = primaryName;
                    this.pendingFocusNode = file.basename;
                    this.onOpen();
                };
            }
        }

        // 🔙 返回專用：跳回上一個畫布 (Corner Up Left Icon)
        if (!isSatellite && this.returnJumpTarget) {
            const btnReturn = btnGroup.createEl("button", { cls: "clickable-icon" });
            setIcon(btnReturn, "corner-up-left");
            btnReturn.title = `Return to ${this.returnJumpTarget.label} canvas`;
            btnReturn.setCssStyles({ padding: "6px", backgroundColor: "transparent", boxShadow: "none", color: "var(--interactive-accent)" });
            btnReturn.onclick = () => {
                const targetTab = this.returnJumpTarget!.tab;
                const targetNode = this.returnJumpTarget!.node;
                this.returnJumpTarget = null; // 消耗記憶

                this.activeTabName = targetTab;
                this.pendingFocusNode = targetNode; // 🌟 精準對焦返上次嗰個人物！
                this.onOpen();
            };
        }

        // ✏️ 鉛筆 Icon (Edit file)
        const openBtn = btnGroup.createEl("button", { cls: "clickable-icon" });
        setIcon(openBtn, "pencil");
        openBtn.title = "Edit note";
        openBtn.setCssStyles({ padding: "6px", backgroundColor: "transparent", boxShadow: "none" });
        openBtn.onclick = () => { this.app.workspace.getLeaf('split', 'vertical').openFile(file); };

        // ➡️ 箭嘴 Icon (Close panel)
        const closeBtn = btnGroup.createEl("button", { cls: "clickable-icon" });
        setIcon(closeBtn, "arrow-right");
        closeBtn.title = "Close panel";
        closeBtn.setCssStyles({ padding: "6px", backgroundColor: "transparent", boxShadow: "none" });
        closeBtn.onclick = () => { container.setCssStyles({ transform: "translateX(100%)" }); };

        // --- 2. 原汁原味 Markdown 筆記渲染 ---
        const content = await this.app.vault.read(file);
        const cache = this.app.metadataCache.getFileCache(file);
        this.currentProperties = Object.assign({}, cache?.frontmatter || {});

        const keys = Object.keys(this.currentProperties).filter(k => !['position', 'canvas_x', 'canvas_y'].includes(k));

        if (keys.length > 0) {
            const propsContainer = container.createDiv({ cls: "metadata-container" });
            propsContainer.setCssStyles({ marginBottom: "20px", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "10px" });

            const propsHeader = propsContainer.createDiv({ cls: "metadata-properties-heading" });
            propsHeader.createDiv({ text: "Properties", attr: { style: "font-size: 0.85em; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;" } });

            const propsList = propsContainer.createDiv({ cls: "metadata-properties" });
            propsList.setCssStyles({ display: "flex", flexDirection: "column", gap: "2px" });

            for (const key of keys) {
                const row = propsList.createDiv({ cls: "metadata-property" });
                row.setCssStyles({ display: "flex", backgroundColor: "var(--background-secondary-alt)", padding: "4px 8px", borderRadius: "4px", alignItems: "baseline", gap: "10px" });

                row.createSpan({ text: key, attr: { style: "color: var(--text-muted); min-width: 90px; font-size: 0.9em;" } });

                let valStr = this.currentProperties[key];
                if (Array.isArray(valStr)) valStr = valStr.map(v => typeof v === 'string' && !v.includes('[[') ? `[[${v}]]` : v).join(", ");
                row.createSpan({ text: String(valStr || "--"), attr: { style: "color: var(--text-normal); font-size: 0.9em; word-break: break-word;" } });
            }
        }

        const contentWrapper = container.createDiv({ cls: "ns-worldboard-preview markdown-rendered" });
        contentWrapper.setCssStyles({ padding: "0 5px", userSelect: "text", fontSize: "0.95em" });

        if (!content.trim()) {
            contentWrapper.createDiv({ text: "Empty note. Click the pencil icon to edit.", attr: { style: "color: var(--text-muted); font-style: italic; text-align: center; margin-top: 30px;" } });
        } else {
            await MarkdownRenderer.render(this.app, content, contentWrapper, file.path, this);
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
    syncToTemplate = true; // 🌟 新增：預設勾選同步至劇情卡

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
            .setDesc("E.g., magic, factions")
            .addText(t => t.onChange(v => this.catName = v));

        new Setting(contentEl)
            .setName("Storage folder")
            .setDesc("E.g., mybook/magic")
            .addText(t => t.onChange(v => this.folderPath = v));

        new Setting(contentEl)
            .setName("Layout mode")
            .addDropdown(d => d.addOption("network", "Network (free form)").addOption("hierarchy", "Hierarchy (Tree)")
                .onChange(v => this.layoutMode = v as 'network' | 'hierarchy'));

        new Setting(contentEl)
            .setName("Parent attribute (for hierarchy)")
            .addText(t => t.onChange(v => this.parentKey = v));

        // 🌟 新增：Checkbox 畀用家揀加唔加入劇情卡
        new Setting(contentEl)
            .setName("Add to scene card template")
            .setDesc("Automatically add this attribute to your scene card template.")
            .addToggle(t => t.setValue(this.syncToTemplate).onChange(v => this.syncToTemplate = v));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Generate & Add")
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
                    await this.plugin.ensureWikiTemplateExists(this.catName, false);

                    // 🌟 邏輯判斷：有剔選先至同步！
                    if (this.syncToTemplate) {
                        await this.plugin.syncSceneTemplateWithCategories();
                    }

                    this.onSuccess(this.catName);
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}