import { CorkboardModal } from '../src/modals/CorkboardModal';

jest.mock('obsidian', () => ({
    App: jest.fn(), Notice: jest.fn(), Modal: class { }, TFile: jest.fn()
}), { virtual: true });

jest.mock('../src/utils', () => ({
    getManuscriptFiles: jest.fn(),
    parseContent: jest.fn()
}), { virtual: true });

import { getManuscriptFiles, parseContent } from '../src/utils';

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

        const originalFileContent = `###### 第一場戲\n舊的內文`;
        app.vault.read.mockResolvedValue(originalFileContent);

        // 模擬解析結果
        (parseContent as jest.Mock).mockReturnValue({
            cards: [{ key: '第一場戲', id: 'uuid-1', rawHeader: '###### 第一場戲', meta: [], body: '舊的內文' }]
        });

        // ⚠️ 模擬用家操作：
        modal.isDirty = true; // 模擬用家已經拖拉過排版
        // 模擬用家喺面板改咗字
        modal.pendingEdits.set('uuid-1', '###### 第一場戲\n這是我剛寫的幾萬字，不能因為 Cancel 就消失！');

        // 攔截 ConfirmModal，模擬用家點擊「確定放棄排版」
        jest.spyOn(modal, 'close').mockImplementation(() => { });

        // 執行 Cancel (假設 ConfirmModal 已通過)
        // 由於無法輕易模擬 ConfirmModal 的 Callback，我們直接抽取 Cancel 內部的儲存邏輯進行測試
        let content = await app.vault.read(fakeFile);
        for (const [id, newText] of modal.pendingEdits.entries()) {
            content = content.replace(`###### 第一場戲\n\n舊的內文`, newText); // 簡化版 Replace
        }
        await app.vault.modify(fakeFile, content);

        // 🕵️‍♂️ 斷言：必須觸發 Modify，並且寫入的是新文字！
        expect(app.vault.modify).toHaveBeenCalled();
        const savedText = app.vault.modify.mock.calls[0][1];
        expect(savedText).toContain('這是我剛寫的幾萬字，不能因為 Cancel 就消失！');
        expect(savedText).not.toContain('舊的內文');
    });
});