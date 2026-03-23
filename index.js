/**
 * @file data/default-user/extensions/colorize/index.js
 * @stamp {"utc":"2026-03-23T00:00:00.000Z"}
 * @version 0.1.1
 * @architectural-role Feature Entry Point
 * @description
 * Colorize — a SillyTavern extension providing complete, safe CSS control
 * over the ST UI. The built-in theme system exposes a fixed set of CSS
 * variables and produces limited results; Colorize bypasses it by injecting
 * an arbitrary user-authored stylesheet into the page head.
 *
 * A RevertTimer (modelled on the Windows screen-resolution confirmation
 * dialog) fires automatically after a configurable duration whenever new CSS
 * is applied, restoring the previous state unless the user explicitly
 * confirms. An emergency keybind (Ctrl+Shift+0) strips all injected CSS
 * unconditionally, ensuring the user can never be locked out of the ST UI
 * by a bad rule.
 *
 * All injected rules are scoped under :root[data-colorize="1"] so they can
 * be disabled atomically by removing a single HTML attribute.
 *
 * @core-principles
 * 1. NEVER LOCK OUT THE USER: Every CSS application is gated by a revert
 *    timer. The timer bar uses only inline styles and cannot be hidden by
 *    user-authored CSS.
 * 2. SILENT ON LOAD: CSS confirmed in a prior session is re-injected on page
 *    load without a revert timer. The timer fires only for new, unconfirmed
 *    changes.
 * 3. STORAGE IS THE COMMIT: Storage.save() is the confirmation step. Nothing
 *    is persisted until the user clicks Keep or the timer fires without Undo.
 * 4. ESCAPE HATCH ALWAYS WORKS: Ctrl+Shift+0 calls strip() and clear()
 *    unconditionally, regardless of UI visibility or state.
 * 5. INJECTOR OWNS THE STYLE TAG: No code outside the Injector section
 *    touches <style id="colorize-custom">. All callers go through injectCss()
 *    and stripCss().
 *
 * @docs
 *   Architecture overview:  docs/colorize_architecture.md
 *
 * @api-declaration
 * Entry points:  jQuery ready → init()
 * Injector:      injectCss(cssText), stripCss(), snapshotCss()
 * Storage:       loadCss(), saveCss(cssText), clearCss()
 * RevertTimer:   startRevertTimer(previousCss), cancelRevertTimer()
 * Editor:        openEditor(), closeEditor(), toggleEditor(), syncEditorTextarea()
 * Keybind:       registerKeybind()
 *
 * @contract
 *   assertions:
 *     purity: mutates
 *     state_ownership: [
 *       _revertTimer, _revertBarEl,
 *       _editorEl, _editorOpen,
 *       extension_settings.colorize]
 *     external_io: [localStorage, document.head, document.body,
 *                   document.documentElement, navigator.clipboard]
 */

'use strict';

// ─── Imports ──────────────────────────────────────────────────────────────────

import { saveSettingsDebounced }  from '../../../../script.js';
import { extension_settings }     from '../../../extensions.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXT_NAME                  = 'colorize';
const STYLE_TAG_ID              = 'colorize-custom';
const SCOPE_ATTR                = 'data-colorize';
const STORAGE_KEY               = 'colorize_custom_css';
const EDITOR_POS_KEY            = 'colorize_editor_pos';
const DEFAULT_REVERT_DURATION_MS = 20_000;

// ─── CSS Templates ────────────────────────────────────────────────────────────
// Each value is a CSS string loaded into the textarea when selected.
// Templates do not auto-apply — the user still clicks Apply (or uses live preview).

