import zhTW from './zh-tw';

const en: Record<keyof typeof zhTW, string> = {
    // ==========================================
    // 📄 Templates
    // ==========================================
    default_template: `###### 🎬 {{SceneName}} <span class="ns-id" data-scene-id="{{UUID}}"></span>\n> [!NSmith] Scene Info\n> - Time:: \n> - POV:: \n> - Status:: #Writing\n> - Note:: \n\nStart writing here...`,
    wiki_template: `# {0}\n\n> [!info] Database\n> - Type:: \n> - Tags:: #Wiki\n\n`,
    history_header: `---\naliases:\n  - "{0}"\ncreated: {1}\nscene_id: {2}\n---\n# 📜 History: {0}\n> [!info] System\n> This file is bound by ID. History remains even if the original draft is renamed.\n\n`,
    history_preview: `# 👀 Preview: {0}\n> 📅 Version: {1}\n\n---\n\n{2}`,
    scene_db_header: `---\nTry: Dataview_Target\nUpdated: {0}\n---\n\n# 📊 Scene Database (Auto-generated)\n> [!warning] Do not modify this file manually\n\n`,

    // ==========================================
    // 🎛️ Panel UI & Buttons
    // ==========================================
    panel_title: "NovelSmith Console",
    tab_outline: "📑 Outline",
    tab_info: "ℹ️ Info",
    tab_history: "🕰️ History",
    btn_insert_card: "➕ Insert Card",
    btn_sync: "💾 Sync",
    btn_split: "✂️ Split",
    btn_merge: "🧲 Merge",
    btn_tools: "🛠️ Tools",
    btn_scrivenings: "📚 Scrivenings",
    btn_sync_and_close: "💾 Sync & Close",
    btn_discard_draft: "🗑️ Discard Draft",
    btn_export: "📤 Compile",

    // ==========================================
    // 🛠️ Tools Dropdown
    // ==========================================
    tool_correct_names: "✍️ Typo Police",
    tool_clean_draft: "🧹 Clean Draft",
    tool_dialogue_mode: "💬 Dialogue Mode",
    tool_redundant_mode: "🔍 Redundant Words",
    tool_auto_wiki: "🧠 Auto Wiki",

    // ==========================================
    // 📚 Scrivenings Mode
    // ==========================================
    scrivener_syncing: "⚡️ Preparing to sync back...",
    scrivener_compiling: "⚡️ Compiling scrivenings draft...",
    scrivener_compile_success: "✅ Compilation complete! {0} chapters loaded.",
    scrivener_sync_success: "✅ Sync complete! Updated {0} files.",
    scrivener_draft_archived: "✅ Sync complete! Draft archived.",
    scrivener_discarded: "🗑️ Draft discarded! Original manuscripts are untouched.\n(Check your OS Recycle Bin if you need it back)",
    scrivener_no_files: "⚠️ No markdown files found in this folder to compile.",
    scrivener_sync_error: "❌ Critical Error: FILE_ID markers missing! Cannot sync.",
    scrivener_id_priority: "🚀 Syncing... (ID Priority Mode)",
    scrivener_title_header: "## 📜 Scrivenings Mode: {0}\n",
    warn_draft_in_progress: "⚠️ Warning: Scrivenings mode is active!\nChanges here might be overwritten when syncing.\nPlease edit inside the draft file, or sync it first.",
    warn_archived_draft_sync: "💾 Archived draft saved (System will not assign IDs here).",
    warn_cant_scriv_here: "⛔ Access Denied: You cannot initiate Scrivenings Mode inside a Scrivenings draft (to prevent infinite loops)!",
    confirm_discard_draft: "🚨 Are you sure you want to discard this draft?\n\nThis will close and delete this temporary file. All changes made here will NOT be synced back to the original files!",
    warn_existing_draft_overwrite: "🚨 CRITICAL WARNING: Unsynced Draft Found!\n\nA Scrivenings draft already exists in this folder. If you restart Scrivenings Mode now, 【ALL UNSYNCED CHANGES】 in the old draft will be overwritten and lost forever!\n\nAre you sure you want to force an overwrite?\n(It is highly recommended to click 'Cancel', open the draft, and click '💾 Sync & Close' first)",
    warn_no_valid_manuscript: "⛔ Access Denied: No scene cards (######) found in this folder.\nScrivenings Mode can only be launched in folders containing valid manuscript files!",

    // ==========================================
    // 📌 System Protection (Main/Utils)
    // ==========================================
    protect_open_file_first: "❌ Please open a note first!",
    protect_backstage: "⛔ Access Denied: This is the protected _Backstage area. Writing features are disabled to protect system files!",
    protect_not_in_book: "⛔ Access Denied: This file is outside your designated 'Book Folder' ({0}). Features disabled.",
    protect_is_archived_draft: "⛔ This is an archived draft. Please return to the original chapter note for this action.",

    // ==========================================
    // 🎬 Plot & Outline
    // ==========================================
    outline_empty_note: "📄 This note is empty",
    outline_draft_title: "📚 Scrivenings Draft",
    outline_no_scenes: "📭 No scenes or chapters found",
    outline_info_empty: "👈 Place your cursor inside any scene in the editor to view its info.",
    outline_info_no_meta: "This scene has no metadata or notes.",
    outline_info_unfilled: " (Empty)",
    outline_updating_layout: "💾 Updating layout...",
    plot_input_insert: "➕ Insert Scene: Enter scene name",
    plot_inserted: "✅ Scene inserted: {0}",
    plot_input_split: "🔪 Split Scene: Enter new scene name",
    plot_split_success: "✅ Split successful: {0}",
    plot_merge_error_no_a: "⚠️ Please place your cursor inside the Target Scene (A) first.",
    plot_merge_error_no_b: "⚠️ No other scenes available to merge.",
    plot_merge_error_lost: "⚠️ Error: Target scene lost track. Merge aborted.",
    plot_merge_empty: "⚠️ The selected scene is empty. Nothing to absorb!",
    plot_merge_success: "✅ Scene absorbed successfully!",

    // ==========================================
    // 🕰️ History (Atomic Backups)
    // ==========================================
    hist_need_cursor: "👈 Place your cursor inside a scene in the editor.",
    hist_title: "📜 Backups for: {0}",
    hist_btn_save: "💾 Save Current Version",
    hist_no_id: "⚠️ Scene '{0}' has no ID. Please click 'Sync/Save' first to generate an ID.",
    hist_empty: "No backups found for this scene. Click the button above to create one!",
    hist_input_name: "Backup Name: {0}",
    hist_default_name: "Auto Backup",
    hist_save_success: "✅ Atomic backup successful!\n(ID: {0})",
    hist_btn_preview: "👀 Preview",
    hist_btn_restore: "⏪ Restore",
    hist_preview_opened: "👀 Preview opened (Right pane)",
    hist_restore_success: "✅ Version restored!",
    hist_err_no_scene: "⚠️ Please place your cursor inside a ###### scene.",
    hist_err_no_id: "🚫 Scene lacks an ID! Please run Smart Save first.",
    hist_err_empty_body: "⚠️ Scene content is empty. Cannot save backup.",

    // ==========================================
    // ✍️ Writing Aids
    // ==========================================
    write_redundant_off: "⚪️ Disabled: Redundant Words Mode",
    write_redundant_on: "🔍 Redundant Words Mode: Monitoring ({0} words)",
    write_redundant_empty: "⚠️ Redundant word list is empty.",
    write_dialogue_off: "⚪️ Disabled: Dialogue Mode",
    write_dialogue_on: "💬 Dialogue Mode: Focused",
    write_typo_success: "✅ Fixed {0} typos.\n{1}",
    write_typo_perfect: "🎉 Perfect! No typos found.",
    write_clean_success: "🧹 Clean Draft complete! Selected markers removed.",
    write_clean_empty: "👌 No markers found to clean.",
    wiki_scanning: "🔍 Scanning {0} links...",
    wiki_success: "✅ Wiki organized!\n🆕 Created: {0}\n📦 Moved: {1}\n📂 Target: {2}",
    wiki_no_links: "👀 No [[Internal Links]] found in this chapter.",
    wiki_all_done: "👌 All links are already in the Wiki folder.",

    // ==========================================
    // 📤 Compiler
    // ==========================================
    compile_empty: "⚠️ No valid chapters found in this folder.",
    compile_progress: "⚡️ Compiling {0} chapters...",
    compile_success: "✅ Compile complete!\n📂 {0}",
    modal_compile_opt_heading: "Insert file name as H2 heading",
    modal_compile_opt_heading_desc: "Automatically insert '## File Name' at the beginning of each chapter.",

    // ==========================================
    // ⚙️ System & Initialization
    // ==========================================
    sys_assign_ids_confirm: "This will assign a hidden ID to all scenes. Proceed?",
    sys_assign_ids_success: "✅ IDs successfully assigned to scenes!",
    sys_template_created: "✅ Generated: {0}",
    sys_template_failed: "❌ Creation failed. Check path.",
    sys_template_exists: "⚠️ File exists ({0}). Aborted to prevent overwrite.",
    sys_template_onboarding: "🎉 Here is your Scene Template!\nYou can modify it now (e.g., add/remove properties). Next time you click 'Insert Card', this new format will be used!",

    // ==========================================
    // 🪟 Modals
    // ==========================================
    modal_clean_title: "🧹 Clean Draft",
    modal_clean_desc: "Select the markers to remove from the current note:",
    modal_clean_opt1: "Remove Comments (%%...%%)",
    modal_clean_opt2: "Remove Strikethrough (~~...~~)",
    modal_clean_opt3: "Remove Highlights (==...==)",
    modal_clean_opt4: "Remove Internal Links ([[...]])",
    modal_clean_opt4_desc: "Keeps display text, removes double brackets.",
    modal_clean_btn: "Clean Now",

    // ==========================================
    // ⌨️ Command Palette
    // ==========================================
    cmd_smart_save: "System: Smart Save & Sync",
    cmd_open_structure: "Open Structure Outline",
    cmd_compile: "Export: Compile Clean Manuscript",
    cmd_scrivenings: "Toggle Scrivenings Mode",
    cmd_save_version: "Atomic Save: Current Scene",
    cmd_restore_version: "Atomic Restore: Current Scene",
    cmd_split_scene: "Plot: Split Scene",
    cmd_merge_scene: "Plot: Merge Scene",
    cmd_redundant: "Toggle Redundant Words Mode",
    cmd_correct_names: "Typo Police (Auto-correct Names)",
    cmd_dialogue: "Toggle Dialogue Mode",
    cmd_clean_draft: "Clean Draft (Remove markers)",
    cmd_auto_wiki: "Wiki: Auto Scan & Create",
};

export default en;