import { HistoryManager } from '../src/managers/HistoryManager';

// =========================================================
// 🎭 1. 假扮 Obsidian API 同埋 Modals
// =========================================================
jest.mock('obsidian', () => ({
    App: jest.fn(),
    Notice: jest.fn(),
    TFile: jest.fn(),
    MarkdownView: jest.fn(),
}), { virtual: true });

jest.mock('../src/modals', () => ({
    InputModal: jest.fn(),
    GenericSuggester: jest.fn()
}), { virtual: true });

describe('HistoryManager - 原子化備份與還原測試', () => {
    let app: any;
    let settings: any;
    let manager: HistoryManager;
    let fakeEditor: any;

    beforeEach(() => {
        // 🔥 統一時間與全域變數設定
        (global as any).window = global;
        (global as any).window.moment = () => ({ format: () => '2026-03-06 12:00:00' });

        app = {
            vault: { read: jest.fn(), modify: jest.fn(), create: jest.fn(), getAbstractFileByPath: jest.fn() },
            workspace: { getActiveViewOfType: jest.fn() }
        };
        settings = { bookFolderPath: 'MyBook', exportFolderPath: 'Output' };
        manager = new HistoryManager(app, settings);

        // 🛠️ 準備一個超級假編輯器 (Fake Editor) 模擬 Obsidian 嘅行為
        fakeEditor = {
            lines: [] as string[],
            cursorLine: 0,
            getCursor: function () { return { line: this.cursorLine, ch: 0 }; },
            lineCount: function () { return this.lines.length; },
            getLine: function (i: number) { return this.lines[i] || ""; },
            getValue: function () { return this.lines.join('\n'); },
            getRange: function (start: any, end: any) {
                return this.lines.slice(start.line, end.line).join('\n');
            },
            replaceRange: jest.fn() // 攔截替換動作嚟做檢查
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =========================================================
    // 🛡️ 測試一：游標定位雷達
    // =========================================================
    test('getSceneInfoAtCursor - 應該準確偵測游標所在場景嘅範圍同 ID', () => {
        fakeEditor.lines = [
            "引言...",                                                                    // Line 0
            '###### 第一場戲 <span class="ns-id" data-scene-id="uuid-111"></span>',       // Line 1 (場景 1 開始)
            "> [!NSmith]",                                                                // Line 2
            "第一場戲內文",                                                               // Line 3
            '###### 🎬 第二場戲 <span class="ns-id" data-scene-id="uuid-222"></span>',    // Line 4 (場景 2 開始)
            "第二場戲內文"                                                                // Line 5
        ];

        // 模擬用家將游標放喺「第一場戲」嘅內文 (Line 3)
        fakeEditor.cursorLine = 3;

        const sceneInfo = manager.getSceneInfoAtCursor(fakeEditor);

        expect(sceneInfo).not.toBeNull();
        expect(sceneInfo?.id).toBe('uuid-111'); // 必須成功認出係第一場戲
        expect(sceneInfo?.title).toBe('第一場戲');
        expect(sceneInfo?.startLine).toBe(1); // 標題喺 Line 1
        expect(sceneInfo?.endLine).toBe(4);   // 邊界應該去到下一場戲嘅標題 (Line 4)
    });

    // =========================================================
    // 🛡️ 測試二：原子化完美還原 (縫合手術)
    // =========================================================
    test('performRestore - 應該保留目前的 Callout 屬性，並替換正文', () => {
        // 模擬目前編輯器入面嘅內容（用家最近改過 POV 屬性，但內文寫壞咗）
        fakeEditor.lines = [
            '###### 目標場景 <span class="ns-id" data-scene-id="uuid-999"></span>',
            "> [!NSmith-red] Scene Info",
            "> - POV:: 已經改成反派視角",
            "",
            "這是一段寫壞了的糟糕內文...",
            "###### 下一個場景"
        ];

        // 指定要還原嘅範圍 (Line 1 到 Line 5)
        const sceneRange = { startLine: 0, endLine: 5 };

        // 模擬從備份檔抽出來嘅「舊版優質內文」
        const backupContent = "這是從前寫的優質內文，我要復活它！";

        // 執行還原手術
        manager.performRestore(fakeEditor, sceneRange, backupContent);

        // 檢查 replaceRange 有冇被呼叫
        expect(fakeEditor.replaceRange).toHaveBeenCalled();

        // 抽出寫入嘅最終內容
        const finalBlock = fakeEditor.replaceRange.mock.calls[0][0];

        // 🕵️‍♂️ 斷言：驗證縫合結果！
        expect(finalBlock).toContain("> - POV:: 已經改成反派視角"); // 必須保留目前嘅最新屬性！
        expect(finalBlock).toContain(backupContent); // 必須成功注入備份嘅正文！
        expect(finalBlock).not.toContain("寫壞了的糟糕內文"); // 寫壞嘅內文必須被清走！
    });

});