# CallBridge AI — Vapi + Twilio + OpenAI + ElevenLabs Integration

End-to-end voice calling orchestration integrating Vapi and imported Twilio phone numbers with user-approved ElevenLabs cloned voices and OpenAI conversation intelligence across the three canonical modules (Public Survey, Political Campaign, and Marriage Event).

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed in Phase 1 interactive clarification:
> - **Module Scope**: Preserving exactly the 3 existing canonical modules: **Public Survey**, **Political Campaign**, and **Marriage Event** (Business Event is excluded per user decision).
> - **Vapi Orchestration Pattern**: Ephemeral inline assistant configuration with dynamic per-call ElevenLabs voice ID and module script overrides passed to `POST https://api.vapi.ai/call/phone`.
> - **Multi-User SaaS Architecture**: Clean user switcher dropdown in the header with strict data isolation per customer account (independent cloned voices, approval statuses, campaigns, contact lists, and call histories).
> - **DTMF Keypad Interaction**: Captures DTMF responses (e.g. Press 1 to support, 2 for info/callback), speaks an authentic confirmation audio acknowledgment, and automatically terminates the call cleanly.

---

## 1. Overview & Core Concept

CallBridge AI transforms user-authored campaign scripts and interactive civic surveys into real outbound telephone calls placed to mobile handsets. By pairing ElevenLabs high-fidelity voice cloning with Vapi telephony orchestration over Twilio carrier routes and OpenAI conversational intelligence, customers can interview respondents, run authorized voter campaigns, and deliver personalized invitations using their own verified cloned voices.

### Target Audience & Persona
- **Public Institutions & Research Surveyors**: Gathering citizen feedback across civic amenities with natural multi-turn Telugu, Hindi, or English conversations and dynamic follow-up probing.
- **Authorized Political Campaign Managers**: Reaching constituents with approved candidate addresses and capturing verified DTMF keypad sentiment.
- **Event Organizers & Families**: Sending authentic spoken wedding invitations with RSVP collection and venue directions.

### Key Value
- **Zero Generic AI Voices**: Every call uses the authenticated user's approved cloned voice profile.
- **Real Carrier Connectivity**: Placed via Vapi through imported Twilio numbers, ringing physical handsets with live carrier status reporting.
- **Complete Tenant Isolation**: Customer voice profiles, contacts, and transcripts remain strictly partitioned.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Multi-User Account Switching**:
   - The user selects or adds a customer tenant in the top navigation bar (e.g. `Client 001: Telangana Outreach Org`).
   - The workspace immediately updates to show that customer's approved voice profile, isolated campaigns, contacts, and call history.
2. **Voice Recording, Cloning & Strict Approval Gate**:
   - In Voice Studio, the user records audio or uploads a sample.
   - ElevenLabs Instant Voice Cloning generates the voice profile and sample preview.
   - The user must explicitly click **Approve Voice** before it can be assigned to outbound campaigns.
   - If the user clicks **Record Again**, the previous approved voice remains active until a replacement is approved.
3. **Outbound Test Call (Browser Preview vs. Phone Call)**:
   - **Test Voice**: Plays the script directly in the browser via ElevenLabs TTS without placing a telephone call.
   - **Test Phone Call**: The user inputs a 10-digit mobile number, clicks *Place Test Phone Call*, and receives an actual phone call from the imported Twilio number. The call status transitions live (`calling` → `ringing` → `in-progress` → `completed`).
4. **Keypad DTMF Collection**:
   - During a campaign call, the agent delivers the speech and prompts: *"Press 1 to support, 2 for more details"*.
   - When the respondent presses a keypad digit, Vapi captures the DTMF event, speaks the confirmation, and terminates the call.
5. **Campaign Sequential Calling & Analytics**:
   - Outbound queue processes contacts sequentially, pausing between calls and recording transcript logs and DTMF selections.

### Visual Identity & Theme
- **Theme Posture**: Clean enterprise SaaS canvas (`bg-slate-50`, dark slate header `bg-slate-900`, crisp white structural cards with hairline borders `border-slate-200`).
- **Typography**: Display typography using `Plus Jakarta Sans` for titles and navigation, paired with `DM Sans` for body text, and tabular monospace numerals (`font-mono tabular-nums`) for timestamps, durations, phone numbers, and call stats.
- **Zero-Pill Discipline**: Metadata displayed as clean, unboxed text separated by subtle typographic dots (`·`). Interactive controls use segmented button bars.
- **Status Contrast**: Telemetry and call status states paired with explicit textual labels (`in_progress` in amber, `completed` in emerald, `failed` in rose).

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Ephemeral Vapi Assistant vs. Fixed Assistant ID
- **Chosen Approach**: Dynamically construct the Vapi assistant payload in backend requests to `POST https://api.vapi.ai/call/phone`, passing the customer's exact ElevenLabs Voice ID (`voice.provider = '11labs'`, `voice.voiceId = customerVoiceId`), system prompt, and webhook URL.
- **Why**: Eliminates manual assistant provisioning in the Vapi dashboard for every new cloned voice. Gives programmatic control over prompt instructions and voice assignments per call.
- **Fallback**: If `VAPI_ASSISTANT_ID` is provided in environment variables, CallBridge supports assistant overrides seamlessly.

### Decision 2: Backend Credential Vault & Server-Side Security
- **Chosen Approach**: All sensitive API keys (`VAPI_PRIVATE_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`) reside exclusively in backend environment variables.
- **Why**: Zero exposure in frontend bundles or network requests. The frontend only communicates with CallBridge proxy endpoints (`/api/callbridge/*`).
- **Resilience**: A dedicated `/api/callbridge/telephony/config-status` endpoint allows the UI to display readiness status without exposing key values.

