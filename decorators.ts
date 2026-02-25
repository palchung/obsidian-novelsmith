import { ViewUpdate, ViewPlugin, DecorationSet, Decoration, EditorView, MatchDecorator } from '@codemirror/view';

// ============================================================
// 1. 全域變數 & 贅字/對話模式 (保持不變)
// ============================================================
export let activeRedundantRegex: RegExp | null = null;
export function updateRedundantPatterns(regex: RegExp | null) { activeRedundantRegex = regex; }

const redundantDecoration = Decoration.mark({ class: 'cm-redundant-text' });

export const redundantHighlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    matcher: MatchDecorator | null = null;
    lastPattern: RegExp | null = null;
    constructor(view: EditorView) {
        this.decorations = Decoration.none;
        if (document.body.classList.contains('mode-redundant')) this.rebuildMatcher(view);
    }
    update(update: ViewUpdate) {
        const isModeOn = document.body.classList.contains('mode-redundant');
        if (!isModeOn || !activeRedundantRegex) {
            this.decorations = Decoration.none; this.matcher = null; this.lastPattern = null; return;
        }
        if (update.docChanged || update.viewportChanged || this.lastPattern !== activeRedundantRegex) this.rebuildMatcher(update.view);
    }
    rebuildMatcher(view: EditorView) {
        if (!activeRedundantRegex) return;
        if (!this.matcher || this.lastPattern !== activeRedundantRegex) {
            this.matcher = new MatchDecorator({ regexp: activeRedundantRegex, decoration: (match) => redundantDecoration });
            this.lastPattern = activeRedundantRegex;
        }
        this.decorations = this.matcher.createDeco(view);
    }
}, { decorations: v => v.decorations });

const dialogueDecoration = Decoration.mark({ class: 'cm-dialogue-text' });
const dialogueMatcher = new MatchDecorator({ regexp: /「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"/g, decoration: (match) => dialogueDecoration });
export const dialogueHighlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = dialogueMatcher.createDeco(view); }
    update(update: ViewUpdate) {
        if (document.body.classList.contains('mode-dialogue')) this.decorations = dialogueMatcher.updateDeco(update, this.decorations);
        else this.decorations = Decoration.none;
    }
}, { decorations: v => v.decorations });


// ============================================================
// 🔥 4. 結構裝飾器 (安全縮小版 - No Widgets)
// ============================================================

const structureMatcher = new MatchDecorator({
    regexp: /(^# 📄 .*$)|(<span class="ns-file-id">\+\+ FILE_ID: .*? \+\+<\/span>)/gm,

    decoration: (match) => {
        const text = match[0];

        // 情況 A: 標題 (# 📄 ...)
        if (text.startsWith("# 📄")) {
            // 使用 mark 改變樣式 (變小、變色)
            return Decoration.mark({
                class: "cm-small-header"
            });
        }

        // 情況 B: ID (<small>++ FILE_ID...)
        // 使用 mark 改變樣式 (變極細、變灰)
        return Decoration.mark({
            class: "cm-small-id"
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