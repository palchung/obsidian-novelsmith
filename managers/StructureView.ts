import { ItemView, WorkspaceLeaf, MarkdownView, ButtonComponent, Notice } from 'obsidian';
import Sortable from 'sortablejs';

export const VIEW_TYPE_STRUCTURE = "novelsmith-structure-view";

interface SceneNode {
    id: string;
    name: string;
    content: string;
    lineNumber: number;
    type: 'scene';
}

interface ChapterNode {
    id: string;
    name: string;
    preamble: string;
    lineNumber: number;
    scenes: SceneNode[];
    type: 'chapter';
}

export class StructureView extends ItemView {
    private sortables: Sortable[] = [];
    private docYaml: string = "";
    private isRefleshing: boolean = false;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_STRUCTURE; }
    getDisplayText() { return "NovelSmith 大綱"; }
    getIcon() { return "kanban-square"; }

    async onOpen() {
        this.refresh();
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf && leaf.view instanceof MarkdownView) {
                    this.parseAndRender();
                }
            })
        );
    }

    async refresh() {
        const container = this.contentEl;
        container.empty();
        container.addClass("ns-structure-container");
        container.createDiv(); // Placeholder for content
        await this.parseAndRender();
    }

    // ============================================================
    // 🧠 解析與繪製
    // ============================================================
    async parseAndRender(containerEl?: HTMLElement) {
        if (this.isRefleshing) return;
        this.isRefleshing = true;

        const targetEl = containerEl || this.contentEl.querySelector(".ns-structure-container > div:last-child");

        let view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            if (leaves.length > 0) view = leaves[0].view as MarkdownView;
        }

        if (!view || !targetEl) {
            if (targetEl) (targetEl as HTMLElement).setText("沒有偵測到活躍的筆記");
            this.isRefleshing = false;
            return;
        }

        const text = view.editor.getValue();
        (targetEl as HTMLElement).empty();

        if (!text.trim()) {
            (targetEl as HTMLElement).setText("📄 這份筆記是空的");
            this.isRefleshing = false;
            return;
        }

        const tree = this.parseDocument(text);

        this.sortables.forEach(s => s.destroy());
        this.sortables = [];

        if (tree.length === 0) {
            (targetEl as HTMLElement).setText("📭 找不到章節或情節標記");
            this.isRefleshing = false;
            return;
        }

        tree.forEach((chapter, chIndex) => {
            const chapterBox = (targetEl as HTMLElement).createDiv({ cls: "ns-chapter-box" });

            chapterBox.dataset.name = chapter.name;
            chapterBox.dataset.preamble = chapter.preamble;

            // A. 章節卡片
            if (chapter.name !== "root") {
                const chCard = chapterBox.createDiv({ cls: "ns-chapter-card" });
                chCard.innerText = `📂 ${chapter.name}`;

                // 🔥 修復點擊事件：使用 addEventListener 並處理
                chCard.addEventListener("click", (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.jumpToLine(chapter.lineNumber);
                });
            }

            // B. 情節容器
            const sceneList = chapterBox.createDiv({ cls: "ns-scene-list" });
            sceneList.dataset.chapterIndex = chIndex.toString();

            chapter.scenes.forEach((scene) => {
                const scCard = sceneList.createDiv({ cls: "ns-scene-card" });
                scCard.innerText = `🎬 ${scene.name}`;
                scCard.dataset.content = scene.content;

                // 🔥 修復點擊事件
                scCard.addEventListener("click", (e) => {
                    e.stopPropagation(); // 防止冒泡
                    e.preventDefault();  // 防止默認行為
                    this.jumpToLine(scene.lineNumber);
                });
            });

            this.sortables.push(new Sortable(sceneList, {
                group: 'scenes',
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                delay: 100,
                delayOnTouchOnly: true,
                onEnd: (evt) => {
                    if (evt.newIndex !== evt.oldIndex || evt.from !== evt.to) {
                        this.saveChanges(targetEl as HTMLElement, view!);
                    }
                }
            }));
        });

        this.isRefleshing = false;
    }

    // ============================================================
    // 🚀 跳轉功能 (Navigation) - 🔥 重大修復
    // ============================================================
    jumpToLine(lineNumber: number) {
        // 1. 嘗試獲取當前活躍的 View
        let view = this.app.workspace.getActiveViewOfType(MarkdownView);

        // 2. 🔥 如果失敗 (因為焦點在側邊欄)，則強制搜尋 workspace 中的第一個 Markdown View
        if (!view) {
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            if (leaves.length > 0) {
                // 通常第一個就是剛剛用戶在編輯的那個
                view = leaves[0].view as MarkdownView;
            }
        }

        // 3. 執行跳轉
        if (view) {
            const editor = view.editor;

            // 確保行號有效
            if (lineNumber < 0) lineNumber = 0;
            const maxLine = editor.lineCount() - 1;
            if (lineNumber > maxLine) lineNumber = maxLine;

            // 設定游標
            editor.setCursor({ line: lineNumber, ch: 0 });

            // 捲動畫面 (置中)
            editor.scrollIntoView({
                from: { line: lineNumber, ch: 0 },
                to: { line: lineNumber, ch: 0 }
            }, true);

            // 🔥 關鍵：強制把焦點還給編輯器，這樣游標才會閃爍，你也才能即刻打字
            editor.focus();
        } else {
            new Notice("⚠️ 找不到目標筆記，請先點擊一下編輯區。");
        }
    }

    // ============================================================
    // 💾 存檔邏輯 (保持不變)
    // ============================================================
    async saveChanges(container: HTMLElement, view: MarkdownView) {
        if (!view) return;
        new Notice("💾 排版更新中...");

        let newFullText = this.docYaml;
        const chapterBoxes = container.querySelectorAll(".ns-chapter-box");

        chapterBoxes.forEach((box) => {
            const el = box as HTMLElement;
            const chName = el.dataset.name;
            const chPreamble = el.dataset.preamble || "";

            if (chName && chName !== "root") {
                if (newFullText.trim() !== "") newFullText += "\n\n";
                newFullText += `# 📄 ${chName}\n`;
                newFullText += `<small>++ FILE_ID: ${chName} ++</small>\n`;
            }

            if (chPreamble) newFullText += chPreamble;

            const scenes = el.querySelectorAll(".ns-scene-card");
            scenes.forEach((sc) => {
                const content = (sc as HTMLElement).dataset.content;
                if (content) {
                    if (!newFullText.endsWith("\n\n")) newFullText += "\n\n";
                    newFullText += content.trim();
                }
            });
        });

        view.editor.setValue(newFullText.trim());
    }

    // ============================================================
    // 🔍 解析器 (Text -> Tree) (保持不變)
    // ============================================================
    parseDocument(text: string): ChapterNode[] {
        const lines = text.split("\n");
        const tree: ChapterNode[] = [];

        this.docYaml = "";
        let startLineIndex = 0;

        if (text.startsWith("---")) {
            const endYamlIndex = text.indexOf("\n---", 3);
            if (endYamlIndex !== -1) {
                this.docYaml = text.substring(0, endYamlIndex + 4) + "\n";
                const yamlLineCount = this.docYaml.split("\n").length - 1;
                startLineIndex = yamlLineCount;
            }
        }

        let currentChapter: ChapterNode = {
            id: 'root', name: 'root', preamble: '', lineNumber: 0, scenes: [], type: 'chapter'
        };

        let currentScene: SceneNode | null = null;
        let buffer: string[] = [];

        const flushScene = () => {
            if (currentScene) {
                currentScene.content += buffer.join("\n");
                currentChapter.scenes.push(currentScene);
            } else if (buffer.length > 0) {
                currentChapter.preamble += buffer.join("\n");
            }
            buffer = [];
        };

        const flushChapter = () => {
            flushScene();
            if (currentChapter.name !== 'root' || currentChapter.scenes.length > 0 || currentChapter.preamble.trim().length > 0) {
                tree.push(currentChapter);
            }
        };

        for (let i = startLineIndex; i < lines.length; i++) {
            const line = lines[i];
            const trimLine = line.trim();

            if (trimLine.startsWith("# 📄")) {
                flushChapter();
                currentChapter = {
                    id: trimLine,
                    name: trimLine.replace("# 📄", "").trim(),
                    preamble: '',
                    lineNumber: i,
                    scenes: [],
                    type: 'chapter'
                };
                currentScene = null;
                buffer = [];
                continue;
            }

            if (trimLine.startsWith("######")) {
                flushScene();
                currentScene = {
                    id: trimLine,
                    name: trimLine.replace(/^[#\s]+|^🎬\s*/g, "").trim(),
                    content: line + "\n",
                    lineNumber: i,
                    type: 'scene'
                };
                buffer = [];
                continue;
            }

            if (trimLine.includes("<small>++ FILE_ID")) continue;

            buffer.push(line);
        }

        flushChapter();
        if (tree.length === 0) tree.push(currentChapter);

        return tree;
    }
}