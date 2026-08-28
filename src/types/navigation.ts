export type WorkspacePageId = "settings";

export type AppView = "workspace" | WorkspacePageId;

export type WorkspacePageTab = {
  id: WorkspacePageId;
  label: string;
  controlsId: string;
};

export const WORKSPACE_PAGE_DEFINITIONS: Record<WorkspacePageId, WorkspacePageTab> = {
  settings: {
    id: "settings",
    label: "设置",
    controlsId: "settings-workspace",
  },
};
