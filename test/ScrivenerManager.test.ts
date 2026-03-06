import { ScrivenerManager } from '../src/managers/ScrivenerManager'; // 請確保路徑正確
import { DRAFT_FILENAME } from '../src/utils'; // 請確保路徑正確
import { TFile } from 'obsidian';

// 🔥 新增呢行：假扮 window.moment，等測試有固定時間！
(global as any).window = { moment: () => ({ format: () => '20260306_120000' }) };

// =========================================================
// 🎭 1. 假扮 (Mock) Obsidian API 同埋 Modals
// =========================================================
jest.mock('obsidian', () => ({
    App: jest.fn(),
    Notice: jest.fn(),
    TFile: jest.fn(),
    TFolder: jest.fn(),
    MarkdownView: jest.fn(),
}), { virtual: true });

// 假扮對話框，等測試唔會被彈出視窗卡住
jest.mock('../src/modals', () => ({
    ChapterSelectionModal: jest.fn(),
    SimpleConfirmModal: jest.fn()
}), { virtual: true });

describe('ScrivenerManager - 核心串聯與同步測試', () => {
    let app: any;
    let settings: any;
    let manager: ScrivenerManager;

    // =========================================================
    // 🛠️ 2. 每次測試前，重新佈置一個乾淨嘅「假 Obsidian 環境」
    // =========================================================
    beforeEach(() => {
        // 設定假嘅 App 內部結構 (Vault, Workspace, FileManager)
        app = {
            vault: {
                read: jest.fn(),
                modify: jest.fn(),
                create: jest.fn(),
                getAbstractFileByPath: jest.fn()
            },
            workspace: {
                getActiveViewOfType: jest.fn(),
                getLeaf: jest.fn().mockReturnValue({ openFile: jest.fn(), detach: jest.fn() })
            },
            fileManager: {
                trashFile: jest.fn(),
                renameFile: jest.fn()
            },
            metadataCache: {
                getFileCache: jest.fn()
            }
        };

        settings = {
            bookFolderPath: 'MyBook',
            keepDraftOnSync: false
        };

        // 實例化你要測試嘅 Manager
        manager = new ScrivenerManager(app, settings);
    });

    // =========================================================
    // 🧪 3. 正式測試案例
    // =========================================================

    test('discardDraft - 應該要成功刪除草稿檔案並關閉視窗', async () => {
        // 準備假檔案同假視窗
        const fakeDraftFile = { path: `MyBook/_Backstage/Drafts/${DRAFT_FILENAME}` };
        const fakeLeaf = { detach: jest.fn() };

        // 告訴系統：當你問「依家打開緊咩畫面？」嗰陣，答佢「打開緊草稿」
        app.workspace.getActiveViewOfType.mockReturnValue({
            file: fakeDraftFile,
            leaf: fakeLeaf
        });

        // 執行目標函數
        await manager.discardDraft(fakeDraftFile as any);

        // 斷言 (Assert)：檢查系統有冇執行我哋預期嘅動作！
        expect(fakeLeaf.detach).toHaveBeenCalled(); // 有冇關閉視窗？
        expect(app.fileManager.trashFile).toHaveBeenCalledWith(fakeDraftFile); // 有冇將檔案掉落垃圾桶？
    });

    test('compileDraft - 應該正確組合多個檔案，隱藏 YAML 並保留引言', async () => {
        const fakeFolder = { name: '第一章', path: 'MyBook/第一章' };
        const file1 = { name: 'Scene1.md' };
        const file2 = { name: 'Scene2.md' };

        // 告訴系統：當你讀取 Scene1 嗰陣俾呢段字佢，讀 Scene2 俾另一段
        app.vault.read.mockImplementation(async (file: any) => {
            if (file.name === 'Scene1.md') return "---\ntags: novel\n---\n我是被保留的引言\n###### 第一場戲\n內文1";
            if (file.name === 'Scene2.md') return "###### 第二場戲\n內文2";
            return "";
        });


        // 🔥 新增：告訴系統 Scene1 有 YAML 要切走！(19 係嗰段 YAML 字串嘅長度)
        app.metadataCache.getFileCache.mockImplementation((file: any) => {
            if (file.name === 'Scene1.md') {
                return {
                    frontmatterPosition: {
                        start: { offset: 0 },
                        end: { offset: 19 }
                    }
                };
            }
            return null; // Scene2 冇 YAML
        });

        // 告訴系統：硬碟入面暫時未有舊草稿
        app.vault.getAbstractFileByPath.mockReturnValue(null);

        // 執行建立草稿！
        await manager.compileDraft(fakeFolder as any, [file1, file2] as any[], '', '');

        // 斷言 (Assert)：檢查 vault.create 有冇被正確呼叫
        expect(app.vault.create).toHaveBeenCalled();

        // 抽出 vault.create 被呼叫時傳入嘅參數 (路徑同埋寫入嘅內容)
        const createCallArgs = app.vault.create.mock.calls[0];
        const createdPath = createCallArgs[0];
        const createdContent = createCallArgs[1];

        // 1. 檢查路徑啱唔啱
        expect(createdPath).toBe(`MyBook/第一章/${DRAFT_FILENAME}`);
        // 2. 檢查標題同 FILE_ID 齊唔齊
        expect(createdContent).toContain('## 📜 Scrivenering mode：第一章');
        expect(createdContent).toContain('++ FILE_ID: Scene1.md ++');
        expect(createdContent).toContain('++ FILE_ID: Scene2.md ++');
        // 3. 檢查分離與保護機制 (有冇切走 YAML？有冇保留引言？)
        expect(createdContent).not.toContain('tags: novel'); // YAML 必須消失！
        expect(createdContent).toContain('我是被保留的引言'); // 引言必須存在！
        expect(createdContent).toContain('###### 第一場戲');
    });
    // =========================================================
    // 👑 終極測試：syncBack 無狀態同步引擎
    // =========================================================

    test('syncBack - 應該完美執行「無狀態同步」，精準組合 YAML、新引言與新內文', async () => {
        // 🔥 解決方法：用 new TFile() 生一個有 Obsidian 血統嘅替身！
        const fakeSceneFile = new TFile() as any;
        fakeSceneFile.name = 'Scene1.md';
        fakeSceneFile.extension = 'md';

        // 1. 準備假資料夾同檔案結構
        const fakeFolder = {
            name: '第一章',
            path: 'MyBook/第一章',
            children: [fakeSceneFile] // 👈 放個真・替身入去
        };
        const fakeDraftFile = { path: `MyBook/第一章/${DRAFT_FILENAME}`, name: DRAFT_FILENAME, basename: 'NSmith_Scrivenering' };


        // 2. 準備假草稿內容 (模擬用家喺草稿入面大改特改)
        const fakeDraftContent = `
## 📜 Scrivenering mode：第一章

# 📄 Scene1.md
<span class="ns-file-id">++ FILE_ID: Scene1.md ++</span>

這是我在草稿裡寫的【新引言】！

###### 第一場戲 <span class="ns-id" data-scene-id="uuid-123"></span>
> [!NSmith]
> - POV:: Alice

這是我在草稿裡寫的【新內文】！
`;

        // 3. 準備假原始檔案內容 (模擬硬碟入面原本嘅狀態，包含 YAML)
        const fakeOriginalContent = `---
tags: novel
---
舊引言
###### 第一場戲 <span class="ns-id" data-scene-id="uuid-123"></span>
> [!NSmith]
> - POV:: Alice

舊內文`;

        // 4. 告訴系統：讀取草稿同原始檔案時，分別回傳以上嘅假內容
        app.vault.read.mockImplementation(async (file: any) => {
            if (file.name === DRAFT_FILENAME) return fakeDraftContent;
            if (file.name === 'Scene1.md') return fakeOriginalContent;
            return ""; // 其他檔案 (如 template) 回傳空
        });

        // 5. 告訴系統 Scene1 有 YAML 要保護
        app.metadataCache.getFileCache.mockImplementation((file: any) => {
            if (file.name === 'Scene1.md') return { frontmatterPosition: { start: { offset: 0 }, end: { offset: 19 } } };
            return null;
        });

        // 🚀 執行終極同步！
        await manager.syncBack(fakeDraftFile as any, fakeFolder as any);

        // ==========================================
        // 🕵️‍♂️ 斷言 (Assert)：檢查合體結果係咪 100% 完美
        // ==========================================

        // 檢查有冇觸發寫入檔案 (modify)
        expect(app.vault.modify).toHaveBeenCalled();

        // 抽出寫入檔案時傳入嘅參數
        const modifyCallArgs = app.vault.modify.mock.calls[0];
        const modifiedFile = modifyCallArgs[0];
        const finalContent = modifyCallArgs[1];

        // 確保修改嘅係 Scene1.md
        expect(modifiedFile.name).toBe('Scene1.md');

        // 🔥 驗證合體結果！
        expect(finalContent).toContain('tags: novel'); // 必須成功將 YAML 復活！
        expect(finalContent).toContain('這是我在草稿裡寫的【新引言】！'); // 必須採用新引言
        expect(finalContent).not.toContain('舊引言'); // 舊引言必須被消滅
        expect(finalContent).toContain('這是我在草稿裡寫的【新內文】！'); // 必須採用新內文
        expect(finalContent).not.toContain('舊內文'); // 舊內文必須被消滅

        // 檢查有冇將草稿掉落垃圾桶 (因為設定 keepDraftOnSync = false)
        expect(app.fileManager.trashFile).toHaveBeenCalledWith(fakeDraftFile);
    });

    test('syncBack - 防呆機制：如果草稿冇 FILE_ID，應該要中斷並保護檔案', async () => {
        const fakeFolder = { children: [] as any[] };
        const fakeDraftFile = { path: `MyBook/第一章/${DRAFT_FILENAME}` };

        // 模擬一個被用家唔小心洗走晒 FILE_ID 嘅壞草稿
        app.vault.read.mockResolvedValue("這是一份壞掉的草稿，沒有檔案 ID 標籤。");

        await manager.syncBack(fakeDraftFile as any, fakeFolder as any);

        // 斷言：系統必須立即終止，絕對唔可以執行任何修改或刪除！
        expect(app.vault.modify).not.toHaveBeenCalled();
        expect(app.fileManager.trashFile).not.toHaveBeenCalled();
    });

});