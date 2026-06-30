export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  workspace: Workspace | null;
}

export interface FbStatus {
  connected: boolean;
  adAccountId: string | null;
  expiresAt: string | null;
}

export interface AdAccount {
  id: string;
  accountId: string;
  name: string;
  status: number;
  currency: string;
}

export interface AmocrmStatus {
  connected: boolean;
  domain: string | null;
  pipelineId: string | null;
  wonStageId: string | null;
}

export interface PipelineStatus {
  id: string | number;
  name: string;
  type: string;
}

export interface Pipeline {
  id: string | number;
  name: string;
  statuses: PipelineStatus[];
}
