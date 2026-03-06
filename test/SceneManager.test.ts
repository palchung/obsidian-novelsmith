import { SceneManager } from '../src/managers/SceneManager';
import { MarkdownView } from 'obsidian';

// =========================================================
// 🎭 1. 假扮 Obsidian API
// =========================================================
jest.mock('obsidian', () => ({
    App: jest.fn(),
    Notice: jest.fn(),
    TFile: jest.fn(),
    TFolder: jest.fn(),
    MarkdownView: jest.fn(),
    moment: () => ({ format: () => '2026-03-06 12:00:00' })
}), { virtual: true });

// 假扮對話框
jest.mock('../src/modals', () => ({
    SimpleConfirmModal: jest.fn()
}), { virtual: true });

describe('SceneManager - 防禦陣地與效能測試', () => {
    let app: any;
    let settings: any;
    let manager: SceneManager;
    let fakeEditor: any;
    let fakeView: any;

    beforeEach(() => {
        // 🔥 修正 1：確保 UUID 長度啱啱好係 12 個字元，唔會被切崩
        let uuidCounter = 0;
        Object.defineProperty(global, 'crypto', {
            value: { randomUUID: jest.fn(() => `uuid-${++uuidCounter}-00000`) },
            configurable: true
        });

        // 🔥 修正 2：讓 window 直接等同於 global，等 Jest 嘅時光機可以完美接管！
        (global as any).window = global;
        (global as any).window.moment = () => ({ format: () => '2026-03-06 12:00:00' });

        app = {
            vault: { read: jest.fn(), modify: jest.fn(), getAbstractFileByPath: jest.fn(), getMarkdownFiles: jest.fn(() => [] as any[]) },
            workspace: { getActiveFile: jest.fn(), getActiveViewOfType: jest.fn() }
        };
        settings = { bookFolderPath: 'MyBook', exportFolderPath: 'Output' };
        manager = new SceneManager(app, settings);

        // 🛠️ 準備一個可以操作字串嘅假編輯器 (Fake Editor)
        fakeEditor = {
            lines: [] as string[],
            lineCount: function () { return this.lines.length; },
            getLine: function (i: number) { return this.lines[i]; },
            replaceRange: jest.fn(), // 我哋會攔截呢個動作嚟檢查結果
            getValue: function () { return this.lines.join('\n'); }
        };

        fakeView = {
            editor: fakeEditor,
            file: { path: 'MyBook/Chapter1.md' }
        };
    });

    afterEach(() => {
        jest.useRealTimers(); // 確保每次跑完測試都還原時間，唔好影響其他測試
        jest.restoreAllMocks();
    });

    // =========================================================
    // 🛡️ 測試一：精準派發 ID
    // =========================================================
    test('executeAssignIDsSilent - 應該幫冇 ID 嘅場景派發新 ID', () => {
        // 準備兩行冇 ID 嘅場景標題
        fakeEditor.lines = [
            "###### 第一場戲",
            "這是一段內文",
            "###### 🎬 第二場戲"
        ];

        // 攔截 database 生成，我哋呢個 test 專注測試 ID 派發
        jest.spyOn(manager, 'scheduleGenerateDatabase').mockImplementation();

        // 執行目標函數
        manager.executeAssignIDsSilent(fakeView as any);

        // 檢查有冇觸發寫入動作
        expect(fakeEditor.replaceRange).toHaveBeenCalled();
        const newContent = fakeEditor.replaceRange.mock.calls[0][0];

        // 驗證係咪派發咗兩個新嘅 ID
        expect(newContent).toContain('data-scene-id="uuid-1-00000"');
        expect(newContent).toContain('data-scene-id="uuid-2-00000"');
    });

    // =========================================================
    // 🛡️ 測試二：防 Copy & Paste 撞 ID
    // =========================================================
    test('executeAssignIDsSilent - 應該精準攔截重複 ID (防 Copy & Paste)', () => {
        // 模擬用家 Copy & Paste 搞到有兩個 DUP-123
        fakeEditor.lines = [
            '###### 場景A <span class="ns-id" data-scene-id="DUP-123"></span>',
            '內文A',
            '###### 場景B <span class="ns-id" data-scene-id="DUP-123"></span>'
        ];

        jest.spyOn(manager, 'scheduleGenerateDatabase').mockImplementation();

        manager.executeAssignIDsSilent(fakeView as any);

        const newContent = fakeEditor.replaceRange.mock.calls[0][0];

        // 1. 第一個 DUP-123 應該保留 (先到先得)
        expect(newContent).toContain('data-scene-id="DUP-123"');

        // 2. 第二個 DUP-123 應該被替換成新嘅 UUID
        expect(newContent).toContain('data-scene-id="uuid-1-00000"');

        // 3. 確保 DUP-123 淨係出現一次！(如果多過一次代表冇換走)
        const matchCount = (newContent.match(/DUP-123/g) || []).length;
        expect(matchCount).toBe(1);
    });

    // =========================================================
    // ⏱️ 測試三：效能防禦 (Debounce)
    // =========================================================
    test('scheduleGenerateDatabase - 應該成功防禦「狂撳」，完美執行 Debounce', () => {
        // 啟動 Jest 嘅時間機器！
        jest.useFakeTimers();

        // 攔截底層生成函數，我哋只關心佢被呼叫咗幾次
        const generateSpy = jest.spyOn(manager as any, 'generateDatabase').mockResolvedValue(undefined);

        // 模擬用家瘋狂打字，連續觸發 3 次
        manager.scheduleGenerateDatabase(1500);
        jest.advanceTimersByTime(500); // 模擬時間過咗 0.5 秒

        manager.scheduleGenerateDatabase(1500);
        jest.advanceTimersByTime(500); // 又過咗 0.5 秒

        manager.scheduleGenerateDatabase(1500);

        // 呢個時候，時間總共過咗 1 秒。因為每次呼叫都會 reset timer，所以生成函數應該【一次都未被執行】！
        expect(generateSpy).not.toHaveBeenCalled();

        // 快轉時間，直到最後一次呼叫之後嘅 1.5 秒
        jest.advanceTimersByTime(1500);

        // 斷言：無論頭先撳咗幾多次，最終都只會執行【1 次】！
        expect(generateSpy).toHaveBeenCalledTimes(1);
    });
});