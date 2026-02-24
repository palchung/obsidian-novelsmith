import { TFile } from 'obsidian';

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
    // 先移除 ID 標籤
    let clean = header.replace(RE_SCENE_ID, "");
    // 再移除 # 和空格
    return clean.replace(RE_HEADER_CLEAN, "").trim();
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
                cleanBody = cleanBody.replace(RE_HIGHLIGHT, "").replace(RE_SEPARATOR, "").trim();
                let tempLines = cleanBody.split("\n");
                while (tempLines.length > 0) {
                    const l = tempLines[0].trim();
                    if (l.startsWith(">") || l === "") tempLines.shift();
                    else break;
                }
                cleanBody = tempLines.join("\n").trim();
            }

            // 🔥 嘗試提取 ID
            const idMatch = currentHeaderRaw.match(RE_SCENE_ID);
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
                if (trimLine.startsWith(">") || trimLine.includes("::") || trimLine === "") {
                    currentMeta.push(line);
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