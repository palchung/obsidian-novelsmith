import { RangeSetBuilder } from '@codemirror/state';

const mockAdd = jest.fn();

// =========================================================
// 🎭 1. 假扮 CodeMirror 的核心組件
// 因為 ViewPlugin 依賴複雜嘅 DOM，所以我哋局部 mock 佢嘅行為
// =========================================================
jest.mock('@codemirror/state', () => ({
    RangeSetBuilder: jest.fn().mockImplementation(() => ({
        add: mockAdd,
        finish: jest.fn().mockReturnValue('mock-decorations')
    }))
}));

jest.mock('@codemirror/view', () => ({
    Decoration: {
        line: jest.fn().mockReturnValue('mock-line-deco'),
        widget: jest.fn().mockReturnValue('mock-widget-deco'),
        mark: jest.fn(),
        replace: jest.fn()
    },
    ViewPlugin: {
        // 直接將 class 抽走，方便我哋 new 佢出嚟測試
        fromClass: jest.fn((pluginClass) => pluginClass)
    },
    WidgetType: class MockWidget { },

    // 🌟 核心修復：加返個假嘅 MatchDecorator 畀系統！
    MatchDecorator: class MockMatchDecorator {
        constructor(config: any) { }
        createDeco() { return 'mock-decorations'; }
        updateDeco() { return 'mock-decorations'; }
    }
}));

// 引入我哋要測試嘅 Plugin
import { idValidatorPlugin } from '../src/decorators';

describe('decorators.ts - ID Validator 終極防禦網測試', () => {



    beforeEach(() => {
        mockAdd.mockClear();
    });

    // 🌟 終極修復版：精準模擬 CodeMirror 的行數與位置計算，防死迴圈！
    const createMockView = (linesText: string[]) => {
        const lines: any[] = [];
        let currentPos = 0;

        // 預先計好每一行嘅起點 (from) 同終點 (to)
        for (let i = 0; i < linesText.length; i++) {
            const length = linesText[i].length;
            lines.push({
                number: i + 1,
                from: currentPos,
                to: currentPos + length,
                text: linesText[i]
            });
            currentPos += length + 1; // +1 代表換行符號 (\n)
        }

        const maxPos = currentPos > 0 ? currentPos - 1 : 0;

        return {
            state: {
                doc: {
                    lines: linesText.length,
                    lineAt: (pos: number) => {
                        // 根據 pos 準確搵出對應嘅行數
                        return lines.find(l => pos >= l.from && pos <= l.to) || lines[lines.length - 1];
                    },
                    line: (lineNo: number) => lines[lineNo - 1] || { text: "" }
                }
            },
            visibleRanges: [{ from: 0, to: maxPos }]
        };
    };

    test('情境 1：健康的場景與章節，不應觸發任何警告', () => {
        const mockView = createMockView([
            '# 📄 第一章 <span class="ns-chapter-center"></span>',
            '<span class="ns-file-id">++ FILE_ID: 第一章 ++</span>',
            '###### 正常場景 <span class="ns-id" data-scene-id="123"></span>',
            '普通內文不會被檢查'
        ]);

        const plugin = new (idValidatorPlugin as any)(mockView);

        // 驗證：Builder.add 一次都唔應該被呼叫 (即係冇畫紅線)
        expect(mockAdd).not.toHaveBeenCalled();
    });

    test('情境 2：場景遺失 ID (或者手動新建未 Sync)，必須瞬間觸發紅線與警告', () => {
        const mockView = createMockView([
            '###### 爛掉的場景 <span class="ns-i', // ID 被刪除了一半
            '###### 全新場景'                    // 手動輸入，未有 ID
        ]);

        const plugin = new (idValidatorPlugin as any)(mockView);

        // 驗證：兩行都要報錯，每行會呼叫 add 兩次 (一次畫線，一次彈警告 Widget)
        expect(mockAdd).toHaveBeenCalledTimes(4);

        // 檢查第一行 (長度 30)：'###### 爛掉的場景 <span class="ns-i'
        expect(mockAdd).toHaveBeenCalledWith(0, 0, 'mock-line-deco');
        expect(mockAdd).toHaveBeenCalledWith(30, 30, 'mock-widget-deco');

        // 檢查第二行 (長度 9，加上前一行與換行符號後，起始於 31，結束於 40)
        expect(mockAdd).toHaveBeenCalledWith(31, 31, 'mock-line-deco');
        expect(mockAdd).toHaveBeenCalledWith(42, 42, 'mock-widget-deco');
    });

    test('情境 3：章節標題下方遺失 FILE_ID，必須觸發警告', () => {
        const mockView = createMockView([
            '# 📄 第二章',
            '這裡本來應該要有 FILE_ID 但被刪除了',
            '###### 場景 <span class="ns-id" data-scene-id="456"></span>'
        ]);

        const plugin = new (idValidatorPlugin as any)(mockView);

        // 驗證：第一行 (章節標題) 必須被標記為損毀
        expect(mockAdd).toHaveBeenCalledTimes(2);
        expect(mockAdd).toHaveBeenCalledWith(0, 0, 'mock-line-deco');
    });

});