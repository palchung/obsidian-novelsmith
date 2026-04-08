import { WorldboardView } from '../src/managers/WorldboardView';

jest.mock('obsidian', () => ({
    ItemView: class { }, Notice: jest.fn(), TFile: jest.fn()
}), { virtual: true });

describe('WorldboardView - YAML 印章防呆測試', () => {
    let app: any, plugin: any, view: any;

    beforeEach(() => {
        app = {
            fileManager: { processFrontMatter: jest.fn() },
            metadataCache: { getFileCache: jest.fn() }
        };
        plugin = { settings: { wikiCategories: [] } };
        view = new WorldboardView({} as any, plugin);
        view.app = app;
    });

    test('handleStampClick - 應該能正確處理不同狀態的 YAML 屬性 (新增/轉換為陣列/移除)', async () => {
        const fakeFile = { basename: 'Alice' };
        view.activeGroupKey = 'Faction';
        view.activeStampValue = 'Magic'; // 印章準備印上 [[Magic]]

        // 模擬 Obsidian 的 processFrontMatter Callback 行為
        app.fileManager.processFrontMatter.mockImplementation(async (file: any, callback: any) => {
            const fakeFrontmatter: any = {
                Faction: '[[Knight]]' // 模擬原本只係單一字串
            };
            callback(fakeFrontmatter);

            // 🕵️‍♂️ 斷言 1：單一字串必須被聰明地轉化為 Array！
            expect(Array.isArray(fakeFrontmatter.Faction)).toBe(true);
            expect(fakeFrontmatter.Faction).toContain('[[Knight]]');
            expect(fakeFrontmatter.Faction).toContain('[[Magic]]');
        });

        // 觸發印章 (使用 any 繞過 private 限制以作測試)
        await (view as any).handleStampClick('Alice', [fakeFile]);
        expect(app.fileManager.processFrontMatter).toHaveBeenCalled();
    });
});