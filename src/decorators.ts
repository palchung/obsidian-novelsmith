import { ViewUpdate, ViewPlugin, DecorationSet, Decoration, EditorView, MatchDecorator } from '@codemirror/view';

// ============================================================
// 1. Global Variables & Redundant Words/Dialogue Mode (Unchanged)
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