const TEMPLATES = {
    '— select a template —': '',

    'Boilerplate: ST CSS Variables': `/* ── Colorize Boilerplate ────────────────────────────────────────────────
   These are the main ST theme CSS variables. Uncomment any you want to
   override. Colorize rules always win over the built-in theme picker.
   ─────────────────────────────────────────────────────────────────── */

:root {
    /* ── Backgrounds ──────────────────────────────────────────── */
    /* --SmartThemeBodyColor:          #1a1a2e; */
    /* --SmartThemeChatBackground:     #16213e; */
    /* --SmartThemeBotMesColor:        #0f3460; */
    /* --SmartThemeUserMesColor:       #1a1a2e; */
    /* --SmartThemeNarratorColor:      #0a0a20; */

    /* ── Text & accents ───────────────────────────────────────── */
    /* --SmartThemeEmColor:            #e94560; */
    /* --SmartThemeQuoteColor:         #a0c4ff; */
    /* --SmartThemeBlurTintColor:      rgba(0,0,0,0.5); */

    /* ── Borders & chrome ─────────────────────────────────────── */
    /* --SmartThemeBorderColor:        rgba(255,255,255,0.1); */
    /* --SmartThemeShadowColor:        rgba(0,0,0,0.5); */

    /* ── Effects ──────────────────────────────────────────────── */
    /* --SmartThemeBlurStrength:       4px; */
    /* --SmartThemeOpacity:            0.9; */

    /* ── Typography ───────────────────────────────────────────── */
    /* --mainFontSize:                 1em; */
}`,

    'Dark Compact': `/* ── Colorize: Dark Compact ──────────────────────────────────────────────
   Deeper dark palette with tighter message spacing.
   ─────────────────────────────────────────────────────────────────── */

:root {
    --SmartThemeBodyColor:      #080810;
    --SmartThemeChatBackground: #0a0a16;
    --SmartThemeBotMesColor:    #0d0d1e;
    --SmartThemeUserMesColor:   #0a0a16;
}

.mes {
    padding: 6px 10px !important;
    margin-bottom: 3px !important;
}

.mes_text {
    font-size: 0.93em !important;
    line-height: 1.55 !important;
}`,

    'Wide Chat': `/* ── Colorize: Wide Chat ─────────────────────────────────────────────────
   Expands the chat container. Best on large monitors.
   ─────────────────────────────────────────────────────────────────── */

#sheld {
    width: 100% !important;
    max-width: 1400px !important;
    margin: 0 auto !important;
}

#chat {
    width: 100% !important;
}

.mes {
    max-width: 90% !important;
}`,

    'Minimal Chrome': `/* ── Colorize: Minimal Chrome ────────────────────────────────────────────
   Dims the top navigation bar when idle. Hover to reveal.
   ─────────────────────────────────────────────────────────────────── */

#top-bar,
#customMenuBar {
    opacity: 0.12 !important;
    transition: opacity 0.35s ease !important;
}

#top-bar:hover,
#customMenuBar:hover {
    opacity: 1 !important;
}`,

    'High Contrast': `/* ── Colorize: High Contrast ─────────────────────────────────────────────
   Pure black background with white text for maximum readability.
   ─────────────────────────────────────────────────────────────────── */

:root {
    --SmartThemeBodyColor:      #000000;
    --SmartThemeChatBackground: #000000;
    --SmartThemeBotMesColor:    #0d0d0d;
    --SmartThemeUserMesColor:   #000000;
    --SmartThemeBorderColor:    rgba(255,255,255,0.35);
}

body, .mes_text, .mes_block {
    color: #ffffff !important;
}

em, b, strong {
    color: #ffff88 !important;
}`,
};

// ─── Module-level state ───────────────────────────────────────────────────────

let _revertTimer  = null;   // setTimeout handle for auto-revert
let _revertBarEl  = null;   // DOM node: floating countdown bar
let _editorEl     = null;   // DOM node: floating editor panel
let _editorOpen   = false;
let _bypassed     = false;  // true when stylesheet is disabled without being cleared

// =============================================================================

