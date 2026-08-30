export interface ParseConfig {
  hashtags: string[];
  keywords: string[];
  profilesPerQuery: number;
  minScore: number;
  minReelsViews: number;
  useAI: boolean;
  apifyToken: string;
  openaiKey?: string;
}

export interface LeadContact {
  telegram: string | null;
  email: string | null;
  phone: string | null;
}

export interface AIAnalysis {
  description: string;
  activitySummary: string;
  isGoodLead: boolean;
  confidence: number;
  reason: string;
}

export interface Lead {
  id: string;
  username: string;
  profileUrl: string;
  fullName: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isBusinessAccount: boolean;
  businessCategory: string | null;
  externalUrl: string | null;
  contact: LeadContact;
  foundByTags: string[];
  avgReelsViews: number;
  minReelsViews: number;
  score: number;
  tier: 'A' | 'B' | 'C';
  aiAnalysis: AIAnalysis | null;
  parsedAt: string;
}

export interface StoredLead extends Lead {
  contacted: boolean;
  replied: boolean;
  called: boolean;
  savedAt: string;
}

export interface TagPreset {
  id: string;
  name: string;
  hashtags: string[];
  keywords: string[];
}

export interface AuthUser {
  username: string;
  subscription: {
    active: boolean;
    expiresAt: string | null;
  };
  settings: {
    hasApifyToken: boolean;
    hasOpenaiKey: boolean;
    googleSheetId: string | null;
    serviceAccountEmail?: string;
  };
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: {
    stage: string;
    current: number;
    total: number;
    message: string;
  };
  leadsCount: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}