### Decision 3: Multi-Tenant Data Store Isolation
- **Chosen Approach**: Extend `callbridgeStorage` to index all records by `clientId`/`userId`.
- **Why**: Ensures that campaigns, contacts, transcripts, and voice profiles are strictly isolated. A user cannot view, dial, or edit another customer's data.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT BROWSER (SPA)                            │
│                                                                             │
│  ┌───────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ Tenant Switcher       │  │ Event Workspaces    │  │ Voice Studio      │  │
│  │ Client 001 / 002 / 003│  │ Survey / Campaign / │  │ Record, Preview,  │  │
│  │ (Active User State)   │  │ Marriage Invitation │  │ Approve/Reject    │  │
│  └───────────┬───────────┘  └──────────┬──────────┘  └─────────┬─────────┘  │
│              │                         │                       │            │
│  ┌───────────┴─────────────────────────┴───────────────────────┴──────────┐  │
│  │   Test Call Panel: [Test Voice (Browser)] & [Test Phone Call (Vapi)]   │  │
│  │   Queue Manager: Sequential Outbound Batch Dialer with Live Telemetry   │  │
│  └─────────────────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │ Fetch /api/callbridge/*
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CALLBRIDGE NODE/EXPRESS                           │
│                                                                             │
│  ┌───────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ Multi-Tenant Auth &   │  │ Vapi Service Client │  │ ElevenLabs Engine │  │
│  │ Storage Controller    │  │ Outbound Call, DTMF,│  │ Instant Cloning,  │  │
│  │ callbridgeStorage.ts  │  │ Webhook Ingestion   │  │ TTS Stream & Dict │  │
│  └───────────┬───────────┘  └──────────┬──────────┘  └─────────┬─────────┘  │
│              │                         │                       │            │
│  ┌───────────┴─────────────────────────┴───────────────────────┴──────────┐  │
│  │ OpenAI Survey Engine: Dynamic Probing & Contextual State Memory        │  │
│  └─────────────────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
      ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
      │   Vapi Telephony    │ │  ElevenLabs Voice   │ │   OpenAI Engine     │
      │   Orchestration &   │ │   Voice Synthesis   │ │  Conversation &     │
      │   Twilio Imported   │ │  (Cloned Customer   │ │  Dynamic Follow-up  │
      │     Carrier No.     │ │       Profiles)     │ │     Intelligence    │
      └─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

### Core Data Models
- **`TenantUser`**: `id`, `name`, `email`, `organization`, `approvedVoiceProfileId`, `createdAt`.
- **`VoiceProfileRecord`**: `id`, `clientId`, `name`, `providerVoiceId`, `approvalStatus: 'approved' | 'pending_review' | 'rejected'`, `languageCapabilities`.
- **`CallJobRecord`**: `id`, `clientId`, `campaignId`, `eventId`, `contactName`, `contactPhone`, `status`, `providerCallId`, `dtmfDigitReceived`, `transcript`, `durationSeconds`.
- **`CampaignRecord`**: `id`, `clientId`, `eventId`, `name`, `status`, `concurrencyLimit`, `totalContacts`, `completedCount`, `failedCount`.

### Implementation Sequence Plan
1. **Backend Telephony Provider Module (`server/telephony/vapiService.ts`)**:
   - Vapi API client initialized with `VAPI_PRIVATE_API_KEY` and `VAPI_PHONE_NUMBER_ID`.
   - Method `createOutboundCall()` with ephemeral assistant, customer number, customer ElevenLabs voice ID, first message, OpenAI model instructions, and webhook endpoint.
   - Method `getCallStatus(callId)` and webhook handler parsing `status-update`, `speech-update` (DTMF digits), and `end-of-call-report`.
2. **Multi-Tenant Storage & Isolation (`server/storage/callbridgeStorage.ts`)**:
   - Add tenant management (`getTenants()`, `createTenant()`).
   - Add multi-tenant filtering to events, voice profiles, contacts, campaigns, and call jobs by `clientId`.
   - Seed default tenant accounts so the app works immediately out-of-the-box.
3. **Voice Approval Workflow (`server/voice/voiceRouter.ts` & `VoiceStudioModal.tsx`)**:
   - Implement explicit `approve-voice` and `reject-voice` endpoints.
   - Update UI with dual actions: **Approve Voice** and **Record Again**.
   - Ensure an unapproved voice cannot be assigned or dialed.
4. **Vapi Webhook & Outbound Queue Integration (`server/callbridgeRouter.ts`)**:
   - Expose `POST /api/callbridge/vapi/webhook` to record call lifecycle, live transcripts, and DTMF inputs.
   - Update `POST /api/callbridge/test-phone-call` to initiate genuine calls via `VapiService`.
   - Update `queueManager.ts` to dispatch sequential calls through Vapi with real-time status transitions.
5. **Frontend Header & Multi-Tenant Switcher (`MainHeader.tsx` & `App.tsx`)**:
   - Add customer account selector in the top bar.
   - Propagate active `clientId` across EventWorkspace, ContactManager, VoiceStudio, and QueueView.
6. **Analytics & Call History Dashboard (`AnalyticsView.tsx`)**:
   - Display module-wise and campaign-wise breakdown, total calls, answered, failed, and DTMF keypad statistics (e.g. Yes/No counts).
7. **Verification & Testing**:
   - Run linter and compilation checks (`tsc --noEmit`, `vite build`).
   - Execute existing test suite (`npm run test:section24`).
   - Validate Vapi and ElevenLabs API integration paths.