/**
 * @section Injector
 * @architectural-role CSS Lifecycle Manager
 * @description
 * Owns the single <style id="colorize-custom"> element in <head> and the
 * :root[data-colorize] scoping attribute on <html>. All CSS injection and
 * removal passes through this section exclusively.
 *
 * The scoping attribute enables atomic disable: removing data-colorize from
 * <html> causes all authored rules to stop matching without touching the
 * style tag itself, making strip/restore very fast and side-effect free.
 * @core-principles
 *   1. One tag, one owner — only this section reads or writes #colorize-custom.
 *   2. injectCss() is idempotent — calling it twice replaces, never duplicates.
 *   3. stripCss() removes both the tag and the scoping attribute together.
 * @api-declaration
 *   injectCss(cssText), stripCss(), snapshotCss()
 * @contract
 *   assertions:
 *     external_io: [document.head, document.documentElement]
 */

function injectCss(cssText) {
    let el = document.getElementById(STYLE_TAG_ID);
    if (!el) {
        el = document.createElement('style');
        el.id = STYLE_TAG_ID;
        document.head.appendChild(el);
    }
    el.textContent = cssText;
    el.disabled = false;    // applying always clears bypass
    _bypassed   = false;
    document.documentElement.setAttribute(SCOPE_ATTR, '1');
    _updateBypassIndicator();
}

function stripCss() {
    const el = document.getElementById(STYLE_TAG_ID);
    if (el) el.remove();
    _bypassed = false;
    document.documentElement.removeAttribute(SCOPE_ATTR);
    _updateBypassIndicator();
}

/** Returns the currently injected CSS text, or '' if nothing is injected. */
function snapshotCss() {
    const el = document.getElementById(STYLE_TAG_ID);
    return el ? el.textContent : '';
}

// =============================================================================

/**
 * @section Storage
 * @architectural-role CSS Persistence Layer
 * @description
 * Thin, synchronous wrapper over localStorage. saveCss() is the confirmation
 * step — nothing is committed to storage until the user explicitly confirms
 * via the RevertTimer or a direct save action in the editor.
 * @core-principles
 *   1. saveCss() is the single source of truth for confirmed CSS.
 *   2. No server-side IO in v0.1; localStorage only.
 *   3. The key is stable; do not change STORAGE_KEY between versions without
 *      a migration path.
 * @api-declaration
 *   loadCss(), saveCss(cssText), clearCss()
 * @contract
 *   assertions:
 *     external_io: [localStorage]
 */

function loadCss()          { return localStorage.getItem(STORAGE_KEY); }
function saveCss(cssText)   { localStorage.setItem(STORAGE_KEY, cssText); }
function clearCss()         { localStorage.removeItem(STORAGE_KEY); }

// =============================================================================

/**
 * @section Bypass
 * @architectural-role Live CSS Toggle
 * @description
 * Provides a non-destructive "pause" for the injected CSS. Bypass disables the
 * stylesheet via HTMLStyleElement.disabled without removing the style tag or
 * clearing storage, so the CSS is instantly restorable. This is useful for
 * comparing the styled vs unstyled UI side by side.
 *
 * Keybind: Ctrl+Shift+B (registered in the Keybind section).
 * The bypass state does NOT persist across page loads — on reload the saved CSS
 * is always re-injected active.
 * @core-principles
 *   1. Bypass is non-destructive: storage and the style tag are untouched.
 *   2. Calling injectCss() or stripCss() always clears the bypass state.
 *   3. toggleBypass() is a no-op if nothing is injected.
 * @api-declaration
 *   toggleBypass(), _updateBypassIndicator(), _updateSettingsBypassBtn()
 * @contract
 *   assertions:
 *     state_ownership: [_bypassed]
 *     external_io: [document.getElementById(STYLE_TAG_ID), document.documentElement]
 */

function toggleBypass() {
    const el = document.getElementById(STYLE_TAG_ID);
    if (!el) return; // nothing injected — bypass is meaningless

    _bypassed   = !_bypassed;
    el.disabled = _bypassed;

    if (_bypassed) {
        document.documentElement.removeAttribute(SCOPE_ATTR);
    } else {
        document.documentElement.setAttribute(SCOPE_ATTR, '1');
    }

    extension_settings[EXT_NAME].bypassed = _bypassed;
    saveSettingsDebounced();

    _updateBypassIndicator();
    _updateSettingsBypassBtn();
    console.log(`[Colorize] Bypass ${_bypassed ? 'ON' : 'OFF'} (Ctrl+Shift+B).`);
}

