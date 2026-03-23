# Colorize — Architecture Overview

**Extension:** `data/default-user/extensions/colorize/`
**Version:** 0.1.1
**Date:** 2026-03-23

---

## Purpose

SillyTavern's built-in theme system exposes a fixed set of controls and
produces limited visual results. Colorize bypasses it by letting the user write
arbitrary CSS that is injected live into the page — with a safety net that
prevents a bad rule from locking them out of the UI.

---

## File Map

```
colorize/
  manifest.json       — Extension metadata; tells ST how to load the extension
  index.js            — All extension logic
  editor.css          — Styles for the extension's own UI panels
  settings.html       — Settings panel fragment; ST injects this into the
                        Extensions drawer automatically
  docs/
    colorize_architecture.md   — This file
```

**Note:** `editor.css` styles the extension's own UI only. The user's custom
CSS never touches disk — it lives in the browser's localStorage and is injected
into the page at runtime via a `<style>` tag.

**Note:** ST loads `editor.css` globally onto every ST page when the extension
is active. All selectors are scoped to Colorize's own elements, so there is no
bleed into ST's UI.

---

## User-Facing Features

### CSS Editor panel
A floating, draggable panel the user opens from the Extensions drawer. Contains
a CSS textarea, Apply/Revert/Reset controls, a live-preview toggle, clipboard
import/export, a revert-duration slider, and a template selector for common
starting points. The emergency keybind hint is permanently visible in the
panel footer.

### Settings drawer entry
A compact block in ST's Extensions drawer with three buttons: open the CSS
Editor, toggle Bypass, and Strip (remove all CSS). Also shows the two keybind
reminders.

### Revert timer
Every time the user clicks Apply, a countdown bar appears at the bottom of the
screen. If the user does nothing, the previous CSS is restored automatically
when the timer expires. The user can click **Keep it** to confirm early, or
**Undo** to restore immediately. This is the primary safety mechanism.

### Bypass
Instantly disables the injected CSS without deleting it. Toggle it on and off
to compare the styled vs unstyled UI side by side. Bypass state persists across
page reloads. The CSS itself is untouched and storage is not cleared.

### Emergency strip keybind
`Ctrl+Shift+0` removes all injected CSS and clears storage unconditionally,
regardless of what is visible on screen. This is the last-resort escape if a
bad rule hides all other UI controls.

### Bypass keybind
`Ctrl+Shift+B` toggles Bypass from the keyboard without opening any panel.

---

## Safety Guarantees

| Risk | How it's handled |
|---|---|
| CSS hides the settings panel or editor | Revert timer fires automatically after a configurable delay (default 20s) |
| User applies CSS and walks away | Same — auto-revert |
| The revert bar itself is hidden by user CSS | The bar is built with inline styles only; no authored selector can target it |
| All visible UI controls are inaccessible | `Ctrl+Shift+0` strips CSS unconditionally from the keyboard |
| Extension fails to load | CSS is never injected; ST loads normally |

---

## Key Behaviours

**Apply is the only action that triggers the revert timer.** Live preview
(applying CSS on every keystroke) intentionally bypasses the timer — the user
is actively watching the result.

**CSS is only saved to storage when confirmed.** Clicking Apply starts the
timer but does not save. Storage is written when the user clicks Keep it, or
when the timer expires without the user clicking Undo.

**Silent re-injection on page load.** CSS that was confirmed in a prior session
is re-injected on load without a revert timer. The timer only fires for new,
unconfirmed changes.

**Bypass persists across reloads.** If the user had bypass active when they
reloaded, the CSS is re-injected on load and then immediately disabled again,
restoring the bypassed state.

**Reset clears everything.** The Reset button in the editor (and the Strip
button in the settings drawer) both remove the injected CSS and delete it from
storage. This requires a confirmation click and cannot be undone.

---

## Logical Modules

All runtime logic lives in `index.js`, organised into the following sections:

| Section | What it does |
|---|---|
| **Injector** | Creates, replaces, and removes the live `<style>` tag in the page head |
| **Storage** | Reads and writes confirmed CSS to localStorage |
| **Bypass** | Non-destructively enables/disables the stylesheet without touching storage |
| **RevertTimer** | Shows the countdown bar; auto-reverts or confirms on user action |
| **Editor** | Builds and manages the floating CSS editor panel |
| **Keybind** | Registers the emergency strip and bypass toggle keyboard shortcuts |
| **Bootstrap** | Runs on load; restores previous state and wires up all UI entry points |

---

## Out of Scope (v0.1)

- Per-character or per-chat CSS overrides
- CSS preprocessor (LESS/SASS)
- Modifying ST's theme files on disk
- Sync across devices
- CSS linting or validation before apply
- Undo history beyond the single revert-timer step