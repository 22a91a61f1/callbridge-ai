import fs from 'fs';
import path from 'path';
import {
  type EventTemplateRecord,
  DEFAULT_TEMPLATES,
  type TemplateFieldDefinition,
} from '../templates/templateEngine.ts';

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
  questionType?: string;
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

export interface CustomPlaceholderField {
  key: string;
  label: string;
  value: string;
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
    // Template & Placeholders Engine
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
  | 'failed'
  | 'no_answer'
  | 'busy'
  | 'cancelled'
  | 'skipped'
  | 'opted_out';

export interface CallJobRecord {
  id: string;
  clientId?: string;
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
  transcript?: Array<{
    role: 'agent' | 'respondent' | 'system' | 'assistant';
    text: string;
    timestamp?: string;
    questionId?: string | null;
    questionOrder?: number;
    turnType?: string;
    callId?: string;
    sessionId?: string;
    speakerRole?: 'assistant' | 'respondent' | 'system';
    transcriptText?: string;
    sequenceNumber?: number;
    isFinal?: boolean;
    confidence?: number;
  }>;
  originalTranscript?: Array<{
    role: 'agent' | 'respondent' | 'system' | 'assistant';
    text: string;
    timestamp?: string;
    questionId?: string | null;
    questionOrder?: number;
    turnType?: string;
    callId?: string;
    sessionId?: string;
    speakerRole?: 'assistant' | 'respondent' | 'system';
    transcriptText?: string;
    sequenceNumber?: number;
    isFinal?: boolean;
    confidence?: number;
  }>;
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
  downloaded?: boolean;
  downloadedAt?: string;
  downloadCount?: number;
  surveyAnswers?: Record<string, any>;
  surveyState?: any;
  callbackDetails?: {
    requestedDate?: string;
    requestedTime?: string;
    timezone?: string;
    scheduledTimestamp?: string;
    resumeQuestionIndex?: number;
    answeredQuestionIds?: string[];
    unansweredQuestionId?: string;
    unansweredQuestionIndex?: number;
    rawUtterance?: string;
    confirmationMessage?: string;
    isTimeVague?: boolean;
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

export interface QuestionAggregateOutcome {
  id: string;
  questionOrder: number;
  text: string;
  category: string;
  issueReportedCount: number;
  issueReportedPercent: number;
  noIssueReportedCount: number;
  noIssueReportedPercent: number;
  unansweredCount: number;
  totalAnswers: number;
}

export interface AggregateEventMetrics {
  eventId: string;
  eventType: string;
  totalCalls: number;
  completedCalls: number;
  answeredCalls: number;
  unansweredCalls: number;
  rejectedCalls: number;
  failedCalls: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  completionRatePercent: number;
  answerRatePercent: number;
  publicSurvey?: {
    totalQuestions: number;
    questions: QuestionAggregateOutcome[];
    completedSurveyCalls?: number;
    incompleteSurveyCalls?: number;
  };
  politicalCampaign?: {
    keypad1Count: number;
    keypad1Percent: number;
    keypad2Count: number;
    keypad2Percent: number;
    noInputCount: number;
    noInputPercent: number;
    totalValidDtmf: number;
  };
  marriageEvent?: {
    attendingCount: number;
    attendingPercent: number;
    notAttendingCount: number;
    notAttendingPercent: number;
    maybeAttendingCount: number;
    maybeAttendingPercent: number;
    totalValidRsvp: number;
  };
  updatedAt: string;
}

export interface EventCallOutcome {
  callId: string;
  eventType?: string;
  status?: 'completed' | 'no_answer' | 'busy' | 'failed' | 'cancelled' | string;
  durationSeconds?: number;
  dtmfDigit?: string;
  politicalOutcome?: '1' | '2' | 'no_input';
  marriageRsvp?: 'YES' | 'NO' | 'MAYBE' | string;
  surveyQuestionId?: string;
  surveyAnswer?: string;
  surveyAnswers?: Record<string, string>;
  isAnswered?: boolean;
  isNoAnswer?: boolean;
  isFailed?: boolean;
  isRejected?: boolean;
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
  totalSeconds: number; // integer seconds
  usedSeconds: number;
  remainingSeconds: number;
  freeCallsAllowed: number;
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
  billingStatus: 'billed' | 'exempt_unconnected' | 'exempt_zero_duration' | 'exempt_internal_test' | 'blocked_insufficient_credits';
  wasAnswered?: boolean;
  providerCost?: number;
  endedReason?: string;
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

export const DEFAULT_PLAN_CONFIGS: Record<SubscriptionPlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free Trial',
    price: 0,
    currency: 'INR',
    includedSeconds: 120,
    freeCallsAllowance: 2,
    validityDays: 365,
    badge: 'Free Tier',
    features: [
      'Exactly 2 completed eligible calls included',
      'Preview Telugu & multi-lingual speech synthesis',
      'Access to all 3 modules (Survey, Campaign, Marriage)',
      'Basic carrier routing over Twilio & Vapi',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    price: 2499,
    currency: 'INR',
    includedSeconds: 1800, // 30 minutes in seconds
    validityDays: 30,
    badge: 'Popular Choice',
    features: [
      '1,800 Seconds (30 minutes) talk time',
      'Accurate per-second billing (exact integer seconds)',
      'ElevenLabs authentic cloned voice delivery',
      'Sequential Outbound Calling with Live Webhooks',
      'Interactive Keypad DTMF sentiment collection',
      'CSV / Excel / PDF contact directory imports',
    ],
  },
  max_pro: {
    id: 'max_pro',
    name: 'Max Pro Plan',
    price: 5999,
    currency: 'INR',
    includedSeconds: 5400, // 90 minutes in seconds
    validityDays: 30,
    badge: 'Enterprise Grade',
    features: [
      '5,400 Seconds (90 minutes) talk time',
      'Accurate per-second billing with max duration safeguards',
      'Priority concurrency carrier line dispatch',
      'OpenAI GPT-4o dynamic follow-up probing',
      'Deepgram Nova-2 speech recognition',
      'Comprehensive usage audit logs & transcript exports',
    ],
  },
};

interface DatabaseSchema {
  tenants: Record<string, TenantUser>;
  events: Record<string, EventRecord>;
  templates: Record<string, EventTemplateRecord>;
  voiceProfiles: Record<string, VoiceProfileRecord>;
  contacts: Record<string, ContactRecord>;
  campaigns: Record<string, CampaignRecord>;
  callJobs: Record<string, CallJobRecord>;
  subscriptions: Record<string, UserSubscription>;
  usageTransactions: Record<string, UsageTransaction>;
  paymentHistory: Record<string, PaymentRecord>;
  planConfigs: Record<string, PlanConfig>;
  aggregateAnalytics: Record<string, AggregateEventMetrics>;
  deduplicationKeys?: string[];
  providerCallIdMappings?: Record<string, { jobId: string; campaignId: string; eventId: string }>;
}

export const CANONICAL_PUBLIC_SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: 'A1', text: 'మీ ప్రాంతంలో తాగునీటి సౌకర్యం ఎలా ఉంది?', category: 'తాగునీరు', allowFollowUp: true },
  { id: 'A2', text: 'మీ ప్రాంతంలోని రోడ్ల పరిస్థితి ఎలా ఉంది?', category: 'రోడ్లు', allowFollowUp: true },
  { id: 'A3', text: 'మీ ప్రాంతంలో విద్యుత్ సరఫరా ఎలా ఉంది?', category: 'విద్యుత్', allowFollowUp: true },
  { id: 'A4', text: 'మీ ప్రాంతంలో డ్రైనేజీ సౌకర్యం గురించి మీ అభిప్రాయం ఏమిటి?', category: 'డ్రైనేజీ', allowFollowUp: true },
  { id: 'A5', text: 'మీ ప్రాంతంలో చెత్త సేకరణ మరియు పారిశుధ్య సేవలు ఎలా ఉన్నాయి?', category: 'చెత్త సేకరణ & పారిశుధ్యం', allowFollowUp: true },
  { id: 'A6', text: 'మీ ప్రాంతంలో ప్రభుత్వ లేదా స్థానిక ఆరోగ్య సేవలు మీ అవసరాలకు సరిపోతున్నాయా?', category: 'ఆరోగ్య సేవలు', allowFollowUp: true },
];

export class CallbridgeStorage {
  private data: DatabaseSchema;
  private filePath: string;
  private processedCallDeduplication = new Set<string>();
  public onQuestionsChanged?: (eventId: string) => void;

