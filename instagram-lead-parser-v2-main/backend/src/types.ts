export interface ParseConfig {
  hashtags: string[];
  keywords: string[];
  profilesPerQuery: number;
  minScore: number;
  minReelsViews: number;
  minFollowers: number;
  useAI: boolean;
}

export interface RawProfile {
  username: string;
  fullName: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isBusinessAccount: boolean;
  businessCategory: string | null;
  externalUrl: string | null;
  profileUrl: string;
  latestPosts: PostSnippet[];
}

export interface PostSnippet {
  caption: string;
  likesCount: number;
  commentsCount?: number;
  videoViewCount?: number;
  timestamp: string;
  type?: string;
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

export interface ParseJob {
  id: string;
  userId: number;
  status: 'pending' | 'running' | 'done' | 'error';
  config: ParseConfig;
  progress: {
    stage: string;
    current: number;
    total: number;
    message: string;
  };
  leads: Lead[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface ExistingLeads {
  usernames: string[];
}
