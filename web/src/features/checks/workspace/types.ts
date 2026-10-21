import type { CheckDetail } from "../queries";

export type WorkspaceClaim = CheckDetail["claims"][number];
export type WorkspaceSegment = CheckDetail["segments"][number];

export type Capabilities = {
  canDecide: boolean;
  canEdit: boolean;
  viewerId: string;
};
