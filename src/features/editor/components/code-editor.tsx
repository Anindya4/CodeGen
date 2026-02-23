import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark"


// To make the contents of the editor bigger:
const customTheme = EditorView.theme({
  ".cm-content": {
    fontSize: "18px",
    lineHeight: "1.6",
  },
  ".cm-gutters": {
    fontSize: "18px",
  },
}, { dark: true });



 

export const CodeEditor = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null)

    useEffect(() => {
        if (!editorRef.current) return;

        const view = new EditorView({
          doc: "Start document",
          parent: editorRef.current,
          extensions: [basicSetup, oneDark, customTheme, javascript({ typescript: true })],
        });

        viewRef.current = view;

        return () => {
            view.destroy()
        }
    },[]);

    

    return (
        <div ref={editorRef} className="size-full pl-4 bg-background"/>
    )

}; 
