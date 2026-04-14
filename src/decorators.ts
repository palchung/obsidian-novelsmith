import { RangeSetBuilder } from "@codemirror/state";
import { ViewUpdate, ViewPlugin, DecorationSet, Decoration, EditorView, MatchDecorator, WidgetType } from '@codemirror/view';
import { MarkdownPostProcessorContext } from 'obsidian';


// ============================================================
// 1. Global Variables & Redundant Words/Dialogue Mode (Unchanged)
// ============================================================
// ============================================================
// 1. 雙重雷達：贅詞 (紅) 與 回聲 (橘) + 隱形遮罩 (獨立控制版)
// ============================================================
export let activeRedundantRegex: RegExp | null = null;
export let activeEchoRegex: RegExp | null = null;

// 🌟 拆分成兩個獨立設定函數
export function setRedundantPattern(regex: RegExp | null) { activeRedundantRegex = regex; }
export function setEchoPattern(regex: RegExp | null) { activeEchoRegex = regex; }

const redundantDecoration = Decoration.mark({ class: 'cm-redundant-text' });
const echoDecoration = Decoration.mark({ class: 'cm-echo-text' });

export const redundantHighlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = Decoration.none; }

    update(update: ViewUpdate) {
        // 🌟 檢查有邊個模式開緊
        const isRedundantOn = document.body.classList.contains('mode-redundant');
        const isEchoOn = document.body.classList.contains('mode-echo');

        if (!isRedundantOn && !isEchoOn) { this.decorations = Decoration.none; return; }

        const builder = new RangeSetBuilder<Decoration>();
        let text = update.view.state.doc.toString();

        // 🛡️ 屏蔽魔法：將標題同屬性變成空白，保護佢哋唔被 Highlight！
        text = text.replace(/^###### .*$/gm, (match) => ' '.repeat(match.length));
        text = text.replace(/^> .*$/gm, (match) => ' '.repeat(match.length));
        text = text.replace(/^# 📄 .*$/gm, (match) => ' '.repeat(match.length));
        text = text.replace(/<span[^>]*>.*?<\/span>/g, (match) => ' '.repeat(match.length));

        const matches: { from: number, to: number, deco: Decoration }[] = [];

        // 只在 Redundant 模式開啟時收集紅色
        if (isRedundantOn && activeRedundantRegex) {
            let match;
            activeRedundantRegex.lastIndex = 0;
            while ((match = activeRedundantRegex.exec(text)) !== null) {
                matches.push({ from: match.index, to: match.index + match[0].length, deco: redundantDecoration });
            }
        }
        // 只在 Echo 模式開啟時收集橘色
        if (isEchoOn && activeEchoRegex) {
            let match;
            activeEchoRegex.lastIndex = 0;
            while ((match = activeEchoRegex.exec(text)) !== null) {
                matches.push({ from: match.index, to: match.index + match[0].length, deco: echoDecoration });
            }
        }

        let lastTo = -1;
        matches.sort((a, b) => a.from - b.from).forEach(m => {
            if (m.from >= lastTo) {
                builder.add(m.from, m.to, m.deco);
                lastTo = m.to;
            }
        });
        this.decorations = builder.finish();
    }
}, { decorations: v => v.decorations });

const dialogueDecoration = Decoration.mark({ class: 'cm-dialogue-text' });
const dialogueMatcher = new MatchDecorator({ regexp: /「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"/g, decoration: (match) => dialogueDecoration });

export const dialogueHighlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        // 🔥 Ultimate Fix: Default to none, create only upon activation to save initial memory
        this.decorations = document.body.classList.contains('ns-mode-dialogue') ? dialogueMatcher.createDeco(view) : Decoration.none;
    }
    update(update: ViewUpdate) {
        const isModeOn = document.body.classList.contains('ns-mode-dialogue');
        // If Dialogue Mode is off, hibernate immediately, zero computation cost!
        if (!isModeOn) {
            this.decorations = Decoration.none;
            return;
        }

        // If just started (originally none), scan from scratch; otherwise, update incrementally
        if (this.decorations === Decoration.none) {
            this.decorations = dialogueMatcher.createDeco(update.view);
        } else {
            this.decorations = dialogueMatcher.updateDeco(update, this.decorations);
        }
    }
}, { decorations: v => v.decorations });


// ============================================================
// 📡 1.5 Syntax Radar Mode (句式雷達：紫色波浪底線)
// ============================================================
export let activeSyntaxRegex: RegExp | null = null;
export function updateSyntaxPatterns(regex: RegExp | null) { activeSyntaxRegex = regex; }

// 🌟 貼心設計：直接注入 Inline CSS，免卻設定 styles.css 嘅煩惱
const syntaxDecoration = Decoration.mark({
    attributes: {
        style: 'text-decoration: underline wavy #9c4be5; text-underline-offset: 3px; text-decoration-thickness: 2px;'
    }
});

