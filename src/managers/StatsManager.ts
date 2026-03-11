import { Notice } from 'obsidian';
import NovelSmithPlugin from '../../main';

// ============================================================
// 📊 Heatmap & Trophy Configuration (Easy to modify!)
// ============================================================

export const HEATMAP_LEVELS = [
    // 🌟 1 - 499 滴：微微亮起 (25% 透明度嘅主題色)
    { min: 1, max: 499, color: "rgba(var(--interactive-accent-rgb), 0.25)", label: "Warming Up" },

    // 🌟 500 - 1999 滴：漸入佳境 (50% 透明度嘅主題色)
    { min: 500, max: 1999, color: "rgba(var(--interactive-accent-rgb), 0.5)", label: "Flowing" },

    // 🌟 2000 - 4999 滴：高效產出 (80% 透明度嘅主題色)
    { min: 2000, max: 4999, color: "rgba(var(--interactive-accent-rgb), 0.8)", label: "Productive" },

    // 🌟 5000 滴以上：火力全開 (100% 實色主題色)
    { min: 5000, max: 999999, color: "var(--interactive-accent)", label: "On Fire!" }
];

export interface TrophyDef {
    id: string;
    name: string;
    desc: string;
    icon: string;
    threshold: number;
    type: "streak" | "total_drops" | "daily_record" | "daily_actions";
}

export const TROPHIES_CONFIG: TrophyDef[] = [
    // --- Streak Trophies ---
    { id: "streak_3", name: "Finding the Rhythm", desc: "Write for 3 consecutive days.", icon: "flame", threshold: 3, type: "streak" },
    { id: "streak_7", name: "Unstoppable", desc: "Write for 7 consecutive days.", icon: "zap", threshold: 7, type: "streak" },
    { id: "streak_30", name: "Iron Will", desc: "Write for 30 consecutive days.", icon: "shield", threshold: 30, type: "streak" },
    { id: "streak_100", name: "Writing Machine", desc: "Write for 100 consecutive days.", icon: "battery-charging", threshold: 100, type: "streak" },

    // --- Total Ink Drops Trophies ---
    { id: "total_10k", name: "First Blood", desc: "Consume 10,000 ink drops.", icon: "droplet", threshold: 10000, type: "total_drops" },
    { id: "total_50k", name: "Rising Star", desc: "Consume 50,000 ink drops.", icon: "star", threshold: 50000, type: "total_drops" },
    { id: "total_100k", name: "Novelist", desc: "Consume 100,000 ink drops. That's a whole book!", icon: "book-open", threshold: 100000, type: "total_drops" },
    { id: "total_500k", name: "Epic Creator", desc: "Consume 500,000 ink drops. A living legend.", icon: "crown", threshold: 500000, type: "total_drops" },

    // --- Daily Limit Trophies ---
    { id: "daily_3k", name: "Creative Burst", desc: "Consume 3,000 ink drops in a single day.", icon: "wind", threshold: 3000, type: "daily_record" },
    { id: "daily_8k", name: "Keyboard Smasher", desc: "Consume 8,000 ink drops in a single day.", icon: "coffee", threshold: 8000, type: "daily_record" },
    { id: "daily_15k", name: "The Tentacle Monster", desc: "Consume 15,000 ink drops in a single day. Are you human?", icon: "ghost", threshold: 15000, type: "daily_record" },

    // --- The Cheeky Trophies (搞笑抵死系列) ---
    { id: "action_50", name: "The Ctrl+S Addict", desc: "Saved 50 times in a day. Do you trust your computer that little?", icon: "save", threshold: 50, type: "daily_actions" },
    { id: "streak_180", name: "Touch Grass", desc: "A 180-day writing streak. The outside world misses you. Go look at a tree.", icon: "leaf", threshold: 180, type: "streak" },
    { id: "total_1m", name: "The Infinite Typewriter", desc: "A million monkeys could eventually write Shakespeare, but you wrote this.", icon: "keyboard", threshold: 1000000, type: "total_drops" },
    { id: "daily_10k", name: "Procrastinator's Panic", desc: "10,000 drops in a day! Did you stare at a blank page for a month and write this all today?", icon: "alarm-clock", threshold: 10000, type: "daily_record" },
    { id: "daily_20k", name: "Lore Dump Warning", desc: "20,000 drops! Pity the readers who have to read this massive exposition.", icon: "megaphone", threshold: 20000, type: "daily_record" }

];

