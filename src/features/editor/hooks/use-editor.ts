import { useCallback } from "react";
import { useEditorState } from "../store/use-editor-store";
import { Id } from "../../../../convex/_generated/dataModel";


export const useEditor = (projectId: Id<"projects">) => {
    const store = useEditorState();
    const TabState = useEditorState((state) => state.getTabState(projectId));

    const openFile = useCallback((
        fileId: Id<"files">,
        options: {pinned : boolean}
    ) => {
        store.openFile(fileId, projectId, options)
    },[store, projectId]);

    const closeTab = useCallback(
        (fileId: Id<"files">) => {
            store.closeTab(projectId, fileId);
        },
        [store, projectId]
    )

    const closeAllTabs = useCallback(() => {
        store.closeAllTabs(projectId);
    },
    [store, projectId])

    const setActiveTab = useCallback(
        (fileId:Id<"files">) => {
            store.setActiveTab(projectId, fileId)
        },[store,projectId]
    )


    return {
        openTabs: TabState.openTabs,
        activeTabId: TabState.activeTabId,
        previewTabId: TabState.previewTabId,
        openFile,
        closeTab,
        closeAllTabs,
        setActiveTab,
    }

}   
