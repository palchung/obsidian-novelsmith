import { WikiManager } from '../src/managers/WikiManager';

jest.mock('obsidian', () => ({
    App: jest.fn(),
    Notice: jest.fn(),
    TFile: jest.fn(),
    MarkdownView: jest.fn(),
}), { virtual: true });

jest.mock('../src/utils', () => ({
    ensureFolderExists: jest.fn().mockResolvedValue(undefined),
    TEMPLATES_DIR: 'Templates'
}), { virtual: true });

describe('WikiManager - AutoWiki 智能生成測試', () => {
    let app: any;
    let settings: any;
    let manager: WikiManager;
    let fakeEditor: any;

    beforeEach(() => {
        app = {
            vault: { create: jest.fn(), modify: jest.fn(), getAbstractFileByPath: jest.fn() },
            metadataCache: { getFirstLinkpathDest: jest.fn() }
        };
        settings = {
            bookFolderPath: 'MyBook',
            wikiCategories: [{ name: 'Character', folderPath: 'MyBook/Characters' }]
        };
        manager = new WikiManager(app, settings);

        fakeEditor = {
            getValue: jest.fn(),
            getScrollInfo: jest.fn().mockReturnValue({ left: 0, top: 0 }),
            scrollTo: jest.fn()
        };
    });

    test('scanAndCreateWiki - 應該精準將屬性變成雙方括號，且不重複包裝已有的 Link', async () => {
        // 準備一份充滿陷阱嘅原稿：有普通字、有已經係 Link 嘅字、有奇怪空格
        const rawContent = `###### 第一場戲
> [!NSmith]
> - Character:: Alice, [[Bob]],   Charlie  , Dave
> - Location:: School`;

        fakeEditor.getValue.mockReturnValue(rawContent);

        // 模擬：Bob 已經有實體檔案，Alice/Charlie/Dave 未有
        app.metadataCache.getFirstLinkpathDest.mockImplementation((link: string) => {
            return link === 'Bob' ? {} : null;
        });

        await manager.scanAndCreateWiki({ editor: fakeEditor, file: {} } as any);

        // 檢查有冇修改原稿
        expect(app.vault.modify).toHaveBeenCalled();
        const modifiedContent = app.vault.modify.mock.calls[0][1];

        // 🕵️‍♂️ 斷言 1：確保冇重複包裝 (Bob 必須維持 [[Bob]]，不能變成 [[[[Bob]]]])
        expect(modifiedContent).toContain('> - Character:: [[Alice]], [[Bob]], [[Charlie]], [[Dave]]');

        // 🕵️‍♂️ 斷言 2：確保冇誤傷其他屬性
        expect(modifiedContent).toContain('> - Location:: School');

        // 🕵️‍♂️ 斷言 3：確保有為 Alice, Charlie, Dave 建立新檔案 (Bob 唔應該建)
        expect(app.vault.create).toHaveBeenCalledTimes(3);
        const createdPaths = app.vault.create.mock.calls.map((call: any) => call[0]);
        expect(createdPaths).toContain('MyBook/Characters/Alice.md');
        expect(createdPaths).toContain('MyBook/Characters/Charlie.md');
        expect(createdPaths).toContain('MyBook/Characters/Dave.md');
    });
});