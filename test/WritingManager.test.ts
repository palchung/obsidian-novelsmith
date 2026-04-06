import { WritingManager } from '../src/managers/WritingManager';



// =========================================================
// 🎭 1. 假扮 Obsidian API 同 Utils
// =========================================================
jest.mock('obsidian', () => ({
    App: jest.fn(),
    Notice: jest.fn(),
    MarkdownView: jest.fn(),
}), { virtual: true });

// 🔥 假扮 Utils 嘅 replaceEntireDocument (我哋要攔截佢嚟檢查最終結果)
jest.mock('../src/utils', () => ({
    replaceEntireDocument: jest.fn(),
    ensureFolderExists: jest.fn(),
    AIDS_DIR: 'Aids'
}), { virtual: true });

// 🔥 假扮對話框：設定當 CleanDraftModal 打開時，自動「剔晒所有選項」並執行
jest.mock('../src/modals', () => ({
    CleanDraftModal: jest.fn().mockImplementation((app, callback) => ({
        open: () => {
            callback({
                removeComments: true,
                removeStrikethrough: true,
                removeHighlights: true,
                removeInternalLinks: true
            });
        }
    }))
}), { virtual: true });

describe('WritingManager - 編輯器大掃除 (Clean Draft)', () => {
    let app: any;
    let settings: any;
    let manager: WritingManager;
    let fakeView: any;

    beforeEach(() => {
        app = {
            workspace: { iterateAllLeaves: jest.fn() },
            vault: { modify: jest.fn().mockResolvedValue(undefined) } // 🌟 補返假嘅寫入檔案功能
        };
        settings = { bookFolderPath: 'MyBook' };
        manager = new WritingManager(app, settings);

        // 🌟 更新呢個假編輯器，補返 getScrollInfo 同 scrollTo 畀佢！
        fakeView = {
            file: { name: 'test.md' },
            editor: {
                getValue: jest.fn(),
                getScrollInfo: jest.fn().mockReturnValue({ left: 0, top: 0 }),
                scrollTo: jest.fn(),
                cm: { dispatch: jest.fn() } // 順便加埋 cm 防呆
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================
    // 🛡️ 測試：精準大掃除與圖片保護機制
    // =========================================================
    test('cleanDraft - 應該根據選項清走標記，並完美保護 ![[圖片]] 不被誤傷', () => {
        // 1. 準備一份充滿雜質，而且有陷阱 (圖片) 嘅草稿
        const rawContent = `
這是一段正常文字。
%% 這是草稿註解 %%
這是 ~~被刪除~~ 的內容。
這是 ==高光== 重點。
主角去了 [[霍格華茲|魔法學校]] 上學。
請看這張地圖：![[地圖.png]]
`;
        fakeView.editor.getValue.mockReturnValue(rawContent);

        // 2. 執行一鍵大掃除
        manager.cleanDraft(fakeView);

        // 3. 檢查系統有冇觸發底層寫入 (modify)
        expect(app.vault.modify).toHaveBeenCalled();

        // 抽出準備寫入檔案嘅最終內容 (modify 嘅第二個參數)
        const finalContent = app.vault.modify.mock.calls[0][1];

        // ==========================================
        // 🕵️‍♂️ 斷言：驗證 Regex 魔法！
        // ==========================================

        // 基本清理
        expect(finalContent).not.toContain('%% 這是草稿註解 %%');
        expect(finalContent).not.toContain('~~被刪除~~');
        expect(finalContent).not.toContain('==高光==');
        expect(finalContent).toContain('高光 重點'); // 確保高光符號走咗，但字留低

        // 內部連結清理 (Aliased Link)
        expect(finalContent).not.toContain('[[霍格華茲|魔法學校]]');
        expect(finalContent).toContain('去了 魔法學校 上學'); // 確保只保留 Alias (別名)

        // 🔥 終極防禦測試：圖片必須原好無缺！
        expect(finalContent).toContain('![[地圖.png]]');
    });
});