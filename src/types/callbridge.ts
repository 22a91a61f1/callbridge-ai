export type EventType =
  | 'public_survey'
  | 'political_campaign'
  | 'political_survey'
  | 'business_event'
  | 'marriage_event'
  | string;
export type LanguageCode = 'te' | 'hi' | 'en';

export type VoiceApprovalStatus = 'approved' | 'pending_review' | 'rejected';

export interface TenantUser {
  id: string; // e.g. client_001
  name: string;
  email: string;
  organization: string;
  organizationName?: string;
  approvedVoiceProfileId?: string;
  approvedVoiceId?: string;
  approvedVoiceName?: string;
  eventVoiceProfiles?: Record<
    string,
    {
      approvedVoiceProfileId: string;
      approvedVoiceName: string;
      providerVoiceId: string;
      updatedAt: string;
      voiceProfileId?: string;
      voiceName?: string;
    }
  >;
  createdAt: string;
  updatedAt: string;
}

export interface CustomPlaceholderField {
  key: string;
  label: string;
  value: string;
}

export interface VoiceProfileRecord {
  id: string;
  clientId: string;
  userId?: string;
  eventType?: EventType;
  eventId?: string;
  name: string;
  voiceName?: string;
  voiceProfileId?: string;
  provider: 'elevenlabs' | 'vapi' | 'sarvam' | 'system';
  providerVoiceId: string;
  elevenLabsVoiceId?: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived';
  voiceStatus: 'ready' | 'processing' | 'failed';
  isApproved?: boolean;
  approvalStatus?: VoiceApprovalStatus;
  selectionStatus?: 'selected' | 'not_selected';
  selected?: boolean;
  languageCapabilities: LanguageCode[];
  previewAudioUrl?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
  speed?: number;
  language?: string;
  pronunciationProfileVersion?: string;
  approvedAt?: string;
  configurationVersion?: number;
  metadata?: Record<string, any>;
}

