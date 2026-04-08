import { WritingManager } from '../src/managers/WritingManager';
import { TFile } from 'obsidian';


// =========================================================
// 🎭 1. 假扮 Obsidian API 同 Utils
// =========================================================
jest.mock('obsidian', () => ({
    App: jest.fn(),
    Notice: jest.fn(),
    MarkdownView: jest.fn(),
    TFile: class { }
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
            vault: {
                modify: jest.fn().mockResolvedValue(undefined),// 🌟 補返假嘅寫入檔案功能
                cachedRead: jest.fn(), // 🌟 3. 補返 cachedRead (對應我哋嘅慳電優化)
                getAbstractFileByPath: jest.fn() // 🌟 補返 getAbstractFileByPath
            }
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


    test('correctNames - 應該精準改錯字，並完美啟動「面具魔法」保護 URL 與 Code Block', async () => {
        // 1. 模擬 FixList.md 嘅內容
        const fakeFixList = "// 錯字表\nJonathan | Jon, John\nHogwarts | Hogwart";

        // 🌟 4. 製造一個假嘅 TFile 實體畀系統，咁 instanceof 就會 Pass！
        const fakeFile = new TFile();
        app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(fakeFile);

        // 🌟 5. 確保呢度係 mock `cachedRead` 而唔係 `read`
        app.vault.cachedRead = jest.fn().mockResolvedValue(fakeFixList);

        // 2. 準備極限陷阱原稿
        const rawContent = `
Jon 去了 Hogwart。
請參考網址：https://john.com/jon-page
或者執行代碼 \`console.log("Jon");\`
> - POV:: John
`;
        fakeView.editor.getValue.mockReturnValue(rawContent);

        // 3. 執行改名
        await manager.correctNames(fakeView);

        expect(app.vault.modify).toHaveBeenCalled();
        const finalContent = app.vault.modify.mock.calls[0][1];

        // 🕵️‍♂️ 斷言：正文嘅錯字必須被改
        expect(finalContent).toContain('Jonathan 去了 Hogwarts。');

        // 🛡️ 防彈斷言：URL 絕對唔可以被改！
        expect(finalContent).toContain('https://john.com/jon-page');

        // 🛡️ 防彈斷言：Code Block 絕對唔可以被改！
        expect(finalContent).toContain('`console.log("Jon");`');

        // 🛡️ 防彈斷言：系統屬性 (Callout) 絕對唔可以被改！
        expect(finalContent).toContain('> - POV:: John');
    });






});