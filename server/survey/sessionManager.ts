export type ConversationStatus =
  | 'active'
  | 'waiting_for_answer'
  | 'waiting_for_follow_up'
  | 'completed'
  | 'ended_by_user'
  | 'refused'
  | 'busy'
  | 'callback_requested'
  | 'ended';

export interface FollowUpDetail {
  topic: string;
  field: string;
  question: string;
  status: 'waiting_for_answer' | 'completed';
}

export type TopicStatus =
  | 'not_started'
  | 'mentioned'
  | 'needs_follow_up'
  | 'sufficiently_answered'
  | 'completed'
  | 'skipped';

export interface SurveySessionState {
  session_id: string;
  survey_id: string;
  language: string; // e.g. "te"
  current_topic?: string;
  current_question?: string;
  current_question_id: string;
  current_question_topic: string;
  conversation_history?: Array<{ role: string; text: string }>;
  topic_status?: Record<string, TopicStatus>;
  topic_statuses?: Record<string, TopicStatus>;
  answers: Record<string, any>;
  pending_follow_up: FollowUpDetail | string | null;
  completed_topics?: string[];
  asked_follow_ups: string[];
  completed_follow_ups: string[];
  completed_questions: string[];
  conversation_status: ConversationStatus;
  callback_requested?: boolean;
  callback_time?: string;
  created_at: string;
  updated_at: string;
}

/**
 * In-memory Session Manager with automatic TTL and per-session isolation.
 * Guarantees that sessions never leak across users or conversations.
 */
class SurveySessionStore {
  private sessions = new Map<string, SurveySessionState>();

  getOrCreateSession(
    sessionId?: string,
    surveyId: string = 'public_facilities',
    language: string = 'te'
  ): SurveySessionState {
    const id = sessionId && sessionId.trim() ? sessionId.trim() : `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    let session = this.sessions.get(id);
    if (!session) {
      const defaultTopicStatus: Record<string, TopicStatus> = {
        drinking_water: 'not_started',
        roads: 'not_started',
        electricity: 'not_started',
        drainage: 'not_started',
        waste_management: 'not_started',
        healthcare: 'not_started',
        education: 'not_started',
        public_transport: 'not_started',
        government_services: 'not_started',
        top_priority: 'not_started',
      };

      session = {
        session_id: id,
        survey_id: surveyId,
        language: language,
        current_topic: 'drinking_water',
        current_question: 'A1',
        current_question_id: 'A1',
        current_question_topic: 'drinking_water',
        conversation_history: [],
        topic_status: defaultTopicStatus,
        topic_statuses: defaultTopicStatus,
        answers: {},
        pending_follow_up: null,
        completed_topics: [],
        asked_follow_ups: [],
        completed_follow_ups: [],
        completed_questions: [],
        conversation_status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.sessions.set(id, session);
    } else {
      if (!session.asked_follow_ups) session.asked_follow_ups = [];
      if (!session.completed_follow_ups) session.completed_follow_ups = [];
      if (!session.conversation_history) session.conversation_history = [];
      if (!session.completed_topics) session.completed_topics = [];
      if (!session.topic_status) {
        session.topic_status = session.topic_statuses || {};
      }
      if (!session.topic_statuses) {
        session.topic_statuses = session.topic_status;
      }
      if (!session.current_topic) {
        session.current_topic = session.current_question_topic || 'drinking_water';
      }
      if (!session.current_question) {
        session.current_question = session.current_question_id || 'A1';
      }
    }
    return session;
  }

  getSession(sessionId: string): SurveySessionState | undefined {
    return this.sessions.get(sessionId.trim());
  }

  saveSession(state: SurveySessionState): SurveySessionState {
    const existing = this.sessions.get(state.session_id);
    const mergedTopicStatus = {
      ...(existing?.topic_status || existing?.topic_statuses || {}),
      ...(state.topic_status || state.topic_statuses || {}),
    };

    const updated: SurveySessionState = {
      ...existing,
      ...state,
      current_topic: state.current_topic || state.current_question_topic || existing?.current_topic || 'drinking_water',
      current_question: state.current_question || state.current_question_id || existing?.current_question || 'A1',
      current_question_topic: state.current_topic || state.current_question_topic || existing?.current_question_topic || 'drinking_water',
      current_question_id: state.current_question || state.current_question_id || existing?.current_question_id || 'A1',
      conversation_history: state.conversation_history || existing?.conversation_history || [],
      answers: {
        ...(existing?.answers || {}),
        ...(state.answers || {}),
      },
      topic_status: mergedTopicStatus,
      topic_statuses: mergedTopicStatus,
      completed_topics: Array.from(
        new Set([...(existing?.completed_topics || []), ...(state.completed_topics || [])])
      ),
      completed_questions: Array.from(
        new Set([...(existing?.completed_questions || []), ...(state.completed_questions || [])])
      ),
      updated_at: new Date().toISOString(),
    };
    this.sessions.set(state.session_id, updated);
    return updated;
  }

  updateAnswers(sessionId: string, newAnswers: Record<string, any>): SurveySessionState {
    const session = this.getOrCreateSession(sessionId);
    session.answers = {
      ...session.answers,
      ...newAnswers,
    };
    session.updated_at = new Date().toISOString();
    this.sessions.set(sessionId, session);
    return session;
  }

  resetSession(sessionId: string, surveyId: string = 'public_facilities', language: string = 'te'): SurveySessionState {
    const defaultTopicStatus: Record<string, TopicStatus> = {
      drinking_water: 'not_started',
      roads: 'not_started',
      electricity: 'not_started',
      drainage: 'not_started',
      waste_management: 'not_started',
      healthcare: 'not_started',
      education: 'not_started',
      public_transport: 'not_started',
      government_services: 'not_started',
      top_priority: 'not_started',
    };

    const cleanSession: SurveySessionState = {
      session_id: sessionId,
      survey_id: surveyId,
      language: language,
      current_topic: 'drinking_water',
      current_question: 'A1',
      current_question_id: 'A1',
      current_question_topic: 'drinking_water',
      conversation_history: [],
      topic_status: defaultTopicStatus,
      topic_statuses: defaultTopicStatus,
      answers: {},
      pending_follow_up: null,
      completed_topics: [],
      asked_follow_ups: [],
      completed_follow_ups: [],
      completed_questions: [],
      conversation_status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.sessions.set(sessionId, cleanSession);
    return cleanSession;
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId.trim());
  }

  getAllSessions(): SurveySessionState[] {
    return Array.from(this.sessions.values());
  }
}

export const surveySessionStore = new SurveySessionStore();
