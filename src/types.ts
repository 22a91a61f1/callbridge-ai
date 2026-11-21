export type SupportedLanguage = 'English' | 'Telugu' | 'Hindi';
export type SurveyType = 'PUBLIC_FACILITIES' | 'ELECTION_VOTER_OPINION' | 'DEVELOPMENT_UNCONFIGURED' | 'CUSTOM';

export interface SurveyQuestion {
  id: string;
  text: string;
  category?: string;
  required?: boolean;
}

export interface SurveyConfig {
  id: string;
  surveyType?: SurveyType;
  title: string;
  description: string;
  targetLanguage: SupportedLanguage;
  questions: SurveyQuestion[];
  knowledgeBase: string;
}

export interface ChatMessage {
  id: string;
  role: 'agent' | 'respondent' | 'system';
  text: string;
  timestamp: string;
  statusTag?: 'clarification' | 'follow-up' | 'knowledge-answer' | 'refusal-handled' | 'completed' | 'stopped';
}

export interface CapturedAnswer {
  questionId: string;
  questionText: string;
  answerSummary: string;
  status: 'answered' | 'refused' | 'pending';
}

export interface ClientVoiceProfile {
  client_id: string;
  user_id?: string;
  voice_id: string;
  provider: 'elevenlabs';
  status: 'active' | 'archived';
  voice_status?: string;
  created_at: string;
  updated_at: string;
  preview_audio_url?: string;
  metadata?: {
    original_filename?: string;
    file_size_bytes?: number;
    mime_type?: string;
    description?: string;
    elevenlabs_name?: string;
    is_mock?: boolean;
    [key: string]: any;
  };
}

export interface AgentTurnResponse {
  reply: string;
  has_active_voice?: boolean;
  pipeline?: string;
  audio_base64?: string;
  audio_stream_url?: string;
  audio_url?: string;
  voice_id?: string;
  voice_provider?: string;
  currentQuestionId?: string;
  extractedAnswers?: Array<{
    questionId: string;
    answerSummary: string;
    status: 'answered' | 'refused' | 'pending';
  }>;
  isSurveyComplete: boolean;
  isSurveyStopped: boolean;
  summaryOfCollected?: string;
  session_id?: string;
  conversationState?: any;
}
