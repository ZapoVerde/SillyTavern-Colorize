# 🎨 Colorize

A SillyTavern extension for writing your own CSS to style the UI exactly how
you want — with a safety net so you can never lock yourself out.

---

## What it does

SillyTavern's built-in theme system gives you a fixed set of colour pickers and
sliders. Colorize goes further: it lets you write arbitrary CSS that applies
live to the entire UI. Want a clean white reading layout? A high-contrast dark
mode? Custom fonts, tighter message spacing, a hidden nav bar? Write it.

The catch with raw CSS is that a bad rule can hide the controls you need to fix
it. Colorize solves this with an automatic revert timer — every time you apply
new CSS, a countdown starts. If you don't confirm it, your previous CSS comes
back on its own.

---

## Installation

1. In SillyTavern, open **Extensions → Install extension**
2. Paste the repository URL
3. Click Install
4. Reload the page

Colorize will appear in the Extensions drawer.

---

## Quick start

1. Open the Extensions drawer and find **Colorize**
2. Click **CSS Editor** to open the floating editor panel
3. Pick a template from the dropdown to get started (or write your own CSS)
4. Click **Apply**
5. A countdown bar appears — you have 20 seconds to decide
   - Click **Keep it** to save your changes
   - Click **Undo** to go back immediately
   - Do nothing and it reverts automatically
6. Iterate from there

---

## Editor controls

| Control | What it does |
|---|---|
| **Apply** | Injects your CSS and starts the revert timer |
| **Live preview** | Applies CSS on every keystroke — no timer, instant feedback |
| **Revert to saved** | Loads your last confirmed CSS back into the editor (does not apply it) |
| **Reset** | Removes all CSS and clears storage — asks you to confirm first |
| **Bypass** | Temporarily disables your CSS without deleting it — useful for side-by-side comparison |
| **Copy / Paste** | Export your CSS to clipboard or import from it |
| **Revert timer slider** | Set how long the countdown lasts (5–60 seconds) |
| **Templates** | Load a pre-written starting point into the editor |

---

## Keyboard shortcuts

| Shortcut | What it does |
|---|---|
| `Ctrl+Shift+0` | **Emergency strip** — removes all CSS and clears storage immediately, no confirmation. Use this if a bad rule hides everything. |
| `Ctrl+Shift+B` | **Bypass toggle** — enables or disables your CSS without clearing it |

The emergency strip shortcut is always shown in the editor footer so you never
have to remember where to find it.

---

## Templates

Colorize ships with several built-in templates to get you started:

| Template | Description |
|---|---|
| **Boilerplate: ST CSS Variables** | A commented-out reference of every major SillyTavern CSS variable. Uncomment the ones you want to change. |
| **Dark Compact** | Deeper dark palette with tighter message spacing |
| **Wide Chat** | Expands the chat area — best on large monitors |
| **Minimal Chrome** | Dims the navigation bar when idle; hover to reveal |
| **High Contrast** | Pure black background with white text |

Templates load into the editor textarea but do not apply automatically — you
still click Apply when ready.

---

## Tips

**CSS variables are the safest approach.** SillyTavern exposes its colours and
effects as CSS variables like `--SmartThemeBodyColor`. Targeting these is more
future-proof than targeting element selectors, which may change between ST
updates. The Boilerplate template lists the main ones.

**Use Live preview for fast iteration.** Toggle it on and type freely — changes
apply instantly with no timer interrupting you. When you're happy, click Apply
to start the confirmation timer and lock it in.

**Bypass is your comparison tool.** Hit `Ctrl+Shift+B` at any time to flip
between your styled and unstyled UI without touching storage.

**Export your CSS before clearing browser data.** Your CSS lives in the
browser's local storage. Use the Copy button to keep a backup somewhere safe.
If local storage is cleared, Colorize cannot recover it.

---

## Safety model

Every Apply starts a countdown. The previous CSS is restored if you don't
confirm. The revert bar is built to survive any CSS rule you can write — it
cannot be hidden by your own stylesheet. If every visible control is somehow
hidden, `Ctrl+Shift+0` always works from the keyboard.

---

## License

AGPL-3.0