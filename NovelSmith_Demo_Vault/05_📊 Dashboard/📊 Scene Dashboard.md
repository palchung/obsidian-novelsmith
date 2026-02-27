# 📊 The Scene Dashboard (Dataview Magic)

> [!tip] The Auto-Generated Database
> Did you know? Every time you sync or edit, NovelSmith secretly updates a master database in the background (`_Backstage/_Scene_Database.md`). 
> It extracts all the `Key:: Value` pairs from your Scene Info callouts!
> 
> By combining this with the famous **Dataview** plugin, you can build powerful, auto-updating dashboards for your novel.

---

### 🛠️ Prerequisite: Install Dataview
To see the magic tables below, you must have the **Dataview** community plugin installed and enabled in your Obsidian vault.

---

### 📋 Magic Table 1: The Master Scene List
Want a bird's-eye view of your entire novel's progress, time, and POV? Here is a simple script to extract everything from the NovelSmith database:

\`\`\`dataview
TABLE WITHOUT ID
  L.Scene AS "🎬 Scene",
  L.children.POV[0] AS "👁️ POV",
  L.children.Time[0] AS "⏰ Time",
  L.children.Status[0] AS "🏷️ Status"
FROM "_Backstage/_Scene_Database.md"
FLATTEN file.lists AS L
WHERE L.Scene
\`\`\`

*(If Dataview is installed, the code block above will render a beautiful table showing Jax and Elara's scenes from Book One!)*

---

### 👥 Magic Table 2: Scenes by Character (POV)
Want to know how many chapters are written from a specific character's perspective? We can group the data!

\`\`\`dataview
TABLE WITHOUT ID
  L.children.POV[0] AS "👁️ Point of View",
  rows.L.Scene AS "🎬 Scenes"
FROM "_Backstage/_Scene_Database.md"
FLATTEN file.lists AS L
WHERE L.Scene AND L.children.POV
GROUP BY L.children.POV[0]
\`\`\`

---

### ⚙️ How it works (The Database Format)
If you open `_Backstage/_Scene_Database.md`, you will see that NovelSmith automatically converts your scene cards into a structured list like this:


```text
## [[Chapter 1 - The Neon Rain]]
- Scene:: [[Chapter 1 - The Neon Rain#The Drop Point|The Drop Point]]
  - SceneName:: The Drop Point
  - SceneID:: `book1-001`
  - Time:: 23:00
  - POV:: Jax
  - Status:: #Draft
```


Because NovelSmith handles all the heavy lifting of extracting and structuring the metadata, you never have to manually update your tracking spreadsheets again. **Just write, click Sync, and watch your dashboard update itself!**

