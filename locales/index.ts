import zhTW from './zh-tw';
import en from './en';

// 建立一個對應表
const localeMap: { [k: string]: Partial<typeof zhTW> } = {
    'zh': zhTW,
    'zh-tw': zhTW,
    'zh-hk': zhTW,
    'en': en
};

// 探測 Obsidian 當前的介面語言 (localStorage 存有 Obsidian 的語言設定)
const locale = window.localStorage.getItem('language') || 'en';

// 找出對應的字典，如果找不到 (例如用家設了法文)，預設使用英文
const currentDict = localeMap[locale] || localeMap['en'];

// =========================================================
// 🔥 核心翻譯函數 t()
// =========================================================
export function t(key: keyof typeof zhTW, ...args: (string | number)[]): string {
    // 1. 拿取翻譯字串 (如果當前字典沒有，降級拿英文，再沒有就直接顯示 Key)
    let str = currentDict[key] || localeMap['en'][key] || key;

    // 2. 替換變數 (例如將 {0} 換成檔案數量)
    if (args.length > 0) {
        args.forEach((arg, index) => {
            str = str.replace(`{${index}}`, String(arg));
        });
    }

    return str;
}


//import { t } from '../locales';

// 以前：
//new Notice("✅ 同步完成！草稿已封存");
// 以後：
//new Notice(t('scrivener_draft_archived'));

// 有變數嘅：
//new Notice(t('scrivener_compile_success', files.length));