// ============================================================
// 🗄️ Data Interfaces
// ============================================================
export interface DailyStat {
    inkDrops: number;
    actionCount: number;
}

export interface StatsData {
    dailyStats: Record<string, DailyStat>; // e.g., { "2026-03-11": { inkDrops: 1200, actionCount: 2 } }
    unlockedTrophies: string[];
    totalInkDrops: number;
    currentStreak: number;
    bestStreak: number;
    lastWriteDate: string;
}

export const DEFAULT_STATS: StatsData = {
    dailyStats: {},
    unlockedTrophies: [],
    totalInkDrops: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastWriteDate: ""
};

// ============================================================
// 🧠 Stats Manager Class
// ============================================================
export class StatsManager {
    plugin: NovelSmithPlugin;
    data: StatsData;

    constructor(plugin: NovelSmithPlugin) {
        this.plugin = plugin;
        this.data = DEFAULT_STATS;
    }

    async loadData(savedData: any) {
        this.data = Object.assign({}, DEFAULT_STATS, savedData);
    }

    // Call this whenever the user performs a "Save" or "Sync"
    async recordActivity(inkDropsToAdd: number) {
        // Only accept positive drops to avoid penalizing heavy editing/deletions
        const validDrops = Math.max(0, inkDropsToAdd);

        // Add base action points (1 action = 10 drops) to reward editing effort
        const totalDropsEarned = validDrops + 10;

        const todayStr = this.getTodayDateString();

        // 1. Update Daily Stats
        if (!this.data.dailyStats[todayStr]) {
            this.data.dailyStats[todayStr] = { inkDrops: 0, actionCount: 0 };
        }
        this.data.dailyStats[todayStr].inkDrops += totalDropsEarned;
        this.data.dailyStats[todayStr].actionCount += 1;

        // 2. Update Total Stats
        this.data.totalInkDrops += totalDropsEarned;

        // 3. Calculate Streak
        this.updateStreak(todayStr);

        // 4. Check for newly unlocked trophies
        this.checkTrophies(todayStr);

        // 5. Save to Obsidian's hidden data.json
        await this.plugin.saveSettings();
    }

    private updateStreak(todayStr: string) {
        if (this.data.lastWriteDate === todayStr) {
            // Already wrote today, streak remains the same
            return;
        }

        const yesterdayStr = this.getYesterdayDateString();

        if (this.data.lastWriteDate === yesterdayStr) {
            // Wrote yesterday, streak continues!
            this.data.currentStreak += 1;
        } else if (this.data.lastWriteDate !== todayStr) {
            // Missed a day (or first time), streak resets to 1
            this.data.currentStreak = 1;
        }

        this.data.lastWriteDate = todayStr;

        if (this.data.currentStreak > this.data.bestStreak) {
            this.data.bestStreak = this.data.currentStreak;
        }
    }

    private checkTrophies(todayStr: string) {
        const todayDrops = this.data.dailyStats[todayStr]?.inkDrops || 0;
        let newlyUnlocked = false;

        TROPHIES_CONFIG.forEach(trophy => {
            // Skip if already unlocked
            if (this.data.unlockedTrophies.includes(trophy.id)) return;

            let isUnlocked = false;

            if (trophy.type === "streak" && this.data.currentStreak >= trophy.threshold) {
                isUnlocked = true;
            } else if (trophy.type === "total_drops" && this.data.totalInkDrops >= trophy.threshold) {
                isUnlocked = true;
            } else if (trophy.type === "daily_record" && todayDrops >= trophy.threshold) {
                isUnlocked = true;
            }
            // 🌟 加多呢行，教系統判定「存檔次數」！
            else if (trophy.type === "daily_actions" && (this.data.dailyStats[todayStr]?.actionCount || 0) >= trophy.threshold) {
                isUnlocked = true;
            }

            if (isUnlocked) {
                this.data.unlockedTrophies.push(trophy.id);
                newlyUnlocked = true;
                // Pop a beautiful notice!
                new Notice(`🏆 Trophy Unlocked: ${trophy.name}!\n${trophy.desc}`, 6000);
            }
        });

        if (newlyUnlocked) {
            // Optional: trigger a UI refresh event if the Stats tab is open
        }
    }

    // --- Date Helpers (Local Time) ---
    private getTodayDateString(): string {
        const d = new Date();
        // Adjust for timezone offset to get accurate local date string (YYYY-MM-DD)
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split('T')[0];
    }

    private getYesterdayDateString(): string {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split('T')[0];
    }
}