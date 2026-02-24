# ⚔️ NovelSmith (Still under development)

**Forge your novel, one scene at a time.** NovelSmith is a comprehensive, Scrivener-inspired writing environment built directly into Obsidian. It transforms your vault into a powerhouse for long-form fiction writing, offering seamless chapter merging, atomic version control, dynamic outlining, and intelligent writing aids—all without breaking standard Markdown.

## ✨ Core Features

### 📚 Scrivenings Mode (Seamless Draft Editing)
Tired of jumping between dozens of chapter files? 
* **Merge & Edit:** Combine multiple chapter files into one continuous, temporary draft for seamless reading and editing.
* **Smart Sync:** Click "Sync", and NovelSmith will intelligently distribute your edits back to their original chapter files using invisible, conflict-free tracking IDs. 
* **Safe Archiving:** Option to archive your merged drafts with timestamps instead of deleting them.

### 🗂️ Interactive Structure View
A custom right-sidebar control panel designed for novelists.
* **Drag-and-Drop Outline:** Reorder scenes and chapters intuitively. Changes sync instantly to your manuscript.
* **Scene Cards:** Insert, split, or merge scenes with a single click. Every scene is automatically assigned an invisible `%% SCENE_ID %%` that stays hidden in Live Preview but anchors your text perfectly.

### 💾 Atomic Version Control
Stop duplicating entire files just to save a backup of a single scene.
* **Scene-Level Backups:** Save versions of *individual scenes*. 
* **History Browser:** View the backup history of any scene you click on in the Structure View.
* **Preview & Restore:** Preview past versions in a side pane and restore them with one click without affecting the rest of the chapter.

### 🛠️ Intelligent Writing Aids
* **Redundant Word Highlighter:** Define a list of your overused words or cliches. NovelSmith will highlight them in real-time to help you trim the fat.
* **Dialogue Focus Mode:** Dims all descriptive text, allowing you to read and refine only the spoken dialogue.
* **CorrectName (Auto-Fixer):** A built-in proofreader. Define common misspellings of your character names or terms in a dictionary file, and fix them all across your current chapter with one click.
* **Clean Draft:** Instantly strips out highlights, strikethroughs, and internal comments when you're ready to finalize a chapter.

### 🧠 Auto-Wiki Generation
Keep your lore organized effortlessly. NovelSmith scans your current chapter for `[[Internal Links]]`. If a character or setting doesn't have a page yet, it automatically generates a profile template for them in your designated Wiki folder.

### 📤 Manuscript Compiler
Ready to publish? The Compiler merges your chapters into a clean, final manuscript.
* Strip out all system IDs, metadata, and scene cards.
* Optionally remove highlights, comments, and convert bold text.
* Outputs a clean, standard Markdown file ready for conversion to PDF, EPUB, or Word.

### 📊 Dataview Integration (Shadow Database)
NovelSmith automatically generates and maintains a `_Scene_Database.md` file in the background. It cleanly maps out all your scenes, POVs, and timelines, perfectly formatted for querying with the popular Dataview plugin.

---

## 🚀 Installation

**Manual Installation:**
1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the Releases page.
2. Create a folder named `novelsmith` inside your vault's `.obsidian/plugins/` directory.
3. Place the downloaded files into the `novelsmith` folder.
4. Reload Obsidian and enable **NovelSmith** in the Community Plugins settings.

---

## ⚙️ Getting Started & Settings

To get the most out of NovelSmith, configure your workspace in the plugin settings:

1. **Designate a Book Folder:** NovelSmith's features (like Scrivenings and Auto-Save) will *only* activate within this specific folder to protect your other Obsidian notes.
2. **Template Path:** Set up your default Scene Card template (NovelSmith will generate a default one for you).
3. **History & Wiki Folders:** Tell NovelSmith where to store your atomic backups and auto-generated lore pages.
4. **Writing Aid Lists:** Set the paths for your Redundant Words list and Fix-It list.

---

## 🥷 How It Works Under the Hood

NovelSmith respects your data. It relies on minimal, non-intrusive syntax:
* **Headers (`######`):** Used to identify scene boundaries.
* **Invisible Span Tags:** Scene IDs and File Boundaries use `<span class="ns-id">` tags. NovelSmith's CSS completely hides these in **Live Preview** mode to keep your writing environment beautiful and distraction-free. They only reveal themselves in Source Mode.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](link-to-your-issues-page).

## 📄 License

This project is licensed under the MIT License.