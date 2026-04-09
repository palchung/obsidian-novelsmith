import { ItemView, WorkspaceLeaf, Notice, TFolder, TFile, MarkdownRenderer, setIcon, Modal, Setting, App } from 'obsidian';
import NovelSmithPlugin from '../../main';
import { Network, Options } from 'vis-network';
import { sanitizeFileName, IMAGE_PROPERTY_KEYS, GROUP_COLORS, getConvexHull } from '../utils';

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
    currentProperties: Record<string, unknown> = {};
    currentBodyContent: string = "";

    // ==========================================
    // 🌟 群組與印章狀態變數
    // ==========================================
    activeGroupKey: string = "";
    activeStampValue: string = "";




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
            const firstAddBtn = emptyBox.createEl("button", { text: "Add your first worldboard category", cls: "mod-cta" });
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

        // 4. 🎨 顏色管理掣 (加入喺 Satellite 同 Plus 掣之間)
        const btnColors = leftToolsBox.createEl("button", { cls: "clickable-icon" });
        setIcon(btnColors, "palette");
        btnColors.title = "Manage relation colors";
        btnColors.setCssStyles({ padding: "4px 8px", backgroundColor: "transparent", boxShadow: "none", cursor: "pointer" });
        btnColors.onclick = () => {
            new ManageEdgeColorsModal(this.app, this.plugin, () => this.renderWorkspace()).open();
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
        let workspaceEl = this.contentEl.querySelector(".ns-worldboard-workspace") as HTMLElement;
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

        // ==========================================
        // 🗂️ 1. 動態收集所有 YAML 屬性 (Dynamic Data Collection)
        // ==========================================
        const allMetaKeys = new Set<string>();
        const allMetaValues: Record<string, Set<string>> = {};

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;
            if (fm) {
                for (const k in fm) {
                    if (!['position', 'canvas_x', 'canvas_y', 'tags'].includes(k)) {
                        allMetaKeys.add(k);
                        if (!allMetaValues[k]) allMetaValues[k] = new Set();
                        const vals = Array.isArray(fm[k]) ? fm[k] : [fm[k]];
                        vals.forEach(v => {
                            if (v !== null && v !== undefined) allMetaValues[k].add(String(v).replace(/[\[\]]/g, '').trim());
                        });
                    }
                }
            } else {
                await this.app.fileManager.processFrontMatter(file, (newFm) => {
                    if (!newFm.tags) newFm.tags = [];
                    if (!newFm.tags.includes(primaryName)) newFm.tags.push(primaryName);
                });
            }
        }

        // ==========================================
        // 🔍 2. 搜尋列 (Search Box) - 終極大遷移！
        // ==========================================
        // 🌟 我哋將個搜尋框由「畫布上面 (absolute)」搬去「頂部導航列 (flex)」！
        // 咁樣可以 100% 避開 iOS Safari 所有絕對座標 Bug 同鍵盤衝突！
        const headerEl = this.contentEl.querySelector(".ns-worldboard-header");
        let searchBox = headerEl?.querySelector(".ns-wb-search-box") as HTMLElement;
        if (searchBox) searchBox.remove();

        if (headerEl) {
            searchBox = headerEl.createDiv({ cls: "ns-wb-search-box" });
            searchBox.setCssStyles({
                position: "relative", top: "auto", left: "auto", transform: "none", // 🌟 強制覆蓋舊 CSS，解除懸浮狀態
                display: "flex", alignItems: "center", gap: "8px", backgroundColor: "var(--background-secondary)",
                padding: "6px 12px", borderRadius: "15px", border: "1px solid var(--background-modifier-border)",
                width: "160px", transition: "width 0.3s", marginLeft: "auto", zIndex: "40" // 🌟 marginLeft: auto 將佢推去畫面最右邊！
            });

            const searchIcon = searchBox.createSpan();
            setIcon(searchIcon, "search");
            searchIcon.setCssStyles({ color: "var(--text-muted)", display: "flex" });

            const searchInput = searchBox.createEl("input", { type: "search", cls: "ns-wb-search-input" });
            searchInput.placeholder = "Search...";
            // 🌟 保持字體 16px，防止 Apple 強制放大畫面
            searchInput.setCssStyles({ border: "none", background: "transparent", color: "var(--text-normal)", outline: "none", width: "100%", fontSize: "16px" });

            // 🌟 新增兩個變數，用嚟死守鏡頭嘅「記憶點」
            let savedScale = 1;
            let savedPosition = { x: 0, y: 0 };

            searchInput.addEventListener("focus", () => {
                searchBox.setCssStyles({ width: "250px", borderColor: "var(--interactive-accent)" });

                if (this.network) {
                    // 1. 鍵盤彈出前嘅 0.001 秒，光速記低目前嘅鏡頭縮放比例同中心點座標！
                    savedScale = this.network.getScale();
                    savedPosition = this.network.getViewPosition();

                    // 2. 等鍵盤彈出穩定後 (約 300ms)，強制將鏡頭「啪」返去記憶點，防止波波消失！
                    setTimeout(() => {
                        if (this.network) {
                            this.network.moveTo({
                                position: savedPosition,
                                scale: savedScale,
                                animation: false // 絕對唔准有動畫，強制瞬間歸位
                            });
                        }
                    }, 300);
                }
            });

            searchInput.addEventListener("blur", () => {
                if (!searchInput.value) searchBox.setCssStyles({ width: "160px", borderColor: "var(--background-modifier-border)" });

                // 3. 鍵盤收起後，再一次強制將鏡頭鎖定喺原本嘅大細，徹底打破「越縮越細」嘅惡性循環！
                setTimeout(() => {
                    if (this.network) {
                        this.network.setSize('100%', '100%');
                        this.network.moveTo({
                            position: savedPosition,
                            scale: savedScale,
                            animation: false
                        });
                    }
                }, 300);
            });

            // 下面保持不變
            searchInput.addEventListener("input", (e) => this.handleSearch((e.target as HTMLInputElement).value));
            searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    searchInput.blur();
                    this.focusSearchMatches();
                }
            });
        }

        // ==========================================
        // 🖌️ 3. 智能勢力群組與印章工具列 (Group & Stamp UI)
        // ==========================================
        const groupControlBox = workspaceEl.createDiv({ cls: "ns-wb-group-box" });
        groupControlBox.setCssStyles({
            position: "absolute", top: "20px", left: "20px", zIndex: "40",
            display: "flex", alignItems: "center", gap: "8px", backgroundColor: "var(--background-secondary)",
            padding: "8px 15px", borderRadius: "20px", border: "1px solid var(--background-modifier-border)",
            boxShadow: "0 4px 15px rgba(0,0,0,0.15)", transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)"
        });

        const groupIcon = groupControlBox.createSpan();
        setIcon(groupIcon, "layers");
        // 🌟 預設顏色：如果已經有開啟勢力圖，Icon 會保持高亮提示用家
        groupIcon.setCssStyles({ color: this.activeGroupKey ? "var(--interactive-accent)" : "var(--text-muted)", display: "flex", cursor: "pointer" });

        const groupSelect = groupControlBox.createEl("select");
        groupSelect.setCssStyles({ border: "none", background: "transparent", color: "var(--text-normal)", outline: "none", cursor: "pointer", fontSize: "0.95em" });

        const stampSelect = groupControlBox.createEl("select");
        stampSelect.setCssStyles({ border: "none", background: "var(--interactive-accent)", color: "var(--text-on-accent)", outline: "none", cursor: "pointer", fontWeight: "bold", borderRadius: "10px", padding: "2px 8px" });

        // ==========================================
        // 🔘 核心切換邏輯：Icon 變成 OK 掣 / 開關掣
        // ==========================================
        let isMenuOpen = false;
        const toggleMenu = (forceOpen?: boolean) => {
            isMenuOpen = forceOpen !== undefined ? forceOpen : !isMenuOpen;
            if (isMenuOpen) {
                // 打開選單
                groupSelect.style.display = "block";
                stampSelect.style.display = this.activeGroupKey ? "block" : "none";
                groupIcon.setCssStyles({ color: "var(--interactive-accent)" });
            } else {
                // 收起選單 (當作 OK 掣)
                groupSelect.style.display = "none";
                stampSelect.style.display = "none";
                // 🌟 收起選單後，如果有勢力圖運行中，Icon 保持高亮
                groupIcon.setCssStyles({ color: this.activeGroupKey ? "var(--interactive-accent)" : "var(--text-muted)" });
            }
        };

        // 初始狀態：隱藏選單，只見到 Icon
        groupSelect.style.display = "none";
        stampSelect.style.display = "none";

        // 點擊 Icon 觸發開關
        groupIcon.onclick = () => toggleMenu();

        const updateGroupOptions = () => {
            groupSelect.empty();
            groupSelect.createEl("option", { text: "No Grouping (clear)", value: "" });
            Array.from(allMetaKeys).sort().forEach(k => groupSelect.createEl("option", { text: `Group by: ${k}`, value: k }));
            groupSelect.createEl("option", { text: "Create new group...", value: "_new_group_" });
            if (this.activeGroupKey) groupSelect.value = this.activeGroupKey;
        };
        updateGroupOptions();

        const updateStampOptions = () => {
            stampSelect.empty();
            stampSelect.createEl("option", { text: "Select value to stamp...", value: "" });
            if (this.activeGroupKey && allMetaValues[this.activeGroupKey]) {
                Array.from(allMetaValues[this.activeGroupKey]).sort().forEach(v => stampSelect.createEl("option", { text: `🖌️ Stamp: ${v}`, value: v }));
            }
            stampSelect.createEl("option", { text: "Create new value...", value: "_new_" });
            if (this.activeStampValue) stampSelect.value = this.activeStampValue;
        };
        updateStampOptions();

        groupSelect.onchange = () => {
            if (groupSelect.value === "_new_group_") {
                import('../modals').then(({ InputModal }) => {
                    new InputModal(this.app, `Create new group attribute (e.g. Faction, Race)`, (newKey) => {
                        if (newKey) {
                            const cleanKey = newKey.trim();
                            if (!allMetaKeys.has(cleanKey)) {
                                allMetaKeys.add(cleanKey);
                                // 🌟 神級修復：確保即時喺 RAM 初始化一個空嘅 Set，防止選單變白！
                                allMetaValues[cleanKey] = new Set();
                            }
                            this.activeGroupKey = cleanKey;
                            this.activeStampValue = "";
                            updateGroupOptions();
                            updateStampOptions();
                            toggleMenu(true); // 強制保持選單打開，等用家繼續揀印章
                            this.renderWorkspace();
                        } else {
                            // 用家取消輸入，回復原狀
                            updateGroupOptions();
                            if (!this.activeGroupKey) toggleMenu(false);
                        }
                    }).open();
                });
                return;
            }

            this.activeGroupKey = groupSelect.value;
            this.activeStampValue = "";

            if (!this.activeGroupKey) {
                toggleMenu(false); // 🌟 如果用家揀 "No Grouping"，自動醒水幫佢收埋個選單
            } else {
                updateStampOptions();
                stampSelect.style.display = "block";
            }
            this.renderWorkspace();
        };

        stampSelect.onchange = () => {
            if (stampSelect.value === "_new_") {
                import('../modals').then(({ InputModal }) => {
                    new InputModal(this.app, `Create new value for [${this.activeGroupKey}]`, (newVal) => {
                        if (newVal) {
                            const cleanVal = newVal.trim();
                            if (!allMetaValues[this.activeGroupKey]) allMetaValues[this.activeGroupKey] = new Set();
                            allMetaValues[this.activeGroupKey].add(cleanVal);
                            this.activeStampValue = cleanVal;
                            updateStampOptions();
                            new Notice(`Stamp equipped! Click on any node to apply "${cleanVal}"`);
                        } else {
                            updateStampOptions(); // 取消輸入，刷新變回原狀
                        }
                    }).open();
                });
                return;
            }
            this.activeStampValue = stampSelect.value;
            new Notice(`Stamp equipped! Click on any node to apply "${this.activeStampValue}"`);
        };


        // ==========================================
        // 🌐 4. 準備 Nodes & Edges
        // ==========================================
        const bgColor = this.getCssVar('--background-secondary-alt') || '#2a2a2a';
        const borderColor = this.getCssVar('--interactive-accent') || '#7b61ff';
        const textColor = this.getCssVar('--text-normal') || '#cccccc';
        const satColor = this.getCssVar('--background-modifier-border') || '#444444';
        const satText = this.getCssVar('--text-muted') || '#888888';

        const nodesData: unknown[] = [];
        const edgesData: unknown[] = [];
        const existingNodeIds = new Set<string>();

        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter || {};

            let nodeSearchStr = file.basename.toLowerCase();

            let imageUrl = null;
            // 動態比對 YAML 屬性與 utils.ts 嘅字典
            const imgKey = IMAGE_PROPERTY_KEYS.find(key => fm[key]);
            if (imgKey) {
                const imgName = String(fm[imgKey]).replace(/[\[\]]/g, '');
                const imgFile = this.app.metadataCache.getFirstLinkpathDest(imgName, file.path);
                if (imgFile) imageUrl = this.app.vault.getResourcePath(imgFile);
            }

            // 🎨 1. 定義卡片顏色與字體
            const origColor = {
                background: bgColor,
                border: borderColor,
                highlight: { background: bgColor, border: 'var(--interactive-accent)' }
            };

            const origFont = {
                color: textColor,
                face: 'var(--font-text)',
                size: 14,
                bold: { color: textColor, size: 14, face: 'var(--font-text)' }
            };

            // 🗂️ 2. 卡片基礎設定 (加入 3D 懸浮陰影)
            const nodeObj: any = {
                id: file.basename,
                label: file.basename,
                color: origColor,
                font: origFont,
                _origColor: origColor,
                _origFont: origFont,
                _searchString: nodeSearchStr,
                borderWidth: 2,
                shadow: { enabled: true, color: 'rgba(0,0,0,0.3)', size: 8, x: 2, y: 4 } // 立體陰影
            };

            // 📸 3. 根據有冇圖片，決定卡片形狀 (Node Shape Mapping)
            if (imageUrl) {
                // 【拍立得型卡片】有圖：上方正方形圖片，下方文字背景
                nodeObj.shape = 'image';
                nodeObj.image = imageUrl;
                nodeObj.size = 35; // 圖片大細
                nodeObj.shapeProperties = { useBorderWithImage: true }; // 為圖片加上邊框
                nodeObj.font = { ...origFont, background: bgColor, strokeWidth: 0 }; // 文字加上底色色塊
            } else {
                // 【文字型卡片】無圖：圓角長方形
                nodeObj.shape = 'box';
                nodeObj.margin = { top: 12, bottom: 12, left: 15, right: 15 }; // 呼吸空間 (Padding)
                nodeObj.widthConstraint = { maximum: 120 }; // 🌟 限制最大寬度，長名會自動換行！
                nodeObj.shapeProperties = { borderRadius: 8 }; // 靚靚圓角
            }

            const savedCoords = this.plugin.settings.worldboardCoords?.[file.path];
            if (savedCoords) {
                nodeObj.x = savedCoords.x;
                nodeObj.y = savedCoords.y;
                nodeObj.physics = false;
            }

            nodesData.push(nodeObj);
            existingNodeIds.add(file.basename);
        });

        let edgeCounter = 0;
        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache && cache.frontmatterLinks) {
                cache.frontmatterLinks.forEach(linkObj => {
                    const target = linkObj.link.split('|')[0].trim();
                    const key = linkObj.key.split('.')[0];

                    const isLocal = files.some(f => f.basename === target);
                    if (!isLocal && !this.showSatellites) return;

                    if (!existingNodeIds.has(target)) {
                        const origSatColor = { background: satColor, border: satText };
                        const origSatFont = { color: satText, size: 12 };

                        nodesData.push({
                            id: target, label: target, shape: 'dot', size: 10,
                            color: origSatColor, font: origSatFont,
                            _origColor: origSatColor, _origFont: origSatFont,
                            _searchString: target.toLowerCase()
                        });
                        existingNodeIds.add(target);
                    }

                    const relationLabel = key;
                    const customColor = this.plugin.settings.relationColors?.[relationLabel];

                    const edgeObj: any = { id: `edge-${edgeCounter++}`, from: file.basename, to: target, label: relationLabel, arrows: 'to' };

                    if (customColor) {
                        const customEdgeFont = { align: 'middle', color: customColor, size: 13, strokeWidth: 2, strokeColor: bgColor, bold: true };
                        const customEdgeColor = { color: customColor, highlight: customColor, hover: customColor };
                        edgeObj.color = customEdgeColor; edgeObj.font = customEdgeFont; edgeObj.width = 2;
                        edgeObj._origColor = customEdgeColor; edgeObj._origFont = customEdgeFont;
                    } else {
                        const origEdgeFont = { align: 'middle', color: satText, size: 11, strokeWidth: 2, strokeColor: bgColor };
                        const origEdgeColor = { color: satText };
                        edgeObj.color = origEdgeColor; edgeObj.font = origEdgeFont; edgeObj.width = 1;
                        edgeObj._origColor = origEdgeColor; edgeObj._origFont = origEdgeFont;
                    }
                    edgesData.push(edgeObj);
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

        // ==========================================
        // 🔮 5. 繪製魔法結界 (Convex Hull Bubbles)
        // ==========================================
        this.network.on("beforeDrawing", (ctx) => {
            if (!this.activeGroupKey) return;

            const groups: Record<string, string[]> = {};
            files.forEach(file => {
                const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
                let vals = fm[this.activeGroupKey];
                if (!vals) return;
                if (!Array.isArray(vals)) vals = [vals];

                vals.forEach((v: any) => {
                    const cleanV = String(v).replace(/[\[\]]/g, '').trim();
                    if (!cleanV) return;
                    if (!groups[cleanV]) groups[cleanV] = [];
                    groups[cleanV].push(file.basename);
                });
            });

            let colorIndex = 0;
            for (const [groupName, nodeIds] of Object.entries(groups)) {
                if (nodeIds.length === 0) continue;

                const positions = this.network?.getPositions(nodeIds);
                if (!positions) continue;
                const points = Object.values(positions);
                if (points.length === 0) continue;

                // 🌟 修正：轉用 utils.ts 引入嘅 GROUP_COLORS 陣列
                const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
                colorIndex++;

                ctx.fillStyle = color.bg;
                ctx.strokeStyle = color.border;
                ctx.lineWidth = 100; // 🌟 利用激粗嘅線條實現氣泡邊緣圓滑化 (Padding)
                ctx.lineJoin = "round";
                ctx.lineCap = "round";

                ctx.beginPath();
                if (points.length === 1) {
                    ctx.arc(points[0].x, points[0].y, 50, 0, 2 * Math.PI);
                } else if (points.length === 2) {
                    ctx.moveTo(points[0].x, points[0].y);
                    ctx.lineTo(points[1].x, points[1].y);
                } else {
                    // 🌟 修正：轉用 utils.ts 引入嘅 getConvexHull 函數 (移除 this.)
                    const hull = getConvexHull(points);
                    ctx.moveTo(hull[0].x, hull[0].y);
                    for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
                    ctx.closePath();
                }
                ctx.fill();
                ctx.stroke();

                // 繪製群組名稱標籤
                const topPoint = points.reduce((min, p) => p.y < min.y ? p : min, points[0]);
                ctx.fillStyle = color.text;
                ctx.font = "bold 16px Arial";
                ctx.textAlign = "center";
                ctx.fillText(groupName, topPoint.x, topPoint.y - 80);
            }
        });

        if (this.pendingFocusNode) {
            const targetId = this.pendingFocusNode;
            this.pendingFocusNode = null;
            this.network.once("afterDrawing", () => {
                this.network?.selectNodes([targetId]);
                // 🌟 關鍵修正：加入 locked: false，防止畫布被鎖死
                this.network?.focus(targetId, { scale: 1.5, locked: false, animation: { duration: 800, easingFunction: "easeInOutQuad" } });
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
                    if (file) this.plugin.settings.worldboardCoords[file.path] = { x: Math.round(pos.x), y: Math.round(pos.y) };
                }
                await this.plugin.saveSettings();
            }
        });

        this.network.on("click", (params) => {
            if (params.nodes.length === 1 && this.activeGroupKey && this.activeStampValue) {
                // 🛑 印章攔截器
                this.handleStampClick(params.nodes[0], files);
            } else if (params.nodes.length === 0 && params.edges.length === 1) {
                // 🎨 連線改色
                this.handleEdgeColorClick(params.edges[0], params.pointer.DOM, edgesData, canvasContainer);
            } else if (params.nodes.length > 0) {
                // 📝 打開預覽面板
                this.openNodePanel(params.nodes[0], files, panelContainer);
            } else {
                // 點擊空白處，收起面板
                panelContainer.setCssStyles({ transform: "translateX(100%)" });
            }
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
                const targetTab = this.returnJumpTarget.tab;
                const targetNode = this.returnJumpTarget.node;
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


    // ==========================================
    // 🔍 搜尋引擎：即時高亮與暗化 (Real-time Dimming)
    // ==========================================
    private handleSearch(query: string) {
        if (!this.network) return;
        const nodesData = (this.network as any).body.data.nodes;
        const edgesData = (this.network as any).body.data.edges;

        const q = query.toLowerCase().trim();
        const nodeUpdates: unknown[] = [];
        const edgeUpdates: unknown[] = [];
        let matchCount = 0;
        let lastMatchId = null;

        if (q === "") {
            nodesData.forEach((node: any) => {
                nodeUpdates.push({ id: node.id, color: node._origColor, font: node._origFont });
            });
            edgesData.forEach((edge: any) => {
                edgeUpdates.push({ id: edge.id, color: edge._origColor, font: edge._origFont });
            });
        } else {
            nodesData.forEach((node: any) => {
                const isMatch = node._searchString && node._searchString.includes(q);
                if (isMatch) {
                    nodeUpdates.push({ id: node.id, color: node._origColor, font: node._origFont });
                    matchCount++;
                    lastMatchId = node.id;
                } else {
                    nodeUpdates.push({
                        id: node.id,
                        color: { background: 'rgba(128,128,128,0.1)', border: 'rgba(128,128,128,0.2)' },
                        font: { color: 'rgba(128,128,128,0.3)' }
                    });
                }
            });

            edgesData.forEach((edge: any) => {
                const fromNode = nodesData.get(edge.from);
                const toNode = nodesData.get(edge.to);
                const isFromMatch = fromNode && fromNode._searchString && fromNode._searchString.includes(q);
                const isToMatch = toNode && toNode._searchString && toNode._searchString.includes(q);

                if (isFromMatch && isToMatch) {
                    edgeUpdates.push({ id: edge.id, color: edge._origColor, font: edge._origFont });
                } else {
                    edgeUpdates.push({
                        id: edge.id,
                        color: { color: 'rgba(128,128,128,0.1)' },
                        font: { color: 'rgba(128,128,128,0.1)', size: 11, strokeWidth: 0 }
                    });
                }
            });
        }

        nodesData.update(nodeUpdates);
        edgesData.update(edgeUpdates);


    }

    // ==========================================
    // 🎥 鏡頭追蹤：按下 Enter 鍵時總覽所有結果
    // ==========================================
    private focusSearchMatches() {
        if (!this.network) return;
        const searchInput = this.contentEl.querySelector(".ns-wb-search-input") as HTMLInputElement;
        if (!searchInput) return;
        const q = searchInput.value.toLowerCase().trim();

        // 🌟 神級時間差：等待 350ms，確保鍵盤收起、畫布解凍完畢，先至發動動畫！
        setTimeout(() => {
            if (!this.network) return;

            if (!q) {
                this.network.fit({ animation: { duration: 800, easingFunction: "easeInOutQuad" } });
                return;
            }

            const nodesData = (this.network as any).body.data.nodes;
            const matchIds: string[] = [];
            nodesData.forEach((node: any) => {
                if (node._searchString && node._searchString.includes(q)) {
                    matchIds.push(node.id);
                }
            });

            if (matchIds.length > 0) {
                // 🌟 華麗運鏡復活！因為畫布已經穩定，動畫絕對唔會引發對角線 Bug！
                this.network.fit({
                    nodes: matchIds,
                    animation: { duration: 800, easingFunction: "easeInOutQuad" }
                });
            }
        }, 350);
    }


    // ==========================================
    // 🖱️ 獨立事件 1：處理印章點擊 (Stamp Interceptor)
    // ==========================================
    private handleStampClick(nodeId: string, files: TFile[]) {
        const file = files.find(f => f.basename === nodeId);
        if (!file) return;

        const valToStamp = this.activeStampValue;
        const formattedVal = `[[${valToStamp}]]`;

        void this.app.fileManager.processFrontMatter(file, (fm) => {
            let existing = fm[this.activeGroupKey];
            if (!existing) {
                fm[this.activeGroupKey] = [formattedVal];
            } else if (Array.isArray(existing)) {
                const exists = existing.some(v => String(v).replace(/[\[\]]/g, '').trim() === valToStamp);
                if (exists) {
                    fm[this.activeGroupKey] = existing.filter(v => String(v).replace(/[\[\]]/g, '').trim() !== valToStamp);
                } else {
                    fm[this.activeGroupKey].push(formattedVal);
                }
            } else {
                const strExisting = String(existing).replace(/[\[\]]/g, '').trim();
                if (strExisting === valToStamp) {
                    delete fm[this.activeGroupKey];
                } else {
                    fm[this.activeGroupKey] = [existing, formattedVal];
                }
            }
        }).then(() => {
            new Notice(`Stamp applied!`);
            setTimeout(() => this.renderWorkspace(), 300);
        });
    }

    // ==========================================
    // 🖱️ 獨立事件 2：處理關係線顏色點擊 (Edge Color Picker)
    // ==========================================
    private handleEdgeColorClick(edgeId: string, pointerDOM: { x: number, y: number }, edgesData: any[], canvasContainer: HTMLElement) {
        const edgeData = edgesData.find((e: any) => e.id === edgeId);
        if (!edgeData || !edgeData.label) return;

        const relationLabel = edgeData.label;
        const currentColor = this.plugin.settings.relationColors?.[relationLabel] || "#7b61ff";

        canvasContainer.querySelectorAll(".ns-color-picker-temp").forEach(el => el.remove());

        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = currentColor;
        colorInput.className = "ns-color-picker-temp";
        colorInput.style.position = "absolute";

        // ⚠️ iOS 修復：唔可以 pointer-events: none，必須有實體大細
        colorInput.style.opacity = "0";
        colorInput.style.width = "1px";
        colorInput.style.height = "1px";
        colorInput.style.border = "none";
        colorInput.style.padding = "0";

        colorInput.style.left = `${pointerDOM.x}px`;
        colorInput.style.top = `${pointerDOM.y}px`;
        canvasContainer.appendChild(colorInput);

        colorInput.onchange = async (e) => {
            const newColor = (e.target as HTMLInputElement).value;
            if (!this.plugin.settings.relationColors) this.plugin.settings.relationColors = {};
            this.plugin.settings.relationColors[relationLabel] = newColor;
            await this.plugin.saveSettings();
            new Notice(`Color updated for "${relationLabel}"`);
            this.renderWorkspace();
            colorInput.remove();
        };

        // 🌟 終極解法：環境偵測 (Platform Sniffing)
        // 偵測是否為 iOS / iPadOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) {
            // iPad/iOS 嚴格安全機制：必須同步執行
            colorInput.click();
        } else {
            // PC/Mac 渲染機制：需要 10ms 延遲等座標畫好，防止飛去左上角
            setTimeout(() => colorInput.click(), 10);
        }
    }

    // ==========================================
    // 🖱️ 獨立事件 3：打開節點預覽面板
    // ==========================================
    private openNodePanel(nodeId: string, files: TFile[], panelContainer: HTMLElement) {
        let file = files.find(f => f.basename === nodeId);
        let isSatellite = false;

        if (file) {
            this.lastSelectedLocalNode = String(nodeId);
        } else {
            file = this.app.metadataCache.getFirstLinkpathDest(String(nodeId), "");
            if (file) isSatellite = true;
        }

        if (!this.pendingFocusNode && !isSatellite) this.returnJumpTarget = null;

        if (file) {
            panelContainer.setCssStyles({ transform: "translateX(0)" });
            void this.renderPanel(file, panelContainer, isSatellite);
        } else {
            panelContainer.setCssStyles({ transform: "translateX(0)" });
            panelContainer.empty();
            panelContainer.createEl("h3", { text: String(nodeId) });
            panelContainer.createDiv({ text: "This node doesn't exist as a file yet. You can create it using the + New button in its respective category.", attr: { style: "color: var(--text-muted);" } });
            const closeBtn = panelContainer.createEl("button", { text: "Close", cls: "mod-cta" });
            closeBtn.onclick = () => panelContainer.setCssStyles({ transform: "translateX(100%)" });
        }
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
            .addDropdown(d => d.addOption("network", "Network (free form)").addOption("hierarchy", "Hierarchy (tree)")
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
                .setButtonText("Generate & add")
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

// ==========================================
// 🎨 新增：管理與重設關係線顏色對話框
// ==========================================
class ManageEdgeColorsModal extends Modal {
    plugin: NovelSmithPlugin;
    onUpdate: () => void;

    constructor(app: App, plugin: NovelSmithPlugin, onUpdate: () => void) {
        super(app);
        this.plugin = plugin;
        this.onUpdate = onUpdate;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Manage relation colors" });

        const colors = this.plugin.settings.relationColors || {};
        const keys = Object.keys(colors);

        if (keys.length === 0) {
            contentEl.createDiv({
                text: "No custom colors set yet. Click any line in the Worldboard to assign a color.",
                attr: { style: "color: var(--text-muted); font-style: italic; margin-bottom: 20px;" }
            });
            return;
        }

        // 🌟 災難復原：一鍵清除所有顏色
        new Setting(contentEl)
            .setName("Clear all colors")
            .setDesc("Reset all relationship lines to default gray.")
            .addButton(btn => btn
                .setButtonText("Clear all")
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.relationColors = {};
                    await this.plugin.saveSettings();
                    this.onUpdate();
                    this.close();
                })
            );

        contentEl.createEl("h3", { text: "Current rules", attr: { style: "margin-top: 20px; margin-bottom: 10px;" } });

        // 🌟 獨立管理：逐個關係修改或刪除
        keys.forEach(key => {
            new Setting(contentEl)
                .setName(key)
                .addColorPicker(cp => cp.setValue(colors[key]).onChange(async (val) => {
                    this.plugin.settings.relationColors[key] = val;
                    await this.plugin.saveSettings();
                    this.onUpdate(); // 即時重畫畫布！
                }))
                .addExtraButton(btn => btn.setIcon("trash").setTooltip("Remove rule").onClick(async () => {
                    delete this.plugin.settings.relationColors[key];
                    await this.plugin.saveSettings();
                    this.onUpdate();
                    this.onOpen(); // 刷新 Modal 畫面
                }));
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}