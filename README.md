# ⚔️ NovelSmith (Beta)

**Forge your novel, one scene at a time.** NovelSmith is a comprehensive, Scrivener-inspired writing environment built directly into Obsidian. It transforms your vault into a powerhouse for long-form fiction writing, offering seamless chapter merging, atomic version control, dynamic outlining, intelligent worldbuilding, and no-code data analytics—all without breaking standard Markdown.

---

## 🎮 Try the Demo Vault (Interactive Tutorial)

Before installing NovelSmith on your precious manuscript, **we highly recommend downloading the [NovelSmith Demo Vault](https://github.com/palchung/novelsmith-demo).** This is not just a showcase—it serves as an interactive, hands-on tutorial. You can safely play around with Scrivenings Mode, drag and drop scene cards, and test the atomic backup features using the dummy text provided. It's the fastest way to understand how the plugin works!

---

## 🏗️ Core Architecture: Chapters vs. Scenes (Crucial for Scrivener Users)

If you are transitioning from traditional novel-writing software, you might be accustomed to the "1 File = 1 Scene" structure, where Chapters are simply folders. **NovelSmith takes a different, Obsidian-optimized approach:**

* **1 Markdown File = 1 Chapter:** To prevent your Obsidian vault from becoming cluttered with hundreds of tiny files (and to keep your Graph View clean), NovelSmith treats each physical `.md` file as a complete **Chapter**.
* **Scenes live inside the Chapter:** Within that Chapter file, you divide the text into smaller, modular **Scenes** using `###### 🎬 Scene Name` headers and Callout blocks for metadata. 
* **The Structure View Magic:** NovelSmith's custom right-sidebar reads these `######` headers and transforms them into draggable, color-coded **"Scene Cards"**. 
* **Why this matters:** This design allows you to scroll and read a whole chapter naturally in Obsidian without needing to compile, while the plugin still gives you the granular power to drag, drop, split, merge, and back up individual scenes within that chapter.

---

## ✨ Core Features

### 📚 Scrivenings Mode (Seamless Draft Editing)
Tired of jumping between dozens of chapter files? 
* **Merge & Edit:** Combine multiple chapter files into one continuous, temporary draft for seamless reading and editing.
* **Smart Sync (ID-Protected):** Click "Sync", and NovelSmith will intelligently distribute your edits back to their original chapter files using invisible, conflict-free tracking IDs. 
* **Safe Archiving & Discarding:** Option to archive your merged drafts with timestamps instead of deleting them. Realize your edits went wrong? Just click "Discard Draft" to safely trash the temporary file without touching your original chapters.

### 🗂️ Interactive Structure View & Global Plot Management
A custom right-sidebar control panel designed for novelists. *(Fully optimized for Mobile and Touch devices!)*
* **Cross-Chapter Migration (Drag & Drop):** When in Scrivenings Mode (merged draft), you can **drag and drop scenes across different chapters**! Seamlessly migrate a scene from Chapter 1 to Chapter 3 without manual copy-pasting. Changes sync instantly to your manuscript with zero-trace replacement (preserving your `Ctrl+Z` Undo history!).
* **Color-Coded Scene Cards:** Insert, split, or merge scenes with a single click. Assign colors (Red for Conflict, Blue for POV, etc.) to your Scene Cards to visually map out your plot in the sidebar.
* **Precision Merging:** Use the "Merge Scene" command to flawlessly absorb text from one scene into another based on their unique IDs.

### 🌍 Auto Wiki & Dynamic Worldbuilding (New)
Your World Bible is now fully integrated and always just one click away.
* **Smart Attribute Scanning:** Click "Auto Wiki", and NovelSmith will safely scan your scene callouts (e.g., `> - Characters:: Alice, Bob`). It intelligently splits names and automatically generates beautifully linked lore notes inside your Wiki folder using your custom templates.
* **Dynamic Info Tab:** The sidebar's "Info Tab" acts as a context-aware World Bible. As you write, it automatically lists the characters, locations, or magic items present in your *current scene* as clickable interactive chips.
* **Lazy-Load Reading & Instant Editing:** Click a character chip to instantly read their lore note in the side panel without lagging your device. Need to update a character's backstory? Click the ✏️ icon to open their note in an adjacent pane—your side panel will **live-update** the rendered text as you type!

### 📊 Dashboard Builder (No-Code Analytics) (New)
Transform your writing progress into a data control center, no coding required! Powered by Dataview and Mermaid JS.
* **Visual BI Generator:** Click "Insert Dashboard" to open a visual, user-friendly UI. Select the attributes you want to analyze (e.g., POV, Status, Rhythm) and the plugin will dynamically generate the complex queries for you.
* **Multiple Render Modes:** * 🥧 **Pie Charts:** Perfect for visualizing POV distribution or draft completion percentages.
  * 📊 **Bar Charts:** See which characters have the highest appearance rates.
  * 🗂️ **DQL Tables:** Generate powerful "Writing Progress Lists" (grouped by chapter) or "Character Trackers" (e.g., "Show me the last 3 scenes this character appeared in to check continuity").
* **Smart Flattening:** The engine automatically handles arrays (e.g., splitting `[[Alice]], [[Bob]]` into individual metrics) seamlessly behind the scenes.

### 💾 Atomic Version Control
Stop duplicating entire files just to save a backup of a single scene.
* **Scene-Level Backups:** Save versions of *individual scenes*. 
* **History Browser:** View the backup history of any scene you click on in the Structure View.
* **Preview & Restore:** Preview past versions in a side pane and restore them with one click without affecting the rest of the chapter.

### 🛠️ Intelligent Writing Aids
* **Redundant Word Highlighter:** Define a list of your overused words or cliches. NovelSmith will highlight them in real-time. It's fully optimized to sleep when deactivated, saving battery on laptops and iPads.
* **Dialogue Focus Mode:** Dims all descriptive text, allowing you to read and refine only the spoken dialogue.
* **CorrectName (Auto-Fixer):** A built-in proofreader. Define common misspellings of your character names, and fix them all across your current chapter with one click. 
* **Clean Draft:** Instantly strips out highlights, strikethroughs, and internal links (converting `[[Location]]` to `Location`) when you're ready to finalize a chapter.

### 📤 Manuscript Compiler
Ready to publish? The Compiler merges your chapters into a clean, final manuscript.
* Strips out all system IDs, metadata, and scene cards.
* Handles Windows/Mac line endings flawlessly.
* Outputs a clean, standard Markdown file ready for conversion to PDF, EPUB, or Word.

---

## 🚨 Best Practices & Important Warnings

To ensure the absolute safety of your manuscript, please keep these rules in mind:

1. **Do NOT Copy-Paste Scene Cards:** Every scene has a unique invisible ID. If you copy and paste a whole scene card, you will duplicate the ID. Always use the **"Insert Scene Card"** or **"Split Scene"** command.
2. **Lockdown during Scrivenings Mode:** When you are editing a merged draft, **do not rename, move, or edit the original chapter files** in your file explorer. Finish your edits in the draft, click **"Sync"**, and *then* manage your other files.
3. **DO NOT DELETE OR MODIFY structural markers in the temporary draft:**
   - **Chapter Headings** (e.g., `# 📄 Chapter 1`)
   - **File ID Markers** (e.g., `<span class="ns-file-id">++ FILE_ID: ... ++</span>`)
   NovelSmith relies strictly on these IDs as anchors. Modifying them will cause the sync process to fail!
4. **Use "Smart Save" (Ctrl+S / Cmd+S):** It automatically assigns IDs to newly written scenes and updates your shadow database in the background.
5. **Respect the `_Backstage` Folder:** Do not manually edit the files inside `History` or the `_Scene_Database.md`. Let the system manage them!
6. **Keep Novel Text outside of Callouts:** Ensure your actual novel text is written *below* the `> [!NSmith]` block, not inside it, or it will be stripped out during compilation!

---

## 🚀 Installation

**Manual Installation:**
1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the [Releases page](https://github.com/palchung/obsidian-novelsmith/releases).
2. Create a folder named `novelsmith` inside your vault's `.obsidian/plugins/` directory.
3. Place the downloaded files into the `novelsmith` folder.
4. Reload Obsidian and enable **NovelSmith** in the Community Plugins settings.

---

## ⚙️ Getting Started & Settings

To get the most out of NovelSmith, configure your workspace:

1. **Designate a Book Folder:** NovelSmith's features will *only* activate within this specific folder to protect your other Obsidian notes.
2. **Initialize:** Click the "Initialize Now" button in the settings to automatically generate your `_Backstage` folder and a customizable `NovelSmith_Template.md` scene card.
3. **Configure Auto Wiki:** Set your Wiki storage folder and define your dynamic Worldbuilding categories (e.g., POV, Location, Magic) in the settings.

---

## 🤝 Contributing & Support
Contributions, issues, and feature requests are highly welcome!
If this plugin helped you forge your novel and you'd like to support its continued development, consider buying me a coffee:

☕ [Buy Me a Coffee](https://buymeacoffee.com/palchung)

This project is licensed under the MIT License.