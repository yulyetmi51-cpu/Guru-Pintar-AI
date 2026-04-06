export interface User {
  id: string;
  name: string;
  nip: string;
  email: string;
  role: 'admin' | 'user';
  status: 'aktif' | 'nonaktif';
  sisa_token?: number;
  last_reset?: string;
  subscription?: 'free' | 'pro';
  subscriptionExpiry?: string;
}

export interface HelpEntry {
  id: string;
  title: string;
  content: string;
  type: 'contact' | 'faq';
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  userId: string;
  userName: string;
  subject: string;
  grade: string;
  topic: string;
  fileUrl: string;
  fileType: 'doc' | 'pdf';
  createdAt: string;
}

export interface SyncHistory {
  id: string;
  timestamp: string;
  status: 'success' | 'error';
  message: string;
  repo: string;
  branch: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  role: 'admin' | 'user' | null;
  user: User | null;
}
