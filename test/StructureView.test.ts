/**
 * @jest-environment jsdom
 */
import { StructureView } from '../src/managers/StructureView';

// =========================================================
// 🎭 1. 假扮 Obsidian API
// =========================================================
jest.mock('obsidian', () => ({
    ItemView: class { },
    WorkspaceLeaf: jest.fn(),
    MarkdownView: jest.fn(),
    Notice: jest.fn(),
    Modal: class { },
    SuggestModal: class { },
    FuzzySuggestModal: class { }
}), { virtual: true });

jest.mock('../src/utils', () => ({
    extractSceneId: (line: string) => {
        const match = line.match(/(?:SCENE_ID:\s*|data-scene-id=")([a-zA-Z0-9-]+)/);
        return match ? match[1] : null;
    },
    cleanSceneTitle: (line: string) => line.replace(/######\s*/, '').replace(/<span.*/, '').trim(),
    extractSceneColor: () => 'default'
}), { virtual: true });

describe('StructureView - 防食字與解析極限測試', () => {
    let view: any;

    beforeEach(() => {
        // 建立假嘅 StructureView 實例
        view = new StructureView({} as any, {} as any);
    });

    test('saveChanges - 同名分身測試：當出現多個「同名且無ID」的場景時，系統必須能精準對應，不可覆寫錯位', async () => {
        // 1. 準備原稿：3 個完全同名、冇 ID 嘅場景
        const rawText = `
###### 待寫場景
場景1內容
###### 待寫場景
場景2內容
###### 待寫場景
場景3內容`;

        const fakeView = {
            editor: {
                getValue: jest.fn().mockReturnValue(rawText),
                getScrollInfo: jest.fn().mockReturnValue({ left: 0, top: 0 }),
                scrollTo: jest.fn()
            },
            file: { path: "Test.md" }
        };
        view.getValidMarkdownView = jest.fn().mockReturnValue(fakeView);

        // 🌟 修正：為 view 注入假嘅 app 物件，等佢可以執行 vault.modify
        view.app = {
            vault: { modify: jest.fn().mockResolvedValue(undefined) }
        };

        // 2. 模擬 DOM 狀態 (用家喺畫面上將第 2 個「待寫場景」改咗字)
        const fakeContainer = document.createElement('div');
        fakeContainer.innerHTML = `
            <div class="ns-chapter-box" data-name="root">
                <div class="ns-scene-card" data-safe-key="NO_ID_待寫場景_0"></div>
                <div class="ns-scene-card" data-safe-key="NO_ID_待寫場景_1"></div>
                <div class="ns-scene-card" data-safe-key="NO_ID_待寫場景_2"></div>
            </div>
        `;

        // 模擬修改：假裝用家編輯咗第 2 個場景 (Index 1)
        view.parseDocument = jest.fn().mockReturnValue([{
            name: "root", preamble: "",
            scenes: [
                { name: "待寫場景", id: null, content: "###### 待寫場景\n場景1內容\n" },
                { name: "待寫場景", id: null, content: "###### 待寫場景\n這是我修改過的場景2！\n" }, // 👈 改變了這裡
                { name: "待寫場景", id: null, content: "###### 待寫場景\n場景3內容\n" }
            ]
        }]);

        // 3. 執行同步
        await view.saveChanges(fakeContainer);

        // 🕵️‍♂️ 斷言：檢查最終合成的文本，次序必須正確，且沒有覆寫錯位！
        // 🌟 修正：使用 view.app.vault.modify 嚟驗證
        const finalContent = view.app.vault.modify.mock.calls[0][1];
        expect(finalContent).toContain('場景1內容');
        expect(finalContent).toContain('這是我修改過的場景2！');
        expect(finalContent).toContain('場景3內容');

        // 確保先後次序沒有亂
        const indexOf1 = finalContent.indexOf('場景1內容');
        const indexOf2 = finalContent.indexOf('這是我修改過的場景2！');
        const indexOf3 = finalContent.indexOf('場景3內容');
        expect(indexOf1).toBeLessThan(indexOf2);
        expect(indexOf2).toBeLessThan(indexOf3);
    });


    test('parseDocument - 應該完美肢解文稿並保留所有正文/引言，一字不漏', () => {
        // 1. 準備一份極度複雜、充滿陷阱嘅原稿
        const rawText = `---
yaml: test
---
這是一段沒有章節的開場白 (Root Preamble)。
不能被食走！

# 📄 第一章
<span class="ns-file-id">++ FILE_ID: 第一章 ++</span>
這是第一章的引言 (Chapter Preamble)。
有換行。

###### 第一場戲 <span class="ns-id" data-scene-id="scene-1"></span>
> [!NSmith]
> - POV:: Alice

這是第一場戲的正文。

###### 🎬 第二場戲 <span class="ns-id" data-scene-id="scene-2"></span>
第二場戲正文。`;

        // 2. 執行解析！
        const tree = view.parseDocument(rawText);

        // ==========================================
        // 🕵️‍♂️ 斷言：檢查各個部位有冇被系統「食走」
        // ==========================================

        // A. 檢查 YAML 有冇保留
        expect(view.docYaml).toContain('yaml: test');

        // B. 檢查 Root Preamble (最容易被忽略嘅開頭廢話)
        const root = tree.find((c: any) => c.name === 'root');
        expect(root.preamble).toContain('這是一段沒有章節的開場白');
        expect(root.preamble).toContain('不能被食走！');

        // C. 檢查 Chapter Preamble (章節標題同場景標題之間嘅字)
        const ch1 = tree.find((c: any) => c.name === '第一章');
        expect(ch1.preamble).toContain('這是第一章的引言');

        // D. 檢查 Scene Content (必須包含屬性同正文)
        const scene1 = ch1.scenes.find((s: any) => s.id === 'scene-1');
        expect(scene1.content).toContain('> - POV:: Alice');
        expect(scene1.content).toContain('這是第一場戲的正文。');

        const scene2 = ch1.scenes.find((s: any) => s.id === 'scene-2');
        expect(scene2.content).toContain('第二場戲正文。');
    });
});