/** Updates bypass visual state in the floating editor (safe to call when editor is closed). */
function _updateBypassIndicator() {
    if (!_editorEl) return;
    const title = _editorEl.querySelector('.colorize-title');
    const btn   = _editorEl.querySelector('#colorize-bypass-btn');
    if (title) {
        title.textContent = _bypassed ? '🎨 Colorize  [bypassed]' : '🎨 Colorize CSS Editor';
        title.style.color = _bypassed ? '#777' : '#ffd700';
    }
    if (btn) {
        btn.textContent = _bypassed ? 'Bypass: ON' : 'Bypass: OFF';
        btn.style.background  = _bypassed ? '#7a5000' : '#252545';
        btn.style.borderColor = _bypassed ? '#c08000' : '#4a4a6a';
        btn.style.color       = _bypassed ? '#ffd700' : '#dde';
    }
}

/** Updates bypass button state in the ST settings panel without clobbering the icon element. */
function _updateSettingsBypassBtn() {
    const btn = document.getElementById('colorize-bypass-settings-btn');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (icon) icon.className = _bypassed ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off';
    const textNode = [...btn.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = _bypassed ? ' Bypass: ON' : ' Bypass: OFF';
    btn.style.background  = _bypassed ? '#7a5000' : '';
    btn.style.borderColor = _bypassed ? '#c08000' : '';
    btn.style.color       = _bypassed ? '#ffd700' : '';
}

// =============================================================================

/**
 * @section RevertTimer
 * @architectural-role Safety Confirmation System
 * @description
 * Implements the Windows screen-resolution confirmation pattern. After any new
 * CSS is applied via the editor, a fixed-position countdown bar appears. If
 * the user does not click "Keep it" within the configured duration, the
 * previous CSS is restored automatically.
 *
 * The bar element uses ONLY inline styles so that no user-authored CSS
 * selector can hide or reposition it, including rules targeting *, body, or
 * position:fixed elements. The bar does not carry any class names.
 * @core-principles
 *   1. Bar is immune to user CSS — inline styles only, zero class names.
 *   2. startRevertTimer() captures previousCss at call time via closure;
 *      it is never re-read from storage during the countdown.
 *   3. Only one timer runs at a time. Calling start() while a timer is active
 *      cancels the previous one first.
 *   4. cancelRevertTimer() removes the bar from the DOM immediately.
 * @api-declaration
 *   startRevertTimer(previousCss), cancelRevertTimer()
 * @contract
 *   assertions:
 *     state_ownership: [_revertTimer, _revertBarEl]
 *     external_io: [document.body]
 */

function startRevertTimer(previousCss) {
    cancelRevertTimer();

    const currentCss = snapshotCss();
    const durationMs = (extension_settings[EXT_NAME]?.revertDuration) ?? DEFAULT_REVERT_DURATION_MS;
    let remaining = Math.ceil(durationMs / 1000);

    // ── Build bar (inline styles only — immune to user CSS) ──────────────────
    const bar = document.createElement('div');
    _revertBarEl = bar;
    bar.style.cssText = [
        'position:fixed', 'bottom:28px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:2147483647', 'background:#141428', 'color:#dde',
        'padding:12px 20px', 'border-radius:8px',
        'font:14px/1.4 Consolas,Monaco,monospace',
        'display:flex', 'align-items:center', 'gap:12px',
        'box-shadow:0 4px 24px rgba(0,0,0,0.7)', 'border:1px solid #4a4a6a',
        'user-select:none', 'pointer-events:all',
    ].join(';');

    const label = document.createElement('span');
    label.style.cssText = 'color:#ffd700;font-weight:bold;min-width:195px';
    label.textContent = `Colorize: reverting in ${remaining}s`;

    const keepBtn = _makeInlineBtn('Keep it', '#1e4d2d', '#2a6a3a');
    const undoBtn = _makeInlineBtn('Undo',    '#4d1e1e', '#6a2a2a');

    bar.append(label, keepBtn, undoBtn);
    document.body.appendChild(bar);

    // ── Countdown tick ────────────────────────────────────────────────────────
    const tick = setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        label.textContent = `Colorize: reverting in ${remaining}s`;
    }, 1000);

    // ── Auto-revert on timeout ────────────────────────────────────────────────
    _revertTimer = setTimeout(() => {
        clearInterval(tick);
        _removeBar();
        previousCss ? injectCss(previousCss) : stripCss();
        syncEditorTextarea();
    }, durationMs);

    // ── Keep it ───────────────────────────────────────────────────────────────
    keepBtn.addEventListener('click', () => {
        clearInterval(tick);
        cancelRevertTimer();
        saveCss(currentCss);
        syncEditorTextarea();
    });

    // ── Undo ──────────────────────────────────────────────────────────────────
    undoBtn.addEventListener('click', () => {
        clearInterval(tick);
        cancelRevertTimer();
        previousCss ? injectCss(previousCss) : stripCss();
        syncEditorTextarea();
    });
}