export interface ContactRecord {
  id: string;
  userId: string;
  eventId: string;
  campaignId?: string;
  name: string;
  phone: string;
  originalPhone: string;
  email?: string;
  locality?: string;
  customFields?: Record<string, string>;
  consentStatus: 'granted' | 'revoked' | 'unconfirmed';
  optOut: boolean;
  importSource: 'manual' | 'csv' | 'excel' | 'pdf';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyQuestion {
  id: string;
  questionId?: string;
  surveyId?: string;
  text: string;
  questionText?: string;
  category?: string;
  description?: string;
  allowFollowUp?: boolean;
  questionOrder?: number;
  enabled?: boolean;
  questionType?: 'rating' | 'feedback' | 'priority' | 'open_ended' | 'custom' | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DtmfOption {
  digit: string;
  labelEn: string;
  spokenPrompt: {
    te: string;
    hi: string;
    en: string;
  };
}

export interface EventRecord {
  id: string;
  type: EventType;
  name: string;
  description?: string;
  language: LanguageCode;
  selectedVoiceProfileId?: string;
  selectedTemplateId?: string;
  createdAt: string;
  updatedAt: string;
  config: {
    // Template & Placeholder Engine
    placeholderValues?: Record<string, string>;
    customPlaceholders?: CustomPlaceholderField[];
    renderedScript?: string;

    // Public Survey
    surveyIntro?: string;
    questions?: SurveyQuestion[];
    enableDynamicFollowUps?: boolean;
    maxFollowUpsPerQuestion?: number;

    // Political Campaign
    candidateName?: string;
    partyName?: string;
    constituency?: string;
    campaignStartDate?: string;
    campaignEndDate?: string;
    approvedScript?: string;
    dtmfOptions?: DtmfOption[];

    // Marriage Event
    brideName?: string;
    groomName?: string;
    weddingDate?: string;
    weddingTime?: string;
    receptionDate?: string;
    receptionTime?: string;
    venueName?: string;
    venueAddress?: string;
    mapLink?: string;
    familyNames?: string;
    customInvitationMessage?: string;
    generatedScript?: string;

    // Customized Event
    customEventType?: string;
    greeting?: string;
    customScript?: string;
    closingMessage?: string;
  };
}

export type CallJobStatus =
  | 'pending'
  | 'initiating'
  | 'calling'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'interrupted'
  | 'callback_scheduled'
  | 'callback_requested'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'opted_out';

export interface SurveyTranscriptTurn {
  role: 'agent' | 'respondent' | 'system';
  text: string;
  timestamp: string;
  questionId?: string;
  questionOrder?: number;
  turnType?: 'greeting' | 'main_question' | 'follow_up' | 'clarification' | 'answer' | 'skip' | 'callback' | 'closing' | 'system';
}

export interface CallJobRecord {
  id: string;
  campaignId: string;
  eventId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  status: CallJobStatus;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  retryCount: number;
  maxRetries: number;
  dtmfDigitReceived?: string;
  dtmfOptionLabel?: string;
  rsvpStatus?: 'attending' | 'not_attending' | 'maybe' | 'callback_requested' | string;
  transcript?: SurveyTranscriptTurn[];
  originalTranscript?: SurveyTranscriptTurn[];
  transcriptRevisions?: Array<{
    editedAt: string;
    editor?: string;
    turnIndex: number;
    previousText: string;
    newText: string;
    reason?: string;
  }>;
  pdfDownloads?: Array<{
    downloadedAt: string;
    count: number;
  }>;
  surveyAnswers?: Record<string, any>;
  surveyState?: any;
  callbackDetails?: {
    requestedDate?: string;
    requestedTime?: string;
    timezone?: string;
    scheduledTimestamp?: string;
    resumeQuestionIndex?: number;
    answeredQuestionIds?: string[];
  };
  callbackRequested?: boolean;
  callbackScheduledAt?: string;
  callbackTimezone?: string;
  failureReason?: string;
  providerCallId?: string;
  vapiCallId?: string;
  twilioCallSid?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecord {
  id: string;
  clientId?: string;
  eventId: string;
  name: string;
  status: 'idle' | 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'stopped' | 'cancelled';
  concurrencyLimit: number;
  totalContacts: number;
  callsInitiated?: number;
  activeCalls?: number;
  processedCount: number;
  completedCount: number;
  failedCount: number;
  answeredCount?: number;
  unansweredCount?: number;
  busyCount?: number;
  keypad1Count?: number;
  keypad2Count?: number;
  attendingCount?: number;
  notAttendingCount?: number;
  maybeAttendingCount?: number;
  pendingCount?: number;
  optOutCount: number;
  activeCallId?: string | null;
  activeCallProviderId?: string | null;
  activeCallStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionPlanId = 'free' | 'pro' | 'max_pro';

export interface PlanConfig {
  id: SubscriptionPlanId;
  name: string;
  price: number;
  currency: string;
  includedSeconds: number;
  freeCallsAllowance?: number;
  validityDays: number;
  badge?: string;
  features: string[];
}

export interface UserSubscription {
  userId: string;
  planId: SubscriptionPlanId;
  planStatus: 'active' | 'exhausted' | 'expired';
  totalSeconds: number; // integer seconds source of truth
  usedSeconds: number;
  remainingSeconds: number;
  freeCallsAllowed: number; // 2 for free plan
  freeCallsUsed: number;
  completedTestCalls?: number;
  isTestingMode?: boolean;
  status: 'active' | 'exhausted' | 'expired';
  purchaseDate: string;
  expiryDate?: string;
  updatedAt: string;
}

export interface UsageTransaction {
  id: string;
  userId: string;
  callId: string;
  eventId: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  vapiCallId?: string;
  twilioCallSid?: string;
  callStartedAt?: string;
  callEndedAt?: string;
  durationSeconds: number;
  creditDeductionSeconds: number;
  billingStatus: 'billed' | 'exempt_unconnected' | 'exempt_zero_duration' | 'blocked_insufficient_credits';
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  userId: string;
  planId: SubscriptionPlanId;
  amount: number;
  currency: string;
  paymentProvider: 'razorpay' | 'gateway_simulation';
  paymentStatus: 'created' | 'completed' | 'failed' | 'cancelled';
  signature?: string;
  verifiedAt?: string;
  createdAt: string;
}

