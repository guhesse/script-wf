export interface WorkfrontFile {
  name: string;
  type: string;
  size?: string;
  url?: string;
  addedInfo?: string;
}

export interface WorkfrontFolder {
  name: string;
  files: WorkfrontFile[];
}

export interface DocumentsResponse {
  success: boolean;
  folders?: WorkfrontFolder[];
  totalFolders?: number;
  totalFiles?: number;
  message?: string;
  debug?: unknown;
}

export interface LoginStatusResponse {
  loggedIn: boolean;
  lastLogin?: string;
  hoursAge?: number;
  error?: string;
}

export interface ShareSelection {
  folder: string;
  fileName: string;
}

export interface ShareResult {
  folder: string;
  fileName: string;
  success: boolean;
  message?: string;
  error?: string;
}

export interface ShareResponse {
  success: boolean;
  message: string;
  results: ShareResult[];
  summary?: {
    total: number;
    success: number;
    errors: number;
  };
}

export interface WorkfrontProject {
  id: string;
  url: string;
  title: string;
  projectId?: string;
  dsid?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  accessCount: number;
}

export interface ProjectHistoryResponse {
  success: boolean;
  projects: WorkfrontProject[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';