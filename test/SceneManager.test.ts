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


    // =========================================================
    // 🛡️ 測試四：標題治癒引擎 (Title Healer) 極限測試
    // =========================================================
    test('executeAssignIDsSilent - 標題治癒引擎：清理各種殘骸，拯救錯位文字', () => {
        // 準備各種被用家「暴力破壞」的極端情況
        fakeEditor.lines = [
            '###### 場景A <span class="ns-i',           // 情況 1：刪除結尾
            '###### 場景B class="ns-id" data-scene-',   // 情況 2：刪除開頭的 <span
            '###### 場景C <span class="ns-id" ></span>',// 情況 3：刪除了中間的 UUID
            '###### 場景D data-warning="⛔️ ID',         // 情況 4：剩下後半截
            '###### 標題E <span class="ns-id" data-scene-id="abc-123" data-warning="⛔️ ID (Do not edit)"></span>這是我新加的字', // 情況 5：文字被擠到 </span> 後面
            // 🌟 情況 6：極端亂碼破壞測試 (完全模擬真實報錯)
            '###### 莉安娜帶着艾莉亞逃亡ofodjfodjfodjfodjnd="07644160-25f" data-warning="⛔️ ID (Do not edit)"> </span>'
        ];

        jest.spyOn(manager, 'scheduleGenerateDatabase').mockImplementation();

        // 執行標題治癒與 ID 派發
        manager.executeAssignIDsSilent(fakeView as any);

        // 獲取修改後寫入編輯器的內容
        const newContent = fakeEditor.replaceRange.mock.calls[0][0];

        // 1-4. 驗證所有垃圾殘骸都被清得一乾二淨，並補上全新 ID
        expect(newContent).toContain('###### 場景A <span class="ns-id" data-scene-id="uuid-1-00000"');
        expect(newContent).toContain('###### 場景B <span class="ns-id" data-scene-id="uuid-2-00000"');
        expect(newContent).toContain('###### 場景C <span class="ns-id" data-scene-id="uuid-3-00000"');
        expect(newContent).toContain('###### 場景D <span class="ns-id" data-scene-id="uuid-4-00000"');

        // 5. 驗證被擠到後面的文字成功搬回前面 (保留原本的 ID abc-123，因為 ID 冇爛)
        expect(newContent).toContain('###### 標題E這是我新加的字 <span class="ns-id" data-scene-id="abc-123"');

        // 🌟 6. 驗證極端亂碼被切走！系統認出 d="07644..." 係 UUID 殘骸，從亂碼開頭一刀切！
        // 留意：因為 5 號標題保留咗舊 ID，所以 6 號標題會獲派 uuid-5-00000
        expect(newContent).toContain('###### 莉安娜帶着艾莉亞逃亡 <span class="ns-id" data-scene-id="uuid-5-00000"');

        // 🛡️ 最終斷言：確保冇任何代碼殘骸留低喺畫面上
        expect(newContent).not.toMatch(/ns-i\b/);
        expect(newContent).not.toMatch(/data-scene-$/);

    });




});