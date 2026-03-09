import { App, setIcon, Editor, TFile } from 'obsidian';

// ============================================================
// 🛠️ Toolbox: Handles string processing and parsing
// ============================================================


// 1. Regular Expressions (Regex)
export const RE_HEADER_CLEAN = /^[#\s]+|^🎬\s*|^[-.]\s*/g;
export const RE_HIGHLIGHT = /==/g;
export const RE_SEPARATOR = /%% - %%/g;
// 🔥 Replace these three lines:
export const RE_FILE_ID = /<span class="ns-file-id">\+\+ FILE_ID: (.*?) \+\+<\/span>/;
export const RE_FILE_ID_HEADING = /<span class="ns-file-id">\+\+ FILE_ID: .*? \+\+<\/span>/g;
export const ST_FILE_ID_HEADING = '<span class="ns-file-id">++ FILE_ID';
export const RE_FOLDER_HEADING = /^# 📄 .*$/gm;
export const RE_SCENE_TAG = /^######\s*/;
export const RE_SCENE_EMOJI = /^🎬\s*/;
// Header (ID part)
//export const RE_SCENE_HEADER_HTML = /###### (.*?)( /;
export const RE_EXTRACT_ID = /(?:SCENE_ID:\s*|data-scene-id=")([a-zA-Z0-9-]+)/;
export const RE_SCENE_INFO = /^> \[\!NSmith.*?\].*?(?:\n>.*)*/gm;
// Used to match header lines (###### Title )
export const RE_SCENE_HEADER = /^(###### .*?)( )?$/;
// Used to match header lines that already have an ID
export const RE_SCENE_HEADER_ID = /^(###### .*?)( )?$/;
// String HTML comment
//export const ST_SCENE_ID_OP = ' ';
export const ST_WARNING = '⛔️ ID (Do not edit)';
export const ST_SCENE_TAG = '######';
export const ST_FILE_ID_HEADER = "++ FILE_ID";

// ============================================================
// 📂 System Constants - Unified management, eliminating magic strings
// ============================================================
export const DRAFT_FILENAME = "NSmith_Scrivenering.md";
export const BACKSTAGE_DIR = "_Backstage";
export const TEMPLATES_DIR = `${BACKSTAGE_DIR}/Templates`;
export const DRAFTS_DIR = `${BACKSTAGE_DIR}/Drafts`;
export const HISTORY_DIR = `${BACKSTAGE_DIR}/History`;
export const AIDS_DIR = `${BACKSTAGE_DIR}/Aids`;
export const SCENE_DB_FILE = "_Scene_Database.md";

// ============================================================
// 🧠 Refactored Shared Utilities (UI & Logic Helpers)
// ============================================================

// 1. 共用：大綱/備註 關鍵字雷達
export const SYNOPSIS_KEYS = ["synopsis", "description", "summary", "note", "大綱", "備註", "簡介"];

export interface ExtractedTags {
    foundSynopsis: string;
    dynamicTags: { key: string, value: string }[];
}

export const extractSynopsisAndTags = (metaLines: string[]): ExtractedTags => {
    let foundSynopsis = "";
    const dynamicTags: { key: string, value: string }[] = [];

    metaLines.forEach((metaLine: string) => {
        const clean = metaLine.replace(/^>\s*/, "").trim();
        if (clean.startsWith('- ')) {
            const match = clean.match(/^-\s*(.*?)::\s*(.*)/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                if (!foundSynopsis && SYNOPSIS_KEYS.includes(key.toLowerCase())) {
                    foundSynopsis = value;
                } else {
                    dynamicTags.push({ key, value });
                }
            }
        }
    });
    return { foundSynopsis, dynamicTags };
};

// 2. 共用：從編輯器游標位置尋找 Scene ID (Anchor ID)
export const getAnchorSceneIdFromCursor = (editor: Editor): string | null => {
    const cursor = editor.getCursor();
    for (let i = cursor.line; i >= 0; i--) {
        const line = editor.getLine(i);
        if (line.trim().startsWith("######")) {
            return extractSceneId(line);
        }
    }
    return null;
};

// ============================================================
// 🛠️ Shared Utilities
// ============================================================
export const ensureFolderExists = async (app: App, folderPath: string) => {
    const cleanPath = folderPath.replace(/^\/+|\/+$/g, '');
    if (!cleanPath) return;

    const folders = cleanPath.split("/");
    let currentPath = "";

    for (let i = 0; i < folders.length; i++) {
        currentPath += (i === 0 ? "" : "/") + folders[i];
        const folder = app.vault.getAbstractFileByPath(currentPath);
        if (!folder) {
            try { await app.vault.createFolder(currentPath); } catch { /* ignore */ }
        }
    }
};

// 2. Data Structure Interface
export interface DraftCard {
    key: string;     // Old: Title (for compatibility)
    id?: string;     // 🔥 New: Unique ID
    rawHeader: string;
    meta: string[];
    body: string;
}

export interface ParseResult {
    yaml: string;
    preamble: string;
    cards: DraftCard[];
}

// 3. Header Cleaning Function (Removes Markdown symbols and ID tags)
export const normalizeHeader = (header: string): string => {
    // 🔥 Reuse our newly written ultimate cleaning function to ensure 100% consistent logic system-wide!
    return cleanSceneTitle(header);
};

// 4. Core Parser
export const parseContent = (text: string, isOriginal: boolean = false, app?: App, file?: TFile): ParseResult => {
    let yamlBlock = "";
    let contentAfterYaml = text;

    // =======================================================
    // call Obsidian API to split YAML out from draft
    // =======================================================
    if (app && file) {
        const cache = app.metadataCache.getFileCache(file);
        if (cache && cache.frontmatterPosition) {
            const startPos = cache.frontmatterPosition.start.offset;
            const endPos = cache.frontmatterPosition.end.offset;

            yamlBlock = text.substring(startPos, endPos);
            contentAfterYaml = text.substring(endPos).trimStart();
        }
    } else {

        const yamlMatch = text.match(/^---\n[\s\S]*?\n---\n/);
        if (yamlMatch) {
            yamlBlock = yamlMatch[0].trimEnd();
            contentAfterYaml = text.substring(yamlMatch[0].length).trimStart();
        }
    }

    // =======================================================
    // Split Preamble and scene card content
    // =======================================================
    const lines = contentAfterYaml.split("\n");
    let cards: DraftCard[] = [];
    let currentHeaderRaw: string | null = null;
    let currentBodyLines: string[] = [];
    let currentMeta: string[] = [];
    let preambleLines: string[] = [];

    let isCollectingMeta = false;
    let hasHitFirstCard = false;

    const flushCard = () => {
        if (currentHeaderRaw) {
            let cleanBody = currentBodyLines.join("\n").trim();
            if (!isOriginal) {
                cleanBody = cleanBody.replace(RE_HIGHLIGHT, "").replace(RE_SEPARATOR, "");
                let tempLines = cleanBody.split("\n");
                while (tempLines.length > 0) {
                    const l = tempLines[0].trim();
                    if (l.startsWith(">")) tempLines.shift();
                    else break;
                }
                cleanBody = tempLines.join("\n").trimEnd();
            } else {
                cleanBody = cleanBody.trimEnd();
            }
            const idMatch = currentHeaderRaw.match(RE_EXTRACT_ID);
            cards.push({
                key: normalizeHeader(currentHeaderRaw),
                id: idMatch ? idMatch[1].trim() : undefined,
                rawHeader: currentHeaderRaw,
                meta: [...currentMeta],
                body: cleanBody
            });
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimLine = line.trim();

        if (trimLine.startsWith("%% FILE")) continue;
        if (trimLine === "%% - %%") continue;
        if (trimLine.startsWith("%% ===")) continue;
        if (trimLine.startsWith("# 📄")) continue;

        if (trimLine.startsWith(ST_SCENE_TAG)) {
            flushCard();
            hasHitFirstCard = true;
            currentHeaderRaw = trimLine;
            currentBodyLines = [];
            currentMeta = [];
            isCollectingMeta = true;
        } else if (hasHitFirstCard) {
            if (isCollectingMeta) {
                if (trimLine.startsWith("> [!NSmith") || trimLine.startsWith("> [!info") || trimLine.startsWith("> -") || trimLine === ">") {
                    currentMeta.push(line);
                } else if (trimLine !== "") {
                    isCollectingMeta = false;
                    currentBodyLines.push(line);
                }
            } else {
                currentBodyLines.push(line);
            }
        } else {

            preambleLines.push(line);
        }
    }
    flushCard();

    return {
        yaml: yamlBlock,
        preamble: preambleLines.join("\n").trimEnd(),
        cards: cards
    };
};

// ============================================================
// 🔥 Masterful Refactoring: Shared header cleaning and ID extraction functions
// ============================================================
export function extractSceneId(header: string): string | null {
    const match = header.match(RE_EXTRACT_ID);
    return match ? match[1].trim() : null;
}

export function cleanSceneTitle(header: string): string {
    let clean = header.replace(/^######\s*/, "").replace(/^🎬\s*/, "");
    const htmlCommentStart = "<" + "!--";
    if (clean.includes(htmlCommentStart)) clean = clean.split(htmlCommentStart)[0];
    if (clean.includes("<span")) clean = clean.split("<span")[0];
    if (clean.includes("<small>")) clean = clean.split("<small>")[0];
    return clean.trim();
}

// ============================================================
// 🎨 Masterful Architecture: System-wide shared color palette dictionary (Single Source of Truth)
// ============================================================

export const RE_EXTRACT_COLOR = /data-color="([a-zA-Z0-9-]+)"/;

export const SCENE_COLORS = [
    { id: "default", icon: "⚪️", name: "Default (Colorless)", cssClass: "ns-color-grey", color: "var(--background-modifier-border)" },
    { id: "red", icon: "🔴", name: "Red (Conflict/Villain)", cssClass: "ns-color-red", color: "#e5534b" },
    { id: "orange", icon: "🟠", name: "Orange (Slice of Life/Suspense)", cssClass: "ns-color-orange", color: "#d9813b" },
    { id: "green", icon: "🟢", name: "Green (Growth/Supporting)", cssClass: "ns-color-green", color: "#4bbf6b" },
    { id: "blue", icon: "🔵", name: "Blue (Calm/Protagonist)", cssClass: "ns-color-blue", color: "#4b8be5" },
    { id: "purple", icon: "🟣", name: "Purple (Mystery/Magic)", cssClass: "ns-color-purple", color: "#9c4be5" },
];

export const getColorById = (colorId: string | null | undefined) => {
    if (!colorId) return SCENE_COLORS[0];
    return SCENE_COLORS.find(c => c.id === colorId) || SCENE_COLORS[0];
};

export const extractSceneColor = (header: string): string => {
    const match = header.match(RE_EXTRACT_COLOR);
    return match ? match[1].trim() : "default";
};

// ============================================================
// 🚀 Masterful Architecture: Universal Scene Parser
// ============================================================
export interface UniversalScene {
    lineIndex: number;      // Line index of the header
    rawHeader: string;      // Raw header text
    title: string;          // Cleaned header name
    id: string | null;      // Unique ID
    colorId: string;        // Color ID
    meta: string[];         // Callout attributes (e.g., Time, POV)
}

export const parseUniversalScenes = (textOrLines: string | string[]): UniversalScene[] => {
    const lines = Array.isArray(textOrLines) ? textOrLines : textOrLines.split("\n");
    const scenes: UniversalScene[] = [];
    let currentScene: UniversalScene | null = null;

    for (let i = 0; i < lines.length; i++) {
        const trimLine = lines[i].trim();

        // Once a scene marker is found, immediately use our previously written utility functions to extract all data!
        if (trimLine.startsWith("######")) {
            currentScene = {
                lineIndex: i,
                rawHeader: trimLine,
                title: cleanSceneTitle(trimLine),
                id: extractSceneId(trimLine),
                colorId: extractSceneColor(trimLine),
                meta: []
            };
            scenes.push(currentScene);
        }
        // Collect attributes
        else if (currentScene && trimLine.startsWith(">")) {
            currentScene.meta.push(trimLine);
        }
        // Leave the attribute block, stop collecting
        else if (currentScene && !trimLine.startsWith(">") && trimLine !== "") {
            currentScene = null;
        }
    }
    return scenes;
};

// ============================================================
// 🛠️ Universal Action Utilities
// ============================================================

// 1. Silent replacement (Protects Ctrl+Z)
export const replaceEntireDocument = (editor: Editor, newContent: string) => {
    const lastLine = editor.lineCount() - 1;
    const lineText = editor.getLine(lastLine);
    const lastCh = lineText.length;

    editor.replaceRange(newContent, { line: 0, ch: 0 }, { line: lastLine, ch: lastCh });
};

// 2. Unified ID Generator
export const generateSceneId = (): string => {
    return crypto.randomUUID().substring(0, 12);
};

// 3. Archived Draft Detector
export const isScriveningsDraft = (content: string, fileName: string = ""): boolean => {
    return fileName === DRAFT_FILENAME || content.includes('++ FILE_ID:') || content.includes('## 📜');
};


/**
 * Official Icon 
 * @param parent e.g topBtnRow
 * @param iconName Lucide Icon 
 * @param text 
 * @param extraStyles 
 * @returns HTMLButtonElement
 */
export function createIconButton(
    parent: HTMLElement,
    iconName: string,
    text: string,
    extraStyles?: Record<string, string>
): HTMLButtonElement {
    const btn = parent.createEl("button");

    // Flex center
    let styles: Record<string, string> = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px"
    };

    // combine extra style
    if (extraStyles) {
        styles = { ...styles, ...extraStyles };
    }

    btn.setCssStyles(styles);
    setIcon(btn, iconName);
    btn.createSpan({ text: text });

    return btn;
}

// ============================================================
// 📁 Global File Scanner (Strict Current Folder Scope)
// ============================================================
export const getManuscriptFiles = (app: App, targetFolderPath: string, exportFolderPath?: string): TFile[] => {
    if (!targetFolderPath) return [];

    return app.vault.getMarkdownFiles()
        .filter(f => {
            // 🌟 嚴格鎖定：只掃描「當前筆記所在」嘅同一層資料夾，唔會跨越去其他部曲！
            if (f.parent?.path !== targetFolderPath) return false;

            if (f.name.startsWith("_") || f.name.startsWith("Script_")) return false;
            if (f.name === DRAFT_FILENAME) return false;
            if (exportFolderPath && f.path.startsWith(exportFolderPath)) return false;
            return true;
        })
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
};