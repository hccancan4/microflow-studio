# MicroFlow Studio — Keyboard Shortcuts

All shortcuts are handled in `App.tsx` → `handleKeyDown`. Shortcuts with `Ctrl` also respond to `Meta` (⌘) on macOS.

| Shortcut | Action |
|---|---|
| `Ctrl+Z` | Undo (up to 50 steps) |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save project (Save As if no current path) |
| `Ctrl+Shift+S` | Save As (always opens file dialog) |
| `Ctrl+O` | Open project |
| `Ctrl+N` | New project (prompts if unsaved changes exist) |
| `Ctrl+E` | Open Export dialog |
| `Delete` | Delete selected component(s) |
| `Backspace` | Delete selected component(s) |

> **Note:** `Delete` and `Backspace` are suppressed when a text input or textarea element is focused (e.g., parameter fields, Monaco editor).
