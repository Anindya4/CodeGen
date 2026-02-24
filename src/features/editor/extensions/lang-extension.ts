import {Extension} from "@codemirror/state"

import {python} from "@codemirror/lang-python"
import {java} from "@codemirror/lang-java"
import {cpp} from "@codemirror/lang-cpp"
import {html} from "@codemirror/lang-html"
import {markdown} from "@codemirror/lang-markdown"
import { javascript } from "@codemirror/lang-javascript"
import {css} from "@codemirror/lang-css"
import {json} from "@codemirror/lang-json"

export const getLanguageExtension = (fileName: string) : Extension => {
    const extension = fileName.split(".").pop()?.toLowerCase()

    switch(extension) {
        case "js":
            return javascript();
        case "jsx":
            return javascript({jsx:true});
        case "ts":
            return javascript({typescript: true});
        case "tsx":
            return javascript({typescript:true, jsx: true});
        case "html":
            return html();
        case "css":
            return css();
        case "json":
            return json();
        case "cpp":
            return cpp();
        case "java":
            return java();
        case "md":
        case "mdx":
            return markdown()
        case "py":
            return python();
        default:
            return [];
        
    }
}