function cancelRevertTimer() {
    if (_revertTimer) { clearTimeout(_revertTimer); _revertTimer = null; }
    _removeBar();
}

function _removeBar() {
    if (_revertBarEl) { _revertBarEl.remove(); _revertBarEl = null; }
}

/** Build a bar button with inline styles only. */
function _makeInlineBtn(text, bg, bgHover) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = [
        `background:${bg}`, 'color:#fff', 'border:1px solid rgba(255,255,255,0.15)',
        'padding:6px 16px', 'border-radius:4px', 'cursor:pointer',
        'font:13px Consolas,Monaco,monospace', 'white-space:nowrap',
        'transition:background 0.12s',
    ].join(';');
    btn.addEventListener('mouseenter', () => { btn.style.background = bgHover; });
    btn.addEventListener('mouseleave', () => { btn.style.background = bg; });
    return btn;
}

// =============================================================================

/**
 * @section Editor
 * @architectural-role CSS Authoring UI
 * @description
 * A floating, draggable panel injected into the ST DOM on demand. Provides a
 * raw CSS textarea, Apply/Revert/Reset controls, a live-preview toggle,
 * clipboard import/export, and a revert-duration slider. The emergency keybind
 * hint is permanently visible in the panel footer.
 *
 * Apply is the only path that triggers RevertTimer. Live preview applies on
 * each keystroke but intentionally bypasses the timer, since the user is
 * actively watching the result and can simply stop typing.
 *
 * Panel position is persisted in localStorage between sessions.
 * @core-principles
 *   1. Apply is the only action that triggers RevertTimer.
 *   2. Live preview is opt-in and explicitly bypasses the revert timer.
 *   3. syncEditorTextarea() is safe to call even when the editor is closed.
 * @api-declaration
 *   openEditor(), closeEditor(), toggleEditor(), syncEditorTextarea()
 * @contract
 *   assertions:
 *     state_ownership: [_editorEl, _editorOpen]
 *     external_io: [document.body, localStorage, navigator.clipboard]
 */

function openEditor() {
    if (_editorOpen) {
        _editorEl?.querySelector('#colorize-textarea')?.focus();
        return;
    }
    _editorEl = _buildEditorEl();
    document.body.appendChild(_editorEl);
    _editorOpen = true;
    _makeDraggable(_editorEl, _editorEl.querySelector('.colorize-header'));
    const pos = _loadEditorPos();
    if (pos) {
        _editorEl.style.left  = `${pos.x}px`;
        _editorEl.style.top   = `${pos.y}px`;
        _editorEl.style.right = 'auto';
    }
    syncEditorTextarea();
    _updateBypassIndicator();
    _editorEl.querySelector('#colorize-textarea').focus();
}

