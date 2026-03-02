import { App, Notice, MarkdownView, TFile } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { updateRedundantPatterns } from '../decorators';
import { AIDS_DIR, ensureFolderExists, replaceEntireDocument } from '../utils';
import { CleanDraftModal } from '../modals';

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
                // @ts-expect-error - Obsidian internal API
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const cm = leaf.view.editor.cm;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
                if (forceShowNotice) new Notice(`✅ Successfully generated Correction List: ${configPath}`);
            } catch {
                if (forceShowNotice) new Notice(`Creation failed, please check the path.`);
            }
        } else {
            if (forceShowNotice) new Notice(`File already exists (${configPath}), generation stopped.`);
        }
    }

    // =================================================================
    // 🔍 Redundant Words Mode
    // =================================================================
    async toggleRedundantMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-redundant');

        if (isModeOn) {
            document.body.classList.remove('mode-redundant');
            updateRedundantPatterns(null);
            this.triggerEditorUpdate();
            new Notice("Disabled: redundant words mode");
        } else {
            document.body.classList.remove('mode-dialogue');

            await this.ensureRedundantListExists(false); // Ensure the file exists
            const configPath = `${this.getAidsFolderPath()}/RedundantList.md`;
            const configFile = this.app.vault.getAbstractFileByPath(configPath);

            if (configFile instanceof TFile) {
                const configContent = await this.app.vault.read(configFile);
                const badWords = configContent.split(/[,，、\n]+/)
                    .map(w => w.trim())
                    .filter(w => w.length > 0 && !w.startsWith("//"));

                if (badWords.length === 0) { new Notice("The active redundant words list is empty."); return; }

                const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                badWords.sort((a, b) => b.length - a.length);

                // 🔥 Masterful fix: Bilingual (Chinese/English) compatible Regex builder
                const patternString = badWords.map(w => {
                    const escaped = escapeRegExp(w);
                    // Condition: If the word starts and ends with alphanumeric characters, add \b (word boundary)
                    const isEnglishWord = /^[a-zA-Z0-9].*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(w);
                    if (isEnglishWord) {
                        return `\\b${escaped}\\b`;
                    }
                    return escaped; // Chinese or other symbols remain unchanged
                }).join("|");

                const combinedRegex = new RegExp(`(${patternString})`, 'g');


                updateRedundantPatterns(combinedRegex);
                document.body.classList.add('mode-redundant');
                this.triggerEditorUpdate();
                new Notice(`🔍 Redundant Words Mode: Monitoring (${badWords.length} words)`);
            }
        }
    }

    // =================================================================
    // 💬 Dialogue Mode
    // =================================================================
    toggleDialogueMode(view: MarkdownView) {
        const isModeOn = document.body.classList.contains('mode-dialogue');

        if (isModeOn) {
            document.body.classList.remove('mode-dialogue');
            this.triggerEditorUpdate();
            new Notice("Disabled: dialogue mode");
        } else {
            document.body.classList.remove('mode-redundant');
            document.body.classList.add('mode-dialogue');
            this.triggerEditorUpdate();
            new Notice("Dialogue mode: focused");
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
        const rawList = await this.app.vault.read(fileObj);

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
                wrongNames = parts.slice(1).filter(p => p);
                lastCorrectName = correctName;
            } else {
                if (lastCorrectName !== "") {
                    correctName = lastCorrectName;
                    wrongNames = parts.slice(1).filter(p => p);
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
                // 🔥 P2 Optimization: Call global silent replacement
                replaceEntireDocument(view.editor, finalContent);

                new Notice(`✅ Corrected ${totalCount} typos.\n` + changesLog.slice(0, 3).join("\n") + (changesLog.length > 3 ? "\n..." : ""), 5000);
            }
        } else {
            new Notice("Perfect! No typos found.");
        }
    }

    // =================================================================
    // 🧹 Clean Draft (Upgraded: Supports options and internal links)
    // =================================================================
    cleanDraft(view: MarkdownView) {
        new CleanDraftModal(this.app, (options) => {
            let content = view.editor.getValue();
            const originalContent = content;

            // Execute cleanup based on user's choice
            if (options.removeComments) content = content.replace(/%%[\s\S]*?%%/g, "");
            if (options.removeStrikethrough) content = content.replace(/~~[\s\S]*?~~/g, "");
            if (options.removeHighlights) content = content.replace(/==/g, "");

            // 🔥 New: Remove internal links (keep display text, e.g., [[Alias|Display]] becomes Display)
            // 🔥 P2 Tweak: Use Negative Lookbehind (?<!\!), perfectly avoid images ![[...]], remove only plain text links!
            if (options.removeInternalLinks) content = content.replace(/(?<!!)\[\[(?:[^\]]*\|)?([^\]]+)\]\]/g, "$1");
            if (content !== originalContent) {
                // 🔥 P2 Optimization: Call global silent replacement
                replaceEntireDocument(view.editor, content);

                new Notice("Clean draft complete! Selected markers have been removed.");
            } else {
                new Notice("No markers found that require cleanup.");
            }
        }).open();
    }
}