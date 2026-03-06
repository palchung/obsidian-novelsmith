import { CompilerManager } from '../src/managers/CompilerManager';
import { Modal, TFile } from 'obsidian';

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
    CompileModal: jest.fn(),
    ChapterSelectionModal: jest.fn()
}), { virtual: true });

describe('CompilerManager - 大清洗行動 (匯出編譯測試)', () => {
    let app: any;
    let settings: any;
    let manager: CompilerManager;

    beforeEach(() => {
        // 🔥 統一時間設定 (匯出檔案命名會用到)
        (global as any).window = global;
        (global as any).window.moment = () => ({ format: () => '20260306_120000' });

        app = {
            vault: {
                read: jest.fn(),
                create: jest.fn(),
                getAbstractFileByPath: jest.fn(),
                createFolder: jest.fn() // 👈 補番呢個畀 ensureFolderExists 用
            },
            workspace: { getActiveViewOfType: jest.fn(), openLinkText: jest.fn() },
            // 👈 補番 metadataCache，等系統識得切 YAML！
            metadataCache: {
                getFileCache: jest.fn().mockReturnValue({
                    frontmatterPosition: { start: { offset: 0 }, end: { offset: 19 } }
                })
            }
        };
        settings = { bookFolderPath: 'MyBook', exportFolderPath: 'Output' };
        manager = new CompilerManager(app, settings);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =========================================================
    // 🛡️ 測試：全方位 Regex 標記清除手術
    // =========================================================
    test('executeCompile - 應該根據選項精準清除所有標記，還原純淨文本', async () => {
        // 1. 準備一個有 Obsidian 血統嘅假檔案
        const fakeFile = new TFile() as any;
        fakeFile.name = 'Chapter1.md';
        fakeFile.basename = 'Chapter1';
        fakeFile.extension = 'md'; // 👈 加上呢行！賦予佢 MD 檔案嘅靈魂！

        // 2. 準備一份充滿「雜質」嘅原稿！
        const rawContent = `---
tags: novel
---
# 📄 Chapter1
<span class="ns-file-id">++ FILE_ID: Chapter1.md ++</span>
%% 這是一段不該被輸出的草稿註解 %%
###### 第一場戲 <span class="ns-id" data-scene-id="123"></span>
> [!NSmith]
> - POV:: Alice

這是一段被 ==高光== 標記的文字。
還有一些 ~~被刪除~~ 的段落。
這是需要合併的 **粗體字**。
主角走進了 [[魔法學院|霍格華茲]]。
結尾附帶一個標籤 #draft 。
`;

        // 告訴系統：讀檔嗰陣就回傳呢份原稿
        app.vault.read.mockResolvedValue(rawContent);

        // 3. 準備「全開」嘅編譯選項 (模擬用家全部剔晒)
        const options = {
            removeYaml: true,
            removeSceneInfo: true,
            removeComments: true,
            removeStrikethrough: true,
            mergeBold: true,
            removeHighlights: true,
            removeInternalLinks: true,
            insertFileNameAsHeading: 'none',
            hashtagAction: 'remove-all' // 連 tag 帶字一齊剷走
        } as any;

        // 4. 準備一個假 View 畀系統讀取 parentFolder.name
        const fakeView = {
            file: {
                parent: { name: 'Chapter1' }
            }
        };

        // 開動過濾機！(傳入 fakeView)
        await (manager as any).executeCompile(fakeView as any, [fakeFile], options);

        // 檢查有冇成功寫出檔案
        expect(app.vault.create).toHaveBeenCalled();

        // 抽出寫入嘅最終內容
        const createdPath = app.vault.create.mock.calls[0][0];
        const createdContent = app.vault.create.mock.calls[0][1];

        // 檢查匯出路徑同檔名係咪正確 (配合你嘅 _Export_ 命名邏輯)
        expect(createdPath).toBe('Output/Chapter1_Export_20260306_120000.md');

        // ==========================================
        // 🕵️‍♂️ 斷言：檢查係咪清得乾乾淨淨！
        // ==========================================

        // A. 系統標記必須強制移除 (無條件)
        expect(createdContent).not.toContain('++ FILE_ID');
        expect(createdContent).not.toContain('# 📄 Chapter1');
        expect(createdContent).not.toContain('data-scene-id="123"');

        // B. 用家選項清除測試
        expect(createdContent).not.toContain('tags: novel'); // YAML 必須消失
        expect(createdContent).not.toContain('%% 這是一段不該被輸出的草稿註解 %%'); // 註解必須消失
        expect(createdContent).not.toContain('###### 第一場戲'); // 場景卡標題消失
        expect(createdContent).not.toContain('> - POV:: Alice'); // Callout 消失

        // C. Regex 精準替換測試 (非常考驗技術)
        expect(createdContent).not.toContain('==高光==');
        expect(createdContent).toContain('被 高光 標記的文字'); // 符號要走，字要留低！(留意可能會有空格)

        expect(createdContent).not.toContain('~~被刪除~~'); // 刪除線成段字都要消失

        expect(createdContent).not.toContain('**粗體字**');
        expect(createdContent).toContain('合併的 粗體字'); // 星號要走，字要留低！

        expect(createdContent).not.toContain('[[魔法學院|霍格華茲]]');
        expect(createdContent).toContain('主角走進了 霍格華茲'); // 必須只保留 Display Name！

        expect(createdContent).not.toContain('#draft'); // Tag 必須完全消失
    });
});