function closeEditor() {
    if (_editorEl) {
        _saveEditorPos();
        _editorEl.remove();
        _editorEl = null;
    }
    _editorOpen = false;
}

function toggleEditor() {
    _editorOpen ? closeEditor() : openEditor();
}

/** Syncs the textarea value to the currently injected CSS. Safe when editor is closed. */
function syncEditorTextarea() {
    if (!_editorEl) return;
    const ta = _editorEl.querySelector('#colorize-textarea');
    if (ta) ta.value = snapshotCss();
}

function _buildEditorEl() {
    const el = document.createElement('div');
    el.id = 'colorize-editor';

    el.innerHTML = `
        <div class="colorize-header">
            <span class="colorize-title">🎨 Colorize CSS Editor</span>
            <button class="colorize-close-btn" title="Close editor">✕</button>
        </div>
        <div class="colorize-toolbar">
            <button id="colorize-apply-btn"  class="colorize-btn colorize-btn-primary" title="Apply CSS and start revert timer">Apply</button>
            <button id="colorize-revert-btn" class="colorize-btn" title="Load saved CSS into textarea (does not apply)">Revert to saved</button>
            <button id="colorize-reset-btn"  class="colorize-btn colorize-btn-danger"  title="Remove all CSS and clear storage">Reset</button>
            <span class="colorize-spacer"></span>
            <button id="colorize-bypass-btn" class="colorize-btn" title="Toggle CSS on/off without clearing storage (Ctrl+Shift+B)">Bypass: OFF</button>
            <button id="colorize-copy-btn"   class="colorize-btn" title="Copy textarea contents to clipboard">Copy</button>
            <button id="colorize-paste-btn"  class="colorize-btn" title="Paste clipboard into textarea">Paste</button>
        </div>
        <div class="colorize-options-row">
            <label class="colorize-toggle-label" title="Apply CSS on every keystroke — no revert timer in this mode">
                <input type="checkbox" id="colorize-live-toggle">
                Live preview
            </label>
            <div class="colorize-dur-group">
                <span>Revert timer:</span>
                <input type="range" id="colorize-dur-slider" min="5" max="60" step="1" value="20">
                <span id="colorize-dur-val">20</span>s
            </div>
        </div>
        <div class="colorize-template-row">
            <label for="colorize-template-select">Template:</label>
            <select id="colorize-template-select" class="colorize-select">
                ${Object.keys(TEMPLATES).map(k => `<option value="${k}">${k}</option>`).join('\n                ')}
            </select>
            <button id="colorize-template-load-btn" class="colorize-btn" title="Load selected template into textarea (does not apply)">Load</button>
        </div>
        <textarea
            id="colorize-textarea"
            spellcheck="false"
            placeholder="/* Enter your CSS here. */

/* Target ST CSS variables for the most future-proof overrides: */
/* :root { --SmartThemeBodyColor: #0d0d1a; } */

/* Or use element selectors: */
/* body { background: #0d0d1a !important; } */

/* Load a template above to get started. */"></textarea>
        <div class="colorize-footer">
            Strip: <kbd>Ctrl+Shift+0</kbd>&nbsp;&nbsp;
            Bypass toggle: <kbd>Ctrl+Shift+B</kbd>
        </div>
    `;

    // ── Close ─────────────────────────────────────────────────────────────────
    el.querySelector('.colorize-close-btn').addEventListener('click', closeEditor);

    // ── Bypass toggle ─────────────────────────────────────────────────────────
    el.querySelector('#colorize-bypass-btn').addEventListener('click', toggleBypass);

    // ── Apply ─────────────────────────────────────────────────────────────────
    el.querySelector('#colorize-apply-btn').addEventListener('click', () => {
        const css  = el.querySelector('#colorize-textarea').value;
        const prev = snapshotCss();
        injectCss(css);
        startRevertTimer(prev);
    });

    // ── Revert to saved (load into textarea, do not apply) ────────────────────
    el.querySelector('#colorize-revert-btn').addEventListener('click', () => {
        const saved = loadCss();
        el.querySelector('#colorize-textarea').value = saved ?? '';
    });

    // ── Reset (strip + clear) ─────────────────────────────────────────────────
    el.querySelector('#colorize-reset-btn').addEventListener('click', () => {
        if (!confirm('Remove all Colorize CSS and clear storage?')) return;
        cancelRevertTimer();
        stripCss();
        clearCss();
        el.querySelector('#colorize-textarea').value = '';
    });

    // ── Copy to clipboard ─────────────────────────────────────────────────────
    el.querySelector('#colorize-copy-btn').addEventListener('click', async () => {
        const btn = el.querySelector('#colorize-copy-btn');
        try {
            await navigator.clipboard.writeText(el.querySelector('#colorize-textarea').value);
            btn.textContent = 'Copied!';
        } catch {
            btn.textContent = 'Failed';
        }
        setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
    });

    // ── Paste from clipboard ──────────────────────────────────────────────────
    el.querySelector('#colorize-paste-btn').addEventListener('click', async () => {
        const btn = el.querySelector('#colorize-paste-btn');
        try {
            el.querySelector('#colorize-textarea').value = await navigator.clipboard.readText();
        } catch {
            btn.textContent = 'Denied';
            setTimeout(() => { btn.textContent = 'Paste'; }, 1800);
        }
    });

    // ── Live preview ──────────────────────────────────────────────────────────
    const liveToggle = el.querySelector('#colorize-live-toggle');
    const textarea   = el.querySelector('#colorize-textarea');
    textarea.addEventListener('input', () => {
        if (liveToggle.checked) injectCss(textarea.value);
    });

    // ── Duration slider ───────────────────────────────────────────────────────
    const slider = el.querySelector('#colorize-dur-slider');
    const durVal = el.querySelector('#colorize-dur-val');
    const s = extension_settings[EXT_NAME];
    const initialSec = Math.round((s.revertDuration ?? DEFAULT_REVERT_DURATION_MS) / 1000);
    slider.value      = initialSec;
    durVal.textContent = initialSec;

    slider.addEventListener('input', () => {
        durVal.textContent = slider.value;
        s.revertDuration   = parseInt(slider.value, 10) * 1000;
        saveSettingsDebounced();
    });

    // ── Template selector ─────────────────────────────────────────────────────
    el.querySelector('#colorize-template-load-btn').addEventListener('click', () => {
        const key = el.querySelector('#colorize-template-select').value;
        const css = TEMPLATES[key];
        if (css === undefined || css === '') return;
        el.querySelector('#colorize-textarea').value = css;
        // Reset selector back to placeholder so repeated loads are possible
        el.querySelector('#colorize-template-select').value = '— select a template —';
    });

    return el;
}

