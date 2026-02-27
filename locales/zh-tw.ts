export default {
    // ==========================================
    // 📄 預設範本 (Templates)
    // ==========================================
    default_template: `###### 🎬 {{SceneName}} <span class="ns-id" data-scene-id="{{UUID}}"></span>\n> [!NSmith] 情節資訊\n> - Time:: \n> - POV:: \n> - Status:: #Writing\n> - Note:: \n\n這裡開始寫正文...`,
    wiki_template: `# {0}\n\n> [!info] 設定資料\n> - Type:: \n> - Tags:: #Wiki\n\n`,
    history_header: `---\naliases:\n  - "{0}"\ncreated: {1}\nscene_id: {2}\n---\n# 📜 歷史紀錄：{0}\n> [!info] 系統提示\n> 此檔案以 ID 命名，即使原稿改名，紀錄依然存在。\n\n`,
    history_preview: `# 👀 預覽：{0}\n> 📅 版本：{1}\n\n---\n\n{2}`,
    scene_db_header: `---\nTry: Dataview_Target\nUpdated: {0}\n---\n\n# 📊 場景數據庫 (系統自動生成)\n> [!warning] 請勿手動修改此檔案\n\n`,

    // ==========================================
    // 🎛️ 面板 UI 與共用按鈕
    // ==========================================
    panel_title: "NovelSmith 控制台",
    tab_outline: "📑 大綱",
    tab_info: "ℹ️ 資訊",
    tab_history: "🕰️ 歷史",
    btn_insert_card: "➕ 插入卡片",
    btn_sync: "💾 同步",
    btn_split: "✂️ 分拆",
    btn_merge: "🧲 吸星",
    btn_tools: "🛠️ 工具",
    btn_scrivenings: "📚 串聯模式",
    btn_sync_and_close: "💾 同步並結束",
    btn_discard_draft: "🗑️ 捨棄草稿",
    btn_export: "📤 匯出文稿",

    // ==========================================
    // 🛠️ 工具下拉選單
    // ==========================================
    tool_correct_names: "✍️ 正字刑警",
    tool_clean_draft: "🧹 一鍵定稿",
    tool_dialogue_mode: "💬 對話模式",
    tool_redundant_mode: "🔍 贅字模式",
    tool_auto_wiki: "🧠 自動百科",

    // ==========================================
    // 📚 串聯模式 (Scrivener)
    // ==========================================
    scrivener_syncing: "⚡️ 準備同步回寫 (Sync)...",
    scrivener_compiling: "⚡️ 準備串聯編譯...",
    scrivener_compile_success: "✅ 編譯完成！共 {0} 章",
    scrivener_sync_success: "✅ 同步完成！更新了 {0} 個檔案。",
    scrivener_draft_archived: "✅ 同步完成！草稿已封存",
    scrivener_discarded: "🗑️ 草稿已捨棄！原稿維持不變。\n(如需挽回，請到電腦作業系統的垃圾桶找回)",
    scrivener_no_files: "⚠️ 資料夾內沒有可串聯的檔案。",
    scrivener_sync_error: "❌ 嚴重錯誤：找不到任何 FILE_ID 標記！無法同步。",
    scrivener_id_priority: "🚀 同步中… (ID 優先模式)",
    scrivener_title_header: "## 📜 串聯潤稿模式：{0}\n",
    warn_draft_in_progress: "⚠️ 警告：串聯模式進行中！\n在此處的修改可能會在稍後同步時被覆寫。\n請返回草稿檔修改，或先結束串聯。",
    warn_archived_draft_sync: "💾 封存草稿已儲存 (為保護檔案，系統不會在此重新分配 ID)。",
    warn_cant_scriv_here: "⛔ 系統拒絕：這是一份串聯草稿檔（或封存草稿），不能在此處啟動串聯模式以免發生無限迴圈！",
    confirm_discard_draft: "🚨 確定要放棄這份草稿嗎？\n\n這將會關閉並刪除此臨時檔案，您剛才在草稿裡打的所有字都不會同步回原稿！",
    warn_existing_draft_overwrite: "🚨 嚴重警告：發現未同步的串聯草稿！\n\n此資料夾內已經有一個串聯草稿存在。如果您現在重新啟動串聯模式，舊草稿中【所有未同步的修改】將會被徹底覆寫並永久遺失！\n\n確定要強行覆寫嗎？\n(強烈建議先按「取消」，打開該草稿並點擊「💾 同步並結束」)",
    warn_no_valid_manuscript: "⛔ 系統拒絕：此資料夾內的筆記沒有任何劇情卡片 (######)。\n串聯模式只能在包含小說文稿的資料夾中啟動！",

    // ==========================================
    // 📌 系統保護結界 (Main/Utils)
    // ==========================================
    protect_open_file_first: "❌ 請先打開筆記！",
    protect_backstage: "⛔ 系統拒絕：這裡是被鎖定的系統後台 (_Backstage)，為保護檔案，已禁用所有寫作功能！",
    protect_not_in_book: "⛔ 系統拒絕：此檔案不在您的「專屬寫作資料夾」({0}) 內，已禁用插件功能以保護檔案。",
    protect_is_archived_draft: "⛔ 這是一份封存草稿，請返回原本的章節筆記中進行此操作。",

    // ==========================================
    // 🎬 情節管理 (Plot/Outline)
    // ==========================================
    outline_empty_note: "📄 這份筆記是空的",
    outline_draft_title: "📚 串聯模式草稿",
    outline_no_scenes: "📭 找不到章節或情節標記",
    outline_info_empty: "👈 請將游標放在編輯器內的任何一個情節中，以檢視其資訊。",
    outline_info_no_meta: "這個情節沒有任何屬性或筆記。",
    outline_info_unfilled: " (未填寫)",
    outline_updating_layout: "💾 排版更新中...",
    plot_input_insert: "➕ 插入劇情卡片：請輸入情節名稱",
    plot_inserted: "✅ 已插入劇情卡片：{0}",
    plot_input_split: "🔪 分拆新情節：請輸入名稱",
    plot_split_success: "✅ 已從此處分拆出：{0}",
    plot_merge_error_no_a: "⚠️ 請先將游標放在主情節 (A) 範圍內",
    plot_merge_error_no_b: "⚠️ 找不到其他情節可以合併",
    plot_merge_error_lost: "⚠️ 發生錯誤：搵唔返主情節，合併中止。",
    plot_merge_empty: "⚠️ 被選取的情節係空嘅，冇嘢好吸！",
    plot_merge_success: "✅ 成功吸取內容！",

    // ==========================================
    // 🕰️ 歷史備份 (History)
    // ==========================================
    hist_need_cursor: "👈 請將游標放在編輯器內的任何一個情節中。",
    hist_title: "📜 {0} 的備份",
    hist_btn_save: "💾 備份當前版本 (原子存檔)",
    hist_no_id: "⚠️ 情節「{0}」尚未有 ID，無法讀取備份。請先點擊上方「💾 儲存/同步」按鈕為其分配 ID。",
    hist_empty: "此情節目前沒有任何備份紀錄。點擊上方按鈕建立第一個備份！",
    hist_input_name: "備份：{0}",
    hist_default_name: "自動備份",
    hist_save_success: "✅ 原子備份成功！\n(ID: {0})",
    hist_btn_preview: "👀 預覽",
    hist_btn_restore: "⏪ 還原",
    hist_preview_opened: "👀 預覽已開啟 (右側)",
    hist_restore_success: "✅ 版本已還原！",
    hist_err_no_scene: "⚠️ 請將游標放在 ###### 情節範圍內",
    hist_err_no_id: "🚫 此情節尚未有 ID！請先執行智能儲存。",
    hist_err_empty_body: "⚠️ 情節內文是空的，無法存檔。",

    // ==========================================
    // ✍️ 寫作輔助 (Writing Aids)
    // ==========================================
    write_redundant_off: "⚪️ 已關閉：贅字模式",
    write_redundant_on: "🔍 贅字模式：監控中 ({0} 詞)",
    write_redundant_empty: "⚠️ 有效贅字清單為空",
    write_dialogue_off: "⚪️ 已關閉：對話模式",
    write_dialogue_on: "💬 對話模式：聚焦中",
    write_typo_success: "✅ 修正了 {0} 個錯處。\n{1}",
    write_typo_perfect: "🎉 完美！沒有發現錯別字。",
    write_clean_success: "🧹 一鍵定稿完成！選定的標記已清除。",
    write_clean_empty: "👌 沒有發現需要清除的標記。",
    wiki_scanning: "🔍 正在掃描 {0} 個連結...",
    wiki_success: "✅ 百科整理完成！\n🆕 新建：{0}\n📦 搬運：{1}\n📂 目標：{2}",
    wiki_no_links: "👀 這一章無發現任何 [[Internal Link]]。",
    wiki_all_done: "👌 所有連結都已歸檔。",

    // ==========================================
    // 📤 匯出文稿 (Compiler)
    // ==========================================
    compile_empty: "⚠️ 資料夾內沒有可編譯的章節。",
    compile_progress: "⚡️ 正在編譯 {0} 個章節...",
    compile_success: "✅ 編譯完成！\n📂 {0}",
    modal_compile_opt_heading: "將檔名轉換為 H2 章節標題",
    modal_compile_opt_heading_desc: "在每個檔案的開頭自動插入 ## 檔案名稱",

    // ==========================================
    // ⚙️ 系統與設定 (Settings & Initialization)
    // ==========================================
    sys_assign_ids_confirm: "這將會為所有情節標題添加隱形 ID，確定嗎？",
    sys_assign_ids_success: "✅ 已成功為情節分配身份證！",
    sys_template_created: "✅ 成功生成：{0}",
    sys_template_failed: "❌ 建立失敗，請檢查路徑",
    sys_template_exists: "⚠️ 檔案已經存在 ({0})，系統停止生成以免覆蓋。",
    sys_template_onboarding: "🎉 這是你的專屬劇情卡片範本！\n你可以現在修改它 (例如加減屬性)，設定好之後，再次點擊「插入卡片」就會使用這個新格式喔！",

    // ==========================================
    // 🪟 彈出視窗 (Modals)
    // ==========================================
    modal_clean_title: "🧹 一鍵定稿",
    modal_clean_desc: "請選擇要從當前文章中清除的標記 (預設全選)：",
    modal_clean_opt1: "移除註釋 (%%...%%)",
    modal_clean_opt2: "移除刪除線 (~~...~~)",
    modal_clean_opt3: "移除高亮 (==...==)",
    modal_clean_opt4: "移除內部連結 ([[...]])",
    modal_clean_opt4_desc: "保留顯示文字，僅移除雙括號",
    modal_clean_btn: "確定清除",

    // ==========================================
    // ⌨️ Obsidian 指令名稱 (Command Palette)
    // ==========================================
    cmd_smart_save: "System: Smart Save & Sync (智能儲存與同步)",
    cmd_open_structure: "Open Structure Outline (打開觸控大綱)",
    cmd_compile: "Export: Compile Clean Manuscript (匯出最終文稿)",
    cmd_scrivenings: "Toggle Scrivenings Mode (串聯模式)",
    cmd_save_version: "Atomic Save: Current Scene (原子存檔)",
    cmd_restore_version: "Atomic Restore: Current Scene (還原版本)",
    cmd_split_scene: "Plot: Split Scene (情節分拆)",
    cmd_merge_scene: "Plot: Merge Scene (吸星大法)",
    cmd_redundant: "🔍 贅字模式 (切換)",
    cmd_correct_names: "✍️ 正字刑警 (一鍵修正名詞)",
    cmd_dialogue: "💬 對話模式 (切換)",
    cmd_clean_draft: "🧹 一鍵定稿 (清除所有標記)",
    cmd_auto_wiki: "Wiki: Auto Scan & Create (自動百科)",
};