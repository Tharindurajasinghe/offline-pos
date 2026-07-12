// src/utils/focusGuard.js
//
// ── GLOBAL FOCUS FIX ──────────────────────────────────────────────────────
// Symptom: in the packaged Windows app, input fields stop accepting keystrokes.
// The window still looks active, the mouse still works, but nothing types —
// until you click the taskbar and come back.
//
// Cause: Electron has TWO focus layers — the OS-level BrowserWindow, and the
// Chromium webContents inside it. Several things detach the second without
// touching the first:
//     • native alert() / confirm()      (this app calls them in 33 places)
//     • window.open() print popups      (every bill, every report)
//     • the Alt-activated menu bar      (removed in main.js for production)
//     • auto-updater dialogs and toasts (production only)
// In that state the window has focus but the PAGE does not, so no key events
// are delivered anywhere. Clicking the taskbar forces a real OS
// deactivate -> activate cycle, which re-arms it. That's the whole mystery.
//
// This guard fixes it from the renderer side, globally, for every page and
// every input — no page-by-page changes needed. It works together with the
// main-process watchdog in electron/main.js.
//
// Call installFocusGuard() once, at startup, before React mounts.

export function installFocusGuard() {
  if (typeof window === 'undefined') return
  if (window.__focusGuardInstalled) return
  window.__focusGuardInstalled = true

  const ensure = () => { try { window.api?.ensureFocus?.() } catch (_) {} }
  const hardRefocus = () => { try { window.api?.refocus?.() } catch (_) {} }

  // ── 1. Any interaction with the page re-arms keyboard focus ───────────────
  // Cheap: ensureFocus() is a no-op in the main process unless the page has
  // actually lost focus. Capture phase so it runs before anything else.
  const onInteract = () => ensure()
  document.addEventListener('pointerdown', onInteract, true)
  document.addEventListener('focusin', onInteract, true)

  // ── 2. Native dialogs: restore focus after they close ─────────────────────
  // alert()/confirm() block the thread and leave the page unfocused on close.
  const nativeAlert = window.alert.bind(window)
  const nativeConfirm = window.confirm.bind(window)
  const nativePrompt = window.prompt.bind(window)

  const afterDialog = (prevEl) => {
    hardRefocus()   // full blur -> focus cycle; dialogs need the strong version
    const put = () => {
      try {
        if (prevEl && document.contains(prevEl) && typeof prevEl.focus === 'function') {
          prevEl.focus()
        }
      } catch (_) {}
    }
    setTimeout(put, 0)
    setTimeout(put, 120)
  }

  window.alert = (msg) => {
    const prev = document.activeElement
    const r = nativeAlert(msg)
    afterDialog(prev)
    return r
  }

  window.confirm = (msg) => {
    const prev = document.activeElement
    const result = nativeConfirm(msg)   // must return the user's real choice
    afterDialog(prev)
    return result
  }

  window.prompt = (msg, def) => {
    const prev = document.activeElement
    const result = nativePrompt(msg, def)
    afterDialog(prev)
    return result
  }

  // ── 3. Printing: window.print() and print popups drop page focus ──────────
  window.addEventListener('afterprint', () => {
    hardRefocus()
    setTimeout(hardRefocus, 200)
  })

  // ── 4. Returning to the app from anywhere else ────────────────────────────
  window.addEventListener('focus', ensure)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensure()
  })
}