// ── Drag support ──────────────────────────────────────────────────────────────

function _makeDraggable(el, handle) {
    let startMouseX = 0, startMouseY = 0, startElX = 0, startElY = 0;

    handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startElX    = rect.left;
        startElY    = rect.top;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp, { once: true });
    });

    function onMove(e) {
        el.style.left  = `${startElX + (e.clientX - startMouseX)}px`;
        el.style.top   = `${startElY + (e.clientY - startMouseY)}px`;
        el.style.right = 'auto';
    }

    function onUp() {
        _saveEditorPos();
        document.removeEventListener('mousemove', onMove);
    }
}

function _saveEditorPos() {
    if (!_editorEl) return;
    const rect = _editorEl.getBoundingClientRect();
    localStorage.setItem(EDITOR_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
}

function _loadEditorPos() {
    try   { return JSON.parse(localStorage.getItem(EDITOR_POS_KEY)); }
    catch { return null; }
}

// =============================================================================

/**
 * @section Keybind
 * @architectural-role Emergency Escape Hatch + Bypass Toggle
 * @description
 * Registers two keybinds on document.keydown:
 *   Ctrl+Shift+0 — Emergency strip. Unconditionally removes all injected CSS
 *     and clears storage. Last-resort escape when a bad rule hides all UI.
 *   Ctrl+Shift+B — Bypass toggle. Non-destructively enables/disables the
 *     injected stylesheet without touching storage. Use this to compare the
 *     styled vs unstyled UI side by side.
 *
 * Both bindings are registered once at Bootstrap and never removed.
 * @core-principles
 *   1. Ctrl+Shift+0 has no conditions or guards — it always works.
 *   2. Ctrl+Shift+B is a no-op when nothing is injected.
 * @api-declaration
 *   registerKeybind()
 * @contract
 *   assertions:
 *     external_io: [document (keydown listener)]
 */

function registerKeybind() {
    document.addEventListener('keydown', e => {
        // ── Ctrl+Shift+0 — Emergency strip (always works) ─────────────────────
        if (e.ctrlKey && e.shiftKey && e.key === '0') {
            e.preventDefault();
            cancelRevertTimer();
            stripCss();
            clearCss();
            syncEditorTextarea();
            _updateSettingsBypassBtn();
            console.log('[Colorize] Emergency strip — all CSS removed (Ctrl+Shift+0).');
        }
        // ── Ctrl+Shift+B — Bypass toggle ──────────────────────────────────────
        if (e.ctrlKey && e.shiftKey && e.key === 'B') {
            e.preventDefault();
            toggleBypass();
        }
    });
}

// =============================================================================

/**
 * @section Bootstrap
 * @architectural-role Extension Initializer
 * @description
 * Runs once on extension load via jQuery's DOM-ready callback. Restores any
 * previously confirmed CSS silently (no revert timer — user already confirmed
 * it in a prior session), registers the keybind, and wires up the settings
 * panel buttons that ST injects from settings.html.
 * @core-principles
 *   1. Silent re-injection on load — no revert timer for previously confirmed CSS.
 *   2. If Storage.load() returns null, nothing is injected and ST loads normally.
 *   3. Sets the scoping attribute on <html> before injecting so the first
 *      paint already has the attribute in place.
 * @api-declaration
 *   init() (implicit — runs in jQuery ready)
 * @contract
 *   assertions:
 *     external_io: [document.documentElement, ST extensions panel DOM]
 */

jQuery(async () => {
    // ── Init settings ─────────────────────────────────────────────────────────
    extension_settings[EXT_NAME] ??= {};
    extension_settings[EXT_NAME].revertDuration ??= DEFAULT_REVERT_DURATION_MS;
    extension_settings[EXT_NAME].bypassed       ??= false;

    // ── Set scoping attribute ─────────────────────────────────────────────────
    document.documentElement.setAttribute(SCOPE_ATTR, '1');

    // ── Silent re-inject previously confirmed CSS ─────────────────────────────
    const saved = loadCss();
    if (saved) {
        injectCss(saved);
        // Restore bypass state from previous session (injectCss clears _bypassed, so set after)
        if (extension_settings[EXT_NAME].bypassed) {
            const el = document.getElementById(STYLE_TAG_ID);
            if (el) {
                el.disabled = true;
                _bypassed   = true;
                document.documentElement.removeAttribute(SCOPE_ATTR);
            }
        }
    }

    // ── Register emergency keybind ────────────────────────────────────────────
    registerKeybind();

    // ── Wire settings panel buttons (injected by ST from settings.html) ───────
    $('#colorize-open-editor-btn').on('click', toggleEditor);

    $('#colorize-bypass-settings-btn').on('click', () => {
        toggleBypass();
    });

    $('#colorize-strip-btn').on('click', () => {
        if (!confirm('Remove all Colorize CSS and clear storage?')) return;
        cancelRevertTimer();
        stripCss();
        clearCss();
        syncEditorTextarea();
        _updateSettingsBypassBtn();
    });

    console.log('[Colorize] v0.1.0 loaded. Emergency strip: Ctrl+Shift+0.');
});
