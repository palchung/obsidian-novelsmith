// src/modals/StatsModal.ts
import { Modal, setIcon } from 'obsidian';
import NovelSmithPlugin from '../../main';
import { HEATMAP_LEVELS, TROPHIES_CONFIG } from '../managers/StatsManager';

// ============================================================
// 🏆 Writer's Journey Dashboard Modal (Elegant Dynamic Edition)
// ============================================================
export class StatsDashboardModal extends Modal {
    plugin: NovelSmithPlugin;
    selectedScope: string; // 🌟 可是 'All' 或者具體年份如 '2026'

    constructor(plugin: NovelSmithPlugin) {
        super(plugin.app);
        this.plugin = plugin;
        this.selectedScope = "All"; // 預設打開歷史總計
    }

    onOpen() {
        this.modalEl.setCssStyles({ width: "85vw", height: "85vh", maxWidth: "1000px" });
        this.renderDashboard();
    }

    renderDashboard() {
        const { contentEl } = this;
        contentEl.empty();

        const statsData = this.plugin.statsManager.data;

        // ==========================================
        // 📊 智能結算引擎：過濾數據，動態計算該年份的獎盃與數據
        // ==========================================
        const yearsSet = new Set<string>();
        yearsSet.add(new Date().getFullYear().toString());
        Object.keys(statsData.dailyStats).forEach(dateStr => yearsSet.add(dateStr.split('-')[0]));
        const availableScopes = ["All", ...Array.from(yearsSet).sort((a, b) => parseInt(b) - parseInt(a))];

        let scopeDrops = 0;
        let scopeActiveDays = 0;
        let scopeBestStreak = 0;
        let scopeMaxDaily = 0;
        let scopeMaxActions = 0;

        const sortedDates = Object.keys(statsData.dailyStats)
            .filter(d => this.selectedScope === "All" || d.startsWith(this.selectedScope))
            .sort();

        let currentTempStreak = 0;
        let lastDate: Date | null = null;

        sortedDates.forEach(dateStr => {
            const stat = statsData.dailyStats[dateStr];

            if (stat.actionCount && stat.actionCount > scopeMaxActions) scopeMaxActions = stat.actionCount;
            if (stat.inkDrops > 0) {
                scopeDrops += stat.inkDrops;
                scopeActiveDays++;
                if (stat.inkDrops > scopeMaxDaily) scopeMaxDaily = stat.inkDrops;

                const currDate = new Date(dateStr);
                if (lastDate) {
                    const diffTime = currDate.getTime() - lastDate.getTime();
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays === 1) currentTempStreak++;
                    else currentTempStreak = 1;
                } else {
                    currentTempStreak = 1;
                }
                if (currentTempStreak > scopeBestStreak) scopeBestStreak = currentTempStreak;
                lastDate = currDate;
            }
        });

        // ==========================================
        // 🎨 構建優雅書卷氣 UI
        // ==========================================
        const headerRow = contentEl.createDiv();
        headerRow.setCssStyles({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" });
        headerRow.createEl("h2", { text: "Writer's journey", attr: { style: "margin: 0; font-family: 'Georgia', serif; font-style: italic;" } });

        const mainContainer = contentEl.createDiv({ cls: "ns-dashboard-container" });

        const sidebar = mainContainer.createDiv({ cls: "ns-dashboard-sidebar" });
        availableScopes.forEach(scope => {
            const btnText = scope === "All" ? "All Time" : scope;
            const btn = sidebar.createEl("button", { text: btnText, cls: `ns-year-link ${scope === this.selectedScope ? 'is-active' : ''}` });
            btn.onclick = () => {
                this.selectedScope = scope;
                this.renderDashboard();
            };
        });

        const contentArea = mainContainer.createDiv({ cls: "ns-dashboard-content" });

        const heroContainer = contentArea.createDiv({ cls: "ns-stats-hero" });
        const createStatItem = (label: string, value: string) => {
            const box = heroContainer.createDiv({ cls: "ns-stat-item" });
            box.createDiv({ text: value, cls: "ns-stat-value" });
            box.createDiv({ text: label, cls: "ns-stat-label" });
        };

        const prefix = this.selectedScope === "All" ? "Total" : "Yearly";
        createStatItem(`${prefix} Ink Drops`, scopeDrops.toLocaleString());
        createStatItem("Active Days", `${scopeActiveDays}`);
        createStatItem("Longest Streak", `${scopeBestStreak}`);
        createStatItem("Best Day", scopeMaxDaily.toLocaleString());

        if (this.selectedScope !== "All") {
            contentArea.createEl("h3", { text: `Momentum of ${this.selectedScope}`, cls: "ns-literary-h3" });
            const heatmapWrapper = contentArea.createDiv({ cls: "ns-heatmap-wrapper" });
            const heatmapGrid = heatmapWrapper.createDiv({ cls: "ns-heatmap-grid" });

            const isCurrentYear = this.selectedScope === new Date().getFullYear().toString();
            let endDate = new Date(parseInt(this.selectedScope), 11, 31, 12, 0, 0);
            if (isCurrentYear) endDate = new Date();
            endDate.setMinutes(endDate.getMinutes() - endDate.getTimezoneOffset());

            for (let i = 364; i >= 0; i--) {
                const targetDate = new Date(endDate);
                targetDate.setDate(targetDate.getDate() - i);
                const dateStr = targetDate.toISOString().split('T')[0];

                const drops = statsData.dailyStats[dateStr]?.inkDrops || 0;
                const cell = heatmapGrid.createDiv({ cls: "ns-heatmap-cell" });

                let cellColor = "var(--background-modifier-border)";
                if (drops > 0) {
                    const level = [...HEATMAP_LEVELS].reverse().find(l => drops >= l.min);
                    if (level) cellColor = level.color;
                }
                cell.setCssStyles({ backgroundColor: cellColor });
                cell.title = `${dateStr}: ${drops.toLocaleString()} drops`;
            }
            setTimeout(() => { heatmapWrapper.scrollLeft = heatmapWrapper.scrollWidth; }, 10);
        }

        const roomTitle = this.selectedScope === "All" ? "Eternal Hall of Fame" : `Trophies Unlocked in ${this.selectedScope}`;
        contentArea.createEl("h3", { text: roomTitle, cls: "ns-literary-h3" });

        const trophyRoom = contentArea.createDiv({ cls: "ns-trophy-room" });

        TROPHIES_CONFIG.forEach(trophy => {
            let isUnlocked = false;

            if (trophy.type === "streak" && scopeBestStreak >= trophy.threshold) isUnlocked = true;
            if (trophy.type === "total_drops" && scopeDrops >= trophy.threshold) isUnlocked = true;
            if (trophy.type === "daily_record" && scopeMaxDaily >= trophy.threshold) isUnlocked = true;
            if (trophy.type === "daily_actions" && scopeMaxActions >= trophy.threshold) isUnlocked = true;

            const card = trophyRoom.createDiv({ cls: `ns-trophy-card ${isUnlocked ? 'is-unlocked' : 'is-locked'}` });

            const iconContainer = card.createDiv({ cls: "ns-trophy-icon" });
            setIcon(iconContainer, isUnlocked ? trophy.icon : "lock");
            if (iconContainer.querySelector("svg")) iconContainer.querySelector("svg").style.width = "30px";

            card.createDiv({ text: trophy.name, cls: "ns-trophy-name" });
            card.createDiv({ text: trophy.desc, cls: "ns-trophy-desc" });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}