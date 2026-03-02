import { App, setIcon } from 'obsidian';

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
export const RE_SCENE_INFO = /^###### .*[\r\n]+(> .*[\r\n]*)*/gm;
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
    headers: string;
    cards: DraftCard[];
}

// 3. Header Cleaning Function (Removes Markdown symbols and ID tags)
export const normalizeHeader = (header: string): string => {
    // 🔥 Reuse our newly written ultimate cleaning function to ensure 100% consistent logic system-wide!
    return cleanSceneTitle(header);
};

// 4. Core Parser
export const parseContent = (text: string, isOriginal: boolean = false): ParseResult => {
    const lines = text.split("\n");
    const cards: DraftCard[] = [];
    let currentHeaderRaw: string | null = null;
    let currentBodyLines: string[] = [];
    let currentMeta: string[] = [];
    const fileHeaders: string[] = [];
    let isCollectingMeta = false;
    let hasHitFirstCard = false;

    const flushCard = () => {
        if (currentHeaderRaw) {
            let cleanBody = currentBodyLines.join("\n").trim();

            if (!isOriginal) {
                cleanBody = cleanBody.replace(RE_HIGHLIGHT, "").replace(RE_SEPARATOR, "");
                const tempLines = cleanBody.split("\n");
                while (tempLines.length > 0) {
                    const l = tempLines[0].trim();
                    if (l.startsWith(">")) tempLines.shift();
                    else break;
                }
                cleanBody = tempLines.join("\n").trimEnd();
            } else {
                // 🔥 Original manuscript also switched to trimEnd()
                cleanBody = cleanBody.trimEnd();
            }

            // 🔥 Attempt to extract ID
            const idMatch = currentHeaderRaw.match(RE_EXTRACT_ID);
            const id = idMatch ? idMatch[1].trim() : undefined;

            cards.push({
                key: normalizeHeader(currentHeaderRaw),
                id: id, // 🔥 Store ID
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
                // 🔥 P0 Fix: Accurately identify attributes to protect body text's Blockquote!
                if (trimLine.startsWith("> [!NSmith") || trimLine.startsWith("> [!info") || trimLine.startsWith("> -") || trimLine === ">") {
                    currentMeta.push(line);
                } else if (trimLine === "") {
                    // Skip blank lines between attributes and body text, but do not treat them as body text
                } else {
                    isCollectingMeta = false;
                    currentBodyLines.push(line);
                }
            } else {
                currentBodyLines.push(line);
            }
        } else {
            if (trimLine !== "") fileHeaders.push(line);
        }
    }
    flushCard();
    return { headers: fileHeaders.join("\n"), cards: cards };
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
    { id: "default", icon: "⚪️", name: "Default (Colorless)", cssClass: "ns-color-grey" },
    { id: "red", icon: "🔴", name: "Red (Conflict/Villain)", cssClass: "ns-color-red" },
    { id: "orange", icon: "🟠", name: "Orange (Slice of Life/Suspense)", cssClass: "ns-color-orange" },
    { id: "green", icon: "🟢", name: "Green (Growth/Supporting)", cssClass: "ns-color-green" },
    { id: "blue", icon: "🔵", name: "Blue (Calm/Protagonist)", cssClass: "ns-color-blue" },
    { id: "purple", icon: "🟣", name: "Purple (Mystery/Magic)", cssClass: "ns-color-purple" },
    //{ id: "grey", icon: "🟤", name: "Grey (Memory/Transition)", cssClass: "ns-color-grey" }
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const replaceEntireDocument = (editor: any, newContent: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const lastLineRaw = editor.lineCount();
    const lastLine = Number(lastLineRaw) - 1;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const lineTextRaw = editor.getLine(lastLine);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const lastCh = Number(lineTextRaw.length);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
