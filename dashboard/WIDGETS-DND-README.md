# Dashboard Builder widget drag-and-drop (widgetdnd-20261025)

**One owner:** `widgetdnd-20261025.js` handles drag-and-drop for every row in the Builder Widgets list
(`#ui > aside.panel:not(.props) > .witem`). It uses one window-level, capture-phase, delegated pointer handler.

## Rules for new widgets and future edits
- To add a widget to the list, append a `.witem` row with a `<span>` name to the Widgets panel. It can be dragged
  right away, with no registration step. Its order key is the span text (trailing digits stripped). Widgets that are
  missing from a saved order are added at the end.
- Order is stored only through `window.__wOrder` (inline widgetorder-20261018 in index.html): a list of names.
  Account users save it with the layout (prefs.worder), and the owner script autosaves 1.5s after a drop. Guests keep it
  in sessionStorage.
- builderwidgets-20261021b.js `flow()` only *paints* rows (tops) using `__wOrder`. Do not add other ordering code.
- **Do not** add pointerdown/mousedown handlers that target `.witem` rows. Also do not use stopPropagation on them. That
  is what kept breaking drag: dash-row.js's drag-out grabbed every *closed* widget row (Weather, Hub Rooms, Priorities,
  News Briefing, Home Status, …) and stopped the event. Drag-out (drop outside the panel opens a closed widget) now lives in the
  owner script. Controls inside a row (button/input/.boxclose/[data-nodrag]) are left alone.
- Listen for `hf:widget-order` on window if you need to react to a reorder.

## Checks
- Browser self-test (any machine with Playwright + Chrome): `python3 /opt/hubface/tools/dnd-selftest.py [URL] [chrome]`.
  It drags every row up and down, adds a synthetic runtime widget, and checks persistence after reload and that there are no JS errors.
- Static lint (cron, daily 04:10): `/opt/hubface/tools/dnd-lint.sh`, which logs to `/var/log/hubface-dnd-lint.log`.
Backups: /root/hubface-backups/builder-dnd-20261025/
