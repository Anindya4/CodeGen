import { EditorView } from "codemirror";


export const customTheme = EditorView.theme({
  "&": {
    outline: "none !important",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "var(--font-plex-mono), monospace",
    fontSize: "18px",
  },
  ".cm-scroller": {
    scrollbarWidth: "thin",
    scrollbarColor: "#c6c6cf transparent",
  },
});