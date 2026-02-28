import { TFile, App } from 'obsidian';

// ============================================================
// 🛠️ 工具箱：負責處理字串與解析
// ============================================================


// 1. 正規表達式 (Regex)
export const RE_HEADER_CLEAN = /^[#\s]+|^🎬\s*|^[-\.]\s*/g;
export const RE_HIGHLIGHT = /==/g;
export const RE_SEPARATOR = /%% - %%/g;
// 🔥 替換這三行：
export const RE_FILE_ID = /<span class="ns-file-id">\+\+ FILE_ID: (.*?) \+\+<\/span>/;
export const RE_FILE_ID_HEADING = /<span class="ns-file-id">\+\+ FILE_ID: .*? \+\+<\/span>/g;
export const ST_FILE_ID_HEADING = '<span class="ns-file-id">++ FILE_ID';
export const RE_FOLDER_HEADING = /^# 📄 .*$/gm;
export const RE_SCENE_TAG = /^######\s*/;
export const RE_SCENE_EMOJI = /^🎬\s*/;
// 標題 (ID 部分)
export const RE_SCENE_HEADER_HTML = /###### (.*?)( <!--|$)/;
export const RE_EXTRACT_ID = /(?:SCENE_ID:\s*|data-scene-id=")([a-zA-Z0-9-]+)/;
// 🔥 新增：讓全系統通用的 ID Regex
// 格式： 
export const RE_SCENE_INFO = /^###### 🎬 .*[\r\n]+(> .*[\r\n]*)*/gm;
export const RE_SCENE_ID = /<!-- SCENE_ID: (.*?) \|.*?-->/;
// 用於匹配標題行 (###### Title )
export const RE_SCENE_HEADER = /^(###### .*?)( )?$/;
// 用於匹配已經有 ID 的標題行
export const RE_SCENE_HEADER_ID = /^(###### .*?)( <!-- SCENE_ID: .*? -->)?$/;
// String HTML comment
export const ST_SCENE_ID_OP = ' <!-- SCENE_ID: ';
export const ST_SCENE_ID_CL = ' -->';
export const ST_WARNING = '⛔️ ID (勿改)';
export const ST_SCENE_TAG = '######';
export const ST_FILE_ID_HEADER = "++ FILE_ID";

// ============================================================
// 📂 系統常數 (System Constants) - 統一管理，杜絕魔法字串
// ============================================================
export const DRAFT_FILENAME = "NSmith_Scrivenering.md";
export const BACKSTAGE_DIR = "_Backstage";
export const TEMPLATES_DIR = `${BACKSTAGE_DIR}/Templates`;
export const DRAFTS_DIR = `${BACKSTAGE_DIR}/Drafts`;
export const HISTORY_DIR = `${BACKSTAGE_DIR}/History`;
export const AIDS_DIR = `${BACKSTAGE_DIR}/Aids`;
export const SCENE_DB_FILE = "_Scene_Database.md";

// ============================================================
// 🛠️ 共用工具函數 (Shared Utilities)
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
            try { await app.vault.createFolder(currentPath); } catch (e) { /* ignore */ }
        }
    }
};

// 2. 資料結構介面 (Interface)
export interface DraftCard {
    key: string;     // 舊：標題 (兼容用)
    id?: string;     // 🔥 新：唯一 ID
    rawHeader: string;
    meta: string[];
    body: string;
}

export interface ParseResult {
    headers: string;
    cards: DraftCard[];
}

// 3. 標題清洗函數 (移除 Markdown 符號及 ID 標籤)
export const normalizeHeader = (header: string): string => {
    // 🔥 直接重用我們剛寫好的終極清洗函數，確保全系統邏輯 100% 一致！
    return cleanSceneTitle(header);
};

// 4. 核心解析器 (Parser)
export const parseContent = (text: string, isOriginal: boolean = false): ParseResult => {
    const lines = text.split("\n");
    let cards: DraftCard[] = [];
    let currentHeaderRaw: string | null = null;
    let currentBodyLines: string[] = [];
    let currentMeta: string[] = [];
    let fileHeaders: string[] = [];
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
                // 🔥 原稿也改用 trimEnd()
                cleanBody = cleanBody.trimEnd();
            }

            // 🔥 嘗試提取 ID
            const idMatch = currentHeaderRaw.match(RE_EXTRACT_ID);
            const id = idMatch ? idMatch[1].trim() : undefined;

            cards.push({
                key: normalizeHeader(currentHeaderRaw),
                id: id, // 🔥 儲存 ID
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
                // 🔥 P0 修復：精準識別屬性，保護正文的 Blockquote！
                if (trimLine.startsWith("> [!NSmith") || trimLine.startsWith("> [!info") || trimLine.startsWith("> -") || trimLine === ">") {
                    currentMeta.push(line);
                } else if (trimLine === "") {
                    // 略過屬性與正文之間的空白行，但不當作正文
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
// 🔥 大師級重構：共用標題清理與 ID 抽取函數
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
// 🎨 大師級架構：全系統共用調色盤字典 (Single Source of Truth)
// ============================================================

export const RE_EXTRACT_COLOR = /data-color="([a-zA-Z0-9-]+)"/;

export const SCENE_COLORS = [
    { id: "default", icon: "⚪️", name: "預設 (無色)", cssClass: "ns-color-grey" },
    { id: "red", icon: "🔴", name: "紅色 (衝突/反派)", cssClass: "ns-color-red" },
    { id: "orange", icon: "🟠", name: "橙色 (日常/懸疑)", cssClass: "ns-color-orange" },
    { id: "green", icon: "🟢", name: "綠色 (成長/配角)", cssClass: "ns-color-green" },
    { id: "blue", icon: "🔵", name: "藍色 (冷靜/主角)", cssClass: "ns-color-blue" },
    { id: "purple", icon: "🟣", name: "紫色 (神秘/魔法)", cssClass: "ns-color-purple" },
    //{ id: "grey", icon: "🟤", name: "灰色 (回憶/過渡)", cssClass: "ns-color-grey" }
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
// 🚀 大師級架構：全域共用場景解析器 (Universal Scene Parser)
// ============================================================
export interface UniversalScene {
    lineIndex: number;      // 標題所在的行數
    rawHeader: string;      // 原始標題文字
    title: string;          // 乾淨的標題名
    id: string | null;      // 身份證 ID
    colorId: string;        // 顏色 ID
    meta: string[];         // Callout 屬性 (例如 Time, POV)
}

export const parseUniversalScenes = (textOrLines: string | string[]): UniversalScene[] => {
    const lines = Array.isArray(textOrLines) ? textOrLines : textOrLines.split("\n");
    const scenes: UniversalScene[] = [];
    let currentScene: UniversalScene | null = null;

    for (let i = 0; i < lines.length; i++) {
        const trimLine = lines[i].trim();

        // 一旦發現場景標記，立刻用我哋之前寫好嘅工具函數抽齊所有資料！
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
        // 收集屬性
        else if (currentScene && trimLine.startsWith(">")) {
            currentScene.meta.push(trimLine);
        }
        // 離開屬性區塊，停止收集
        else if (currentScene && !trimLine.startsWith(">") && trimLine !== "") {
            currentScene = null;
        }
    }
    return scenes;
};

// ============================================================
// 🛠️ 全域通用動作 (Universal Action Utilities)
// ============================================================

// 1. 無痕替換 (保護 Ctrl+Z)
export const replaceEntireDocument = (editor: any, newContent: string) => {
    const lastLine = editor.lineCount() - 1;
    const lastCh = editor.getLine(lastLine).length;
    editor.replaceRange(newContent, { line: 0, ch: 0 }, { line: lastLine, ch: lastCh });
};

// 2. 統一 ID 生成器
export const generateSceneId = (): string => {
    return crypto.randomUUID().substring(0, 12);
};

// 3. 封存草稿偵測器
export const isScriveningsDraft = (content: string, fileName: string = ""): boolean => {
    return fileName === DRAFT_FILENAME || content.includes('++ FILE_ID:') || content.includes('## 📜');
};