import { App, Notice, MarkdownView, TFile, Editor, TFolder } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { NovelSmithSettings } from '../settings';
import { setRedundantPattern, setEchoPattern, updateSyntaxPatterns } from '../decorators';
import { AIDS_DIR, ensureFolderExists, SYNTAX_GAP_CN, SYNTAX_GAP_EN, SENTENCE_END_REGEX, ECHO_SCAN_RANGE, ECHO_MIN_REPEATS, ECHO_STOP_WORDS } from '../utils';
import { CleanDraftModal } from '../modals';

interface EditorWithCM extends Editor {
    cm: EditorView;
}

export class WritingManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(newSettings: NovelSmithSettings) {
        this.settings = newSettings;
    }

    private triggerEditorUpdate() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) {

                const cm = (leaf.view.editor as unknown as EditorWithCM).cm;

                if (cm) cm.dispatch({ effects: [] });
            }
        });
    }


    // Modify path to constant:
    private getAidsFolderPath() {
        return `${this.settings.bookFolderPath}/${AIDS_DIR}`;
    }

    // =================================================================
    // 📄 Smart Generator: Redundant Words List and Correction List
    // =================================================================
    public async ensureRedundantListExists(forceShowNotice: boolean = false) {
        const configPath = `${this.getAidsFolderPath()}/RedundantList.md`;
        // ... Below, replace this.settings.redundantListPath with configPath
        const configFile = this.app.vault.getAbstractFileByPath(configPath);
        if (!configFile) {
            // 🔥 Bug fix: Pass only the folder path, do not pass the full path including .md!
            await ensureFolderExists(this.app, this.getAidsFolderPath());
            try {
                await this.app.vault.create(configPath, `// Default Redundant Words List\nactually, basically, seemingly`);
                if (forceShowNotice) new Notice(`Successfully generated redundant words list: ${configPath}`);
            } catch {
                if (forceShowNotice) new Notice(`Creation failed, please check the path.`);
            }
        } else {
            if (forceShowNotice) new Notice(`File already exists (${configPath}), generation stopped.`);
        }
    }

    public async ensureFixListExists(forceShowNotice: boolean = false) {
        const configPath = `${this.getAidsFolderPath()}/FixList.md`;
        // ... Same replacement logic, replace this.settings.fixListPath with configPath
        const configFile = this.app.vault.getAbstractFileByPath(configPath);
        if (!configFile) {
            // 🔥 Bug fix: Pass only the folder path, do not pass the full path including .md!
            await ensureFolderExists(this.app, this.getAidsFolderPath());
            try {
                await this.app.vault.create(configPath, `// Correction List\nMainCharacterName | Typo1`);
                if (forceShowNotice) new Notice(`Successfully generated Correction List: ${configPath}`);
            } catch {
                if (forceShowNotice) new Notice(`Creation failed, please check the path.`);
            }
        } else {
            if (forceShowNotice) new Notice(`File already exists (${configPath}), generation stopped.`);
        }
    }

    public async ensureSyntaxListExists(forceShowNotice: boolean = false) {
        const configPath = `${this.getAidsFolderPath()}/SyntaxList.md`;
        const configFile = this.app.vault.getAbstractFileByPath(configPath);
        if (!configFile) {
            await ensureFolderExists(this.app, this.getAidsFolderPath());
            try {
                const defaultContent = `// 句式雷達清單 (Syntax Radar List)\n// 支援中英混合，使用 "..." 作為萬能匹配符，系統會自動識別語言並跨行掃描。\n\n之所以...是因為\n當...的時候\n與其說...不如說\n雖然...但是\n被...給\n\nThe reason...is because\nNot only...but also\nThere are...who\nWhether...or not`;
                await this.app.vault.create(configPath, defaultContent);
                if (forceShowNotice) new Notice(`Successfully generated syntax List: ${configPath}`);
            } catch {
                if (forceShowNotice) new Notice(`Creation failed, please check the path.`);
            }
        } else {
            if (forceShowNotice) new Notice(`File already exists (${configPath}), generation stopped.`);
        }
    }


    // =================================================================
    // 🔍 1. Redundant Words Mode (紅字贅詞)
    // =================================================================
    async toggleRedundantMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-redundant');

        if (isModeOn) {
            document.body.classList.remove('mode-redundant');
            setRedundantPattern(null);
            this.triggerEditorUpdate();
            new Notice("Disabled: redundant words mode");
        } else {
            document.body.classList.remove('ns-mode-dialogue');
            await this.ensureRedundantListExists(false);
            const configPath = `${this.getAidsFolderPath()}/RedundantList.md`;
            const configFile = this.app.vault.getAbstractFileByPath(configPath);

            if (configFile instanceof TFile) {
                const configContent = await this.app.vault.cachedRead(configFile);
                let badWords = configContent.split(/[,，、\n]+/)
                    .map(w => w.trim())
                    .filter(w => w.length > 0 && !w.startsWith("//"));

                if (badWords.length === 0) { new Notice("Redundant list is empty."); return; }

                const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                badWords.sort((a, b) => b.length - a.length);

                const pattern = badWords.map(w => {
                    const isEn = /^[a-zA-Z0-9].*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(w);
                    return isEn ? `\\b${escapeRegExp(w)}\\b` : escapeRegExp(w);
                }).join("|");

                setRedundantPattern(new RegExp(`(${pattern})`, 'g'));
                document.body.classList.add('mode-redundant');
                this.triggerEditorUpdate();
                // new Notice(`🔍 Redundant Mode Active: ${badWords.length} targets`);
            }
        }
    }

    // =================================================================
    // 📡 2. Echo Radar Mode (橘色回聲)
    // =================================================================
    async toggleEchoMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-echo');

        if (isModeOn) {
            document.body.classList.remove('mode-echo');
            setEchoPattern(null);
            this.triggerEditorUpdate();
            new Notice("Disabled: echo radar");
        } else {
            document.body.classList.remove('ns-mode-dialogue');

            // 1. 獲取 AutoWiki 豁免名單
            const excludedWikiNames = new Set<string>();
            if (this.settings.wikiCategories) {
                for (const cat of this.settings.wikiCategories) {
                    if (!cat.folderPath) continue;
                    const folder = this.app.vault.getAbstractFileByPath(cat.folderPath);
                    if (folder && folder instanceof TFolder) {
                        folder.children.forEach(f => {
                            if (f instanceof TFile && f.extension === "md") {
                                excludedWikiNames.add(f.basename);
                                const parts = f.basename.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g);
                                if (parts) parts.forEach(p => excludedWikiNames.add(p));
                            }
                        });
                    }
                }
            }

            const editorText = view.editor.getValue();
            let scanText = editorText;
            const echoWords = new Set<string>();
            const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 結構屏蔽魔法
            scanText = scanText.replace(/^###### .*$/gm, (match) => ' '.repeat(match.length));
            scanText = scanText.replace(/^> .*$/gm, (match) => ' '.repeat(match.length));
            scanText = scanText.replace(/^# 📄 .*$/gm, (match) => ' '.repeat(match.length));
            scanText = scanText.replace(/<span[^>]*>.*?<\/span>/g, (match) => ' '.repeat(match.length));

            // 防碎化屏蔽魔法
            const sortedWikiNames = Array.from(excludedWikiNames).sort((a, b) => b.length - a.length);
            for (const name of sortedWikiNames) {
                if (name.length > 0) scanText = scanText.replace(new RegExp(escapeRegExp(name), 'g'), ' '.repeat(name.length));
            }

            // 英文單詞
            const enRegex = /[a-zA-Z]{3,}/g;
            let enMatch;
            while ((enMatch = enRegex.exec(scanText)) !== null) {
                const word = enMatch[0];
                if (ECHO_STOP_WORDS.has(word.toLowerCase())) continue;

                const searchStart = enMatch.index + word.length;
                const lookaheadText = scanText.substring(searchStart, searchStart + ECHO_SCAN_RANGE);
                const wordPattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
                const matchesInWindow = (lookaheadText.match(wordPattern) || []).length;
                if (matchesInWindow >= ECHO_MIN_REPEATS - 1) echoWords.add(word);
            }

            // 中文 N-gram 碎片掃描
            const cnRegex = /[\u4e00-\u9fa5]{2,}/g;
            let cnMatch;
            while ((cnMatch = cnRegex.exec(scanText)) !== null) {
                const block = cnMatch[0];
                const blockIndex = cnMatch.index;

                for (let i = 0; i <= block.length - 2; i++) {
                    for (let len = 2; len <= 4 && i + len <= block.length; len++) {
                        const ngram = block.substring(i, i + len);
                        if (ECHO_STOP_WORDS.has(ngram)) continue;

                        const searchStart = blockIndex + i + len;
                        const lookaheadText = scanText.substring(searchStart, searchStart + ECHO_SCAN_RANGE);
                        const matchesInWindow = lookaheadText.split(ngram).length - 1;
                        if (matchesInWindow >= ECHO_MIN_REPEATS - 1) echoWords.add(ngram);
                    }
                }
            }

            const finalEchoWords = Array.from(echoWords).sort((a, b) => b.length - a.length);
            if (finalEchoWords.length === 0) { new Notice("No echo words found."); return; }

            const pattern = finalEchoWords.map(w => escapeRegExp(w)).join("|");
            setEchoPattern(new RegExp(`(${pattern})`, 'g'));

            document.body.classList.add('mode-echo');
            this.triggerEditorUpdate();
            new Notice(`📡 Echo Radar Active: ${finalEchoWords.length} Echoes`);
        }
    }


    // =================================================================
    // 📡 Syntax Radar Mode (跨行句式雷達)
    // =================================================================
    async toggleSyntaxMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-syntax');

        if (isModeOn) {
            document.body.classList.remove('mode-syntax');
            updateSyntaxPatterns(null); // 此函數需要在 decorators.ts 匯出
            this.triggerEditorUpdate();
            new Notice("Disabled: syntax radar");
        } else {
            await this.ensureSyntaxListExists(false); // Ensure the file exists
            const configPath = `${this.getAidsFolderPath()}/SyntaxList.md`;
            const configFile = this.app.vault.getAbstractFileByPath(configPath);

            if (configFile instanceof TFile) {
                const configContent = await this.app.vault.cachedRead(configFile);
                const badSyntaxes = configContent.split('\n')
                    .map(w => w.trim())
                    .filter(w => w.length > 0 && !w.startsWith("//"));

                if (badSyntaxes.length === 0) { new Notice("The active syntax list is empty."); return; }

                const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                badSyntaxes.sort((a, b) => b.length - a.length);

                const patternString = badSyntaxes.map(w => {
                    let escaped = escapeRegExp(w);
                    // 偵測是否包含英文字母
                    const hasEnglish = /[a-zA-Z]/.test(w);

                    // 轉換 "..." 為跨行正則匹配 [\s\S]
                    // 🌟 核心升級：加入「尾巴追蹤」
                    if (escaped.includes('\\.\\.\\.')) {
                        const gap = hasEnglish ? SYNTAX_GAP_EN : SYNTAX_GAP_CN;
                        // 將「A...B」變成「A...B + 後續文字 + 標點」
                        escaped = escaped.replace(/\\\.\\\.\\\./g, `[\\s\\S]{1,${gap}}?`) + SENTENCE_END_REGEX;
                    }

                    // 英文句式頭尾加上單詞邊界 \b
                    if (hasEnglish) {
                        return `\\b${escaped}\\b`;
                    }
                    return escaped;
                }).join("|");

                const combinedRegex = new RegExp(`(${patternString})`, 'g');

                updateSyntaxPatterns(combinedRegex); // 更新 Regex
                document.body.classList.add('mode-syntax'); // 觸發 CSS 渲染
                this.triggerEditorUpdate();
                // new Notice(`📡 Syntax Radar: Monitoring (${badSyntaxes.length} patterns)`);
            }
        }
    }



    // =================================================================
    // 💬 Dialogue Mode
    // =================================================================
    toggleDialogueMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('ns-mode-dialogue');

        if (isModeOn) {
            document.body.classList.remove('ns-mode-dialogue');
            this.triggerEditorUpdate();
            new Notice("Disabled: dialogue mode");
        } else {
            document.body.classList.remove('mode-redundant');
            document.body.classList.remove('mode-echo');
            document.body.classList.add('ns-mode-dialogue');
            this.triggerEditorUpdate();
            // new Notice("Dialogue mode: focused");
        }
    }

    // =================================================================
    // ✍️ Name Corrector
    // =================================================================
    async correctNames(view: MarkdownView) {
        await this.ensureFixListExists(false); // Ensure the file exists
        const dataFileName = `${this.getAidsFolderPath()}/FixList.md`;
        const fileObj = this.app.vault.getAbstractFileByPath(dataFileName);

        if (!(fileObj instanceof TFile)) return;
        const rawList = await this.app.vault.cachedRead(fileObj);

        const fixList: Record<string, string[]> = {};
        const linesList = rawList.trim().split('\n');
        let lastCorrectName = "";

        for (let line of linesList) {
            line = line.trim();
            if (!line || line.startsWith("//")) continue;
            const parts = line.split(/[|｜]/).map(p => p.trim());
            let correctName = "";
            let wrongNames: string[] = [];
            if (parts[0] !== "") {
                correctName = parts[0];
                // 🌟 神級修復：用 flatMap 配合正則表達式，將「Jon, John」用逗號或頓號斬件！
                wrongNames = parts.slice(1).flatMap(p => p.split(/[,，、]/)).map(p => p.trim()).filter(p => p);
                lastCorrectName = correctName;
            } else {
                if (lastCorrectName !== "") {
                    correctName = lastCorrectName;
                    // 🌟 同上，確保換行嘅錯字都會被斬件
                    wrongNames = parts.slice(1).flatMap(p => p.split(/[,，、]/)).map(p => p.trim()).filter(p => p);
                } else continue;
            }
            if (fixList[correctName]) {
                fixList[correctName] = [...new Set([...fixList[correctName], ...wrongNames])];
            } else {
                fixList[correctName] = wrongNames;
            }
        }



        const allReplacements: { wrong: string, correct: string, regex?: RegExp }[] = [];
        for (const [correctName, wrongNames] of Object.entries(fixList)) {
            wrongNames.forEach(wrong => {
                if (wrong !== correctName) {
                    allReplacements.push({ wrong: wrong, correct: correctName });
                }
            });
        }
        allReplacements.sort((a, b) => b.wrong.length - a.wrong.length);

        // 🔥 Performance leap: Pre-compile all Regex! Add English word boundary protection!
        const compiledReplacements = allReplacements.map(item => {
            const escapedWrong = item.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 🔥 Anti-false-positive mechanism 1: If the typo is fully English, force add word boundary \b
            const isEnglishWord = /^[a-zA-Z0-9].*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(item.wrong);
            let pattern = isEnglishWord ? `\\b${escapedWrong}\\b` : escapedWrong;

            // Handle cases where the correct name contains the wrong name (e.g., Wrong: John -> Correct: Johnathan)
            if (item.correct.startsWith(item.wrong)) {
                const suffix = item.correct.slice(item.wrong.length);
                if (suffix) {
                    const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    pattern += `(?!${escapedSuffix})`;
                }
            }
            return {
                ...item,
                regex: new RegExp(pattern, 'g') // Pre-built engine
            };
        });

        const content = view.editor.getValue();
        let totalCount = 0;
        const changesLog: string[] = [];
        const lines = content.split("\n");
        let inCodeBlock = false;
        let inYaml = false;

        const processedLines = lines.map((line, index) => {
            // ==========================================
            // 🛡️ Absolute Barrier 1: Large block protection (YAML and Code Block)
            // ==========================================
            // 1. Skip YAML block (usually at the top of the file)
            if (index === 0 && line.trim() === "---") { inYaml = true; return line; }
            if (inYaml) { if (line.trim() === "---") inYaml = false; return line; }

            // 2. Skip Markdown code block (```)
            if (line.trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
                return line;
            }
            if (inCodeBlock) return line;

            // 3. Skip system tags and attribute lines
            if (line.includes("<small>++ FILE_ID") || line.includes("++ FILE_ID:")) return line;
            if (line.trim().startsWith(">") && line.includes("::")) return line;

            let newLine = line;

            // ==========================================
            // 🎭 Absolute Barrier 2: "Mask Magic" (Protect inline URLs/code)
            // ==========================================
            const masks: { token: string, original: string }[] = [];
            let maskCounter = 0;

            // Mask URLs (http / https)
            newLine = newLine.replace(/https?:\/\/[^\s)]+/g, (match) => {
                const token = `__NS_MASK_${maskCounter++}__`;
                masks.push({ token, original: match });
                return token;
            });

            // Mask inline code (`code`)
            newLine = newLine.replace(/`[^`]+`/g, (match) => {
                const token = `__NS_MASK_${maskCounter++}__`;
                masks.push({ token, original: match });
                return token;
            });

            // ==========================================
            // ✍️ Execute text replacement
            // ==========================================
            compiledReplacements.forEach(item => {
                if (item.regex) {
                    item.regex.lastIndex = 0; // Reset index just in case
                    newLine = newLine.replace(item.regex, () => {
                        totalCount++; // Count occurrences
                        if (!changesLog.some(log => log.includes(`"${item.wrong}" -> "${item.correct}"`))) {
                            changesLog.push(`"${item.wrong}" -> "${item.correct}"`); // Write to Log
                        }
                        return item.correct; // Return correct word for replacement
                    });
                }
            });

            // ==========================================
            // 🪄 Remove mask: Restore inline URLs and code!
            // ==========================================
            masks.forEach(mask => {
                newLine = newLine.replace(mask.token, mask.original);
            });

            return newLine;
        });

        if (totalCount > 0) {
            const finalContent = processedLines.join("\n");
            if (finalContent !== content) {
                // 🌟 終極無痕更新魔法：捨棄 replaceEntireDocument，改用底層寫入！
                // Obsidian 會自動做 Smart Diff，只更新改錯字嗰一行，畫面 100% 零閃爍、不跳頂！
                await this.app.vault.modify(view.file, finalContent);

                new Notice(`Corrected ${totalCount} typos.\n` + changesLog.slice(0, 3).join("\n") + (changesLog.length > 3 ? "\n..." : ""), 5000);
            }
        } else {
            new Notice("Perfect! No typos found.");
        }
    }

    // =================================================================
    // 🧹 Clean Draft (Upgraded: Smart Diff & options)
    // =================================================================
    cleanDraft(view: MarkdownView) {
        // 🌟 注意呢度加咗 async
        new CleanDraftModal(this.app, async (options: any) => {
            let content = view.editor.getValue();
            const originalContent = content;

            // Execute cleanup based on user's choice
            if (options.removeComments) content = content.replace(/%%[\s\S]*?%%/g, "");
            if (options.removeStrikethrough) content = content.replace(/~~[\s\S]*?~~/g, "");
            if (options.removeHighlights) content = content.replace(/==/g, "");

            // Remove internal links
            if (options.removeInternalLinks) content = content.replace(/(?<!!)\[\[(?:[^\]]*\|)?([^\]]+)\]\]/g, "$1");

            // Remove Bold
            if (options.removeBold) content = content.replace(/\*\*([\s\S]*?)\*\*/g, "$1");

            // 🌟 替換為以下加入咗「防大地震鎖定」嘅版本：
            if (content !== originalContent) {
                // 1. 記低捲軸，專門用嚟應付 Internal Link 刪除引起嘅 Smart Diff 罷工！
                const scrollInfo = view.editor.getScrollInfo();

                // 2. 底層寫入
                await this.app.vault.modify(view.file, content);

                // 3. 強制鎖死捲軸 (拯救飛上頂嘅情況)
                setTimeout(() => {
                    view.editor.scrollTo(scrollInfo.left, scrollInfo.top);
                }, 100);

                new Notice("Clean draft complete! Selected markers have been removed.");
            } else {
                new Notice("No markers found that require cleanup.");
            }
        }).open();
    }

    // =================================================================
    // ✨ 魔法閃爍視覺回饋
    // =================================================================
    triggerMagicFlash(view: MarkdownView) {
        const editorEl = view.containerEl.querySelector('.markdown-source-view');
        if (editorEl) {
            editorEl.classList.remove('ns-editor-flash');
            void (editorEl as HTMLElement).offsetWidth; // 強制重繪 (Trigger Reflow)
            editorEl.classList.add('ns-editor-flash');

            // 動畫完結後清理 Class
            setTimeout(() => {
                editorEl.classList.remove('ns-editor-flash');
            }, 1500);
        }
    }



}