export const syntaxHighlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    matcher: MatchDecorator | null = null;
    lastPattern: RegExp | null = null;

    constructor(view: EditorView) {
        this.decorations = Decoration.none;
        if (document.body.classList.contains('mode-syntax')) this.rebuildMatcher(view);
    }

    update(update: ViewUpdate) {
        const isModeOn = document.body.classList.contains('mode-syntax');
        if (!isModeOn || !activeSyntaxRegex) {
            this.decorations = Decoration.none; this.matcher = null; this.lastPattern = null; return;
        }
        if (update.docChanged || update.viewportChanged || this.lastPattern !== activeSyntaxRegex) this.rebuildMatcher(update.view);
    }

    rebuildMatcher(view: EditorView) {
        if (!activeSyntaxRegex) return;
        if (!this.matcher || this.lastPattern !== activeSyntaxRegex) {
            this.matcher = new MatchDecorator({ regexp: activeSyntaxRegex, decoration: (match) => syntaxDecoration });
            this.lastPattern = activeSyntaxRegex;
        }
        this.decorations = this.matcher.createDeco(view);
    }
}, { decorations: v => v.decorations });





// ============================================================
// 🔥 4. Structure Decorators (Safe scaled-down version - No Widgets)
// ============================================================

const structureMatcher = new MatchDecorator({
    regexp: /(^# 📄 .*$)|(<span class="ns-file-id">\+\+ FILE_ID: .*? \+\+<\/span>)/gm,

    decoration: (match) => {
        const text = match[0];

        // Case A: Headers (# 📄 ...)
        if (text.startsWith("# 📄")) {
            // Use mark to change styling (smaller, colored)
            return Decoration.mark({
                class: "ns-small-header"
            });
        }

        // Case B: ID (<small>++ FILE_ID...)
        // Use mark to change styling (tiny, grey)
        return Decoration.mark({
            class: "ns-small-id"
        });
    }
});

export const structureHighlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = structureMatcher.createDeco(view); }
    update(update: ViewUpdate) {
        this.decorations = structureMatcher.updateDeco(update, this.decorations);
    }
}, { decorations: v => v.decorations });

// ============================================================
// 🔥 5. System Tags Protector (一網打盡：隱藏所有系統標記)
// ============================================================

class HiddenIdWidget extends WidgetType {
    toDOM() {
        const span = document.createElement("span");
        span.style.display = "none";
        return span;
    }
    ignoreEvent() { return true; }
}

class FileBoundaryWidget extends WidgetType {
    toDOM() {
        const span = document.createElement("span");
        //span.className = "ns-file-id";
        span.style.display = "none";
        return span;
    }
    ignoreEvent() { return true; }
}

const systemTagsMatcher = new MatchDecorator({
    // 🌟 更新 Regex：同時捕捉 ns-id, ns-file-id 同埋 ns-chapter-center
    regexp: /<span class="ns-id"[^>]*>.*?<\/span>|<span class="ns-file-id"[^>]*>.*?<\/span>|<span class="ns-chapter-center"[^>]*>.*?<\/span>/g,
    decoration: (match) => {
        const text = match[0];
        // 判斷係邊種標記
        if (text.includes("ns-file-id")) {
            return Decoration.replace({ widget: new FileBoundaryWidget(), inclusive: false });
        } else {
            // ns-id 同 ns-chapter-center 都一律套用隱形 Widget
            return Decoration.replace({ widget: new HiddenIdWidget(), inclusive: false });
        }
    }
});

export const systemTagsProtector = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = systemTagsMatcher.createDeco(view); }
    update(update: ViewUpdate) { this.decorations = systemTagsMatcher.updateDeco(update, this.decorations); }
}, { decorations: v => v.decorations });



// ============================================================
// 🎭 6. Micro Post-Processor (屬性對齊魔法，絕對安全、零干擾)
// ============================================================
export function alignPropertyProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    // 只針對 NSmith 卡片，唔影響其他筆記
    const callouts = Array.from(el.querySelectorAll('.callout')).filter(c => c.getAttribute('data-callout')?.startsWith('nsmith'));

    callouts.forEach(callout => {
        const lists = callout.querySelectorAll('ul');
        lists.forEach(ul => {
            ul.classList.add("ns-property-list"); // 加 Class 畀 CSS 做 Grid 排版

            const items = ul.querySelectorAll('li');
            items.forEach(li => {
                const text = li.innerHTML;
                if (text.includes("::")) {
                    // 將文字拆開，包裝成 左(Key) 同 右(Value)
                    const parts = text.split("::");
                    const key = parts[0];
                    const val = parts.slice(1).join("::");

                    // 重新包裝，唔加任何 Input，純粹為咗排版
                    li.innerHTML = `<span class="ns-prop-key">${key}</span><span class="ns-prop-separator">::</span><span class="ns-prop-val">${val}</span>`;
                }
            });
        });
    });
}

