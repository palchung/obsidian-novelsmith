import { App, TFile, Notice } from 'obsidian';
import { NovelSmithSettings } from '../settings';
import { BACKSTAGE_DIR, SCENE_DB_FILE } from '../utils';
import { DashboardConfig } from '../modals';

export class DashboardManager {
    app: App;
    settings: NovelSmithSettings;

    constructor(app: App, settings: NovelSmithSettings) {
        this.app = app;
        this.settings = settings;
    }

    // =================================================================
    // 🔍 Scan scene cards attribute
    // =================================================================
    public async getAvailableAttributes(): Promise<string[]> {
        const dbPath = `${this.settings.bookFolderPath}/${BACKSTAGE_DIR}/${SCENE_DB_FILE}`;
        const dbFile = this.app.vault.getAbstractFileByPath(dbPath);

        if (!(dbFile instanceof TFile)) {
            new Notice("Cannot find scene database! Please press sync to generate a database.");
            return [];
        }

        const content = await this.app.vault.read(dbFile);


        const regex = /\[\s*([^\]\[\s:]+)\s*::/g;
        const matches = [...content.matchAll(regex)];

        const keys = new Set<string>();

        matches.forEach(m => {
            const key = m[1].trim();


            //const systemKeys = ["Scene", "SceneName", "SceneID", "Date"];
            const systemKeys = ["Scene", "SceneName", "SceneID"];
            if (!systemKeys.includes(key) && key !== "") {
                keys.add(key);
            }
        });


        const finalKeys = Array.from(keys);


        if (finalKeys.length === 0) {
            return ["Number of scenes"];
        }

        return finalKeys;
    }

    // =================================================================
    // 🪄 generate DataviewJS + Mermaid or DQL code
    // =================================================================
    public generateDashboardCode(config: DashboardConfig): string {
        const dbPath = `${this.settings.bookFolderPath}/${BACKSTAGE_DIR}/${SCENE_DB_FILE}`;
        const attrsJson = JSON.stringify(config.attributes);
        const flattenStr = config.flatten ? "true" : "false";
        const limitNum = config.limit;
        const chartType = config.chartType;
        const tableStyle = config.tableStyle;

        // ==========================================
        // 🗂️ A：DQL table 
        // ==========================================
        if (chartType === 'table') {
            let dql = "```dataview\nTABLE WITHOUT ID\n";

            // mode 1：table (Group By chapters)
            if (tableStyle === 'progress') {
                dql += `  key AS "Chapters",\n  rows.item.Scene AS "Scenes",\n`;
                config.attributes.forEach((attr: string, index: number) => {
                    const isLast = index === config.attributes.length - 1;
                    dql += `  map(rows.item, (i) => default(i.${attr}, "-")) AS "${attr}"${isLast ? "" : ","}\n`;
                });
                dql += `FROM "${dbPath}"\n`;
                dql += `FLATTEN file.lists AS item\n`;
                dql += `WHERE item.Scene\n`;
                dql += `GROUP BY meta(item.section).subpath\n`;
            }
            // mode 2：chart (Group By attributes，include least N time scenes)
            else {
                const targetAlias = "TargetAttr";
                dql += `  ${targetAlias} AS "📌 ${config.attributes.join(" & ")}",\n`;
                dql += `  length(rows) AS "appearance count",\n`;
                if (limitNum > 0) {
                    dql += `  join(slice(rows.item.Scene, choice(length(rows) > ${limitNum}, length(rows) - ${limitNum}, 0)), "<br>") AS "最近 ${limitNum} 次軌跡"\n`;
                } else {
                    dql += `  join(rows.item.Scene, "<br>") AS "All scenes"\n`;
                }
                dql += `FROM "${dbPath}"\n`;
                dql += `FLATTEN file.lists AS item\n`;
                dql += `WHERE item.Scene\n`;

                // 神級合併語法：FLATTEN flat(list(item.POV, item.Players))
                if (config.attributes.length > 1) {
                    const listArgs = config.attributes.map((a: string) => `item.${a}`).join(", ");
                    dql += `FLATTEN flat(list(${listArgs})) AS ${targetAlias}\n`;
                } else {
                    if (config.flatten) dql += `FLATTEN item.${config.attributes[0]} AS ${targetAlias}\n`;
                    else dql += `FLATTEN list(item.${config.attributes[0]}) AS ${targetAlias}\n`;
                }

                dql += `WHERE ${targetAlias} != null\n`;
                dql += `GROUP BY ${targetAlias}\n`;
                dql += `SORT length(rows) DESC\n`;
            }
            dql += "```";
            return dql;
        }

        // ==========================================
        // 📊 B：generate DataviewJS to draw Mermaid chart
        // ==========================================

        let code = `\`\`\`dataviewjs
// ==========================================
// 📊 NovelSmith Auto-Generated Dashboard Chart
// ==========================================
const dbPath = "${dbPath}";
const targetAttrs = ${attrsJson};
const flatten = ${flattenStr};
const limit = ${limitNum};
const chartType = "${chartType}";

const page = dv.page(dbPath);
if (!page) {
    dv.paragraph("cannot find scene database, please press sync to generate one.");
} else {
    const items = page.file.lists.where(l => l.Scene);
    const attrCounts = {};

    for (let item of items) {
        let vals = [];
        for (let attr of targetAttrs) {
            if (item[attr]) {
                let raw = Array.isArray(item[attr]) ? item[attr] : [item[attr]];
                for (let r of raw) {
                    let cleanText = "";
                    if (r.display) cleanText = r.display;
                    else if (r.path) cleanText = r.path.split('/').pop().replace('.md', '').split('#')[0];
                    else cleanText = String(r).replace(/\\[\\[(.*?)(?:\\|.*?)?\\]\\]/g, "$1").trim(); 
                    if (cleanText) vals.push(cleanText);
                }
            }
        }
        let finalVals = flatten ? vals : (vals.length > 0 ? [vals.join(" + ")] : []);
        for (let v of finalVals) {
            if (!v) continue;
            attrCounts[v] = (attrCounts[v] || 0) + 1;
        }
    }

    const sortedKeys = Object.keys(attrCounts).sort((a, b) => attrCounts[b] - attrCounts[a]);

    if (sortedKeys.length === 0) {
        dv.paragraph("📝 *No data to show*");
    } else {
        if (chartType === 'pie') {
            let mermaidCode = "pie title " + targetAttrs.join(" & ") + " stats\\n";
            for (let k of sortedKeys) {
                mermaidCode += \`    "\${k}" : \${attrCounts[k]}\\n\`;
            }
            dv.paragraph("\`\`\`mermaid\\n" + mermaidCode + "\`\`\`");

        } else if (chartType === 'bar') {
            let displayKeys = sortedKeys;
            if (limit > 0 && displayKeys.length > limit) displayKeys = displayKeys.slice(0, limit); 
            let mermaidCode = "xychart-beta\\n";
            mermaidCode += \`    title "\${targetAttrs.join(" & ")} quantity ranking"\\n\`;
            let xLabels = displayKeys.map(k => \`"\${k}"\`).join(", ");
            let yData = displayKeys.map(k => attrCounts[k]).join(", ");
            mermaidCode += \`    x-axis [\${xLabels}]\\n\`;
            mermaidCode += \`    y-axis "appearance count"\\n\`;
            mermaidCode += \`    bar [\${yData}]\\n\`;
            dv.paragraph("\`\`\`mermaid\\n" + mermaidCode + "\`\`\`");
        }
    }
}
\`\`\``;
        return code;
    }
}