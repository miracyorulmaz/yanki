// ============================================================================
// Yankı — Shared TypeScript Types
// CONTRACTS.md'deki veri modeli ile birebir eşleşir.
// ============================================================================

// ---- DB Modelleri ----

export type UserStatus = 'active' | 'deceased' | 'deactivated';
export type QuestionCategory = 'onboarding' | 'daily';
export type QuestionType = 'multiple_choice' | 'scaled' | 'open_text';
export type EntrySource = 'onboarding' | 'daily' | 'chat' | 'manual_note';
export type FriendshipTier = 'friend' | 'close_friend';
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
export type ConversationRole = 'user' | 'yanki';
export type AccessGrantStatus = 'active' | 'revoked';

export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  status: UserStatus;
  consent_given_at: string | null;
  consent_text_version: string | null;
  deletion_requested_at: string | null;
  onboarding_completed_at: string | null;
}

export interface Question {
  id: string;
  category: QuestionCategory;
  tag: string | null;
  question_type: QuestionType;
  text: string;
  options: Record<string, unknown> | null;
  weight: number | null;
  dimensions: string[];
  importance: string | null;
  refreshable: boolean;
  active: boolean;
}

export interface PersonalityProfile {
  id: string;
  user_id: string;
  summary_text: string;
  traits: Record<string, unknown>;
  created_at: string;
}

export interface Insight {
  id: string;
  user_id: string;
  insight_text: string;
  category: string | null;
  confidence: number;
  based_on_period_start: string;
  based_on_period_end: string;
  created_at: string;
}

export interface Entry {
  id: string;
  user_id: string;
  question_id: string | null;
  source: EntrySource;
  question: string;
  question_type: QuestionType;
  answer: string;
  moderation_flag: string | null;
  created_at: string;
}

export interface EntryEmbedding {
  entry_id: string;
  embedding: number[];
  embedding_model: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  tier: FriendshipTier;
  status: FriendshipStatus;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  role: ConversationRole;
  message: string;
  used_profile_version: string | null;
  used_insight_ids: string[] | null;
  model: string | null;
  token_input: number | null;
  token_output: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface YankiAccessGrant {
  id: string;
  grantor_id: string;
  grantee_id: string;
  status: AccessGrantStatus;
  granted_at: string;
}

// ---- Seed Data ----

export interface SeedQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  weight?: number;
  dimensions: string[];
  importance?: string;
  refreshable: boolean;
}

export interface SeedCategory {
  category: QuestionCategory;
  tag?: string;
  questions: SeedQuestion[];
}

// ---- API Request/Response ----

export interface OnboardingAnswerRequest {
  questionId: string;
  question: string;
  questionType: QuestionType;
  answer: string;
}

export interface OnboardingAnswerResponse {
  entryId: string;
}

export interface OnboardingCompleteResponse {
  profileId: string;
  profileSummary: string;
  firstMessage: string;
}

export interface DailyQuestionsResponse {
  questions: { id: string; text: string; type: string }[];
}

export interface DailyAnswerRequest {
  questionId: string;
  answer: string;
}

export interface DailyAnswerResponse {
  entryId: string;
  moderationFlag: null | 'flagged';
}

export interface ChatMessageRequest {
  message: string;
}

export interface ChatMessageResponse {
  reply: string;
  usedMemories: string[];
}

export interface FriendshipRequest {
  addresseeId: string;
  tier: FriendshipTier;
}

export interface FriendshipRespondRequest {
  friendshipId: string;
  action: 'accept' | 'block';
}

export interface FriendshipListResponse {
  friends: { userId: string; displayName: string; tier: string }[];
}
