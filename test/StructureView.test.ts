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