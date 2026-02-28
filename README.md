# ⚔️ NovelSmith (Still Under Development)

**Forge your novel, one scene at a time.** NovelSmith is a comprehensive, Scrivener-inspired writing environment built directly into Obsidian. It transforms your vault into a powerhouse for long-form fiction writing, offering seamless chapter merging, atomic version control, dynamic outlining, color-coded scene management, and intelligent writing aids—all without breaking standard Markdown.

---

## 🏗️ Core Architecture: Chapters vs. Scenes (Crucial for Scrivener Users)

If you are transitioning from Scrivener or other traditional novel-writing software, you might be accustomed to the "1 File = 1 Scene" structure, where Chapters are simply folders. **NovelSmith takes a different, Obsidian-optimized approach:**

* **1 Markdown File = 1 Chapter:** To prevent your Obsidian vault from becoming cluttered with hundreds of tiny files (and to keep your Graph View clean), NovelSmith treats each physical `.md` file as a complete **Chapter**.
* **Scenes live inside the Chapter:** Within that Chapter file, you divide the text into smaller, modular **Scenes** using `###### 🎬 Scene Name` headers. 
* **The Structure View Magic:** NovelSmith's custom right-sidebar reads these `######` headers and transforms them into draggable, color-coded **"Scene Cards"**. 
* **Why this matters:** This design allows you to scroll and read a whole chapter naturally in Obsidian without needing to compile, while the plugin still gives you the granular power to drag, drop, split, merge, and back up individual scenes within that chapter.

---

## ✨ Core Features

### 📚 Scrivenings Mode (Seamless Draft Editing)
Tired of jumping between dozens of chapter files? 
* **Merge & Edit:** Combine multiple chapter files into one continuous, temporary draft for seamless reading and editing.
* **Smart Sync (ID-Protected):** Click "Sync", and NovelSmith will intelligently distribute your edits back to their original chapter files using invisible, conflict-free tracking IDs. (It even detects if you accidentally deleted an ID and recovers it!)
* **Safe Archiving & Discarding:** Option to archive your merged drafts with timestamps instead of deleting them. Realize your edits went wrong? Just click "Discard Draft" to safely trash the temporary file without touching your original chapters.

### 🗂️ Interactive Structure View & Plot Management
A custom right-sidebar control panel designed for novelists.
* **Drag-and-Drop Outline:** Reorder scenes and chapters intuitively. Changes sync instantly to your manuscript with zero-trace replacement (preserving your `Ctrl+Z` Undo history!).
* **Color-Coded Scene Cards:** Insert, split, or merge scenes with a single click. Assign colors (Red for Conflict, Blue for POV A, etc.) to your Scene Cards to visually map out your plot in the sidebar.
* **Precision Merging:** Use the "Merge Scene" command to flawlessly absorb text from one scene into another based on their unique IDs.

### 💾 Atomic Version Control
Stop duplicating entire files just to save a backup of a single scene.
* **Scene-Level Backups:** Save versions of *individual scenes*. 
* **History Browser:** View the backup history of any scene you click on in the Structure View.
* **Preview & Restore:** Preview past versions in a side pane and restore them with one click without affecting the rest of the chapter.

### 🛠️ Intelligent Writing Aids
* **Redundant Word Highlighter:** Define a list of your overused words or cliches. NovelSmith will highlight them in real-time. It's fully optimized to sleep when deactivated, saving battery on laptops and iPads.
* **Dialogue Focus Mode:** Dims all descriptive text, allowing you to read and refine only the spoken dialogue.
* **CorrectName (Auto-Fixer):** A built-in proofreader. Define common misspellings of your character names, and fix them all across your current chapter with one click. (Safely ignores URLs, code blocks, and YAML).
* **Clean Draft:** Instantly strips out highlights, strikethroughs, and internal links (converting `[[Location]]` to `Location` while perfectly preserving image links like `![[Map.png]]`) when you're ready to finalize a chapter.

### 📤 Manuscript Compiler
Ready to publish? The Compiler merges your chapters into a clean, final manuscript.
* Strips out all system IDs, metadata, and scene cards.
* Handles Windows/Mac line endings flawlessly.
* Outputs a clean, standard Markdown file ready for conversion to PDF, EPUB, or Word.

### 📊 Dataview Integration (Shadow Database)
NovelSmith automatically generates and maintains a `_Scene_Database.md` file in the background. It cleanly maps out all your scenes, POVs, colors, and timelines, perfectly formatted for querying with the popular Dataview plugin.

---

## 🚨 Best Practices & Important Warnings

To ensure the absolute safety of your manuscript, please keep these rules in mind:

1. **Do NOT Copy-Paste Scene Cards:** Every scene has a unique invisible ID (e.g., `<span class="ns-id" data-scene-id="..."/>`). If you copy and paste a whole scene card, you will duplicate the ID. 
   * *Best Practice:* Always use the **"Insert Scene Card"** or **"Split Scene"** command to generate new scenes. If you must copy text, only copy the body text, not the `######` header. (NovelSmith has an auto-linting feature to catch duplicated IDs, but it's best to avoid doing it manually).
2. **Lockdown during Scrivenings Mode:** When you are editing a merged draft (Scrivenings Mode), **do not rename, move, or edit the original chapter files** in your file explorer. Finish your edits in the draft, click **"Sync"**, and *then* manage your other files.
3. **Use "Smart Save" (Ctrl+S / Cmd+S):**
   NovelSmith provides a "Smart Save" command. Use it often! It automatically assigns IDs to newly written scenes and updates your shadow database in the background.
4. **Respect the `_Backstage` Folder:**
   NovelSmith creates a `_Backstage` folder to store your templates, backups, and databases. Do not manually edit the files inside `History` or the `_Scene_Database.md`. Let the system manage them!
5. **Keep Novel Text outside of Callouts:**
   Your scene metadata lives inside a blockquote callout (e.g., `> [!NSmith]`). Ensure your actual novel text is written *below* this block, not inside it, or it will be stripped out during compilation! Standard blockquotes for letters or dialogues (`> "Hello!"`) in your body text are perfectly safe.

---

## 🚀 Installation

**Manual Installation:**
1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the Releases page.
2. Create a folder named `novelsmith` inside your vault's `.obsidian/plugins/` directory.
3. Place the downloaded files into the `novelsmith` folder.
4. Reload Obsidian and enable **NovelSmith** in the Community Plugins settings.

---

## ⚙️ Getting Started & Settings

To get the most out of NovelSmith, configure your workspace:

1. **Designate a Book Folder:** NovelSmith's features will *only* activate within this specific folder to protect your other Obsidian notes.
2. **Generate Templates:** Trigger the "Insert Scene Card" command for the first time, and NovelSmith will generate a customizable `NovelSmith_Template.md` for you.
3. **Writing Aid Lists:** Set up your Redundant Words list and Fix-It list to supercharge your editing phase.

---

## 🥷 How It Works Under the Hood

NovelSmith respects your data. It relies on minimal, non-intrusive syntax:
* **Headers (`######`):** Used to identify scene boundaries.
* **Invisible Span Tags:** Scene IDs and File Boundaries use `<span class="ns-id">` tags with a built-in `data-warning="⛔️ ID (Do not edit)"` attribute. NovelSmith's CSS completely hides these in **Live Preview** mode to keep your writing environment beautiful and distraction-free. 

---

## 🤝 Contributing & License
Contributions, issues, and feature requests are welcome!
This project is licensed under the MIT License.