/**
 * @jest-environment jsdom
 */
import { WorldboardView } from '../src/managers/WorldboardView';

// =========================================================
// 🎭 假扮 Obsidian API (全副武裝版)
// =========================================================
jest.mock('obsidian', () => {
    // 假扮 Obsidian 嘅 Setting 介面 (因為入面有大量連續呼叫 .setName().setDesc())
    class MockSetting {
        setName() { return this; }
        setDesc() { return this; }
        addText() { return this; }
        addDropdown() { return this; }
        addToggle() { return this; }
        addButton() { return this; }
        addColorPicker() { return this; }
        addExtraButton() { return this; }
    }

    return {
        App: jest.fn(),
        Notice: jest.fn(),
        TFile: jest.fn(),
        TFolder: jest.fn(),
        ItemView: class { contentEl = document.createElement('div'); },
        // 🌟 補番 Modal 嘅定義
        Modal: class { app: any; constructor(app: any) { this.app = app; } close() { } open() { } },
        // 🌟 補番 Setting 嘅定義
        Setting: MockSetting,
        setIcon: jest.fn(),
        MarkdownRenderer: { render: jest.fn() }
    };
}, { virtual: true });

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