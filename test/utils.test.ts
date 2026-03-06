import {
    extractSceneId,
    cleanSceneTitle,
    extractSceneColor,
    isScriveningsDraft,
    parseUniversalScenes,
    parseContent // 🔥 新增引入 parseContent
} from '../src/utils';

// 虛擬化 Obsidian 模組
jest.mock('obsidian', () => ({
    App: jest.fn(),
    Notice: jest.fn(),
    TFile: jest.fn(),
    setIcon: jest.fn(),
    Editor: jest.fn()
}), { virtual: true });

describe('utils.ts - 核心字串與解析邏輯', () => {

    // ... (保留之前嘅測試) ...
    test('extractSceneId - 應該要成功抽到 UUID', () => {
        const fakeHeader = '###### 第一場戲 <span class="ns-id" data-scene-id="1234abc" data-warning="⛔️ ID (Do not edit)"></span>';
        expect(extractSceneId(fakeHeader)).toBe('1234abc');
    });

    test('cleanSceneTitle - 應該要清走晒 Markdown 符號同 HTML', () => {
        expect(cleanSceneTitle('###### 🎬 第二場戲 <span class="ns-id">...</span>')).toBe('第二場戲');
    });

    test('extractSceneColor - 應該要成功抽到 data-color 嘅值', () => {
        expect(extractSceneColor('###### 測試 <span data-color="red"></span>')).toBe('red');
        expect(extractSceneColor('###### 測試 <span></span>')).toBe('default');
    });

    test('isScriveningsDraft - 應該準確辨認串聯草稿', () => {
        expect(isScriveningsDraft('', 'NSmith_Scrivenering.md')).toBe(true);
        expect(isScriveningsDraft('++ FILE_ID: 123 ++', 'other.md')).toBe(true);
        expect(isScriveningsDraft('普通內文', 'normal.md')).toBe(false);
    });

    test('parseUniversalScenes - 應該成功解析多個場景同 Callout 屬性', () => {
        const fakeContent = "引言\n###### 第一場\n> [!NSmith]\n> - POV:: Alice\n###### 🎬 第二場 <span class=\"ns-id\" data-scene-id=\"xyz\" data-color=\"blue\"></span>\n> - Time:: Day";
        const scenes = parseUniversalScenes(fakeContent);
        expect(scenes.length).toBe(2);
        expect(scenes[0].title).toBe('第一場');
        expect(scenes[1].id).toBe('xyz');
        expect(scenes[1].colorId).toBe('blue');
    });

    // ==========================================
    // 👑 終極大佬：parseContent 測試
    // ==========================================
    describe('parseContent 引擎測試', () => {

        test('情境 1：無 Obsidian API 時的 Fallback 解析 (舊版邏輯)', () => {
            const fakeText = "---\ntitle: 測試檔案\n---\n這是一段引言。\n###### 場景1\n正文內容";
            const result = parseContent(fakeText);

            expect(result.yaml).toBe("---\ntitle: 測試檔案\n---");
            expect(result.preamble).toBe("這是一段引言。");
            expect(result.cards.length).toBe(1);
            expect(result.cards[0].key).toBe("場景1");
        });

        test('情境 2：依賴 Obsidian API 精準切割真 YAML', () => {
            const fakeYaml = "---\ntags: novel\n---";
            const fakeText = `${fakeYaml}\n真正的引言\n###### 第一場\n內容`;

            // 模擬 (Mock) Obsidian API 嘅行為
            const fakeApp = {
                metadataCache: {
                    getFileCache: jest.fn().mockReturnValue({
                        frontmatterPosition: {
                            start: { offset: 0 },
                            end: { offset: fakeYaml.length } // 模擬 YAML 嘅結尾位置
                        }
                    })
                }
            } as any;
            const fakeFile = {} as any;

            const result = parseContent(fakeText, false, fakeApp, fakeFile);

            expect(result.yaml).toBe(fakeYaml);
            expect(result.preamble).toBe("真正的引言");
            expect(result.cards.length).toBe(1);
        });

        test('情境 3：破解「假 YAML」陷阱！', () => {
            const fakeText = "---\n我喜歡用分隔線開頭\n---\n引言繼續\n###### 第一場\n內容";

            // 模擬 Obsidian 判斷為「冇 YAML」 (回傳空物件)
            const fakeApp = {
                metadataCache: {
                    getFileCache: jest.fn().mockReturnValue({})
                }
            } as any;
            const fakeFile = {} as any;

            const result = parseContent(fakeText, false, fakeApp, fakeFile);

            // 系統必須認為冇 YAML！
            expect(result.yaml).toBe("");
            // 嗰兩條分隔線必須原封不動歸入 Preamble！
            expect(result.preamble).toContain("我喜歡用分隔線開頭");
            expect(result.cards.length).toBe(1);
        });
    });

});