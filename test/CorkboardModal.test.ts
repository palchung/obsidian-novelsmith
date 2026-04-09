import { CorkboardModal } from '../src/modals/CorkboardModal';
import { getManuscriptFiles, parseContent } from '../src/utils';

// =========================================================
// 🎭 1. 假扮 Obsidian API
// =========================================================
jest.mock('obsidian', () => ({
    App: jest.fn(), Notice: jest.fn(), TFile: jest.fn(), setIcon: jest.fn(),
    Modal: class { app: any; constructor(app: any) { this.app = app; } close() { } open() { } },
    FuzzySuggestModal: class { }, SuggestModal: class { }, Component: class { },
    Menu: class { addItem = jest.fn(); showAtMouseEvent = jest.fn(); },
    MarkdownRenderer: { render: jest.fn() }
}), { virtual: true });

// =========================================================
// 🎭 2. 假扮 Utils 函數
// =========================================================
jest.mock('../src/utils', () => ({
    getManuscriptFiles: jest.fn(),
    parseContent: jest.fn()
}), { virtual: true });

// =========================================================
// 🎭 3. 🌟 神級 Mock：令 SimpleConfirmModal 自動觸發「確認」
// =========================================================
jest.mock('../src/modals', () => ({
    SimpleConfirmModal: jest.fn().mockImplementation((app, msg, onConfirm) => ({
        open: () => onConfirm() // 直接執行 callback，略過 UI 點擊！
    }))
}), { virtual: true });


describe('CorkboardModal - 狀態分離與還原測試', () => {
    let app: any, plugin: any, modal: CorkboardModal;

    beforeEach(() => {
        app = { vault: { read: jest.fn(), modify: jest.fn() } };
        plugin = { app, settings: {} };
        modal = new CorkboardModal(plugin, null, "Folder", false);
    });

    test('cancelCorkboard - 拖拉排版後取消，必須捨棄排版，但保留 pendingEdits 中的文字修改', async () => {
        const fakeFile = { path: 'Chapter1.md' };
        (getManuscriptFiles as jest.Mock).mockReturnValue([fakeFile]);

        const originalFileContent = `###### 第一場戲\n\n舊的內文`;
        app.vault.read.mockResolvedValue(originalFileContent);

        // 模擬解析結果 (這會餵給你的真實 cancelCorkboard 邏輯)
        (parseContent as jest.Mock).mockReturnValue({
            cards: [{ key: '第一場戲', id: 'uuid-1', rawHeader: '###### 第一場戲', meta: [], body: '舊的內文' }]
        });

        // ⚠️ 模擬用家操作：
        modal.isDirty = true; // 模擬用家已經拖拉過排版
        // 模擬用家喺面板改咗字
        modal.pendingEdits.set('uuid-1', '###### 第一場戲\n這是我剛寫的幾萬字，不能因為 Cancel 就消失！');

        // 🌟 直接執行真正的 Cancel 函數！(SimpleConfirmModal 會自動幫手撳確定)
        await modal.cancelCorkboard();

        // 🕵️‍♂️ 斷言：必須觸發 Modify，並且寫入的是新文字！
        expect(app.vault.modify).toHaveBeenCalled();
        const savedText = app.vault.modify.mock.calls[0][1];

        expect(savedText).toContain('這是我剛寫的幾萬字，不能因為 Cancel 就消失！');
        expect(savedText).not.toContain('舊的內文');
    });
});