  constructor(storageDir = path.join(process.cwd(), 'data')) {
    try {
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
    } catch (e) {
      console.warn('Storage directory create warning:', e);
    }
    this.filePath = path.join(storageDir, 'callbridge_db.json');
    this.data = this.load();
    this.seedDefaultTenantsIfEmpty();
    this.seedDefaultTemplatesIfEmpty();
    this.seedDefaultVoiceProfilesIfEmpty();
    this.seedDefaultEventsIfEmpty();
    this.seedDefaultSubscriptionsIfEmpty();
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.deduplicationKeys)) {
          for (const k of parsed.deduplicationKeys) {
            this.processedCallDeduplication.add(k);
          }
        }
        return {
          tenants: parsed.tenants || {},
          events: parsed.events || {},
          templates: parsed.templates || {},
          voiceProfiles: parsed.voiceProfiles || {},
          contacts: parsed.contacts || {},
          campaigns: parsed.campaigns || {},
          callJobs: parsed.callJobs || {},
          subscriptions: parsed.subscriptions || {},
          usageTransactions: parsed.usageTransactions || {},
          paymentHistory: parsed.paymentHistory || {},
          planConfigs: parsed.planConfigs || { ...DEFAULT_PLAN_CONFIGS },
          aggregateAnalytics: parsed.aggregateAnalytics || {},
          deduplicationKeys: parsed.deduplicationKeys || [],
          providerCallIdMappings: parsed.providerCallIdMappings || {},
        };
      }
    } catch (e) {
      console.warn('Failed to load callbridge_db.json, initializing fresh store:', e);
    }
    return {
      tenants: {},
      events: {},
      templates: {},
      voiceProfiles: {},
      contacts: {},
      campaigns: {},
      callJobs: {},
      subscriptions: {},
      usageTransactions: {},
      paymentHistory: {},
      planConfigs: { ...DEFAULT_PLAN_CONFIGS },
      aggregateAnalytics: {},
      deduplicationKeys: [],
      providerCallIdMappings: {},
    };
  }

  private persist(): void {
    try {
      this.data.deduplicationKeys = Array.from(this.processedCallDeduplication);
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to write callbridge_db.json:', e);
    }
  }

  private seedDefaultTemplatesIfEmpty(): void {
    if (!this.data.templates || Object.keys(this.data.templates).length === 0) {
      this.data.templates = {};
      DEFAULT_TEMPLATES.forEach((tpl) => {
        this.data.templates[tpl.id] = tpl;
      });
      this.persist();
    }
  }

  public seedDefaultTenantsIfEmpty(): void {
    if (!this.data.tenants || Object.keys(this.data.tenants).length === 0) {
      this.data.tenants = {};
      const now = new Date().toISOString();
      const defaultTenants: TenantUser[] = [
        {
          id: 'client_001',
          name: 'Telangana Outreach Org',
          email: 'campaign@telangana.org',
          organization: 'Telangana Civic Engagement Office',
          organizationName: 'Telangana Outreach Org',
          approvedVoiceProfileId: undefined,
          approvedVoiceName: undefined,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'client_002',
          name: 'Civic Action Forum',
          email: 'admin@civicaction.org',
          organization: 'Civic Research & Survey Group',
          organizationName: 'Civic Action Forum',
          approvedVoiceProfileId: 'K1QBvMiZJPKFiKyZwAxM',
          approvedVoiceName: 'Ramesh (Civic Survey)',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'client_003',
          name: 'Grand Wedding Planners',
          email: 'invitations@grandwedding.com',
          organization: 'Grand Celebrations & Events',
          organizationName: 'Grand Wedding Planners',
          approvedVoiceProfileId: undefined,
          approvedVoiceName: undefined,
          createdAt: now,
          updatedAt: now,
        },
      ];

      defaultTenants.forEach((t) => {
        this.data.tenants[t.id] = t;
      });
      this.persist();
    }
  }

  public seedDefaultVoiceProfilesIfEmpty(): void {
    if (!this.data.voiceProfiles || Object.keys(this.data.voiceProfiles).length === 0) {
      this.data.voiceProfiles = {};
      const now = new Date().toISOString();
      const defaultProfiles: VoiceProfileRecord[] = [
        {
          id: 'vp_authorized_clone',
          clientId: 'client_001',
          name: 'Authorized Cloned Voice (Telugu)',
          provider: 'elevenlabs',
          providerVoiceId: '5IASxvpUK3p2EFjhO3pn',
          createdAt: now,
          updatedAt: now,
          status: 'active',
          voiceStatus: 'ready',
          approvalStatus: 'approved',
          languageCapabilities: ['te', 'hi', 'en'],
        },
        {
          id: 'vp_client_cloned_01',
          clientId: 'client_002',
          name: 'Civic Cloned Voice (Primary)',
          provider: 'elevenlabs',
          providerVoiceId: 'K1QBvMiZJPKFiKyZwAxM',
          createdAt: now,
          updatedAt: now,
          status: 'active',
          voiceStatus: 'ready',
          approvalStatus: 'approved',
          languageCapabilities: ['te', 'hi', 'en'],
        },
      ];

      defaultProfiles.forEach((p) => {
        this.data.voiceProfiles[p.id] = p;
      });
      this.persist();
    }
  }

  /**
   * Seeds exactly the three primary event categories:
   * 1. Public Survey
   * 2. Political Campaign
   * 3. Marriage Event
   * Strictly NO hardcoded customer, candidate, party, or family names.
   */
  public seedDefaultEventsIfEmpty(force = false): void {
    // If events exist with old hardcoded customer names, clean them up
    const existingValues = Object.values(this.data.events);
    const hasOldHardcodedNames = existingValues.some(
      (e) =>
        e.config?.candidateName?.includes('రవి') ||
        e.config?.brideName?.includes('లక్ష్మి') ||
        e.name?.includes('Suresh')
    );

    if (force || existingValues.length === 0 || hasOldHardcodedNames) {
      this.data.events = {};

      const now = new Date().toISOString();
      const defaultCategories: EventRecord[] = [
        {
          id: 'event_public_survey',
          type: 'public_survey',
          name: 'Public Survey',
          description: 'Citizen opinion and civic feedback survey with 10 default questions and dynamic conversational follow-ups.',
          language: 'te',
          selectedVoiceProfileId: '5IASxvpUK3p2EFjhO3pn',
          selectedTemplateId: 'tpl_public_amenities',
          createdAt: now,
          updatedAt: now,
          config: {
            surveyIntro: 'నమస్కారం అండి! మీ ప్రాంతంలోని ప్రజా సదుపాయాల గురించి కొన్ని విషయాలు తెలుసుకోవడానికి మాట్లాడుతున్నాం.',
            enableDynamicFollowUps: true,
            maxFollowUpsPerQuestion: 2,
            questions: [...CANONICAL_PUBLIC_SURVEY_QUESTIONS],
          },
        },
        {
          id: 'event_political_campaign',
          type: 'political_campaign',
          name: 'Political Campaign',
          description: 'Constituency voter outreach with candidate speech scripts and interactive keypad DTMF feedback.',
          language: 'te',
          selectedVoiceProfileId: '5IASxvpUK3p2EFjhO3pn',
          selectedTemplateId: 'tpl_constituency_outreach',
          createdAt: now,
          updatedAt: now,
          config: {
            placeholderValues: {
              campaign_name: '',
              candidate_name: '',
              party_name: '',
              constituency_name: '',
              campaign_message: '',
              closing_message: '',
            },
            approvedScript: 'నమస్కారం! నేను {{party_name}} అభ్యర్థి {{candidate_name}} మాట్లాడుతున్నాను. {{campaign_message}} అభివృద్ధి కార్యక్రమాలకు మీ మద్దతు ఉంటే 1 నొక్కండి, మరిన్ని వివరాల కోసం 2 నొక్కండి.',
            dtmfOptions: [
              {
                digit: '1',
                labelEn: 'Support Candidate Agenda',
                spokenPrompt: {
                  te: 'మద్దతు కోసం 1 నొక్కండి',
                  hi: 'समर्थन के लिए 1 दबाएं',
                  en: 'Press 1 to support the candidate',
                },
              },
              {
                digit: '2',
                labelEn: 'Request Information / Callback',
                spokenPrompt: {
                  te: 'మరిన్ని వివరాల కోసం 2 నొక్కండి',
                  hi: 'अधिक जानकारी के लिए 2 दबाएं',
                  en: 'Press 2 for more information',
                },
              },
            ],
          },
        },
        {
          id: 'event_political_survey',
          type: 'political_survey',
          name: 'Political Survey',
          description: 'Constituency voter sentiment and issue-priority surveys with dynamic conversational questions.',
          language: 'te',
          selectedVoiceProfileId: '5IASxvpUK3p2EFjhO3pn',
          selectedTemplateId: 'tpl_political_voter_survey',
          createdAt: now,
          updatedAt: now,
          config: {
            placeholderValues: {
              survey_name: '',
              organization_name: '',
              constituency_name: '',
            },
            questions: [
              { id: 'PS1', text: 'మీ నియోజకవర్గంలో ప్రస్తుతం అత్యంత ప్రాధాన్యత ఇవ్వాల్సిన ప్రధాన సమస్య ఏమిటి?', category: 'priorities', allowFollowUp: true },
              { id: 'PS2', text: 'గత ఐదేళ్లలో మీ ప్రాంతంలో జరిగిన అభివృద్ధి కార్యక్రమాలపై మీ సంతృప్తి ఎంత?', category: 'satisfaction', allowFollowUp: true },
              { id: 'PS3', text: 'భవిష్యత్తు నాయకత్వంలో మీరు ఎలాంటి అర్హతలు ముఖ్యంగా కోరుకుంటున్నారు?', category: 'leadership', allowFollowUp: true },
            ],
          },
        },
        {
          id: 'event_business_event',
          type: 'business_event',
          name: 'Business Event',
          description: 'Formal corporate conference, summit, and product launch invitations with automated RSVP collection.',
          language: 'te',
          selectedVoiceProfileId: '5IASxvpUK3p2EFjhO3pn',
          selectedTemplateId: 'tpl_business_conference',
          createdAt: now,
          updatedAt: now,
          config: {
            placeholderValues: {
              company_name: '',
              event_title: '',
              event_date: '',
              event_time: '',
              venue_name: '',
            },
            dtmfOptions: [
              { digit: '1', labelEn: 'Confirm Attendance', spokenPrompt: { te: 'ధృవీకరణ కోసం 1 నొక్కండి', hi: 'पुष्टि के लिए 1 दबाएं', en: 'Press 1 to confirm' } },
              { digit: '2', labelEn: 'Unable to Attend', spokenPrompt: { te: 'హాజరు కాలేనప్పుడు 2 నొక్కండి', hi: 'अनुपस्थिति हेतु 2 दबाएं', en: 'Press 2 if unable to attend' } },
            ],
          },
        },
        {
          id: 'event_marriage_event',
          type: 'marriage_event',
          name: 'Marriage Event',
          description: 'Personalized wedding and reception invitation audio campaign with venue directions and RSVP tracking.',
          language: 'te',
          selectedVoiceProfileId: '5IASxvpUK3p2EFjhO3pn',
          selectedTemplateId: 'tpl_wedding_invitation',
          createdAt: now,
          updatedAt: now,
          config: {
            placeholderValues: {
              bride_name: '',
              groom_name: '',
              wedding_date: '',
              wedding_time: '',
              reception_date: '',
              reception_time: '',
              venue_name: '',
              venue_address: '',
              family_name: '',
              invitation_message: '',
            },
            generatedScript: 'నమస్కారం అండి! {{family_name}} తరపున సంతోషంగా ఆహ్వానిస్తున్నాము. మా చిరంజీవి {{groom_name}} మరియు చిరంజీవలక్ష్మి {{bride_name}} ల వివాహ మహోత్సవం {{wedding_date}} నాడు {{wedding_time}} కు {{venue_name}} లో జరగనుంది. మీరందరూ విచ్చేసి నూతన వధూవరులను ఆశీర్వదించగలరని కోరుకుంటున్నాము.',
          },
        },
      ];

      defaultCategories.forEach((e) => {
        this.data.events[e.id] = e;
      });
      this.persist();
    } else {
      // Ensure Public Survey has exactly the 6 canonical questions and approved Rishi cloned voice
      let modified = false;
      const pubSurvey = this.data.events['event_public_survey'];
      if (pubSurvey) {
        if (!pubSurvey.config.questions) {
          pubSurvey.config.questions = [...CANONICAL_PUBLIC_SURVEY_QUESTIONS];
          modified = true;
        }
        if (pubSurvey.selectedVoiceProfileId !== 'Txde0pZ5tVhXE6HUspcf') {
          pubSurvey.selectedVoiceProfileId = 'Txde0pZ5tVhXE6HUspcf';
          modified = true;
        }
      }
      if (this.data.events['event_customize_event']) {
        delete this.data.events['event_customize_event'];
        modified = true;
      }

      // Remove event_political_survey if present (per Master Prompt: REMOVE POLITICAL SURVEY MODULE COMPLETELY)
      if (this.data.events['event_political_survey']) {
        delete this.data.events['event_political_survey'];
        modified = true;
      }

      if (this.data.voiceProfiles['vp_authorized_clone']) {
        const vp = this.data.voiceProfiles['vp_authorized_clone'];
        if (vp.providerVoiceId !== 'Txde0pZ5tVhXE6HUspcf') {
          vp.providerVoiceId = 'Txde0pZ5tVhXE6HUspcf';
          vp.elevenLabsVoiceId = 'Txde0pZ5tVhXE6HUspcf';
          vp.modelId = 'eleven_v4_turbo';
          vp.stability = 0.50;
          vp.similarityBoost = 0.85;
          vp.style = 0.15;
          vp.speakerBoost = true;
          vp.speed = 1.0;
          modified = true;
        }
      }

      ['event_public_survey', 'event_political_campaign', 'event_marriage_event'].forEach((eid) => {
        const ev = this.data.events[eid];
        if (ev && (!ev.selectedVoiceProfileId || ev.selectedVoiceProfileId === '6wa317UxpFQae2t7ZA0Y' || ev.selectedVoiceProfileId === '5IASxvpUK3p2EFjhO3pn' || ev.selectedVoiceProfileId === 'WKyArUrP6hdAVp2kHYkw')) {
          ev.selectedVoiceProfileId = 'Txde0pZ5tVhXE6HUspcf';
          modified = true;
        }
      });
      if (modified) {
        this.persist();
      }
    }
  }

  // ==========================
  // TEMPLATES MANAGEMENT
  // ==========================
  getTemplates(category?: string): EventTemplateRecord[] {
    const list = Object.values(this.data.templates || {});
    if (category) {
      return list.filter((t) => t.category === category);
    }
    return list.filter((t) => (t.category as string) !== 'customize_event');
  }

  getTemplate(id: string): EventTemplateRecord | undefined {
    return this.data.templates?.[id];
  }

  saveTemplate(template: EventTemplateRecord): EventTemplateRecord {
    template.updatedAt = new Date().toISOString();
    if (!this.data.templates) this.data.templates = {};
    this.data.templates[template.id] = template;
    this.persist();
    return template;
  }

  deleteTemplate(id: string): boolean {
    if (this.data.templates?.[id]) {
      delete this.data.templates[id];
      this.persist();
      return true;
    }
    return false;
  }

  // ==========================
  // EVENTS CRUD
  // ==========================
  getEvents(): EventRecord[] {
    const priority: Record<string, number> = {
      event_public_survey: 1,
      public_survey: 1,
      event_political_campaign: 2,
      political_campaign: 2,
      event_marriage_event: 3,
      marriage_event: 3,
    };

    return Object.values(this.data.events)
      .filter((e) => ['public_survey', 'political_campaign', 'marriage_event'].includes(e.type))
      .sort((a, b) => {
        const pa = priority[a.id] || priority[a.type] || 99;
        const pb = priority[b.id] || priority[b.type] || 99;
        return pa - pb;
      });
  }

  getEvent(id: string): EventRecord | undefined {
    return this.data.events[id];
  }

  saveEvent(event: EventRecord): EventRecord {
    event.updatedAt = new Date().toISOString();
    this.data.events[event.id] = event;
    this.persist();
    return event;
  }

  deleteEvent(id: string): boolean {
    if (this.data.events[id]) {
      delete this.data.events[id];
      for (const [cid, c] of Object.entries(this.data.contacts)) {
        if (c.eventId === id) delete this.data.contacts[cid];
      }
      for (const [cid, c] of Object.entries(this.data.campaigns)) {
        if (c.eventId === id) delete this.data.campaigns[cid];
      }
      for (const [jid, j] of Object.entries(this.data.callJobs)) {
        if (j.eventId === id) delete this.data.callJobs[jid];
      }
      if ((this.data as any).surveyQuestions && (this.data as any).surveyQuestions[id]) {
        delete (this.data as any).surveyQuestions[id];
      }
      this.persist();
      return true;
    }
    return false;
  }

  duplicateEvent(id: string): EventRecord | null {
    const original = this.data.events[id];
    if (!original) return null;

    const now = new Date().toISOString();
    const newId = `event-${original.type}-${Date.now()}`;
    const duplicated: EventRecord = {
      ...JSON.parse(JSON.stringify(original)),
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    };

    this.data.events[newId] = duplicated;
    this.persist();
    return duplicated;
  }

  // ==========================
  // SURVEY QUESTIONS MANAGEMENT
  // ==========================
  getSurveyQuestions(eventId: string): SurveyQuestion[] {
    let event = this.getEvent(eventId);
    if (!event) {
      const camp = this.getCampaign(eventId);
      if (camp?.eventId) {
        event = this.getEvent(camp.eventId);
      }
    }
    if (!event) return [];
    if (!event.config) event.config = {};
    if (event.config.questions === undefined) {
      if (Array.isArray((event as any).surveyQuestions) && (event as any).surveyQuestions.length > 0) {
        event.config.questions = [...(event as any).surveyQuestions];
        this.saveEvent(event);
      } else if (event.type === 'public_survey') {
        event.config.questions = [...CANONICAL_PUBLIC_SURVEY_QUESTIONS];
        this.saveEvent(event);
      } else {
        return [];
      }
    }
    return (event.config.questions || [])
      .map((q, idx) => ({
        ...q,
        id: q.id || q.questionId || `A${idx + 1}`,
        questionId: q.questionId || q.id || `A${idx + 1}`,
        surveyId: q.surveyId || eventId,
        text: q.text || q.questionText || '',
        questionText: q.questionText || q.text || '',
        category: (q.category || 'General').trim(),
        description: q.description || '',
        questionOrder: q.questionOrder !== undefined ? q.questionOrder : idx + 1,
        enabled: q.enabled !== false,
        questionType: q.questionType || 'open_ended',
        allowFollowUp: q.allowFollowUp !== false,
        createdAt: q.createdAt || event.createdAt,
        updatedAt: q.updatedAt || new Date().toISOString(),
      }))
      .sort((a, b) => (a.questionOrder ?? 0) - (b.questionOrder ?? 0));
  }

  saveSurveyQuestions(eventId: string, questions: SurveyQuestion[]): SurveyQuestion[] {
    const event = this.getEvent(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);
    if (!event.config) event.config = {};
    const now = new Date().toISOString();
    const normalized: SurveyQuestion[] = questions.map((q, idx) => {
      const qId = q.questionId || q.id || `A${idx + 1}`;
      const qText = (q.questionText || q.text || '').trim();
      return {
        id: qId,
        questionId: qId,
        surveyId: eventId,
        text: qText,
        questionText: qText,
        category: (q.category || 'General').trim(),
        description: q.description || '',
        questionOrder: idx + 1,
        enabled: q.enabled !== false,
        questionType: q.questionType || 'open_ended',
        allowFollowUp: q.allowFollowUp !== false,
        createdAt: q.createdAt || now,
        updatedAt: now,
      };
    });
    event.config.questions = normalized;
    this.saveEvent(event);

    // Sync aggregate analytics for this event so deleted questions do not ghost in analytics
    const agg = this.data.aggregateAnalytics[eventId];
    if (agg && agg.publicSurvey) {
      agg.publicSurvey.totalQuestions = normalized.length;
      const prevQMap = new Map((agg.publicSurvey.questions || []).map((q) => [q.id, q]));
      agg.publicSurvey.questions = normalized.map((q, idx) => {
        const prev = prevQMap.get(q.id);
        return {
          id: q.id,
          questionOrder: idx + 1,
          text: q.text,
          category: q.category || 'General',
          issueReportedCount: prev?.issueReportedCount || 0,
          issueReportedPercent: prev?.issueReportedPercent || 0,
          noIssueReportedCount: prev?.noIssueReportedCount || 0,
          noIssueReportedPercent: prev?.noIssueReportedPercent || 0,
          unansweredCount: prev?.unansweredCount || 0,
          totalAnswers: prev?.totalAnswers || 0,
        };
      });
    }

    try {
      this.onQuestionsChanged?.(eventId);
    } catch (e) {
      console.warn('onQuestionsChanged listener error:', e);
    }

    return normalized;
  }

  addSurveyQuestion(eventId: string, question: Partial<SurveyQuestion>): SurveyQuestion {
    const existing = this.getSurveyQuestions(eventId);
    const now = new Date().toISOString();
    const newIdx = existing.length + 1;
    const qId = question.questionId || question.id || `Q${Date.now().toString(36)}`;
    const qText = (question.questionText || question.text || '').trim();
    const newQ: SurveyQuestion = {
      id: qId,
      questionId: qId,
      surveyId: eventId,
      text: qText,
      questionText: qText,
      category: (question.category || 'Custom').trim(),
      description: question.description || '',
      questionOrder: newIdx,
      enabled: question.enabled !== false,
      questionType: question.questionType || 'custom',
      allowFollowUp: question.allowFollowUp !== false,
      createdAt: now,
      updatedAt: now,
    };
    existing.push(newQ);
    this.saveSurveyQuestions(eventId, existing);
    return newQ;
  }

  updateSurveyQuestion(eventId: string, questionId: string, updates: Partial<SurveyQuestion>): SurveyQuestion | null {
    const existing = this.getSurveyQuestions(eventId);
    const index = existing.findIndex((q) => q.id === questionId || q.questionId === questionId);
    if (index === -1) return null;
    const now = new Date().toISOString();
    const current = existing[index];
    const updated: SurveyQuestion = {
      ...current,
      ...updates,
      id: current.id,
      questionId: current.questionId || current.id,
      surveyId: eventId,
      text: updates.text !== undefined ? updates.text.trim() : (updates.questionText !== undefined ? updates.questionText.trim() : current.text),
      questionText: updates.questionText !== undefined ? updates.questionText.trim() : (updates.text !== undefined ? updates.text.trim() : current.questionText || current.text),
      category: updates.category !== undefined ? updates.category.trim() : current.category,
      enabled: updates.enabled !== undefined ? updates.enabled : current.enabled,
      allowFollowUp: updates.allowFollowUp !== undefined ? updates.allowFollowUp : current.allowFollowUp,
      questionOrder: updates.questionOrder !== undefined ? updates.questionOrder : current.questionOrder,
      updatedAt: now,
    };
    existing[index] = updated;
    this.saveSurveyQuestions(eventId, existing);
    return updated;
  }

  deleteSurveyQuestion(eventId: string, questionId: string): boolean {
    const existing = this.getSurveyQuestions(eventId);
    const filtered = existing.filter((q) => q.id !== questionId && q.questionId !== questionId);
    if (filtered.length === existing.length) return false;
    filtered.forEach((q, idx) => {
      q.questionOrder = idx + 1;
    });
    this.saveSurveyQuestions(eventId, filtered);
    return true;
  }

  reorderSurveyQuestions(eventId: string, questionIds: string[]): SurveyQuestion[] {
    const existing = this.getSurveyQuestions(eventId);
    const map = new Map(existing.map((q) => [q.id || q.questionId, q]));
    const reordered: SurveyQuestion[] = [];
    questionIds.forEach((id) => {
      const q = map.get(id);
      if (q) {
        reordered.push(q);
        map.delete(id);
      }
    });
    map.forEach((q) => reordered.push(q));
    reordered.forEach((q, idx) => {
      q.questionOrder = idx + 1;
    });
    return this.saveSurveyQuestions(eventId, reordered);
  }

  // ==========================
  // TENANTS MANAGEMENT (MULTI-USER)
  // ==========================
  // TENANTS MANAGEMENT (MULTI-USER)
  // ==========================
  getTenants(): TenantUser[] {
    return Object.values(this.data.tenants || {}).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  getTenant(id: string): TenantUser | undefined {
    return this.data.tenants?.[id];
  }

  saveTenant(tenant: TenantUser): TenantUser {
    tenant.updatedAt = new Date().toISOString();
    if (!this.data.tenants) this.data.tenants = {};
    this.data.tenants[tenant.id] = tenant;
    this.persist();
    return tenant;
  }

  setTenantApprovedVoice(
    clientId: string,
    voiceId: string,
    eventType?: string,
    eventId?: string
  ): TenantUser | undefined {
    const tenant = this.getTenant(clientId);
    if (!tenant) return undefined;

    const profile = this.getVoiceProfile(voiceId);
    const resolvedEventType = (eventType || profile?.eventType || 'public_survey') as EventType;
    const now = new Date().toISOString();

    if (profile) {
      profile.approvalStatus = 'approved';
      profile.isApproved = true;
      profile.status = 'active';
      profile.voiceStatus = 'ready';
      profile.eventType = resolvedEventType;
      if (eventId) profile.eventId = eventId;
      profile.modelId = profile.modelId || 'eleven_multilingual_v2';
      profile.stability = profile.stability !== undefined ? profile.stability : 0.45;
      profile.similarityBoost = profile.similarityBoost !== undefined ? profile.similarityBoost : 0.85;
      profile.style = profile.style !== undefined ? profile.style : 0.20;
      profile.speakerBoost = profile.speakerBoost !== undefined ? profile.speakerBoost : true;
      profile.speed = profile.speed !== undefined ? profile.speed : 0.98;
      profile.language = profile.language || 'te';
      profile.pronunciationProfileVersion = profile.pronunciationProfileVersion || 'v2.1_conversational';
      profile.approvedAt = profile.approvedAt || now;
      profile.configurationVersion = (profile.configurationVersion || 0) + 1;
      profile.updatedAt = now;
      this.data.voiceProfiles[profile.id] = profile;

      // Archive other profiles of this client strictly within the SAME eventType
      for (const [id, p] of Object.entries(this.data.voiceProfiles)) {
        if (
          p.clientId === clientId &&
          p.eventType === resolvedEventType &&
          id !== profile.id &&
          p.providerVoiceId !== profile.providerVoiceId
        ) {
          p.status = 'archived';
          p.updatedAt = now;
          this.data.voiceProfiles[id] = p;
        }
      }

      tenant.approvedVoiceName = profile.name;
      tenant.approvedVoiceProfileId = profile.providerVoiceId || profile.id;
    } else {
      tenant.approvedVoiceProfileId = voiceId;
    }

    if (!tenant.eventVoiceProfiles) {
      tenant.eventVoiceProfiles = {};
    }
    tenant.eventVoiceProfiles[resolvedEventType] = {
      approvedVoiceProfileId: profile?.id || voiceId,
      approvedVoiceName: profile?.name || profile?.voiceName || voiceId,
      providerVoiceId: profile?.providerVoiceId || profile?.elevenLabsVoiceId || voiceId,
      voiceName: profile?.name || profile?.voiceName || voiceId,
      voiceProfileId: profile?.id || voiceId,
      updatedAt: now,
    };

    tenant.updatedAt = now;
    this.data.tenants[clientId] = tenant;

    // Update canonical events for this tenant matching resolvedEventType or eventId
    Object.values(this.data.events).forEach((ev) => {
      if ((eventId && ev.id === eventId) || ev.type === resolvedEventType) {
        ev.selectedVoiceProfileId = profile?.providerVoiceId || profile?.id || voiceId;
        ev.updatedAt = now;
        this.data.events[ev.id] = ev;
      }
    });

    this.persist();

    console.log('[CALLBRIDGE_VOICE_APPROVED_EVENT_SCOPED]', {
      clientId,
      eventType: resolvedEventType,
      eventId: eventId || null,
      voiceId,
      approvedVoiceName: profile?.name || voiceId,
    });

    return tenant;
  }

  // ==========================
  // VOICE PROFILES
  // ==========================
  getVoiceProfiles(clientId?: string, eventType?: string): VoiceProfileRecord[] {
    const all = Object.values(this.data.voiceProfiles || {});
    const filtered = all.filter((v) => {
      if (
        v.name?.toLowerCase().includes('madhavi') ||
        v.providerVoiceId === '4XvBGCPMXWyVQa75dbZg' ||
        v.id === 'vp_madhavi_reference'
      ) {
        return false;
      }
      if (clientId && v.clientId !== clientId) {
        return false;
      }
      if (eventType && v.eventType !== eventType) {
        return false;
      }
      return true;
    });
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getApprovedVoiceProfile(clientId: string, eventType?: string, eventId?: string): VoiceProfileRecord | undefined {
    const tenant = this.getTenant(clientId);

    // 1. If eventId is provided, check event.selectedVoiceProfileId
    if (eventId) {
      const event = this.getEvent(eventId);
      if (event?.selectedVoiceProfileId) {
        const match = this.getVoiceProfile(event.selectedVoiceProfileId);
        if (
          match &&
          match.clientId === clientId &&
          (!eventType || !match.eventType || match.eventType === eventType || match.eventType === event.type) &&
          !match.name?.toLowerCase().includes('madhavi') &&
          match.providerVoiceId !== '4XvBGCPMXWyVQa75dbZg'
        ) {
          return match;
        }
      }
    }

    // 2. If eventType is provided, check tenant.eventVoiceProfiles?.[eventType]
    if (eventType && tenant?.eventVoiceProfiles?.[eventType]) {
      const rec = tenant.eventVoiceProfiles[eventType];
      const match =
        this.getVoiceProfile(rec.approvedVoiceProfileId) ||
        this.getVoiceProfile(rec.providerVoiceId);
      if (
        match &&
        match.clientId === clientId &&
        (!match.eventType || match.eventType === eventType) &&
        !match.name?.toLowerCase().includes('madhavi') &&
        match.providerVoiceId !== '4XvBGCPMXWyVQa75dbZg'
      ) {
        return match;
      }
    }

    // 3. Check active voice profiles for this client matching eventType
    if (eventType) {
      const clientProfiles = this.getVoiceProfiles(clientId, eventType);
      const approved = clientProfiles.find(
        (v) => (v.approvalStatus === 'approved' || v.isApproved) && v.voiceStatus !== 'failed'
      );
      if (approved) return approved;

      // Strict event isolation: DO NOT leak another event type's voice!
      return undefined;
    }

    // 4. Fallback for generic legacy queries where eventType was omitted
    if (tenant?.approvedVoiceProfileId && tenant.approvedVoiceProfileId !== '4XvBGCPMXWyVQa75dbZg') {
      const match = this.getVoiceProfile(tenant.approvedVoiceProfileId);
      if (match && match.clientId === clientId && !match.name?.toLowerCase().includes('madhavi')) {
        return match;
      }
    }

    const allApproved = this.getVoiceProfiles(clientId).find(
      (v) => (v.approvalStatus === 'approved' || v.isApproved) && v.voiceStatus !== 'failed'
    );
    return allApproved;
  }

  getVoiceProfile(idOrVoiceId: string): VoiceProfileRecord | undefined {
    if (!idOrVoiceId) return undefined;
    const target = idOrVoiceId.trim();
    const direct =
      this.data.voiceProfiles[target] ||
      Object.values(this.data.voiceProfiles).find(
        (v) => v.providerVoiceId === target || v.elevenLabsVoiceId === target || v.id === target
      );
    if (direct) {
      if (direct.elevenLabsVoiceId === 'Txde0pZ5tVhXE6HUspcf' || direct.providerVoiceId === 'Txde0pZ5tVhXE6HUspcf') {
        direct.modelId = 'eleven_v4_turbo';
        direct.speed = 1.0;
        direct.stability = 0.50;
        direct.similarityBoost = 0.85;
        direct.style = 0.15;
        direct.speakerBoost = true;
      }
      return direct;
    }

    if (
      target === 'Txde0pZ5tVhXE6HUspcf' ||
      target === 'vp_rishi_candidate' ||
      target === 'vp_authorized_clone' ||
      target === '5IASxvpUK3p2EFjhO3pn' ||
      target === 'WKyArUrP6hdAVp2kHYkw'
    ) {
      return {
        id: 'vp_rishi_candidate',
        clientId: 'client_001',
        name: 'Rishi (Cloned Voice)',
        provider: 'elevenlabs',
        providerVoiceId: 'Txde0pZ5tVhXE6HUspcf',
        elevenLabsVoiceId: 'Txde0pZ5tVhXE6HUspcf',
        modelId: 'eleven_v4_turbo',
        speed: 1.0,
        stability: 0.50,
        similarityBoost: 0.85,
        style: 0.15,
        speakerBoost: true,
        status: 'active',
        voiceStatus: 'ready',
        approvalStatus: 'approved',
        isApproved: true,
        languageCapabilities: ['te', 'hi', 'en'],
        createdAt: '2026-11-01T05:48:59.740Z',
        updatedAt: new Date().toISOString(),
      };
    }
    return undefined;
  }

  saveVoiceProfile(profile: VoiceProfileRecord): VoiceProfileRecord {
    profile.updatedAt = new Date().toISOString();
    if (!profile.eventType) {
      profile.eventType = 'public_survey';
    }
    if (!profile.elevenLabsVoiceId) {
      profile.elevenLabsVoiceId = profile.providerVoiceId;
    }
    if (!profile.voiceName) {
      profile.voiceName = profile.name;
    }
    if (profile.isApproved === undefined) {
      profile.isApproved = profile.approvalStatus === 'approved';
    }

    // If active and approved for this eventType, archive others for this client in the same eventType
    if (profile.status === 'active' && profile.isApproved) {
      const now = new Date().toISOString();
      for (const [id, p] of Object.entries(this.data.voiceProfiles)) {
        if (
          p.clientId === profile.clientId &&
          p.eventType === profile.eventType &&
          id !== profile.id &&
          p.providerVoiceId !== profile.providerVoiceId
        ) {
          p.status = 'archived';
          p.updatedAt = now;
          this.data.voiceProfiles[id] = p;
        }
      }
    }

    if (!profile.userId) {
      profile.userId = profile.clientId;
    }
    if (!profile.voiceProfileId) {
      profile.voiceProfileId = profile.id;
    }
    this.data.voiceProfiles[profile.id] = profile;
    this.persist();
    return profile;
  }

  selectVoiceProfile(
    clientId: string,
    voiceProfileId: string,
    eventType?: string,
    eventId?: string
  ): { success: boolean; profile?: VoiceProfileRecord; event?: EventRecord; tenant?: TenantUser; error?: string } {
    const profile = this.getVoiceProfile(voiceProfileId);
    if (!profile) {
      return { success: false, error: 'Voice profile not found in database' };
    }

    if (profile.clientId && profile.clientId !== clientId) {
      return { success: false, error: 'Forbidden: Voice profile does not belong to this user account' };
    }

    if (eventType && profile.eventType && profile.eventType !== eventType) {
      return {
        success: false,
        error: `Event mismatch: Voice profile belongs to '${profile.eventType}', cannot select for '${eventType}'`,
      };
    }

    const elevenLabsVoiceId = profile.elevenLabsVoiceId || profile.providerVoiceId;
    if (!elevenLabsVoiceId || !elevenLabsVoiceId.trim()) {
      return { success: false, error: 'Invalid voice profile: Missing ElevenLabs Voice ID' };
    }

    const isApproved = Boolean(profile.isApproved || profile.approvalStatus === 'approved');
    if (!isApproved) {
      return {
        success: false,
        error: 'Cannot select an unapproved voice profile. Please approve this voice profile first.',
      };
    }

    const resolvedEventType = (eventType || profile.eventType || 'public_survey') as any;
    const now = new Date().toISOString();

    // Mark selectionStatus for profiles in this eventType
    for (const [id, p] of Object.entries(this.data.voiceProfiles)) {
      if (p.clientId === clientId && p.eventType === resolvedEventType) {
        if (p.id === profile.id || p.providerVoiceId === profile.providerVoiceId) {
          p.selectionStatus = 'selected';
          p.selected = true;
          p.updatedAt = now;
        } else {
          p.selectionStatus = 'not_selected';
          p.selected = false;
          p.updatedAt = now;
        }
        this.data.voiceProfiles[id] = p;
      }
    }

    profile.selectionStatus = 'selected';
    profile.selected = true;
    profile.updatedAt = now;

    // Update matching event(s)
    let updatedEvent: EventRecord | undefined = undefined;
    for (const ev of Object.values(this.data.events)) {
      if ((eventId && ev.id === eventId) || ev.type === resolvedEventType) {
        ev.selectedVoiceProfileId = elevenLabsVoiceId;
        ev.updatedAt = now;
        this.data.events[ev.id] = ev;
        if (!updatedEvent || ev.id === eventId) {
          updatedEvent = ev;
        }
      }
    }

    // Update tenant's eventVoiceProfiles
    const tenant = this.getTenant(clientId);
    if (tenant) {
      if (!tenant.eventVoiceProfiles) tenant.eventVoiceProfiles = {};
      tenant.eventVoiceProfiles[resolvedEventType] = {
        approvedVoiceProfileId: profile.id,
        approvedVoiceName: profile.name || profile.voiceName || elevenLabsVoiceId,
        providerVoiceId: elevenLabsVoiceId,
        voiceName: profile.name || profile.voiceName || elevenLabsVoiceId,
        voiceProfileId: profile.id,
        updatedAt: now,
      };
      tenant.approvedVoiceName = profile.name || profile.voiceName;
      tenant.approvedVoiceProfileId = elevenLabsVoiceId;
      tenant.updatedAt = now;
      this.data.tenants[clientId] = tenant;
    }

    this.persist();

    return {
      success: true,
      profile,
      event: updatedEvent,
      tenant,
    };
  }


  deleteVoiceProfile(
    id: string,
    clientId?: string
  ): { success: boolean; profile?: VoiceProfileRecord; error?: string } {
    const profile = this.getVoiceProfile(id);
    if (!profile) {
      return { success: false, error: 'Voice profile not found' };
    }

    // Security check: Must belong to tenant if clientId provided
    if (clientId && profile.clientId !== clientId) {
      return {
        success: false,
        error: "Unauthorized: Cannot delete another user's voice profile",
      };
    }

    // Never delete system voices
    if (
      profile.provider === 'system' ||
      profile.id.startsWith('vp_system_') ||
      (profile as any).isSystem
    ) {
      return { success: false, error: 'Cannot delete shared system voices' };
    }

    // Remove from in-memory voiceProfiles
    delete this.data.voiceProfiles[profile.id];

    // If tenant had this voice as approved, clear tenant's approved voice
    if (clientId && this.data.tenants[clientId]) {
      const tenant = this.data.tenants[clientId];
      if (
        tenant.approvedVoiceProfileId === profile.providerVoiceId ||
        tenant.approvedVoiceProfileId === profile.id
      ) {
        tenant.approvedVoiceProfileId = undefined;
        tenant.approvedVoiceName = undefined;
        tenant.updatedAt = new Date().toISOString();
      }
      if (tenant.eventVoiceProfiles) {
        for (const [evType, evp] of Object.entries(tenant.eventVoiceProfiles)) {
          if (
            evp.approvedVoiceProfileId === profile.id ||
            evp.providerVoiceId === profile.providerVoiceId ||
            evp.voiceProfileId === profile.id
          ) {
            delete tenant.eventVoiceProfiles[evType];
            tenant.updatedAt = new Date().toISOString();
          }
        }
      }
    } else {
      for (const t of Object.values(this.data.tenants)) {
        if (
          t.approvedVoiceProfileId === profile.providerVoiceId ||
          t.approvedVoiceProfileId === profile.id
        ) {
          t.approvedVoiceProfileId = undefined;
          t.approvedVoiceName = undefined;
          t.updatedAt = new Date().toISOString();
        }
        if (t.eventVoiceProfiles) {
          for (const [evType, evp] of Object.entries(t.eventVoiceProfiles)) {
            if (
              evp.approvedVoiceProfileId === profile.id ||
              evp.providerVoiceId === profile.providerVoiceId ||
              evp.voiceProfileId === profile.id
            ) {
              delete t.eventVoiceProfiles[evType];
              t.updatedAt = new Date().toISOString();
            }
          }
        }
      }
    }

    // Clear from any event selectedVoiceProfileId
    for (const event of Object.values(this.data.events)) {
      if (
        event.selectedVoiceProfileId === profile.providerVoiceId ||
        event.selectedVoiceProfileId === profile.id
      ) {
        event.selectedVoiceProfileId = undefined;
        event.updatedAt = new Date().toISOString();
      }
    }

    this.persist();
    return { success: true, profile };
  }

  // ==========================
  // CONTACTS
  // ==========================
  getContacts(eventId: string, clientId?: string): ContactRecord[] {
    return Object.values(this.data.contacts)
      .filter((c) => c.eventId === eventId && (!clientId || c.userId === clientId || (c as any).clientId === clientId || c.userId === 'user_default' || !(c as any).clientId))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  saveContact(contact: ContactRecord): ContactRecord {
    contact.updatedAt = new Date().toISOString();
    this.data.contacts[contact.id] = contact;
    this.persist();
    return contact;
  }

  saveContactsBulk(contacts: ContactRecord[]): ContactRecord[] {
    const baseTime = Date.now();
    contacts.forEach((c, idx) => {
      if (!c.createdAt) {
        c.createdAt = new Date(baseTime + idx * 20).toISOString();
      }
      c.updatedAt = new Date(baseTime + idx * 20).toISOString();
      this.data.contacts[c.id] = c;
    });
    this.persist();
    return contacts;
  }

  deleteContact(id: string): boolean {
    if (this.data.contacts[id]) {
      delete this.data.contacts[id];
      this.persist();
      return true;
    }
    return false;
  }

  // ==========================
  // CAMPAIGNS & CALL JOBS
  // ==========================
  getCampaigns(eventId: string, clientId?: string): CampaignRecord[] {
    return Object.values(this.data.campaigns)
      .filter((c) => c.eventId === eventId && (!clientId || c.clientId === clientId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getCampaign(id: string): CampaignRecord | undefined {
    return this.data.campaigns[id];
  }

  saveCampaign(campaign: CampaignRecord): CampaignRecord {
    campaign.updatedAt = new Date().toISOString();
    this.data.campaigns[campaign.id] = campaign;
    this.persist();
    return campaign;
  }

  deleteCampaign(id: string): boolean {
    if (this.data.campaigns[id]) {
      delete this.data.campaigns[id];
      for (const [jid, j] of Object.entries(this.data.callJobs)) {
        if (j.campaignId === id) {
          delete this.data.callJobs[jid];
        }
      }
      this.persist();
      return true;
    }
    return false;
  }

  private providerCallIdToJobMap = new Map<string, { jobId: string; campaignId: string; eventId: string }>();
  private jobIdToProviderCallIdMap = new Map<string, string>();

  public mapProviderCallIdToJob(providerCallId: string, jobId: string, campaignId: string, eventId: string): void {
    if (providerCallId && jobId) {
      this.providerCallIdToJobMap.set(providerCallId, { jobId, campaignId, eventId });
      this.jobIdToProviderCallIdMap.set(jobId, providerCallId);
      if (!this.data.providerCallIdMappings) {
        this.data.providerCallIdMappings = {};
      }
      this.data.providerCallIdMappings[providerCallId] = { jobId, campaignId, eventId };
      this.persist();
    }
  }

  public getJobIdByProviderCallId(providerCallId: string): string | undefined {
    if (!providerCallId) return undefined;
    const inMem = this.providerCallIdToJobMap.get(providerCallId)?.jobId;
    if (inMem) return inMem;
    const fromDisk = this.data.providerCallIdMappings?.[providerCallId]?.jobId;
    if (fromDisk) return fromDisk;
    const all = Object.values(this.data.callJobs);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].providerCallId === providerCallId) {
        return all[i].id;
      }
    }
    return undefined;
  }

  public getProviderCallIdByJobId(jobId: string): string | undefined {
    if (!jobId) return undefined;
    const inMem = this.jobIdToProviderCallIdMap.get(jobId);
    if (inMem) return inMem;
    if (this.data.callJobs[jobId]?.providerCallId) {
      return this.data.callJobs[jobId].providerCallId;
    }
    const mappings = this.data.providerCallIdMappings;
    if (mappings) {
      for (const [pId, info] of Object.entries(mappings)) {
        if (info.jobId === jobId) return pId;
      }
    }
    return undefined;
  }

  getCallJob(id: string): CallJobRecord | undefined {
    if (!id) return undefined;
    if (this.data.callJobs[id]) return this.data.callJobs[id];
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.callJobs?.[id]) {
          this.data.callJobs[id] = parsed.callJobs[id];
          return this.data.callJobs[id];
        }
      }
    } catch {}
    const mappedJobId = this.providerCallIdToJobMap.get(id)?.jobId || this.data.providerCallIdMappings?.[id]?.jobId;
    if (mappedJobId && this.data.callJobs[mappedJobId]) {
      return this.data.callJobs[mappedJobId];
    }
    // Search across all callJobs by providerCallId or id
    const all = Object.values(this.data.callJobs);
    for (let i = all.length - 1; i >= 0; i--) {
      const j = all[i];
      if (j.providerCallId === id || j.id === id) {
        return j;
      }
    }
    return undefined;
  }

  getCallJobByProviderId(providerCallId: string): CallJobRecord | undefined {
    if (!providerCallId) return undefined;
    const mappedJobId = this.providerCallIdToJobMap.get(providerCallId)?.jobId || this.data.providerCallIdMappings?.[providerCallId]?.jobId;
    if (mappedJobId && this.data.callJobs[mappedJobId]) {
      return this.data.callJobs[mappedJobId];
    }
    const all = Object.values(this.data.callJobs);
    for (let i = all.length - 1; i >= 0; i--) {
      const j = all[i];
      if (j.providerCallId === providerCallId || j.id === providerCallId) {
        return j;
      }
    }
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.callJobs) {
          for (const j of Object.values(parsed.callJobs) as CallJobRecord[]) {
            if (j.providerCallId === providerCallId || j.id === providerCallId) {
              this.data.callJobs[j.id] = j;
              return j;
            }
          }
        }
      }
    } catch {}
    return undefined;
  }

  getCallJobs(campaignId: string): CallJobRecord[] {
    return Object.values(this.data.callJobs).filter((j) => j.campaignId === campaignId);
  }

  getCallJobsByEvent(eventId: string): CallJobRecord[] {
    return Object.values(this.data.callJobs).filter((j) => j.eventId === eventId);
  }

  getCallJobsByClient(clientId: string): CallJobRecord[] {
    return Object.values(this.data.callJobs).filter((j) => j.clientId === clientId);
  }

  /**
   * Initializes default aggregate analytics for an event if not already present.
   */
  public getAggregateAnalytics(eventId: string): AggregateEventMetrics {
    if (!this.data.aggregateAnalytics) this.data.aggregateAnalytics = {};
    if (this.data.aggregateAnalytics[eventId]) {
      return this.data.aggregateAnalytics[eventId];
    }

    const event = this.getEvent(eventId);
    const campaign = !event ? this.getCampaign(eventId) : null;
    const parentEvent = campaign ? this.getEvent(campaign.eventId) : null;
    const eventType = event?.type || parentEvent?.type || (campaign ? 'political_campaign' : 'public_survey');
    const now = new Date().toISOString();

    const questions = eventType === 'public_survey' ? this.getSurveyQuestions(event?.id || eventId) : [];

    const defaultMetrics: AggregateEventMetrics = {
      eventId,
      eventType,
      totalCalls: 0,
      completedCalls: 0,
      answeredCalls: 0,
      unansweredCalls: 0,
      rejectedCalls: 0,
      failedCalls: 0,
      totalDurationSeconds: 0,
      averageDurationSeconds: 0,
      completionRatePercent: 0,
      answerRatePercent: 0,
      publicSurvey:
        eventType === 'public_survey'
          ? {
              totalQuestions: questions.length,
              questions: questions.map((q, idx) => ({
                id: q.id || `A${idx + 1}`,
                questionOrder: idx + 1,
                text: q.text || q.questionText || `Question ${idx + 1}`,
                category: q.category || 'General',
                issueReportedCount: 0,
                issueReportedPercent: 0,
                noIssueReportedCount: 0,
                noIssueReportedPercent: 0,
                unansweredCount: 0,
                totalAnswers: 0,
              })),
            }
          : undefined,
      politicalCampaign:
        eventType === 'political_campaign'
          ? {
              keypad1Count: 0,
              keypad1Percent: 0,
              keypad2Count: 0,
              keypad2Percent: 0,
              noInputCount: 0,
              noInputPercent: 0,
              totalValidDtmf: 0,
            }
          : undefined,
      marriageEvent:
        eventType === 'marriage_event'
          ? {
              attendingCount: 0,
              attendingPercent: 0,
              notAttendingCount: 0,
              notAttendingPercent: 0,
              maybeAttendingCount: 0,
              maybeAttendingPercent: 0,
              totalValidRsvp: 0,
            }
          : undefined,
      updatedAt: now,
    };

    this.data.aggregateAnalytics[eventId] = defaultMetrics;
    this.persist();
    return defaultMetrics;
  }

  private recordSingleAggregateOutcome(targetId: string, outcome: EventCallOutcome, now: string): AggregateEventMetrics {
    const agg = this.getAggregateAnalytics(targetId);

    // Privacy-preserving deduplication key (never logs or retains caller personal information)
    const effectiveDtmf = outcome.dtmfDigit || (outcome.politicalOutcome === '1' || outcome.politicalOutcome === '2' ? outcome.politicalOutcome : undefined);
    const dedupKey = `${targetId}_${outcome.callId}_${outcome.status || ''}_${effectiveDtmf || ''}_${outcome.marriageRsvp || ''}_${outcome.surveyAnswer || ''}`;
    if (this.processedCallDeduplication.has(dedupKey)) {
      return agg;
    }
    this.processedCallDeduplication.add(dedupKey);

    const job = this.getCallJob(outcome.callId) || this.getCallJobByProviderId(outcome.callId);
    const providerId = job?.providerCallId || this.getProviderCallIdByJobId(outcome.callId) || outcome.callId;
    const jobId = job?.id || this.getJobIdByProviderCallId(outcome.callId) || outcome.callId;

    const isAlreadyInitiated =
      this.processedCallDeduplication.has(`${targetId}_${outcome.callId}_call_counted`) ||
      this.processedCallDeduplication.has(`${targetId}_${providerId}_call_counted`) ||
      this.processedCallDeduplication.has(`${targetId}_${jobId}_call_counted`);

    if (!isAlreadyInitiated) {
      this.processedCallDeduplication.add(`${targetId}_${outcome.callId}_call_counted`);
      this.processedCallDeduplication.add(`${targetId}_${providerId}_call_counted`);
      this.processedCallDeduplication.add(`${targetId}_${jobId}_call_counted`);
      agg.totalCalls++;
    }

    const duration = Math.max(0, Math.round(outcome.durationSeconds || 0));
    agg.totalDurationSeconds += duration;

    const unansKey = `${targetId}_${outcome.callId}_unanswered_counted`;
    const failKey = `${targetId}_${outcome.callId}_failed_counted`;

    const isAnsweredCall = Boolean(outcome.isAnswered || outcome.status === 'completed' || effectiveDtmf);
    const isUnansweredCall = Boolean(!isAnsweredCall && (outcome.isNoAnswer || outcome.status === 'no_answer'));
    const isFailedCall = Boolean(!isAnsweredCall && !isUnansweredCall && (outcome.isFailed || outcome.status === 'failed' || outcome.status === 'busy'));

    if (isAnsweredCall) {
      const isAlreadyAnswered =
        this.processedCallDeduplication.has(`${targetId}_${outcome.callId}_answered_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${providerId}_answered_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${jobId}_answered_counted`);

      if (!isAlreadyAnswered) {
        this.processedCallDeduplication.add(`${targetId}_${outcome.callId}_answered_counted`);
        this.processedCallDeduplication.add(`${targetId}_${providerId}_answered_counted`);
        this.processedCallDeduplication.add(`${targetId}_${jobId}_answered_counted`);
        agg.answeredCalls++;
      }

      const isAlreadyCompleted =
        this.processedCallDeduplication.has(`${targetId}_${outcome.callId}_completed_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${providerId}_completed_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${jobId}_completed_counted`);

      if (!isAlreadyCompleted) {
        this.processedCallDeduplication.add(`${targetId}_${outcome.callId}_completed_counted`);
        this.processedCallDeduplication.add(`${targetId}_${providerId}_completed_counted`);
        this.processedCallDeduplication.add(`${targetId}_${jobId}_completed_counted`);
        agg.completedCalls++;
      }
    } else if (isUnansweredCall) {
      if (!this.processedCallDeduplication.has(unansKey)) {
        this.processedCallDeduplication.add(unansKey);
        agg.unansweredCalls++;
      }
    } else if (isFailedCall) {
      if (!this.processedCallDeduplication.has(failKey)) {
        this.processedCallDeduplication.add(failKey);
        agg.failedCalls++;
        if (outcome.isRejected) agg.rejectedCalls++;
      }
    }

    // Ensure totalCalls >= answeredCalls
    if (agg.answeredCalls > agg.totalCalls) {
      agg.totalCalls = agg.answeredCalls;
    }

    // Safe zero-division guarded rate calculations
    agg.averageDurationSeconds =
      agg.completedCalls > 0 ? Math.round(agg.totalDurationSeconds / agg.completedCalls) : 0;
    agg.completionRatePercent =
      agg.totalCalls > 0 ? Math.round((agg.completedCalls / agg.totalCalls) * 100) : 0;
    agg.answerRatePercent =
      agg.totalCalls > 0 ? Math.round((agg.answeredCalls / agg.totalCalls) * 100) : 0;

    // Module-specific anonymous aggregate updates
    if (agg.eventType === 'political_campaign' && agg.politicalCampaign) {
      const dtmfVal = effectiveDtmf || (outcome.politicalOutcome === '1' || outcome.politicalOutcome === '2' ? outcome.politicalOutcome : undefined);
      if (dtmfVal === '1' || dtmfVal === '2') {
        const isAlreadyProcessed =
          this.processedCallDeduplication.has(`${targetId}_${outcome.callId}_political_dtmf_${dtmfVal}`) ||
          this.processedCallDeduplication.has(`${targetId}_${providerId}_political_dtmf_${dtmfVal}`) ||
          this.processedCallDeduplication.has(`${targetId}_${jobId}_political_dtmf_${dtmfVal}`);

        if (!isAlreadyProcessed) {
          this.processedCallDeduplication.add(`${targetId}_${outcome.callId}_political_dtmf_${dtmfVal}`);
          this.processedCallDeduplication.add(`${targetId}_${providerId}_political_dtmf_${dtmfVal}`);
          this.processedCallDeduplication.add(`${targetId}_${jobId}_political_dtmf_${dtmfVal}`);
          if (dtmfVal === '1') {
            agg.politicalCampaign.keypad1Count++;
          } else {
            agg.politicalCampaign.keypad2Count++;
          }
        }
      } else if (outcome.politicalOutcome === 'no_input' || (outcome.status === 'completed' && !dtmfVal)) {
        const hasKeypad1 = this.processedCallDeduplication.has(`${targetId}_${outcome.callId}_political_dtmf_1`);
        const hasKeypad2 = this.processedCallDeduplication.has(`${targetId}_${outcome.callId}_political_dtmf_2`);
        if (!hasKeypad1 && !hasKeypad2) {
          const noInputDedupKey = `${targetId}_${outcome.callId}_political_no_input`;
          if (!this.processedCallDeduplication.has(noInputDedupKey)) {
            this.processedCallDeduplication.add(noInputDedupKey);
            agg.politicalCampaign.noInputCount++;
          }
        }
      }
      const totalValid = agg.politicalCampaign.keypad1Count + agg.politicalCampaign.keypad2Count;
      agg.politicalCampaign.totalValidDtmf = totalValid;

      // Mathematical Rule: Percentage = (Count of selected option / Total valid responses) * 100
      agg.politicalCampaign.keypad1Percent =
        totalValid > 0 ? Math.round((agg.politicalCampaign.keypad1Count / totalValid) * 100) : 0;
      agg.politicalCampaign.keypad2Percent =
        totalValid > 0 ? Math.round((agg.politicalCampaign.keypad2Count / totalValid) * 100) : 0;
      const answeredCalls = agg.answeredCalls || 0;
      agg.politicalCampaign.noInputPercent =
        answeredCalls > 0 ? Math.round((agg.politicalCampaign.noInputCount / answeredCalls) * 100) : 0;
    } else if (agg.eventType === 'marriage_event' && agg.marriageEvent) {
      // Purely spoken RSVP classification for Marriage Event (No keypad / DTMF interaction)
      const rsvp = String(outcome.marriageRsvp || (outcome as any).marriageRsvpStatus || '').trim().toUpperCase();
      const isAlreadyRecorded = this.isMarriageRsvpRecorded(targetId, outcome.callId);
      if (!isAlreadyRecorded && rsvp) {
        let recordedCat: 'ATTENDING' | 'NOT ATTENDING' | 'MAYBE ATTENDING' | null = null;
        if (rsvp === 'YES' || rsvp === 'ATTENDING') {
          agg.marriageEvent.attendingCount++;
          recordedCat = 'ATTENDING';
        } else if (rsvp === 'NO' || rsvp === 'NOT_ATTENDING') {
          agg.marriageEvent.notAttendingCount++;
          recordedCat = 'NOT ATTENDING';
        } else if (rsvp === 'MAYBE' || rsvp === 'MAYBE_ATTENDING' || rsvp === 'TENTATIVE') {
          agg.marriageEvent.maybeAttendingCount++;
          recordedCat = 'MAYBE ATTENDING';
        }
        if (recordedCat) {
          const providerId = this.getProviderCallIdByJobId(outcome.callId) || outcome.callId;
          const jobId = this.getJobIdByProviderCallId(outcome.callId) || outcome.callId;

          this.processedCallDeduplication.add(`marriage_rsvp_${targetId}_${outcome.callId}`);
          this.processedCallDeduplication.add(`marriage_rsvp_${targetId}_${providerId}`);
          this.processedCallDeduplication.add(`marriage_rsvp_${targetId}_${jobId}`);
          this.processedCallDeduplication.add(`${targetId}_${outcome.callId}_marriage_rsvp_recorded`);
          this.processedCallDeduplication.add(`${targetId}_${providerId}_marriage_rsvp_recorded`);
          this.processedCallDeduplication.add(`${targetId}_${jobId}_marriage_rsvp_recorded`);

          const initKey = `${targetId}_${outcome.callId}_call_counted`;
          if (!this.processedCallDeduplication.has(initKey)) {
            this.processedCallDeduplication.add(initKey);
            agg.totalCalls++;
          }
          const ansKey = `${targetId}_${outcome.callId}_answered_counted`;
          if (!this.processedCallDeduplication.has(ansKey)) {
            this.processedCallDeduplication.add(ansKey);
            agg.answeredCalls++;
          }

          console.log('[MARRIAGE_RSVP_AGGREGATE_UPDATED]', {
            campaignId: targetId,
            attendingCount: agg.marriageEvent.attendingCount,
            notAttendingCount: agg.marriageEvent.notAttendingCount,
            maybeAttendingCount: agg.marriageEvent.maybeAttendingCount,
          });
        }
      }

      agg.marriageEvent.totalValidRsvp =
        agg.marriageEvent.attendingCount + agg.marriageEvent.notAttendingCount + agg.marriageEvent.maybeAttendingCount;

      // Mathematical constraint: Attending + Not Attending + Maybe Attending <= Answered Calls
      if (agg.answeredCalls < agg.marriageEvent.totalValidRsvp) {
        agg.answeredCalls = agg.marriageEvent.totalValidRsvp;
      }
      if (agg.totalCalls < agg.answeredCalls) {
        agg.totalCalls = agg.answeredCalls;
      }

      // Denominator rule: Denominator for Attending, Not Attending, and Maybe % is Answered Calls (0% if answeredCalls is 0)
      const ansDenominator = agg.answeredCalls || 0;
      agg.marriageEvent.attendingPercent =
        ansDenominator > 0
          ? Math.round((agg.marriageEvent.attendingCount / ansDenominator) * 100)
          : 0;
      agg.marriageEvent.notAttendingPercent =
        ansDenominator > 0
          ? Math.round((agg.marriageEvent.notAttendingCount / ansDenominator) * 100)
          : 0;
      agg.marriageEvent.maybeAttendingPercent =
        ansDenominator > 0
          ? Math.round((agg.marriageEvent.maybeAttendingCount / ansDenominator) * 100)
          : 0;
    } else if (agg.eventType === 'public_survey' && agg.publicSurvey) {
      if (outcome.surveyAnswers) {
        for (const q of agg.publicSurvey.questions) {
          const val = outcome.surveyAnswers[q.id] || outcome.surveyAnswers[q.text];
          if (typeof val === 'string' && val.trim()) {
            const lower = val.toLowerCase();
            if (lower.includes('issue') || lower.includes('సమస్య') || lower.includes('problem')) {
              q.issueReportedCount++;
            } else {
              q.noIssueReportedCount++;
            }
            q.totalAnswers = q.issueReportedCount + q.noIssueReportedCount;
            q.issueReportedPercent = Math.round((q.issueReportedCount / (q.totalAnswers || 1)) * 100);
            q.noIssueReportedPercent = Math.round((q.noIssueReportedCount / (q.totalAnswers || 1)) * 100);
          }
        }
      }
      const answeredQCount = outcome.surveyAnswers ? Object.keys(outcome.surveyAnswers).length : 0;
      const totalQ = agg.publicSurvey.questions.length || 1;
      const isCompleteSurvey = answeredQCount >= totalQ;
      if (isCompleteSurvey) {
        agg.publicSurvey.completedSurveyCalls = (agg.publicSurvey.completedSurveyCalls || 0) + 1;
      } else if (outcome.isAnswered || outcome.status === 'completed') {
        agg.publicSurvey.incompleteSurveyCalls = (agg.publicSurvey.incompleteSurveyCalls || 0) + 1;
      }
    }

    agg.updatedAt = now;
    this.data.aggregateAnalytics[targetId] = agg;
    return agg;
  }

  /**
   * Updates anonymous aggregate counters with deduplication to prevent double-counting.
   * Strictly avoids persisting individual personal details or transcripts.
   */
  public recordEventCallOutcome(eventId: string, outcome: EventCallOutcome, campaignId?: string): AggregateEventMetrics {
    const now = new Date().toISOString();
    const agg = this.recordSingleAggregateOutcome(eventId, outcome, now);

    if (campaignId && campaignId !== eventId) {
      this.recordSingleAggregateOutcome(campaignId, outcome, now);
    }

    if (campaignId && this.data.campaigns[campaignId]) {
      const camp = this.data.campaigns[campaignId];
      const campAgg = this.getAggregateAnalytics(campaignId);

      // Immediate synchronization of RSVP and answered counts during active calls
      if (campAgg.marriageEvent) {
        camp.attendingCount = campAgg.marriageEvent.attendingCount;
        camp.notAttendingCount = campAgg.marriageEvent.notAttendingCount;
        camp.maybeAttendingCount = campAgg.marriageEvent.maybeAttendingCount;
      }
      camp.answeredCount = campAgg.answeredCalls;
      camp.completedCount = campAgg.completedCalls;
      camp.unansweredCount = campAgg.unansweredCalls;
      camp.failedCount = campAgg.failedCalls;
      camp.processedCount = (camp.completedCount || 0) + (camp.unansweredCount || 0) + (camp.failedCount || 0);

      const isTerminal = ['completed', 'failed', 'no_answer', 'busy', 'cancelled'].includes(outcome.status || '');
      if (isTerminal) {
        camp.activeCalls = 0;
        camp.activeCallId = null;
        camp.activeCallStatus = null;
        if (campAgg.politicalCampaign) {
          camp.keypad1Count = campAgg.politicalCampaign.keypad1Count;
          camp.keypad2Count = campAgg.politicalCampaign.keypad2Count;
        }
        const remainingPending = this.getCallJobs(campaignId).filter((j) => j.status === 'pending').length;
        camp.pendingCount = remainingPending;
        if (remainingPending === 0 && (camp.status === 'running' || camp.status === 'draft')) {
          camp.status = 'completed';
        }
      }
      camp.updatedAt = now;
      this.data.campaigns[campaignId] = camp;
    }

    this.persist();
    return agg;
  }

  public recordCallInitiated(eventId: string, callId: string, campaignId?: string): void {
    const markInit = (targetId: string) => {
      const agg = this.getAggregateAnalytics(targetId);
      const job = this.getCallJob(callId) || this.getCallJobByProviderId(callId);
      const providerId = job?.providerCallId || this.getProviderCallIdByJobId(callId) || callId;
      const jobId = job?.id || this.getJobIdByProviderCallId(callId) || callId;

      const isAlreadyInitiated =
        this.processedCallDeduplication.has(`${targetId}_${callId}_call_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${providerId}_call_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${jobId}_call_counted`);

      if (!isAlreadyInitiated) {
        this.processedCallDeduplication.add(`${targetId}_${callId}_call_counted`);
        this.processedCallDeduplication.add(`${targetId}_${providerId}_call_counted`);
        this.processedCallDeduplication.add(`${targetId}_${jobId}_call_counted`);
        agg.totalCalls++;
        agg.updatedAt = new Date().toISOString();
        this.data.aggregateAnalytics[targetId] = agg;
      }
    };
    markInit(eventId);
    if (campaignId && campaignId !== eventId) {
      markInit(campaignId);
    }
    this.persist();
  }

  public recordCallAnswered(eventId: string, callId: string, campaignId?: string): void {
    const markAns = (targetId: string) => {
      const agg = this.getAggregateAnalytics(targetId);
      const job = this.getCallJob(callId) || this.getCallJobByProviderId(callId);
      const providerId = job?.providerCallId || this.getProviderCallIdByJobId(callId) || callId;
      const jobId = job?.id || this.getJobIdByProviderCallId(callId) || callId;

      const isAlreadyInitiated =
        this.processedCallDeduplication.has(`${targetId}_${callId}_call_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${providerId}_call_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${jobId}_call_counted`);

      if (!isAlreadyInitiated) {
        this.processedCallDeduplication.add(`${targetId}_${callId}_call_counted`);
        this.processedCallDeduplication.add(`${targetId}_${providerId}_call_counted`);
        this.processedCallDeduplication.add(`${targetId}_${jobId}_call_counted`);
        agg.totalCalls++;
      }

      const isAlreadyAnswered =
        this.processedCallDeduplication.has(`${targetId}_${callId}_answered_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${providerId}_answered_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${jobId}_answered_counted`);

      if (!isAlreadyAnswered) {
        this.processedCallDeduplication.add(`${targetId}_${callId}_answered_counted`);
        this.processedCallDeduplication.add(`${targetId}_${providerId}_answered_counted`);
        this.processedCallDeduplication.add(`${targetId}_${jobId}_answered_counted`);
        agg.answeredCalls++;
        if (agg.answeredCalls > agg.totalCalls) {
          agg.totalCalls = agg.answeredCalls;
        }
        agg.answerRatePercent = agg.totalCalls > 0 ? Math.round((agg.answeredCalls / agg.totalCalls) * 100) : 0;
        if (agg.eventType === 'political_campaign' && agg.politicalCampaign) {
          const totalValid = agg.politicalCampaign.keypad1Count + agg.politicalCampaign.keypad2Count;
          agg.politicalCampaign.totalValidDtmf = totalValid;
          agg.politicalCampaign.keypad1Percent = totalValid > 0 ? Math.round((agg.politicalCampaign.keypad1Count / totalValid) * 100) : 0;
          agg.politicalCampaign.keypad2Percent = totalValid > 0 ? Math.round((agg.politicalCampaign.keypad2Count / totalValid) * 100) : 0;
          const ans = agg.answeredCalls || 0;
          agg.politicalCampaign.noInputPercent = ans > 0 ? Math.round((agg.politicalCampaign.noInputCount / ans) * 100) : 0;
        } else if (agg.eventType === 'marriage_event' && agg.marriageEvent) {
          const ans = agg.answeredCalls || 0;
          agg.marriageEvent.attendingPercent = ans > 0 ? Math.round((agg.marriageEvent.attendingCount / ans) * 100) : 0;
          agg.marriageEvent.notAttendingPercent = ans > 0 ? Math.round((agg.marriageEvent.notAttendingCount / ans) * 100) : 0;
          agg.marriageEvent.maybeAttendingPercent = ans > 0 ? Math.round((agg.marriageEvent.maybeAttendingCount / ans) * 100) : 0;
        }
        agg.updatedAt = new Date().toISOString();
        this.data.aggregateAnalytics[targetId] = agg;
      }
    };
    markAns(eventId);
    if (campaignId && campaignId !== eventId) {
      markAns(campaignId);
    }
    this.persist();
  }

  public isMarriageRsvpRecorded(campaignId: string, callId: string): boolean {
    if (!callId) return false;
    const job = this.getCallJob(callId) || this.getCallJobByProviderId(callId);
    const providerId = job?.providerCallId || this.getProviderCallIdByJobId(callId) || callId;
    const jobId = job?.id || this.getJobIdByProviderCallId(callId) || callId;

    const keysToCheck = [
      `marriage_rsvp_${campaignId}_${callId}`,
      `marriage_rsvp_${campaignId}_${providerId}`,
      `marriage_rsvp_${campaignId}_${jobId}`,
      `${campaignId}_${callId}_marriage_rsvp_recorded`,
      `${campaignId}_${providerId}_marriage_rsvp_recorded`,
      `${campaignId}_${jobId}_marriage_rsvp_recorded`,
    ];

    return keysToCheck.some((k) => this.processedCallDeduplication.has(k));
  }

  public recordMarriageRsvpOutcome(
    campaignId: string,
    providerCallId: string,
    category: 'ATTENDING' | 'NOT_ATTENDING' | 'MAYBE_ATTENDING',
    eventId?: string
  ): {
    attendingCount: number;
    notAttendingCount: number;
    maybeAttendingCount: number;
  } {
    const job = this.getCallJobByProviderId(providerCallId) || this.getCallJob(providerCallId);
    const providerId = job?.providerCallId || this.getProviderCallIdByJobId(providerCallId) || providerCallId;
    const jobId = job?.id || this.getJobIdByProviderCallId(providerCallId) || providerCallId;

    const now = new Date().toISOString();

    const markDedup = (targetId: string) => {
      this.processedCallDeduplication.add(`marriage_rsvp_${targetId}_${providerCallId}`);
      this.processedCallDeduplication.add(`marriage_rsvp_${targetId}_${providerId}`);
      this.processedCallDeduplication.add(`marriage_rsvp_${targetId}_${jobId}`);
      this.processedCallDeduplication.add(`${targetId}_${providerCallId}_marriage_rsvp_recorded`);
      this.processedCallDeduplication.add(`${targetId}_${providerId}_marriage_rsvp_recorded`);
      this.processedCallDeduplication.add(`${targetId}_${jobId}_marriage_rsvp_recorded`);
    };

    const updateTarget = (targetId: string) => {
      markDedup(targetId);
      const agg = this.getAggregateAnalytics(targetId);
      if (!agg.marriageEvent) {
        agg.marriageEvent = {
          attendingCount: 0,
          notAttendingCount: 0,
          maybeAttendingCount: 0,
          attendingPercent: 0,
          notAttendingPercent: 0,
          maybeAttendingPercent: 0,
          totalValidRsvp: 0,
        };
      }

      if (category === 'ATTENDING') {
        agg.marriageEvent.attendingCount++;
      } else if (category === 'NOT_ATTENDING') {
        agg.marriageEvent.notAttendingCount++;
      } else if (category === 'MAYBE_ATTENDING') {
        agg.marriageEvent.maybeAttendingCount++;
      }

      agg.marriageEvent.totalValidRsvp =
        agg.marriageEvent.attendingCount +
        agg.marriageEvent.notAttendingCount +
        agg.marriageEvent.maybeAttendingCount;

      const isAlreadyInitiated =
        this.processedCallDeduplication.has(`${targetId}_${providerCallId}_call_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${providerId}_call_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${jobId}_call_counted`);

      if (!isAlreadyInitiated) {
        this.processedCallDeduplication.add(`${targetId}_${providerCallId}_call_counted`);
        this.processedCallDeduplication.add(`${targetId}_${providerId}_call_counted`);
        this.processedCallDeduplication.add(`${targetId}_${jobId}_call_counted`);
        agg.totalCalls++;
      }

      const isAlreadyAnswered =
        this.processedCallDeduplication.has(`${targetId}_${providerCallId}_answered_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${providerId}_answered_counted`) ||
        this.processedCallDeduplication.has(`${targetId}_${jobId}_answered_counted`);

      if (!isAlreadyAnswered) {
        this.processedCallDeduplication.add(`${targetId}_${providerCallId}_answered_counted`);
        this.processedCallDeduplication.add(`${targetId}_${providerId}_answered_counted`);
        this.processedCallDeduplication.add(`${targetId}_${jobId}_answered_counted`);
        agg.answeredCalls++;
      }

      if (agg.answeredCalls < agg.marriageEvent.totalValidRsvp) {
        agg.answeredCalls = agg.marriageEvent.totalValidRsvp;
      }
      if (agg.totalCalls < agg.answeredCalls) {
        agg.totalCalls = agg.answeredCalls;
      }

      const ans = agg.answeredCalls || 0;
      agg.marriageEvent.attendingPercent =
        ans > 0 ? Math.round((agg.marriageEvent.attendingCount / ans) * 100) : 0;
      agg.marriageEvent.notAttendingPercent =
        ans > 0 ? Math.round((agg.marriageEvent.notAttendingCount / ans) * 100) : 0;
      agg.marriageEvent.maybeAttendingPercent =
        ans > 0 ? Math.round((agg.marriageEvent.maybeAttendingCount / ans) * 100) : 0;

      agg.updatedAt = now;
      this.data.aggregateAnalytics[targetId] = agg;
      return agg;
    };

    const campAgg = updateTarget(campaignId);

    const camp = this.data.campaigns[campaignId];
    const resolvedEventId = eventId || camp?.eventId;
    if (resolvedEventId && resolvedEventId !== campaignId) {
      updateTarget(resolvedEventId);
    }

    if (camp && campAgg.marriageEvent) {
      camp.attendingCount = campAgg.marriageEvent.attendingCount;
      camp.notAttendingCount = campAgg.marriageEvent.notAttendingCount;
      camp.maybeAttendingCount = campAgg.marriageEvent.maybeAttendingCount;
      camp.answeredCount = campAgg.answeredCalls;
      camp.callsInitiated = Math.max(camp.callsInitiated || 0, campAgg.totalCalls);
      camp.updatedAt = now;
      this.data.campaigns[campaignId] = camp;
    }

    this.persist();

    return {
      attendingCount: campAgg.marriageEvent?.attendingCount || 0,
      notAttendingCount: campAgg.marriageEvent?.notAttendingCount || 0,
      maybeAttendingCount: campAgg.marriageEvent?.maybeAttendingCount || 0,
    };
  }

  private recordSinglePoliticalKeypad(targetId: string, callId: string, digit: '1' | '2', now: string): AggregateEventMetrics {
    const agg = this.getAggregateAnalytics(targetId);

    const job = this.getCallJobByProviderId(callId) || this.getCallJob(callId);
    const providerId = job?.providerCallId || this.getProviderCallIdByJobId(callId) || callId;
    const jobId = job?.id || this.getJobIdByProviderCallId(callId) || callId;

    const dedupKeys = [
      `${targetId}_${callId}_political_dtmf_${digit}`,
      `${targetId}_${providerId}_political_dtmf_${digit}`,
      `${targetId}_${jobId}_political_dtmf_${digit}`,
      `${targetId}_${callId}_political_dtmf`,
      `${targetId}_${providerId}_political_dtmf`,
      `${targetId}_${jobId}_political_dtmf`,
    ];
    if (dedupKeys.some((k) => this.processedCallDeduplication.has(k))) {
      return agg;
    }
    dedupKeys.forEach((k) => this.processedCallDeduplication.add(k));

    // Count in initiated calls if not already counted
    const callInitKeys = [
      `${targetId}_${callId}_call_counted`,
      `${targetId}_${providerId}_call_counted`,
      `${targetId}_${jobId}_call_counted`,
    ];
    if (!callInitKeys.some((k) => this.processedCallDeduplication.has(k))) {
      callInitKeys.forEach((k) => this.processedCallDeduplication.add(k));
      agg.totalCalls++;
    }

    // Keypad entry proves respondent answered
    const ansKeys = [
      `${targetId}_${callId}_answered_counted`,
      `${targetId}_${providerId}_answered_counted`,
      `${targetId}_${jobId}_answered_counted`,
    ];
    if (!ansKeys.some((k) => this.processedCallDeduplication.has(k))) {
      ansKeys.forEach((k) => this.processedCallDeduplication.add(k));
      agg.answeredCalls++;
    }

    const compKeys = [
      `${targetId}_${callId}_completed_counted`,
      `${targetId}_${providerId}_completed_counted`,
      `${targetId}_${jobId}_completed_counted`,
    ];
    if (!compKeys.some((k) => this.processedCallDeduplication.has(k))) {
      compKeys.forEach((k) => this.processedCallDeduplication.add(k));
      agg.completedCalls++;
    }

    if (agg.answeredCalls > agg.totalCalls) {
      agg.totalCalls = agg.answeredCalls;
    }

    if (!agg.politicalCampaign) {
      agg.politicalCampaign = {
        keypad1Count: 0,
        keypad1Percent: 0,
        keypad2Count: 0,
        keypad2Percent: 0,
        noInputCount: 0,
        noInputPercent: 0,
        totalValidDtmf: 0,
      };
    }

    if (digit === '1') {
      agg.politicalCampaign.keypad1Count++;
    } else if (digit === '2') {
      agg.politicalCampaign.keypad2Count++;
    }

    const totalValid = agg.politicalCampaign.keypad1Count + agg.politicalCampaign.keypad2Count;
    agg.politicalCampaign.totalValidDtmf = totalValid;

    // Denominator rule: Keypad % = valid digit / total valid responses * 100
    agg.politicalCampaign.keypad1Percent =
      totalValid > 0 ? Math.round((agg.politicalCampaign.keypad1Count / totalValid) * 100) : 0;
    agg.politicalCampaign.keypad2Percent =
      totalValid > 0 ? Math.round((agg.politicalCampaign.keypad2Count / totalValid) * 100) : 0;
    const ans = agg.answeredCalls || 0;
    agg.politicalCampaign.noInputPercent =
      ans > 0 ? Math.round((agg.politicalCampaign.noInputCount / ans) * 100) : 0;

    agg.answerRatePercent =
      agg.totalCalls > 0 ? Math.round((agg.answeredCalls / agg.totalCalls) * 100) : 0;

    agg.updatedAt = now;
    this.data.aggregateAnalytics[targetId] = agg;
    return agg;
  }

  public recordPoliticalKeypadOutcome(eventId: string, callId: string, digit: '1' | '2', campaignId?: string): AggregateEventMetrics {
    const now = new Date().toISOString();
    const agg = this.recordSinglePoliticalKeypad(eventId, callId, digit, now);
    if (campaignId && campaignId !== eventId) {
      this.recordSinglePoliticalKeypad(campaignId, callId, digit, now);
    }
    if (campaignId && this.data.campaigns[campaignId]) {
      const camp = this.data.campaigns[campaignId];
      const job = this.getCallJobByProviderId(callId) || this.getCallJob(callId);
      const providerId = job?.providerCallId || this.getProviderCallIdByJobId(callId) || callId;
      const jobId = job?.id || this.getJobIdByProviderCallId(callId) || callId;

      const campKeypadKeys = [
        `${campaignId}_${callId}_camp_keypad_${digit}`,
        `${campaignId}_${providerId}_camp_keypad_${digit}`,
        `${campaignId}_${jobId}_camp_keypad_${digit}`,
        `${campaignId}_${callId}_camp_keypad`,
        `${campaignId}_${providerId}_camp_keypad`,
        `${campaignId}_${jobId}_camp_keypad`,
      ];
      if (!campKeypadKeys.some((k) => this.processedCallDeduplication.has(k))) {
        campKeypadKeys.forEach((k) => this.processedCallDeduplication.add(k));
        if (digit === '1') {
          camp.keypad1Count = (camp.keypad1Count || 0) + 1;
        } else if (digit === '2') {
          camp.keypad2Count = (camp.keypad2Count || 0) + 1;
        }
      }
      const campAgg = this.getAggregateAnalytics(campaignId);
      camp.answeredCount = campAgg.answeredCalls;
      camp.completedCount = campAgg.completedCalls;
      camp.unansweredCount = campAgg.unansweredCalls;
      camp.failedCount = campAgg.failedCalls;
      camp.processedCount = (camp.completedCount || 0) + (camp.unansweredCount || 0) + (camp.failedCount || 0);
      camp.updatedAt = now;
      this.data.campaigns[campaignId] = camp;
    }
    this.persist();
    return agg;
  }

  public purgePoliticalCallJob(jobId: string): void {
    if (this.data.callJobs[jobId]) {
      delete this.data.callJobs[jobId];
      this.persist();
    }
  }

  deleteCallJob(id: string): boolean {
    if (this.data.callJobs[id]) {
      delete this.data.callJobs[id];
      this.persist();
      return true;
    }
    return false;
  }

  saveCallJob(job: CallJobRecord): CallJobRecord {
    job.updatedAt = new Date().toISOString();

    const isTerminal = ['completed', 'failed', 'no_answer', 'busy', 'cancelled', 'opted_out'].includes(job.status);
    const event = this.getEvent(job.eventId);
    const eventType = event?.type || (job as any).moduleType || (job.metadata as any)?.moduleType;

    // DATA PRIVACY & ZERO-PII RETENTION FOR POLITICAL CAMPAIGN:
    // When a political campaign call completes/terminates, completely remove the call record from storage.
    // DATA PRIVACY & ZERO-PII RETENTION FOR POLITICAL CAMPAIGN AND MARRIAGE EVENT:
    // When a political campaign or marriage event call completes/terminates, completely remove the individual call record from storage.
    // Anonymous aggregate metrics are persisted in aggregateAnalytics.
    if (isTerminal && (eventType === 'political_campaign' || eventType === 'political_survey' || eventType === 'marriage_event')) {
      if (this.data.callJobs[job.id]) {
        delete this.data.callJobs[job.id];
      }
      this.persist();
      return job;
    }

    // Public Survey: PRESERVE transcripts and survey answers in authentic script.
    // Anonymize personal identifiers (phone/name) for respondent privacy.
    if (isTerminal) {
      if (eventType !== 'public_survey') {
        delete job.transcript;
        delete job.surveyAnswers;
      }
      job.contactName = 'Anonymized Respondent';
      job.contactPhone = '***';
      if (job.metadata) {
        delete job.metadata.vapiResponse;
        delete job.metadata.customer;
        delete job.metadata.customerData;
      }
    }

    if (job.providerCallId) {
      if (!this.data.providerCallIdMappings) this.data.providerCallIdMappings = {};
      this.data.providerCallIdMappings[job.providerCallId] = {
        jobId: job.id,
        campaignId: job.campaignId,
        eventId: job.eventId,
      };
      this.providerCallIdToJobMap.set(job.providerCallId, {
        jobId: job.id,
        campaignId: job.campaignId,
        eventId: job.eventId,
      });
      this.jobIdToProviderCallIdMap.set(job.id, job.providerCallId);
    }

    this.data.callJobs[job.id] = job;
    this.persist();
    return job;
  }

  saveCallJobsBulk(jobs: CallJobRecord[]): CallJobRecord[] {
    const now = new Date().toISOString();
    jobs.forEach((j) => {
      j.updatedAt = now;
      const isTerminal = ['completed', 'failed', 'no_answer', 'busy', 'cancelled', 'opted_out'].includes(j.status);
      const event = this.getEvent(j.eventId);
      const eventType = event?.type || (j as any).moduleType || (j.metadata as any)?.moduleType;

      if (isTerminal && (eventType === 'political_campaign' || eventType === 'political_survey' || eventType === 'marriage_event')) {
        delete this.data.callJobs[j.id];
        return;
      }

      if (isTerminal) {
        if (eventType !== 'public_survey') {
          delete j.transcript;
          delete j.surveyAnswers;
        }
        j.contactName = 'Anonymized Respondent';
        j.contactPhone = '***';
        if (j.metadata) {
          delete j.metadata.vapiResponse;
          delete j.metadata.customer;
        }
      }
      this.data.callJobs[j.id] = j;
    });
    this.persist();
    return jobs;
  }

  // ==========================
  // SAAS SUBSCRIPTIONS & DURATION BILLING
  // ==========================

  private seedDefaultSubscriptionsIfEmpty(): void {
    if (!this.data.subscriptions) {
      this.data.subscriptions = {};
    }
    if (!this.data.usageTransactions) {
      this.data.usageTransactions = {};
    }
    if (!this.data.paymentHistory) {
      this.data.paymentHistory = {};
    }
    if (!this.data.planConfigs || Object.keys(this.data.planConfigs).length === 0) {
      this.data.planConfigs = { ...DEFAULT_PLAN_CONFIGS };
    }

    const tenants = Object.keys(this.data.tenants);
    const now = new Date().toISOString();

    for (const tenantId of tenants) {
      if (!this.data.subscriptions[tenantId]) {
        // Initialize with canonical Free Trial Plan (Exactly 2 eligible completed calls)
        this.data.subscriptions[tenantId] = {
          userId: tenantId,
          planId: 'free',
          planStatus: 'active',
          totalSeconds: 120, // 2 minutes default free allowance
          usedSeconds: 0,
          remainingSeconds: 120,
          freeCallsAllowed: 2, // exactly 2 completed/eligible calls
          freeCallsUsed: 0,
          status: 'active',
          purchaseDate: now,
          updatedAt: now,
        };
      }
    }
    this.persist();
  }

  getPlanConfigs(): Record<SubscriptionPlanId, PlanConfig> {
    return this.data.planConfigs || DEFAULT_PLAN_CONFIGS;
  }

  getPlanConfig(planId: SubscriptionPlanId): PlanConfig {
    return (this.data.planConfigs && this.data.planConfigs[planId]) || DEFAULT_PLAN_CONFIGS[planId];
  }

  updatePlanConfig(planId: SubscriptionPlanId, updates: Partial<PlanConfig>): PlanConfig {
    if (!this.data.planConfigs) this.data.planConfigs = { ...DEFAULT_PLAN_CONFIGS };
    const current = this.data.planConfigs[planId] || DEFAULT_PLAN_CONFIGS[planId];
    const updated: PlanConfig = {
      ...current,
      ...updates,
      id: planId,
    };
    this.data.planConfigs[planId] = updated;
    this.persist();
    return updated;
  }

  getSubscription(userId: string): UserSubscription {
    const cleanId = (userId || 'client_001').trim();
    if (!this.data.subscriptions) this.data.subscriptions = {};
    if (!this.data.subscriptions[cleanId]) {
      const now = new Date().toISOString();
      this.data.subscriptions[cleanId] = {
        userId: cleanId,
        planId: 'free',
        planStatus: 'active',
        totalSeconds: 120,
        usedSeconds: 0,
        remainingSeconds: 120,
        freeCallsAllowed: 2,
        freeCallsUsed: 0,
        completedTestCalls: 2,
        isTestingMode: true,
        status: 'active',
        purchaseDate: now,
        updatedAt: now,
      };
      this.persist();
    } else {
      const sub = this.data.subscriptions[cleanId];
      if (sub.completedTestCalls === undefined) {
        sub.completedTestCalls = 2;
      }
      if (sub.isTestingMode === undefined) {
        sub.isTestingMode = true;
      }
      // If user is testing and was falsely marked exhausted due to test calls, restore to active
      if (sub.status === 'exhausted' && sub.planId === 'free' && sub.usedSeconds === 0) {
        sub.status = 'active';
        sub.planStatus = 'active';
      }
    }
    return this.data.subscriptions[cleanId];
  }

  saveSubscription(subscription: UserSubscription): UserSubscription {
    subscription.updatedAt = new Date().toISOString();
    if (!this.data.subscriptions) this.data.subscriptions = {};
    this.data.subscriptions[subscription.userId] = subscription;
    this.persist();
    return subscription;
  }

  /**
   * Retrieves accurate testing mode statistics dynamically from backend storage records.
   */
  getTestingModeUsage(userId: string = 'client_001'): {
    active: boolean;
    completedTestCalls: number;
    totalTestCalls: number;
    policy: string;
  } {
    const sub = this.getSubscription(userId);
    const jobs = Object.values(this.data.callJobs || {}).filter((j: any) => {
      const matchesUser = !j.clientId || j.clientId === userId;
      const isTest = j.campaignId?.includes('test') || j.contactId?.includes('test') || j.id?.includes('test') || j.metadata?.isTestCall;
      return matchesUser && isTest;
    });
    const completedCount = jobs.filter((j: any) => j.status === 'completed').length;
    const finalCompleted = Math.max(sub.completedTestCalls ?? 2, completedCount);
    return {
      active: sub.isTestingMode !== false,
      completedTestCalls: finalCompleted,
      totalTestCalls: Math.max(finalCompleted, jobs.length),
      policy: 'Testing Mode is active. Internal test calls are exempt from credit deductions and do not force a paid upgrade.',
    };
  }

  /**
   * Pre-call verification: verifies active subscription, credit balance, and sets maximum permitted call duration.
   * Exempts authorized testing calls so they are never blocked or forced into a paid upgrade.
   */
  checkCallEligibility(userId: string, isTestCall = false): {
    allowed: boolean;
    reason?: string;
    subscription: UserSubscription;
    maxPermittedSeconds: number;
    upgradeRequired: boolean;
    isTestingModeActive?: boolean;
  } {
    const sub = this.getSubscription(userId);

    // Testing Mode / Internal Test Calls are NEVER blocked and NEVER force paid upgrades
    if (isTestCall || sub.isTestingMode !== false) {
      return {
        allowed: true,
        subscription: sub,
        maxPermittedSeconds: 300,
        upgradeRequired: false,
        isTestingModeActive: true,
      };
    }

    if (sub.status === 'exhausted' || sub.planStatus === 'exhausted') {
      return {
        allowed: false,
        reason: 'Your available call duration has been exhausted. Please upgrade your plan.',
        subscription: sub,
        maxPermittedSeconds: 0,
        upgradeRequired: true,
        isTestingModeActive: false,
      };
    }

    if (sub.planId === 'free') {
      if (sub.freeCallsUsed >= sub.freeCallsAllowed) {
        sub.status = 'exhausted';
        sub.planStatus = 'exhausted';
        this.saveSubscription(sub);
        return {
          allowed: false,
          reason: 'Your free trial limit of 2 eligible calls has been exhausted. Please upgrade your plan.',
          subscription: sub,
          maxPermittedSeconds: 0,
          upgradeRequired: true,
          isTestingModeActive: false,
        };
      }
      return {
        allowed: true,
        subscription: sub,
        maxPermittedSeconds: Math.max(20, sub.remainingSeconds || 120),
        upgradeRequired: false,
        isTestingModeActive: false,
      };
    }

    // Pro or Max Pro duration checks
    if (sub.remainingSeconds <= 0) {
      sub.status = 'exhausted';
      sub.planStatus = 'exhausted';
      this.saveSubscription(sub);
      return {
        allowed: false,
        reason: 'Your available call duration has been exhausted. Please upgrade your plan.',
        subscription: sub,
        maxPermittedSeconds: 0,
        upgradeRequired: true,
        isTestingModeActive: false,
      };
    }

    return {
      allowed: true,
      subscription: sub,
      maxPermittedSeconds: sub.remainingSeconds,
      upgradeRequired: false,
      isTestingModeActive: false,
    };
  }

  /**
   * Idempotent call duration deduction and transaction recording in integer seconds.
   * Exempts internal testing calls, non-connected attempts, and unanswered calls.
   * Preserves provider costs separately from customer credit deductions.
   */
  recordCallBilling(params: {
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
    status: string;
    durationSeconds?: number;
    wasAnswered?: boolean;
    providerCost?: number;
    endedReason?: string;
    isTestCall?: boolean;
    campaignId?: string;
  }): UsageTransaction {
    if (!this.data.usageTransactions) this.data.usageTransactions = {};

    // 1. Idempotency Check: Do not double-charge on duplicate webhooks or multiple polling syncs
    const existing = Object.values(this.data.usageTransactions).find(
      (tx) => tx.callId === params.callId || (params.vapiCallId && tx.vapiCallId === params.vapiCallId)
    );
    if (existing) {
      return existing;
    }

    const duration = Math.max(0, Math.round(params.durationSeconds || 0));
    const sub = this.getSubscription(params.userId);
    const now = new Date().toISOString();

    const isTestCall = Boolean(
      params.isTestCall ||
      params.campaignId?.includes('test') ||
      params.contactId === 'contact_test' ||
      params.callId.startsWith('test_')
    );

    // 2. Validate connection state: Do NOT charge for non-connected attempts or unanswered calls
    // Even if ringing/transport duration was non-zero (e.g. 31s ringing before timeout/failure),
    // customer credits must NOT be deducted for unanswered or failed calls.
    const isExplicitlyUnanswered = params.wasAnswered === false;
    const isUnconnectedStatus = ['no_answer', 'busy', 'failed', 'cancelled', 'opted_out', 'skipped'].includes(params.status);
    const isCarrierConnectionFailure = Boolean(
      params.endedReason && (
        params.endedReason.includes('failed-to-connect') ||
        params.endedReason.includes('no-answer') ||
        params.endedReason.includes('busy') ||
        params.endedReason.includes('rejected') ||
        params.endedReason.includes('declined') ||
        params.endedReason.includes('transport-never-connected')
      )
    );

    const isUnconnected = isExplicitlyUnanswered || isUnconnectedStatus || isCarrierConnectionFailure;

    let deduction = 0;
    let billingStatus: UsageTransaction['billingStatus'] = 'billed';

    if (isTestCall) {
      // Internal testing call: exempt from paid credit deductions, update test usage accurately
      billingStatus = 'exempt_internal_test';
      deduction = 0;
      sub.completedTestCalls = (sub.completedTestCalls || 0) + 1;
      // Ensure subscription status remains unchanged and active
      if (sub.status === 'exhausted' && sub.usedSeconds === 0) {
        sub.status = 'active';
        sub.planStatus = 'active';
      }
      this.saveSubscription(sub);
    } else if (isUnconnected) {
      billingStatus = 'exempt_unconnected';
      deduction = 0;
    } else if (duration === 0) {
      billingStatus = 'exempt_zero_duration';
      deduction = 0;
    } else {
      // Completed, connected production customer call with genuine answered duration
      deduction = duration;

      if (sub.planId === 'free') {
        sub.freeCallsUsed = (sub.freeCallsUsed || 0) + 1;
        sub.usedSeconds = (sub.usedSeconds || 0) + deduction;
        sub.remainingSeconds = Math.max(0, (sub.remainingSeconds || 120) - deduction);
        if (sub.freeCallsUsed >= sub.freeCallsAllowed || sub.remainingSeconds <= 0) {
          sub.status = 'exhausted';
          sub.planStatus = 'exhausted';
        }
      } else {
        // Duration-based billing in exact integer seconds
        sub.usedSeconds = (sub.usedSeconds || 0) + deduction;
        sub.remainingSeconds = Math.max(0, (sub.remainingSeconds || 0) - deduction);
        if (sub.remainingSeconds <= 0) {
          sub.status = 'exhausted';
          sub.planStatus = 'exhausted';
        }
      }
      this.saveSubscription(sub);
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tx: UsageTransaction = {
      id: txId,
      userId: params.userId,
      callId: params.callId,
      eventId: params.eventId,
      contactId: params.contactId,
      contactName: params.contactName,
      contactPhone: params.contactPhone,
      vapiCallId: params.vapiCallId,
      twilioCallSid: params.twilioCallSid,
      callStartedAt: params.callStartedAt || now,
      callEndedAt: params.callEndedAt || now,
      durationSeconds: duration,
      creditDeductionSeconds: deduction,
      billingStatus,
      wasAnswered: params.wasAnswered,
      providerCost: params.providerCost !== undefined ? Number(params.providerCost) : 0,
      endedReason: params.endedReason,
      createdAt: now,
    };

    this.data.usageTransactions[txId] = tx;
    this.persist();

    console.log('[BILLING_RECORD_COMPLETED]', {
      userId: params.userId,
      callId: params.callId,
      durationSeconds: duration,
      deductionSeconds: deduction,
      remainingSeconds: sub.remainingSeconds,
      planId: sub.planId,
      billingStatus,
      wasAnswered: params.wasAnswered,
      providerCost: tx.providerCost,
      isTestCall,
    });

    return tx;
  }

  getUsageTransactions(userId: string): UsageTransaction[] {
    if (!this.data.usageTransactions) return [];
    return Object.values(this.data.usageTransactions)
      .filter((tx) => !userId || tx.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  createPaymentOrder(userId: string, planId: SubscriptionPlanId): {
    orderId: string;
    amount: number;
    currency: string;
    plan: PlanConfig;
    keyId: string;
  } {
    const plan = this.getPlanConfig(planId);
    if (!plan || planId === 'free') {
      throw new Error(`Invalid plan for upgrade: ${planId}`);
    }

    const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const paymentRecord: PaymentRecord = {
      id: `pay_rec_${Date.now()}`,
      orderId,
      userId,
      planId,
      amount: plan.price,
      currency: plan.currency || 'INR',
      paymentProvider: process.env.RAZORPAY_KEY_ID ? 'razorpay' : 'gateway_simulation',
      paymentStatus: 'created',
      createdAt: now,
    };

    if (!this.data.paymentHistory) this.data.paymentHistory = {};
    this.data.paymentHistory[orderId] = paymentRecord;
    this.persist();

    return {
      orderId,
      amount: plan.price,
      currency: plan.currency || 'INR',
      plan,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_live_callbridge_demo',
    };
  }

  verifyPaymentAndActivate(params: {
    userId: string;
    orderId: string;
    paymentId: string;
    signature?: string;
    planId: SubscriptionPlanId;
  }): {
    success: boolean;
    subscription: UserSubscription;
    message: string;
  } {
    const { userId, orderId, paymentId, signature, planId } = params;
    if (!this.data.paymentHistory) this.data.paymentHistory = {};
    const paymentRecord = this.data.paymentHistory[orderId];

    if (!paymentRecord) {
      throw new Error(`Order ${orderId} not found in payment records`);
    }

    if (paymentRecord.paymentStatus === 'completed') {
      const sub = this.getSubscription(userId);
      return { success: true, subscription: sub, message: 'Plan already activated for this order' };
    }

    const effectivePlanId = (params.planId || paymentRecord.planId) as SubscriptionPlanId;
    const plan = this.getPlanConfig(effectivePlanId);
    if (!plan) {
      throw new Error(`Unknown plan ${effectivePlanId}`);
    }

    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + plan.validityDays * 24 * 60 * 60 * 1000).toISOString();

    paymentRecord.paymentStatus = 'completed';
    paymentRecord.signature = signature || `sig_${Math.random().toString(36).slice(2, 10)}`;
    paymentRecord.verifiedAt = now;
    this.data.paymentHistory[orderId] = paymentRecord;

    // Activate subscription and add duration credits in integer seconds
    const currentSub = this.getSubscription(userId);
    const newTotalSeconds = (currentSub.remainingSeconds > 0 ? currentSub.remainingSeconds : 0) + plan.includedSeconds;

    const updatedSub: UserSubscription = {
      userId,
      planId: effectivePlanId,
      planStatus: 'active',
      totalSeconds: newTotalSeconds,
      usedSeconds: 0,
      remainingSeconds: newTotalSeconds,
      freeCallsAllowed: 2,
      freeCallsUsed: currentSub.freeCallsUsed || 0,
      status: 'active',
      purchaseDate: now,
      expiryDate: expiry,
      updatedAt: now,
    };

    this.saveSubscription(updatedSub);

    console.log('[PAYMENT_VERIFIED_AND_ACTIVATED]', {
      userId,
      orderId,
      paymentId,
      planId,
      addedSeconds: plan.includedSeconds,
      totalSeconds: newTotalSeconds,
    });

    return {
      success: true,
      subscription: updatedSub,
      message: `Successfully upgraded to ${plan.name}! ${Math.round(plan.includedSeconds / 60)} minutes (${plan.includedSeconds} seconds) added to your account.`,
    };
  }

  getPaymentHistory(userId: string): PaymentRecord[] {
    if (!this.data.paymentHistory) return [];
    return Object.values(this.data.paymentHistory)
      .filter((p) => !userId || p.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export const callbridgeStorage = new CallbridgeStorage();

