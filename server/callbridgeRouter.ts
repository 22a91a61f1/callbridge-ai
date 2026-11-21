import { Router, type Response } from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import {
  callbridgeStorage,
  isSharedDefaultEvent,
  type EventRecord,
  type ContactRecord,
  type CampaignRecord,
  type CallJobRecord,
  type TenantUser,
  type VoiceProfileRecord,
} from './storage/callbridgeStorage.ts';
import { queueManager } from './campaign/queueManager.ts';
import { providerCapacityController } from './campaign/providerCapacityController.ts';
import { ContactService } from './contacts/contactService.ts';
import { ExportService } from './reporting/exportService.ts';
import { ElevenLabsService, resolveVoiceId } from './voice/elevenLabsService.ts';
import { getVerifiedAdditionalVoices, isAdditionalVoiceId, getAdditionalVoiceConfig, getCachedAdditionalVoice } from './voice/additionalVoices.ts';
import { VapiService } from './telephony/vapiService.ts';
import { voiceProfileStorage } from './voice/voiceProfileStorage.ts';
import { SurveySequentialEngine } from './survey/surveySequentialEngine.ts';
import { translateCampaignScriptToTelugu } from './survey/openAiEngine.ts';
import type { AuthenticatedRequest } from './auth/firebaseAuthMiddleware.ts';

export const callbridgeRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const marriageStartLocks = new Set<string>();

const SHARED_PLATFORM_VOICE_IDS = new Set([
  'Txde0pZ5tVhXE6HUspcf', // Default Rishi platform voice
]);

function isValidTenantId(id: string | undefined | null): id is string {
  return Boolean(id && typeof id === 'string' && id.trim() !== '' && id.trim() !== 'user_default');
}

/**
 * Strictly derives tenantId from verified Firebase auth context when present.
 * Never trusts frontend-supplied clientId/userId for authenticated customers,
 * and never falls back to 'client_001' or 'user_default'.
 */
function resolveTenantId(req: AuthenticatedRequest): string | undefined {
  if (isValidTenantId(req.authUser?.tenantId)) {
    return req.authUser.tenantId;
  }
  const fromReq =
    (typeof req.body?.clientId === 'string' && req.body.clientId.trim()) ||
    (typeof req.body?.client_id === 'string' && req.body.client_id.trim()) ||
    (typeof req.body?.userId === 'string' && req.body.userId.trim()) ||
    (typeof req.body?.user_id === 'string' && req.body.user_id.trim()) ||
    (typeof req.query?.clientId === 'string' && req.query.clientId.trim()) ||
    (typeof req.query?.userId === 'string' && req.query.userId.trim()) ||
    (typeof req.query?.user_id === 'string' && req.query.user_id.trim()) ||
    '';
  return isValidTenantId(fromReq) ? fromReq : undefined;
}

function requireTenantId(req: AuthenticatedRequest, res: Response): string | null {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    res.status(401).json({ success: false, error: 'Authentication required: missing verified customer tenant context' });
    return null;
  }
  return tenantId;
}

function assertEventAccess(
  req: AuthenticatedRequest,
  res: Response,
  eventId: string
): { clientId: string; event: EventRecord } | null {
  const clientId = requireTenantId(req, res);
  if (!clientId) return null;

  const rawEvent = callbridgeStorage.getEvent(eventId);
  if (!rawEvent) {
    res.status(404).json({ success: false, error: 'Event not found' });
    return null;
  }

  if (!isSharedDefaultEvent(eventId)) {
    if (!isValidTenantId(rawEvent.clientId) || rawEvent.clientId !== clientId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Event belongs to another customer or has no verified tenant owner',
      });
      return null;
    }
  }

  const scopedEvent = callbridgeStorage.getEvent(eventId, clientId);
  if (!scopedEvent) {
    res.status(403).json({ success: false, error: 'Forbidden: Cannot access this event' });
    return null;
  }
  return { clientId, event: scopedEvent };
}

function isSharedPlatformVoice(voiceId: string, profile?: any): boolean {
  if (isAdditionalVoiceId(voiceId) || SHARED_PLATFORM_VOICE_IDS.has(voiceId)) {
    return true;
  }
  if (profile && (profile.isAdditionalVoice === true || profile.isSharedDefault === true)) {
    return true;
  }
  return false;
}

async function verifyVoiceProfileAccess(
  voiceId: string,
  clientId: string
): Promise<{ allowed: boolean; profile?: any; providerVoiceId?: string; reason?: string }> {
  const trimmed = (voiceId || '').trim();
  if (!trimmed) {
    return { allowed: false, reason: 'voiceId is required' };
  }
  if (isSharedPlatformVoice(trimmed)) {
    const profile = callbridgeStorage.getVoiceProfile(trimmed);
    return { allowed: true, profile, providerVoiceId: profile?.providerVoiceId || trimmed };
  }

  const fromCallbridge = callbridgeStorage.getVoiceProfile(trimmed);
  const fromVoiceStorage = !fromCallbridge
    ? (await voiceProfileStorage.getProfileById(trimmed).catch(() => null)) ||
      (await voiceProfileStorage.getProfileByVoiceId(trimmed).catch(() => null))
    : null;
  const profile = fromCallbridge || fromVoiceStorage;

  if (profile) {
    if (isSharedPlatformVoice(trimmed, profile)) {
      return {
        allowed: true,
        profile,
        providerVoiceId: (profile as any).providerVoiceId || (profile as any).elevenLabsVoiceId || (profile as any).voice_id || trimmed,
      };
    }
    const ownerId = (profile as any).clientId || (profile as any).client_id || (profile as any).user_id;
    if (!isValidTenantId(ownerId)) {
      return { allowed: false, profile, reason: 'Forbidden: Legacy voice profile has no verified tenant owner' };
    }
    if (ownerId !== clientId) {
      return { allowed: false, profile, reason: 'Forbidden: Voice profile belongs to another customer' };
    }
    return {
      allowed: true,
      profile,
      providerVoiceId: (profile as any).providerVoiceId || (profile as any).elevenLabsVoiceId || (profile as any).voice_id || trimmed,
    };
  }

  return { allowed: false, reason: 'Forbidden: Voice profile not found or does not belong to this customer' };
}

// Central server-side ownership guards derived strictly from verified Firebase token
// Denies both cross-tenant records and legacy records with missing or 'user_default' ownership.
callbridgeRouter.param('campaignId', (req: AuthenticatedRequest, res, next, campaignId) => {
  if (req.authUser && campaignId) {
    const camp = callbridgeStorage.getCampaign(campaignId);
    if (camp && (!isValidTenantId(camp.clientId) || camp.clientId !== req.authUser.tenantId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Campaign belongs to another customer or has unverified ownership',
      });
    }
  }
  next();
});

callbridgeRouter.param('contactId', (req: AuthenticatedRequest, res, next, contactId) => {
  if (req.authUser && contactId) {
    const allContacts = Object.values((callbridgeStorage as any).data?.contacts || {}) as ContactRecord[];
    const contact = allContacts.find((c) => c.id === contactId);
    const ownerId = (contact as any)?.clientId || contact?.userId;
    if (contact && (!isValidTenantId(ownerId) || ownerId !== req.authUser.tenantId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Contact belongs to another customer or has unverified ownership',
      });
    }
  }
  next();
});

callbridgeRouter.param('jobId', (req: AuthenticatedRequest, res, next, jobId) => {
  if (req.authUser && jobId) {
    const job = callbridgeStorage.getCallJob(jobId) || callbridgeStorage.getCallJobByProviderId(jobId);
    const mapping = callbridgeStorage.getProviderCallMapping(jobId);
    if (job || mapping) {
      const ownerId = job?.clientId || mapping?.tenantId;
      if (!isValidTenantId(ownerId) || ownerId !== req.authUser.tenantId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Call record belongs to another customer or has unverified ownership',
        });
      }
    }
  }
  next();
});

callbridgeRouter.param('callId', (req: AuthenticatedRequest, res, next, callId) => {
  if (req.authUser && callId) {
    const job = callbridgeStorage.getCallJob(callId) || callbridgeStorage.getCallJobByProviderId(callId);
    const mapping = callbridgeStorage.getProviderCallMapping(callId);
    if (job || mapping) {
      const ownerId = job?.clientId || mapping?.tenantId;
      if (!isValidTenantId(ownerId) || ownerId !== req.authUser.tenantId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Call record belongs to another customer or has unverified ownership',
        });
      }
    }
  }
  next();
});

// ==========================================
// 0. MULTI-TENANT USER ACCOUNTS
// ==========================================
callbridgeRouter.get('/tenants', (req: AuthenticatedRequest, res) => {
  if (req.authUser) {
    const ownTenant = callbridgeStorage.getTenant(req.authUser.tenantId);
    return res.json({ success: true, tenants: ownTenant ? [ownTenant] : [] });
  }
  const tenants = callbridgeStorage.getTenants();
  res.json({ success: true, tenants });
});

callbridgeRouter.post('/tenants', (req: AuthenticatedRequest, res) => {
  if (req.authUser) {
    return res.status(403).json({ success: false, error: 'Forbidden: Customer accounts cannot create additional tenants' });
  }
  const { name, email, organization } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tenant name is required' });
  }
  const id = `client_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const tenant: TenantUser = {
    id,
    name: name.trim(),
    email: email?.trim() || `${id}@callbridge.ai`,
    organization: organization?.trim() || name.trim(),
    createdAt: now,
    updatedAt: now,
  };
  callbridgeStorage.saveTenant(tenant);
  res.json({ success: true, tenant });
});

callbridgeRouter.get('/tenants/:id', (req: AuthenticatedRequest, res) => {
  if (req.authUser && req.params.id !== req.authUser.tenantId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot access another customer profile' });
  }
  const tenant = callbridgeStorage.getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const approvedVoice = callbridgeStorage.getApprovedVoiceProfile(tenant.id);
  res.json({ success: true, tenant, approvedVoice });
});

callbridgeRouter.put('/tenants/:id', (req: AuthenticatedRequest, res) => {
  if (req.authUser && req.params.id !== req.authUser.tenantId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot modify another customer profile' });
  }
  const tenant = callbridgeStorage.getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const { name, organization, email, preferences, settings } = req.body;
  if (name !== undefined && name.trim()) tenant.name = name.trim();
  if (organization !== undefined && organization.trim()) tenant.organization = organization.trim();
  if (email !== undefined && email.trim()) tenant.email = email.trim();
  if (preferences !== undefined) (tenant as any).preferences = { ...((tenant as any).preferences || {}), ...preferences };
  if (settings !== undefined) (tenant as any).settings = { ...((tenant as any).settings || {}), ...settings };
  tenant.updatedAt = new Date().toISOString();
  callbridgeStorage.saveTenant(tenant);
  res.json({ success: true, tenant });
});

callbridgeRouter.put('/tenants/:id/approved-voice', async (req: AuthenticatedRequest, res) => {
  if (req.authUser && req.params.id !== req.authUser.tenantId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot modify another customer voice profile' });
  }
  const { voiceId, eventType, eventId } = req.body;
  if (!voiceId) return res.status(400).json({ error: 'voiceId is required' });
  const clientId = req.authUser?.tenantId || req.params.id;
  const voiceAccess = await verifyVoiceProfileAccess(String(voiceId), clientId);
  if (!voiceAccess.allowed) {
    return res.status(403).json({
      success: false,
      error: voiceAccess.reason || 'Forbidden: Voice profile does not belong to this customer',
    });
  }
  const updated = callbridgeStorage.setTenantApprovedVoice(clientId, voiceId, eventType, eventId);
  if (!updated) return res.status(404).json({ error: 'Tenant not found' });

  // Activate in voiceProfileStorage as well
  await voiceProfileStorage.approveVoice(clientId, voiceId, eventType, eventId).catch(() => null);

  console.log('[VOICE_APPROVAL_COMPLETED]', {
    clientId,
    eventType: eventType || 'public_survey',
    eventId: eventId || null,
    voiceId,
    approvedVoiceName: updated.approvedVoiceName,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, tenant: updated });
});


// ==========================================
// 1. EVENTS MANAGEMENT (Independent modules)
// ==========================================
callbridgeRouter.get('/events', (req: AuthenticatedRequest, res) => {
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const events = callbridgeStorage.getEvents(clientId);
  res.json({ success: true, events });
});

callbridgeRouter.get('/events/:id', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  res.json({ success: true, event: access.event });
});

callbridgeRouter.post('/events', (req: AuthenticatedRequest, res) => {
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const { type, name, description, language, config } = req.body;
  if (!type || !name) {
    return res.status(400).json({ error: 'Event type and name are required' });
  }

  const now = new Date().toISOString();
  const newEvent: EventRecord = {
    id: `event-${type}-${Date.now()}`,
    clientId,
    type,
    name: name.trim(),
    description: description?.trim() || '',
    language: language || 'te',
    createdAt: now,
    updatedAt: now,
    config: config || {},
  };

  callbridgeStorage.saveEvent(newEvent, clientId);
  res.json({ success: true, event: newEvent });
});

callbridgeRouter.put('/events/:id', async (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { clientId, event: existing } = access;

  const {
    name,
    description,
    language,
    config,
    selectedVoiceProfileId,
    voiceSelectionType,
    selectedVoiceName,
    selectedVoiceSlotLabel,
  } = req.body;

  if (typeof selectedVoiceProfileId === 'string' && selectedVoiceProfileId.trim()) {
    const voiceAccess = await verifyVoiceProfileAccess(selectedVoiceProfileId.trim(), clientId);
    if (!voiceAccess.allowed) {
      return res.status(403).json({
        success: false,
        error: voiceAccess.reason || 'Forbidden: Voice profile does not belong to this customer',
      });
    }
  }

  const updated: EventRecord = {
    ...existing,
    clientId: isSharedDefaultEvent(existing.id) ? undefined : clientId,
    name: name !== undefined ? name.trim() : existing.name,
    description: description !== undefined ? description.trim() : existing.description,
    language: language || existing.language,
    selectedVoiceProfileId: selectedVoiceProfileId !== undefined ? selectedVoiceProfileId : existing.selectedVoiceProfileId,
    voiceSelectionType: voiceSelectionType !== undefined ? voiceSelectionType : existing.voiceSelectionType,
    selectedVoiceName: selectedVoiceName !== undefined ? selectedVoiceName : existing.selectedVoiceName,
    selectedVoiceSlotLabel: selectedVoiceSlotLabel !== undefined ? selectedVoiceSlotLabel : existing.selectedVoiceSlotLabel,
    config: {
      ...existing.config,
      ...(config || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  callbridgeStorage.saveEvent(updated, clientId);
  const merged = callbridgeStorage.getEvent(existing.id, clientId) || updated;
  res.json({ success: true, event: merged });
});

// Event/campaign-level voice selection (cloned vs additional voice, strictly tenant-isolated)
callbridgeRouter.post('/events/:id/voice-selection', async (req: AuthenticatedRequest, res) => {
  try {
    const eventId = req.params.id;
    const access = assertEventAccess(req, res, eventId);
    if (!access) return;
    const { clientId, event: ev } = access;

    const voiceSelectionType = req.body?.voiceSelectionType === 'additional' ? 'additional' : 'cloned';
    const rawVoiceId = typeof req.body?.voiceId === 'string' ? req.body.voiceId.trim() : '';

    if (voiceSelectionType === 'additional') {
      const cfg = getAdditionalVoiceConfig(rawVoiceId);
      if (!cfg) {
        return res.status(400).json({
          success: false,
          error: 'Unknown additional voice ID. Please choose one of the supported Additional Voices.',
        });
      }

      // Ensure live verification on ElevenLabs before persisting
      let catalogEntry = getCachedAdditionalVoice(cfg.voiceId);
      if (!catalogEntry) {
        const verifiedCatalog = await getVerifiedAdditionalVoices();
        catalogEntry = verifiedCatalog.voices.find((v) => v.voiceId === cfg.voiceId);
      }

      if (!catalogEntry?.accessible) {
        const check = await ElevenLabsService.verifyVoiceExists(cfg.voiceId);
        if (!check.valid) {
          return res.status(422).json({
            success: false,
            error: check.error || `Selected additional voice (${cfg.slotLabel}) is currently inaccessible on ElevenLabs.`,
          });
        }
      }

      const result = callbridgeStorage.setEventVoiceSelection(eventId, {
        voiceSelectionType: 'additional',
        voiceId: cfg.voiceId,
        voiceName: catalogEntry?.name || cfg.slotLabel,
        slotLabel: cfg.slotLabel,
        clientId,
      });
      if (!result.success) {
        return res.status(400).json(result);
      }

      console.log('[EVENT_ADDITIONAL_VOICE_SELECTED]', {
        eventId,
        clientId,
        eventType: ev.type,
        voiceId: cfg.voiceId,
        slotLabel: cfg.slotLabel,
        voiceName: result.event?.selectedVoiceName,
      });

      return res.json({ success: true, event: result.event });
    }

    if (rawVoiceId) {
      const voiceAccess = await verifyVoiceProfileAccess(rawVoiceId, clientId);
      if (!voiceAccess.allowed) {
        return res.status(403).json({
          success: false,
          error: voiceAccess.reason || 'Forbidden: Voice profile does not belong to this customer',
        });
      }
    }

    // Restore Cloned Voice at event level cleanly (tenant-isolated)
    const result = callbridgeStorage.setEventVoiceSelection(eventId, {
      voiceSelectionType: 'cloned',
      voiceId: rawVoiceId || undefined,
      clientId,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }

    console.log('[EVENT_CLONED_VOICE_RESTORED]', {
      eventId,
      clientId,
      eventType: ev.type,
      voiceId: result.event?.selectedVoiceProfileId,
      voiceName: result.event?.selectedVoiceName,
    });

    return res.json({ success: true, event: result.event });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to update event voice selection' });
  }
});

callbridgeRouter.delete('/events/:id', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  if (isSharedDefaultEvent(req.params.id)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Shared default platform events cannot be deleted by customer accounts',
    });
  }
  const success = callbridgeStorage.deleteEvent(req.params.id);
  if (!success) return res.status(404).json({ error: 'Event not found' });
  res.json({ success: true, message: 'Event deleted' });
});

callbridgeRouter.delete('/events/:id/custom-placeholders/:key', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { clientId, event } = access;
  const keyToDelete = req.params.key;
  const updatedEvent: EventRecord = {
    ...event,
    config: {
      ...event.config,
      customPlaceholders: event.config?.customPlaceholders
        ? event.config.customPlaceholders.filter((f) => f.key !== keyToDelete)
        : undefined,
      placeholderValues: event.config?.placeholderValues
        ? Object.fromEntries(Object.entries(event.config.placeholderValues).filter(([k]) => k !== keyToDelete))
        : undefined,
    },
    updatedAt: new Date().toISOString(),
  };
  callbridgeStorage.saveEvent(updatedEvent, clientId);
  const merged = callbridgeStorage.getEvent(event.id, clientId) || updatedEvent;
  res.json({ success: true, event: merged });
});

callbridgeRouter.post('/events/:id/duplicate', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const duplicated = callbridgeStorage.duplicateEvent(req.params.id, access.clientId);
  if (!duplicated) {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json({ success: true, event: duplicated });
});

import {
  renderTemplateScript,
  sanitizeScriptForSpeech,
  validateRequiredFields,
  type EventTemplateRecord,
} from './templates/templateEngine.ts';

// ==========================================
// 1.5 TEMPLATES MANAGEMENT & SCRIPT RENDERING
// ==========================================
callbridgeRouter.get('/templates', (req: AuthenticatedRequest, res) => {
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const category = req.query.category as string | undefined;
  const templates = callbridgeStorage.getTemplates(category, clientId);
  res.json({ success: true, templates });
});

callbridgeRouter.get('/templates/:id', (req: AuthenticatedRequest, res) => {
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const template = callbridgeStorage.getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  if (!template.isDefault && (!isValidTenantId(template.clientId) || template.clientId !== clientId)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Template belongs to another customer or has unverified ownership',
    });
  }
  res.json({ success: true, template });
});

callbridgeRouter.post('/templates', (req: AuthenticatedRequest, res) => {
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const { name, category, description, scriptTemplate, fields, defaultValues, questions, dtmfOptions } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Name and category are required' });
  }

  const now = new Date().toISOString();
  const templateRecord: EventTemplateRecord = {
    id: `tpl_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    clientId,
    category,
    name: name.trim(),
    description: description?.trim() || 'Custom saved template',
    isDefault: false,
    isCustom: true,
    scriptTemplate: scriptTemplate || { te: '', hi: '', en: '' },
    fields: Array.isArray(fields) ? fields : [],
    defaultValues: defaultValues || {},
    questions: Array.isArray(questions) ? questions : undefined,
    dtmfOptions: Array.isArray(dtmfOptions) ? dtmfOptions : undefined,
    createdAt: now,
    updatedAt: now,
  };

  callbridgeStorage.saveTemplate(templateRecord);
  res.json({ success: true, template: templateRecord });
});

callbridgeRouter.delete('/templates/:id', (req: AuthenticatedRequest, res) => {
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const existing = callbridgeStorage.getTemplate(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });
  if (existing.isDefault) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot delete default system templates' });
  }
  if (!isValidTenantId(existing.clientId) || existing.clientId !== clientId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Template belongs to another customer or has unverified ownership',
    });
  }
  const success = callbridgeStorage.deleteTemplate(req.params.id);
  res.json({ success });
});

callbridgeRouter.post('/render-script', (req, res) => {
  const { templateString, values = {}, customFields = [] } = req.body;
  const result = renderTemplateScript(templateString || '', values, customFields);
  res.json({ success: true, ...result });
});

callbridgeRouter.post('/validate-fields', (req, res) => {
  const { fields = [], values = {}, customFields = [] } = req.body;
  const result = validateRequiredFields(fields, values, customFields);
  res.json({ success: true, ...result });
});

callbridgeRouter.post('/translate', async (req, res) => {
  const { text, targetLanguage = 'te' } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ success: false, error: 'Text to translate is required' });
  }
  try {
    const { translatedText, model } = await translateCampaignScriptToTelugu(text);
    res.json({ success: true, translatedText, model, targetLanguage });
  } catch (err: any) {
    console.error('[TRANSLATE_ENDPOINT_ERROR]', err?.message || err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to translate text' });
  }
});


// ==========================================
// 1.8 SURVEY QUESTION MANAGEMENT
// ==========================================
callbridgeRouter.get('/events/:id/questions', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const questions = callbridgeStorage.getSurveyQuestions(req.params.id, access.clientId);
  res.json({ success: true, questions, count: questions.length });
});

callbridgeRouter.put('/events/:id/questions', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { questions } = req.body;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'Questions array is required' });
  }
  const saved = callbridgeStorage.saveSurveyQuestions(req.params.id, questions, access.clientId);
  res.json({ success: true, questions: saved });
});

callbridgeRouter.post('/events/:id/questions', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { questionText, questionType, allowFollowUp, enabled } = req.body;
  if (!questionText || !questionText.trim()) {
    return res.status(400).json({ error: 'Question text is required' });
  }
  const question = callbridgeStorage.addSurveyQuestion(
    req.params.id,
    {
      questionText: questionText.trim(),
      questionType: questionType || 'open_ended',
      allowFollowUp: allowFollowUp !== undefined ? Boolean(allowFollowUp) : true,
      enabled: enabled !== undefined ? Boolean(enabled) : true,
    },
    access.clientId
  );
  res.json({ success: true, question });
});

callbridgeRouter.put('/events/:id/questions/:questionId', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const updated = callbridgeStorage.updateSurveyQuestion(req.params.id, req.params.questionId, req.body, access.clientId);
  if (!updated) {
    return res.status(404).json({ error: 'Question not found' });
  }
  res.json({ success: true, question: updated });
});

callbridgeRouter.delete('/events/:id/questions/:questionId', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const success = callbridgeStorage.deleteSurveyQuestion(req.params.id, req.params.questionId, access.clientId);
  if (!success) {
    return res.status(404).json({ error: 'Question not found' });
  }
  res.json({ success: true, message: 'Question deleted successfully' });
});

callbridgeRouter.post('/events/:id/questions/reorder', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { orderedQuestionIds } = req.body;
  if (!Array.isArray(orderedQuestionIds)) {
    return res.status(400).json({ error: 'orderedQuestionIds array is required' });
  }
  const questions = callbridgeStorage.reorderSurveyQuestions(req.params.id, orderedQuestionIds, access.clientId);
  res.json({ success: true, questions });
});

// ==========================================
// 2. CONTACTS MANAGEMENT
// ==========================================
callbridgeRouter.get('/events/:id/contacts', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const contacts = callbridgeStorage.getContacts(req.params.id, access.clientId);
  res.json({ success: true, contacts, count: contacts.length });
});

callbridgeRouter.post('/events/:id/contacts', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { name, phone, email, locality, consentStatus, optOut, notes } = req.body;
  const { normalized, isValid } = ContactService.normalizePhoneNumber(phone);

  if (!isValid) {
    return res.status(400).json({ error: 'Invalid phone number format. Provide a valid 10-digit number.' });
  }

  const now = new Date().toISOString();
  const contact: ContactRecord = {
    id: `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: access.clientId,
    eventId: req.params.id,
    name: (name || 'Contact').trim(),
    phone: normalized,
    originalPhone: phone,
    email: email?.trim(),
    locality: locality?.trim(),
    consentStatus: consentStatus || 'granted',
    optOut: Boolean(optOut),
    importSource: 'manual',
    notes: notes?.trim(),
    createdAt: now,
    updatedAt: now,
  };

  callbridgeStorage.saveContact(contact);
  res.json({ success: true, contact });
});

callbridgeRouter.put('/events/:id/contacts/:contactId', (req: AuthenticatedRequest, res) => {
  const existing = callbridgeStorage
    .getContacts(req.params.id, req.authUser?.tenantId)
    .find((c) => c.id === req.params.contactId);
  if (!existing) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const { name, phone, email, locality, consentStatus, optOut, notes } = req.body;
  let normalizedPhone = existing.phone;
  if (phone && phone !== existing.phone && phone !== existing.originalPhone) {
    const norm = ContactService.normalizePhoneNumber(phone);
    if (!norm.isValid) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
    normalizedPhone = norm.normalized;
  }

  const updated: ContactRecord = {
    ...existing,
    name: name !== undefined ? name.trim() : existing.name,
    phone: normalizedPhone,
    originalPhone: phone || existing.originalPhone,
    email: email !== undefined ? email?.trim() : existing.email,
    locality: locality !== undefined ? locality?.trim() : existing.locality,
    consentStatus: consentStatus || existing.consentStatus,
    optOut: optOut !== undefined ? Boolean(optOut) : existing.optOut,
    notes: notes !== undefined ? notes?.trim() : existing.notes,
    updatedAt: new Date().toISOString(),
  };

  callbridgeStorage.saveContact(updated);
  res.json({ success: true, contact: updated });
});

callbridgeRouter.delete('/events/:id/contacts/:contactId', (req: AuthenticatedRequest, res) => {
  const success = callbridgeStorage.deleteContact(req.params.contactId);
  res.json({ success });
});

callbridgeRouter.delete('/contacts/:contactId', (req: AuthenticatedRequest, res) => {
  const success = callbridgeStorage.deleteContact(req.params.contactId);
  res.json({ success });
});

const isNamePhoneOnlyEvent = (eventId: string, bodyFlag?: any, queryFlag?: any): boolean => {
  if (bodyFlag === true || bodyFlag === 'true' || queryFlag === 'true') return true;
  if (bodyFlag === false || bodyFlag === 'false' || queryFlag === 'false') return false;
  const evt = callbridgeStorage.getEvent(eventId);
  return evt?.type === 'public_survey' || evt?.type === 'political_campaign';
};

// Parse manual pasted string of phone numbers and names
callbridgeRouter.post('/events/:id/contacts/paste', (req: AuthenticatedRequest, res) => {
  const { pastedText, namePhoneOnly } = req.body;
  if (!pastedText || typeof pastedText !== 'string' || !pastedText.trim()) {
    return res.status(400).json({ error: 'Pasted text is required' });
  }
  const result = ContactService.parseManualPasted(pastedText, req.params.id, {
    namePhoneOnly: isNamePhoneOnlyEvent(req.params.id, namePhoneOnly),
    clientId: req.authUser?.tenantId,
  });
  res.json({ success: true, ...result });
});

// Robust multer upload wrapper that guarantees JSON responses on all errors
const handleContactFileUpload = (req: any, res: any, next: any) => {
  upload.any()(req, res, (err: any) => {
    if (err) {
      console.error('[UPLOAD_MULTER_ERROR]', err);
      return res.status(400).json({ success: false, error: `Upload failed: ${err.message || 'File upload error'}` });
    }
    if (Array.isArray(req.files) && req.files.length > 0) {
      req.file = req.files.find((f: any) => f.fieldname === 'file') || req.files[0];
    }
    next();
  });
};

const processContactUpload = async (req: any, res: any) => {
  const files: any[] = Array.isArray(req.files) && req.files.length > 0
    ? req.files
    : req.file
    ? [req.file]
    : [];

  if (files.length === 0 || !files[0]?.buffer) {
    return res.status(400).json({ success: false, error: 'No file uploaded. Please upload a valid CSV, Excel (.xlsx/.xls) or PDF (.pdf) file.' });
  }

  const rawEventId = req.params?.id || req.body?.eventId || req.query?.eventId || 'default_event';
  const eventId = String(rawEventId).trim();
  const nameCol = req.body?.nameCol || req.query?.nameCol;
  const phoneCol = req.body?.phoneCol || req.query?.phoneCol;
  const localityCol = req.body?.localityCol || req.query?.localityCol;
  const namePhoneOnly = isNamePhoneOnlyEvent(eventId, req.body?.namePhoneOnly, req.query?.namePhoneOnly);
  const tenantId = (req as AuthenticatedRequest).authUser?.tenantId;

  try {
    const allRecords: any[] = [];
    const uploadedFileNames: string[] = [];
    const seenBatchPhones = new Set<string>();
    let combinedFormat = 'pdf';
    let needsColumnMapping = false;
    let availableHeaders: string[] | undefined;
    let sampleRows: Record<string, any>[] | undefined;
    let firstError: string | undefined;

    for (const file of files) {
      if (!file?.buffer) continue;
      const displayFileName = file.originalname || 'uploaded_document.pdf';
      const originalName = displayFileName.toLowerCase();
      uploadedFileNames.push(displayFileName);

      if (originalName.endsWith('.csv') || originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
        combinedFormat = 'spreadsheet';
        const result = ContactService.parseSpreadsheet(file.buffer, eventId, {
          nameCol: nameCol ? String(nameCol) : undefined,
          phoneCol: phoneCol ? String(phoneCol) : undefined,
          localityCol: localityCol ? String(localityCol) : undefined,
          namePhoneOnly,
          sourceFileName: displayFileName,
          seenBatchPhones,
          clientId: tenantId,
        });
        if (result.needsColumnMapping) {
          needsColumnMapping = true;
          availableHeaders = result.availableHeaders;
          sampleRows = result.sampleRows;
        }
        if (result.error && !firstError) firstError = result.error;
        for (const rec of result.records || []) {
          allRecords.push({
            ...rec,
            sourceFileName: rec.sourceFileName || displayFileName,
          });
        }
      } else if (originalName.endsWith('.pdf')) {
        console.log('[PDF_IMPORT_REQUEST_RECEIVED]', {
          eventId,
          originalName,
          mimeType: file.mimetype,
          contentLength: file.size,
        });
        console.log('[PDF_IMPORT_FILE_BUFFER_RECEIVED]', {
          bytes: file.buffer?.length ?? 0,
        });

        const result = await ContactService.parsePdfBuffer(file.buffer, eventId, {
          namePhoneOnly,
          sourceFileName: displayFileName,
          seenBatchPhones,
          clientId: tenantId,
        });
        if (result.error && !firstError) firstError = result.error;
        for (const rec of result.records || []) {
          allRecords.push({
            ...rec,
            sourceFileName: rec.sourceFileName || displayFileName,
          });
        }
      } else {
        return res.status(400).json({ success: false, error: `Unsupported file format for "${displayFileName}". Please upload CSV, XLSX, XLS or PDF.` });
      }
    }

    const validCount = allRecords.filter((r) => r.status === 'Valid').length;
    const invalidCount = allRecords.filter((r) => r.status === 'Invalid').length;
    const duplicateCount = allRecords.filter((r) => r.status === 'Duplicate').length;
    const needsReviewCount = allRecords.filter((r) => r.status === 'Needs Review').length;

    if (combinedFormat === 'pdf') {
      console.log('[PDF_IMPORT_API_RESPONSE]', {
        success: true,
        format: 'pdf',
        files: uploadedFileNames,
        totalDetected: allRecords.length,
        validCount,
        invalidCount,
        duplicateCount,
        needsReviewCount,
      });
    }

    return res.json({
      success: true,
      format: combinedFormat,
      uploadedFileNames,
      sourceFileName: uploadedFileNames[0],
      needsColumnMapping,
      availableHeaders,
      sampleRows,
      error: allRecords.length === 0 ? firstError : undefined,
      records: allRecords,
      contacts: allRecords,
      totalRows: allRecords.length,
      totalFound: allRecords.length,
      totalDetected: allRecords.length,
      validCount,
      invalidCount,
      duplicateCount,
      needsReviewCount,
    });
  } catch (err: any) {
    console.error('[CONTACT_UPLOAD_PARSING_ERROR]', err);
    return res.status(500).json({ success: false, error: `File parsing error: ${err.message || 'Unknown parsing error'}` });
  }
};

// File upload: CSV / Excel / PDF (supports single or multiple files)
callbridgeRouter.post('/events/:id/contacts/upload', handleContactFileUpload, processContactUpload);
callbridgeRouter.post('/events/undefined/contacts/upload', handleContactFileUpload, processContactUpload);
callbridgeRouter.post('/contacts/upload', handleContactFileUpload, processContactUpload);

// Commit bulk parsed contacts
callbridgeRouter.post('/events/:id/contacts/commit-bulk', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { contacts, source, sourceFileName, namePhoneOnly } = req.body;
  if (!Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Contacts list required' });
  }

  const stripExtraFields = isNamePhoneOnlyEvent(req.params.id, namePhoneOnly);
  const baseTime = Date.now();
  const recordsToSave: ContactRecord[] = contacts
    .filter((c: any) => c.phone && c.status !== 'Invalid' && !c.isDuplicate)
    .map((c: any, idx: number) => ({
      id: `cnt_${baseTime}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      userId: access.clientId,
      eventId: req.params.id,
      name: (c.name || 'Resident').trim(),
      phone: c.phone,
      originalPhone: c.rawPhone || c.phone,
      email: stripExtraFields ? undefined : (c.email || undefined),
      locality: stripExtraFields ? undefined : (c.locality || undefined),
      consentStatus: 'granted',
      optOut: false,
      importSource: source || 'csv',
      sourceFileName: c.sourceFileName || sourceFileName || undefined,
      createdAt: new Date(baseTime + idx * 20).toISOString(),
      updatedAt: new Date(baseTime + idx * 20).toISOString(),
    }));

  callbridgeStorage.saveContactsBulk(recordsToSave);
  res.json({ success: true, count: recordsToSave.length, contacts: recordsToSave });
});

// ==========================================
// 3. CAMPAIGNS & OUTBOUND QUEUE
// ==========================================
callbridgeRouter.get('/events/:id/campaigns', async (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const eventId = req.params.id;
  const campaigns = callbridgeStorage.getCampaigns(eventId, access.clientId);
  for (const camp of campaigns) {
    if (camp.status === 'running' || (camp.activeCalls ?? 0) > 0 || Boolean(camp.activeCallId)) {
      await queueManager.reconcileCampaign(camp.id);
    }
  }
  const freshCampaigns = callbridgeStorage.getCampaigns(eventId, access.clientId);
  res.json({ success: true, campaigns: freshCampaigns });
});

callbridgeRouter.post('/events/:id/campaigns', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { name, concurrencyLimit, contactIds } = req.body;
  const eventId = req.params.id;

  const now = new Date().toISOString();
  const campaign: CampaignRecord = {
    id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    clientId: access.clientId,
    eventId,
    name: (name || 'New Campaign').trim(),
    status: 'draft',
    concurrencyLimit: concurrencyLimit ? Math.max(1, parseInt(concurrencyLimit, 10)) : 1,
    totalContacts: 0,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  callbridgeStorage.saveCampaign(campaign);

  // Enqueue chosen contacts or all contacts for this event
  const jobs = queueManager.createCampaignJobs(campaign.id, eventId, contactIds || []);

  res.json({ success: true, campaign, queuedJobs: jobs.length });
});

// Idempotently prepare a DRAFT campaign batch from confirmed contacts without starting outbound calls
callbridgeRouter.post('/events/:id/campaigns/prepare-batch', (req: AuthenticatedRequest, res) => {
  const eventId = String(req.params.id);
  const access = assertEventAccess(req, res, eventId);
  if (!access) return;
  const { clientId: tenantId, event } = access;

  const { contactIds, sourceFileNames, name } = req.body || {};
  const allEligibleContacts = callbridgeStorage
    .getContacts(eventId, tenantId)
    .filter((c) => !c.optOut && c.consentStatus !== 'revoked');

  if (allEligibleContacts.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No valid confirmed contacts available. Please add or import contacts first.',
    });
  }

  const existingCampaigns = callbridgeStorage.getCampaigns(eventId, tenantId);

  let targetContacts: ContactRecord[] = [];
  if (Array.isArray(contactIds) && contactIds.length > 0) {
    const byId = new Map(allEligibleContacts.map((c) => [c.id, c]));
    targetContacts = contactIds
      .map((id: string) => byId.get(id))
      .filter((c): c is ContactRecord => Boolean(c));
  } else {
    // Exclude contacts already included in completed campaigns so old batches aren't mixed in
    const completedContactIds = new Set<string>();
    const completedPhones = new Set<string>();
    for (const camp of existingCampaigns) {
      if (camp.status === 'completed') {
        for (const qId of camp.queuedContactIds || []) {
          completedContactIds.add(qId);
        }
        for (const job of callbridgeStorage.getCallJobs(camp.id)) {
          if (job.contactId) completedContactIds.add(job.contactId);
          if (job.contactPhone) completedPhones.add(job.contactPhone);
        }
      }
    }

    const unbatched = allEligibleContacts.filter(
      (c) => !completedContactIds.has(c.id) && !completedPhones.has(c.phone)
    );
    targetContacts = unbatched.length > 0 ? unbatched : allEligibleContacts;
  }

  if (targetContacts.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No eligible confirmed contacts matched for this batch.',
    });
  }

  const targetContactIds = targetContacts.map((c) => c.id);

  const normalizedFileNames: string[] = Array.isArray(sourceFileNames) && sourceFileNames.length > 0
    ? Array.from(new Set(sourceFileNames.map((f: any) => String(f || '').trim()).filter(Boolean)))
    : Array.from(new Set(targetContacts.map((c) => c.sourceFileName).filter((f): f is string => Boolean(f))));

  // Idempotency: reuse existing draft campaign if it already contains the exact same ordered contact IDs
  const matchingDraft = existingCampaigns.find((camp) => {
    if (camp.status !== 'draft') return false;
    const queued = Array.isArray(camp.queuedContactIds) ? camp.queuedContactIds : [];
    if (queued.length !== targetContactIds.length) return false;
    return queued.every((id, idx) => id === targetContactIds[idx]);
  });

  if (matchingDraft) {
    if (normalizedFileNames.length > 0 && (!matchingDraft.sourceFileNames || matchingDraft.sourceFileNames.length === 0)) {
      matchingDraft.sourceFileNames = normalizedFileNames;
      matchingDraft.name = normalizedFileNames.join(', ');
      matchingDraft.updatedAt = new Date().toISOString();
      callbridgeStorage.saveCampaign(matchingDraft);
    }
    const jobs = callbridgeStorage.getCallJobs(matchingDraft.id);
    return res.json({
      success: true,
      reused: true,
      campaign: matchingDraft,
      queuedJobsCount: jobs.length,
    });
  }

  const batchLabel =
    (typeof name === 'string' && name.trim()) ||
    (normalizedFileNames.length > 0
      ? normalizedFileNames.join(', ')
      : `${event.name} Batch ${existingCampaigns.length + 1}`);

  const now = new Date().toISOString();
  const campaign: CampaignRecord = {
    id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    clientId: tenantId,
    eventId,
    name: batchLabel,
    status: 'draft',
    concurrencyLimit: 1,
    totalContacts: targetContacts.length,
    pendingCount: targetContacts.length,
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    optOutCount: 0,
    queuedContactIds: targetContactIds,
    sourceFileNames: normalizedFileNames.length > 0 ? normalizedFileNames : undefined,
    createdAt: now,
    updatedAt: now,
  };

  callbridgeStorage.saveCampaign(campaign);
  const jobs = queueManager.createCampaignJobs(campaign.id, eventId, targetContactIds);
  const freshCampaign = callbridgeStorage.getCampaign(campaign.id) || campaign;

  return res.json({
    success: true,
    reused: false,
    campaign: freshCampaign,
    queuedJobsCount: jobs.length,
  });
});

callbridgeRouter.post('/events/:id/proceed-with-data', async (req: AuthenticatedRequest, res) => {
  const eventId = String(req.params.id);
  const access = assertEventAccess(req, res, eventId);
  if (!access) return;
  const { clientId, event } = access;
  const marriageLockKey = `${clientId}:${eventId}`;
  let lockedMarriageStart = false;
  try {
    if (event.type === 'marriage_event') {
      if (marriageStartLocks.has(marriageLockKey)) {
        const runningCamp = callbridgeStorage.getCampaigns(eventId, clientId).find((c) => c.status === 'running');
        if (runningCamp) {
          return res.json({
            success: true,
            alreadyRunning: true,
            message: 'Marriage Event sequential calling is already active for this event.',
            campaign: runningCamp,
            queuedJobsCount: callbridgeStorage.getCallJobs(runningCamp.id).length,
          });
        }
      }
      marriageStartLocks.add(marriageLockKey);
      lockedMarriageStart = true;
    }

    // 1. If contacts are passed in body (e.g. reviewed from modal), save them first
    const { contacts, source } = req.body;
    if (Array.isArray(contacts) && contacts.length > 0) {
      const baseTime = Date.now();
      const recordsToSave: ContactRecord[] = contacts
        .filter((c: any) => c.phone && c.status !== 'Invalid' && !c.isDuplicate)
        .map((c: any, idx: number) => ({
          id: `cnt_${baseTime}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
          userId: clientId,
          eventId,
          name: (c.name || 'Resident').trim(),
          phone: c.phone,
          originalPhone: c.rawPhone || c.phone,
          email: c.email || undefined,
          locality: c.locality || undefined,
          consentStatus: 'granted',
          optOut: false,
          importSource: source || 'import',
          createdAt: new Date(baseTime + idx * 20).toISOString(),
          updatedAt: new Date(baseTime + idx * 20).toISOString(),
        }));
      if (recordsToSave.length > 0) {
        callbridgeStorage.saveContactsBulk(recordsToSave);
      }
    }

    // 2. Fetch all valid, authorized contacts for THIS customer & event
    const eventContacts = callbridgeStorage
      .getContacts(eventId, clientId)
      .filter((c) => !c.optOut && c.consentStatus !== 'revoked');
    if (eventContacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid contacts found for this event. Please add or import contacts before proceeding.',
      });
    }

    // Pre-flight SaaS Subscription and Duration Check
    const eligibility = callbridgeStorage.checkCallEligibility(clientId);
    if (!eligibility.allowed) {
      return res.status(402).json({
        success: false,
        error: 'Your available call duration has been exhausted. Please upgrade your plan.',
        upgradeRequired: true,
        reason: eligibility.reason,
      });
    }

    // 3. Find existing running (for Marriage Event idempotency) or draft/paused campaign for THIS customer
    const existingCampaigns = callbridgeStorage.getCampaigns(eventId, clientId);
    let targetCampaign =
      (event.type === 'marriage_event'
        ? existingCampaigns.find((c) => c.status === 'running')
        : undefined) ||
      existingCampaigns.find((c) => c.status === 'draft' || c.status === 'paused');

    const wasAlreadyRunning = Boolean(targetCampaign && targetCampaign.status === 'running');

    const now = new Date().toISOString();
    if (!targetCampaign) {
      targetCampaign = {
        id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        clientId,
        eventId,
        name: `${event.name} Sequential Calling`,
        status: 'draft',
        concurrencyLimit: 1,
        totalContacts: eventContacts.length,
        processedCount: 0,
        completedCount: 0,
        failedCount: 0,
        optOutCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      callbridgeStorage.saveCampaign(targetCampaign);
    }

    // 4. Validate survey questions if public survey (tenant-scoped)
    if (event.type === 'public_survey') {
      const activeQuestions = SurveySequentialEngine.resolveActiveQuestions(eventId, clientId);
      if (!activeQuestions || activeQuestions.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot start survey: Public Survey has no active questions. Please add at least one question before starting.',
        });
      }
    }

    // 5. Update the call queue with all event contacts (if Marriage campaign already running, reuse existing queue cleanly)
    const existingJobs = callbridgeStorage.getCallJobs(targetCampaign.id);
    const queuedJobs =
      event.type === 'marriage_event' && wasAlreadyRunning && existingJobs.length > 0
        ? existingJobs
        : queueManager.createCampaignJobs(targetCampaign.id, eventId, eventContacts.map((c) => c.id));

    // 6. Begin sequential outbound calling immediately (idempotent if already calling)
    const startResult = queueManager.startCampaign(targetCampaign.id);
    const updatedCampaign = callbridgeStorage.getCampaign(targetCampaign.id) || targetCampaign;

    return res.json({
      success: true,
      alreadyRunning: wasAlreadyRunning,
      message: wasAlreadyRunning
        ? 'Marriage Event sequential calling is already active for this event.'
        : `Calling queue updated with ${eventContacts.length} contacts. Sequential calling started.`,
      campaign: updatedCampaign,
      queuedJobsCount: queuedJobs.length,
      startResult,
    });
  } catch (err: any) {
    console.error('Error in proceed-with-data:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to proceed with data' });
  } finally {
    if (lockedMarriageStart) {
      marriageStartLocks.delete(marriageLockKey);
    }
  }
});

callbridgeRouter.post('/events/:id/sequence/start', async (req: AuthenticatedRequest, res) => {
  const eventId = String(req.params.id);
  const access = assertEventAccess(req, res, eventId);
  if (!access) return;
  const { clientId, event } = access;
  const marriageLockKey = `${clientId}:${eventId}`;
  let lockedMarriageStart = false;
  try {
    if (event.type === 'marriage_event') {
      if (marriageStartLocks.has(marriageLockKey)) {
        const runningCamp = callbridgeStorage.getCampaigns(eventId, clientId).find((c) => c.status === 'running');
        if (runningCamp) {
          return res.json({
            success: true,
            alreadyRunning: true,
            message: 'Marriage Event sequential calling is already running.',
            campaign: runningCamp,
            queuedJobsCount: callbridgeStorage.getCallJobs(runningCamp.id).length,
          });
        }
      }
      marriageStartLocks.add(marriageLockKey);
      lockedMarriageStart = true;
    }

    // 1. Pre-flight SaaS Subscription and Duration Check
    const eligibility = callbridgeStorage.checkCallEligibility(clientId);
    if (!eligibility.allowed) {
      return res.status(402).json({
        success: false,
        error: 'Your available call duration has been exhausted. Please upgrade your plan in the Upgrade section.',
        upgradeRequired: true,
        reason: eligibility.reason,
      });
    }

    // 2. Fetch all valid, authorized contacts for THIS customer & event
    const contacts = callbridgeStorage.getContacts(eventId, clientId).filter(
      (c) => !c.optOut && c.consentStatus !== 'revoked'
    );
    if (contacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid target contacts found for this event. Please add or import contacts before starting the sequence.',
      });
    }

    // 2b. Validate public survey has active questions (tenant-scoped)
    if (event.type === 'public_survey') {
      const activeQuestions = SurveySequentialEngine.resolveActiveQuestions(eventId, clientId);
      if (!activeQuestions || activeQuestions.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot start survey: Public Survey has no active questions. Please add at least one question before starting.',
        });
      }
    }

    // 3. Find existing running (for Marriage Event idempotency) or draft/paused campaign for THIS customer
    let targetCampaign = req.body?.campaignId ? callbridgeStorage.getCampaign(req.body.campaignId) : null;
    if (targetCampaign && (!isValidTenantId(targetCampaign.clientId) || targetCampaign.clientId !== clientId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Campaign belongs to another customer or has unverified ownership',
      });
    }
    if (!targetCampaign) {
      const existingCampaigns = callbridgeStorage.getCampaigns(eventId, clientId);
      targetCampaign =
        (event.type === 'marriage_event'
          ? existingCampaigns.find((c) => c.status === 'running')
          : null) ||
        existingCampaigns.find((c) => c.status === 'draft' || c.status === 'paused') ||
        null;
    }

    const wasAlreadyRunning = Boolean(targetCampaign && targetCampaign.status === 'running');

    const now = new Date().toISOString();
    if (!targetCampaign) {
      targetCampaign = {
        id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        clientId,
        eventId,
        name: `${event.name} Sequential Calling Batch`,
        status: 'draft',
        concurrencyLimit: 1,
        totalContacts: contacts.length,
        processedCount: 0,
        completedCount: 0,
        failedCount: 0,
        optOutCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      callbridgeStorage.saveCampaign(targetCampaign);
    }

    // 4. Ensure queue jobs exist for the target contacts (strictly scoped to this customer's contacts)
    let jobs = callbridgeStorage.getCallJobs(targetCampaign.id);
    const hasOpenJobs = jobs.some(
      (j) =>
        j.status === 'pending' ||
        j.status === 'initiating' ||
        j.status === 'calling' ||
        j.status === 'ringing' ||
        j.status === 'in_progress'
    );
    const ownedContactIdSet = new Set(contacts.map((c) => c.id));
    const requestedContactIds = Array.isArray(req.body?.selectedContactIds)
      ? req.body.selectedContactIds.filter((id: string) => ownedContactIdSet.has(id))
      : contacts.map((c) => c.id);

    if (jobs.length === 0 || (!hasOpenJobs && !wasAlreadyRunning && jobs.every((j) => ['completed', 'failed', 'cancelled'].includes(j.status)))) {
      jobs = queueManager.createCampaignJobs(
        targetCampaign.id,
        eventId,
        requestedContactIds.length > 0 ? requestedContactIds : contacts.map((c) => c.id)
      );
    }

    // 5. Begin sequential outbound calling immediately (idempotent if already active)
    const startResult = queueManager.startCampaign(targetCampaign.id);
    const updatedCampaign = callbridgeStorage.getCampaign(targetCampaign.id) || targetCampaign;

    return res.json({
      success: true,
      alreadyRunning: wasAlreadyRunning,
      message: wasAlreadyRunning
        ? 'Sequential calling is already running for this Marriage Event.'
        : `Sequential calling started successfully with ${contacts.length} queued contacts.`,
      campaign: updatedCampaign,
      queuedJobsCount: jobs.length,
      startResult,
    });
  } catch (err: any) {
    console.error('Error in sequence start:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to start sequence' });
  } finally {
    if (lockedMarriageStart) {
      marriageStartLocks.delete(marriageLockKey);
    }
  }
});

callbridgeRouter.post('/events/:id/campaigns/:campaignId/start', (req: AuthenticatedRequest, res) => {
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const campaign = callbridgeStorage.getCampaign(req.params.campaignId);
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'Campaign not found' });
  }
  if (!isValidTenantId(campaign.clientId) || campaign.clientId !== clientId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Campaign belongs to another customer or has unverified ownership',
    });
  }
  const eligibility = callbridgeStorage.checkCallEligibility(clientId);
  if (!eligibility.allowed) {
    return res.status(402).json({
      success: false,
      error: 'Your available call duration has been exhausted. Please upgrade your plan in the Upgrade section.',
      upgradeRequired: true,
      reason: eligibility.reason,
    });
  }

  // Auto-populate jobs if campaign currently has no jobs
  let jobs = callbridgeStorage.getCallJobs(campaign.id);
  if (jobs.length === 0) {
    const contacts = callbridgeStorage.getContacts(campaign.eventId, clientId).filter(
      (c) => !c.optOut && c.consentStatus !== 'revoked'
    );
    if (contacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid contacts found for this campaign. Please add or import contacts before starting.',
      });
    }
    jobs = queueManager.createCampaignJobs(campaign.id, campaign.eventId, contacts.map((c) => c.id));
  }

  const event = campaign.eventId ? callbridgeStorage.getEvent(campaign.eventId, clientId) : null;
  if (event?.type === 'public_survey') {
    const activeQuestions = SurveySequentialEngine.resolveActiveQuestions(campaign.eventId, clientId);
    if (!activeQuestions || activeQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot start survey: Public Survey has no active questions. Please add at least one question before starting.',
      });
    }
  }

  const result = queueManager.startCampaign(req.params.campaignId);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.message,
    });
  }
  const updatedCampaign = callbridgeStorage.getCampaign(campaign.id) || campaign;
  res.json({
    success: true,
    message: result.message || 'Sequential calling started successfully',
    campaign: updatedCampaign,
    queuedJobsCount: jobs.length,
    result,
  });
});

callbridgeRouter.post('/events/:id/campaigns/:campaignId/pause', (req, res) => {
  const result = queueManager.pauseCampaign(req.params.campaignId);
  const campaign = callbridgeStorage.getCampaign(req.params.campaignId);
  res.json({ ...result, campaign });
});

// Continue / Resume queue
callbridgeRouter.post('/events/:id/campaigns/:campaignId/resume', (req, res) => {
  const result = queueManager.resumeCampaign(req.params.campaignId);
  const campaign = callbridgeStorage.getCampaign(req.params.campaignId);
  res.json({ ...result, campaign });
});

// Stop queue (preserves ongoing active call, stops placing new calls)
callbridgeRouter.post('/events/:id/campaigns/:campaignId/stop', (req, res) => {
  const result = queueManager.stopCampaign(req.params.campaignId);
  const campaign = callbridgeStorage.getCampaign(req.params.campaignId);
  res.json({ ...result, campaign });
});

// Cancel queue (cancels pending calls, terminates active call via provider API)
callbridgeRouter.post('/events/:id/campaigns/:campaignId/cancel', async (req, res) => {
  const result = await queueManager.cancelCampaign(req.params.campaignId);
  const campaign = callbridgeStorage.getCampaign(req.params.campaignId);
  res.json({ ...result, campaign });
});

callbridgeRouter.delete('/events/:id/campaigns/:campaignId', (req, res) => {
  const success = callbridgeStorage.deleteCampaign(req.params.campaignId);
  res.json({ success });
});

callbridgeRouter.delete('/campaigns/:campaignId', (req, res) => {
  const success = callbridgeStorage.deleteCampaign(req.params.campaignId);
  res.json({ success });
});

callbridgeRouter.get('/events/:id/campaigns/:campaignId/jobs', (req, res) => {
  const event = callbridgeStorage.getEvent(req.params.id);
  const campaign = callbridgeStorage.getCampaign(req.params.campaignId);
  if (event?.type === 'marriage_event' && (campaign?.status === 'completed' || campaign?.status === 'cancelled')) {
    return res.json({ success: true, jobs: [] });
  }
  const jobs = callbridgeStorage.getCallJobs(req.params.campaignId);
  res.json({ success: true, jobs });
});

callbridgeRouter.post('/events/:id/campaigns/:campaignId/jobs/:jobId/retry', (req, res) => {
  const job = callbridgeStorage.getCallJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Call job not found' });
  }
  const campaign = callbridgeStorage.getCampaign(req.params.campaignId);
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'Campaign not found' });
  }

  job.status = 'pending';
  job.failureReason = undefined;
  job.retryCount = (job.retryCount || 0) + 1;
  job.updatedAt = new Date().toISOString();
  callbridgeStorage.saveCallJob(job);

  if (campaign.status === 'completed' || campaign.status === 'paused' || campaign.status === 'stopped') {
    queueManager.startCampaign(campaign.id);
  } else {
    queueManager.processNext(campaign.id);
  }

  res.json({ success: true, message: 'Job queued for retry', job });
});

// Tenant-scoped independent queue status endpoints (never exposes other customers' queues)
callbridgeRouter.get('/queue-status', (req: AuthenticatedRequest, res) => {
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const eventId = typeof req.query.eventId === 'string' ? req.query.eventId.trim() : undefined;
  res.json({
    success: true,
    ...queueManager.getTenantQueueStatus(clientId, eventId || undefined),
  });
});

callbridgeRouter.get('/events/:id/queue-status', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  res.json({
    success: true,
    ...queueManager.getTenantQueueStatus(access.clientId, req.params.id),
  });
});

callbridgeRouter.get('/events/:id/call-history', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const event = access.event;
  const isZeroHistoryModule =
    event?.type === 'political_campaign' ||
    event?.type === 'political_survey' ||
    event?.type === 'marriage_event';
  if (isZeroHistoryModule) {
    // Zero-PII: Political Campaign & Marriage Event never retain or expose individual call histories
    return res.json({ success: true, jobs: [] });
  }

  const jobs = callbridgeStorage.getCallJobsByEvent(req.params.id, access.clientId);
  const sanitizedJobs = jobs.map((j) => ({
    id: j.id,
    eventId: j.eventId,
    campaignId: j.campaignId,
    status: j.status,
    durationSeconds: j.durationSeconds || 0,
    dtmfDigitReceived: j.dtmfDigitReceived,
    dtmfOptionLabel: j.dtmfOptionLabel,
    rsvpStatus: j.rsvpStatus,
    failureReason: j.failureReason,
    startedAt: j.startedAt,
    endedAt: j.endedAt,
    createdAt: j.createdAt,
    contactName: 'Anonymized Respondent',
    contactPhone: '***',
  }));
  res.json({ success: true, jobs: sanitizedJobs });
});

// DTMF Keypad Capture & Instant Termination endpoint
callbridgeRouter.post('/calls/:callId/dtmf', async (req, res) => {
  try {
    const { callId } = req.params;
    const digit = String(req.body.digit || req.body.digits || '').trim();
    if (!digit) {
      return res.status(400).json({ success: false, error: 'Digit is required' });
    }

    const job = callbridgeStorage.getCallJob(callId) || callbridgeStorage.getCallJobByProviderId(callId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Call job not found' });
    }

    const now = new Date().toISOString();
    const isOne = digit === '1';
    const isTwo = digit === '2';
    const event = callbridgeStorage.getEvent(job.eventId);
    const resolvedType = event?.type || (job as any).moduleType || 'political_campaign';

    job.dtmfDigitReceived = digit;
    let terminated = false;
    let terminationResult: any = null;

    if (resolvedType === 'marriage_event') {
      if (isOne || isTwo) {
        terminated = true;
        job.rsvpStatus = isOne ? 'attending' : 'not_attending';
        job.dtmfOptionLabel = isOne ? 'Attending (Keypad 1)' : 'Not Attending (Keypad 2)';
        callbridgeStorage.recordEventCallOutcome(job.eventId, {
          callId: job.id,
          eventType: 'marriage_event',
          marriageRsvp: isOne ? 'YES' : 'NO',
          dtmfDigit: isOne ? '1' : '2',
          isAnswered: true,
        });

        const targetProviderId = job.providerCallId || job.id;
        terminationResult = await VapiService.terminateCall(
          targetProviderId,
          job.metadata?.controlUrl,
          job.metadata?.controlAuthenticationEnabled
        );
      } else {
        console.log(`[MARRIAGE_DTMF_IGNORED] Non-1/2 digit received: ${digit}`);
      }
      return res.json({ success: true, digit, label: job.dtmfOptionLabel, job, terminated, terminationResult });
    }

    if (resolvedType === 'political_campaign' || resolvedType === 'political_survey') {
      if (isOne || isTwo) {
        terminated = true;
        // Record anonymous aggregate outcome with valid responses denominator tracking
        callbridgeStorage.recordPoliticalKeypadOutcome(job.eventId, job.id, isOne ? '1' : '2', job.campaignId);
        callbridgeStorage.saveCallJob(job);

        const targetProviderId = job.providerCallId || job.id;
        terminationResult = await VapiService.terminateCall(
          targetProviderId,
          job.metadata?.controlUrl,
          job.metadata?.controlAuthenticationEnabled
        );
      } else {
        // Digits other than 1 and 2 do NOT increment counters or terminate call
        console.log(`[POLITICAL_DTMF_IGNORED] Non-1/2 digit received: ${digit}`);
      }
    } else if (resolvedType === 'public_survey') {
      job.dtmfOptionLabel = isOne ? 'Issue Reported' : isTwo ? 'No Issue Reported' : `Keypad ${digit}`;
      callbridgeStorage.recordEventCallOutcome(job.eventId, {
        callId: job.id,
        eventType: 'public_survey',
        surveyQuestionId: 'overall',
        surveyAnswer: isOne ? 'issue_reported' : 'no_issue',
      });
      callbridgeStorage.saveCallJob(job);
    }

    res.json({ success: true, digit, label: job.dtmfOptionLabel, job, terminated, terminationResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Call termination route
callbridgeRouter.post('/calls/:callId/terminate', async (req, res) => {
  const result = await VapiService.terminateCall(req.params.callId);
  if ((result as any)?.results) {
    return res.status(200).json({ results: (result as any).results, ...result });
  }
  res.json(result);
});

callbridgeRouter.delete('/calls/:callId', async (req, res) => {
  const result = await VapiService.terminateCall(req.params.callId);
  res.json(result);
});

// Transcript Retrieval Route
callbridgeRouter.get('/calls/:jobId/transcript', (req, res) => {
  const { jobId } = req.params;
  const job =
    callbridgeStorage.getCallJob(jobId) ||
    callbridgeStorage.getCallJobByProviderId(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Call record not found' });
  }

  res.json({
    success: true,
    jobId: job.id,
    providerCallId: job.providerCallId,
    contactName: job.contactName,
    contactPhone: job.contactPhone,
    status: job.status,
    durationSeconds: job.durationSeconds || 0,
    transcript: job.transcript || [],
    originalTranscript: job.originalTranscript || job.transcript || [],
    transcriptRevisions: job.transcriptRevisions || [],
    surveyAnswers: job.surveyAnswers || {},
    surveyState: job.surveyState || null,
    callbackDetails: job.callbackDetails || null,
    pdfDownloads: job.pdfDownloads || [],
  });
});

// Transcript Revision / Edit Route
callbridgeRouter.patch('/calls/:jobId/transcript', (req, res) => {
  const { jobId } = req.params;
  const { turnIndex, turnId, editedText, reason, revisedBy } = req.body;

  if (typeof editedText !== 'string' || !editedText.trim()) {
    return res.status(400).json({ success: false, error: 'editedText is required and cannot be empty.' });
  }

  const job =
    callbridgeStorage.getCallJob(jobId) ||
    callbridgeStorage.getCallJobByProviderId(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Call record not found' });
  }

  if (!Array.isArray(job.transcript) || job.transcript.length === 0) {
    return res.status(400).json({ success: false, error: 'Call has no transcript turns to edit.' });
  }

  // Preserve original transcript if not already stored
  if (!Array.isArray(job.originalTranscript) || job.originalTranscript.length === 0) {
    job.originalTranscript = JSON.parse(JSON.stringify(job.transcript));
  }

  let targetIdx = -1;
  if (typeof turnIndex === 'number' && turnIndex >= 0 && turnIndex < job.transcript.length) {
    targetIdx = turnIndex;
  } else if (turnId) {
    targetIdx = job.transcript.findIndex((t: any) => t.turnId === turnId);
  }

  if (targetIdx === -1) {
    return res.status(404).json({ success: false, error: 'Target transcript turn not found.' });
  }

  const prevText = job.transcript[targetIdx].text;
  const now = new Date().toISOString();

  // Record revision history
  if (!Array.isArray(job.transcriptRevisions)) {
    job.transcriptRevisions = [];
  }
  job.transcriptRevisions.push({
    editedAt: now,
    editor: revisedBy || 'User Admin',
    turnIndex: targetIdx,
    previousText: prevText,
    newText: editedText.trim(),
    reason: reason || 'Manual review transcription correction',
  });

  // Update current turn text
  job.transcript[targetIdx].text = editedText.trim();
  job.updatedAt = now;

  callbridgeStorage.saveCallJob(job);

  res.json({
    success: true,
    message: 'Transcript turn updated and revision history recorded.',
    transcript: job.transcript,
    transcriptRevisions: job.transcriptRevisions,
  });
});

// Transcript PDF Download Route (Native Telugu Unicode Rendering)
callbridgeRouter.get('/calls/:jobId/transcript.pdf', async (req, res) => {
  const { jobId } = req.params;
  const job =
    callbridgeStorage.getCallJob(jobId) ||
    callbridgeStorage.getCallJobByProviderId(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Call record not found' });
  }

  try {
    const pdfBuffer = await ExportService.generateSurveyTranscriptPdf(job);

    // Track PDF download
    if (!Array.isArray(job.pdfDownloads)) {
      job.pdfDownloads = [];
    }
    job.pdfDownloads.push({
      downloadedAt: new Date().toISOString(),
      count: job.pdfDownloads.length + 1,
    });
    callbridgeStorage.saveCallJob(job);

    const safePhone = (job.contactPhone || job.id).replace(/[^0-9a-zA-Z_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="survey_transcript_${safePhone}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('PDF generation error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to generate PDF' });
  }
});

// ==========================================
// 4. ANALYTICS & EXPORTS
// ==========================================
callbridgeRouter.get('/events/:id/analytics', async (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { clientId: tenantId, event } = access;
  const campaignId = (req.query.campaignId || req.query.campaign_id) as string | undefined;
  if (campaignId) {
    const targetCamp = callbridgeStorage.getCampaign(campaignId);
    if (targetCamp && (!isValidTenantId(targetCamp.clientId) || targetCamp.clientId !== tenantId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Campaign belongs to another customer or has unverified ownership',
      });
    }
    await queueManager.reconcileCampaign(campaignId);
  } else {
    const campaigns = callbridgeStorage.getCampaigns(req.params.id, tenantId);
    for (const camp of campaigns) {
      if (camp.status === 'running' || (camp.activeCalls ?? 0) > 0 || Boolean(camp.activeCallId)) {
        await queueManager.reconcileCampaign(camp.id);
      }
    }
  }
  const analytics = ExportService.exportAnalyticsJson(req.params.id, campaignId, tenantId);
  if (event?.type === 'marriage_event') {
    const marriageRsvp = analytics?.moduleSpecificMetrics?.marriageRsvp;
    console.log('[MARRIAGE_RSVP_DASHBOARD_DATA_RETURNED]', {
      campaignId: analytics?.campaignId || campaignId || req.params.id,
      attendingCount: marriageRsvp?.attendingCount ?? 0,
      notAttendingCount: marriageRsvp?.notAttendingCount ?? 0,
      maybeAttendingCount: marriageRsvp?.maybeCount ?? marriageRsvp?.maybeAttendingCount ?? 0,
    });
  }
  res.json({ success: true, analytics });
});

callbridgeRouter.get('/events/:id/campaigns/:campaignId/analytics', async (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const { clientId: tenantId, event } = access;
  await queueManager.reconcileCampaign(req.params.campaignId);
  const analytics = ExportService.exportAnalyticsJson(req.params.id, req.params.campaignId, tenantId);
  if (event?.type === 'marriage_event') {
    const marriageRsvp = analytics?.moduleSpecificMetrics?.marriageRsvp;
    console.log('[MARRIAGE_RSVP_DASHBOARD_DATA_RETURNED]', {
      campaignId: req.params.campaignId,
      attendingCount: marriageRsvp?.attendingCount ?? 0,
      notAttendingCount: marriageRsvp?.notAttendingCount ?? 0,
      maybeAttendingCount: marriageRsvp?.maybeCount ?? marriageRsvp?.maybeAttendingCount ?? 0,
    });
  }
  res.json({ success: true, analytics });
});

callbridgeRouter.post('/marriage/rsvp', (req: AuthenticatedRequest, res) => {
  const { campaignId, providerCallId, category } = req.body;
  if (!campaignId || !providerCallId || !category) {
    return res.status(400).json({ success: false, error: 'campaignId, providerCallId, and category are required' });
  }
  if (req.authUser) {
    const camp = callbridgeStorage.getCampaign(campaignId);
    if (camp && (!isValidTenantId(camp.clientId) || camp.clientId !== req.authUser.tenantId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Campaign belongs to another customer or has unverified ownership',
      });
    }
  }
  const result = VapiService.processStructuredMarriageRsvp(campaignId, providerCallId, category);
  res.json(result);
});

callbridgeRouter.get('/events/:id/export/contacts.csv', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const csv = ExportService.exportContactsCsv(req.params.id, access.clientId);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="contacts_${req.params.id}.csv"`);
  res.send(csv);
});

callbridgeRouter.get('/events/:id/export/contacts.xlsx', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const buffer = ExportService.exportContactsExcel(req.params.id, access.clientId);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="contacts_${req.params.id}.xlsx"`);
  res.send(buffer);
});

callbridgeRouter.get('/events/:id/export/contacts.pdf', async (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  try {
    const buffer = await ExportService.exportContactsPdf(req.params.id, access.clientId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contacts_${req.params.id}.pdf"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

callbridgeRouter.get('/events/:id/export/call-history.csv', (req: AuthenticatedRequest, res) => {
  const access = assertEventAccess(req, res, req.params.id);
  if (!access) return;
  const csv = ExportService.exportCallHistoryCsv(req.params.id, access.clientId);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="calls_${req.params.id}.csv"`);
  res.send(csv);
});

// Telephony & Vapi Webhook Route mounted inside /api/callbridge
callbridgeRouter.post('/vapi/webhook', async (req, res) => {
  const authCheck = VapiService.verifyWebhookAuth(req);
  if (!authCheck.authorized) {
    console.warn('[VAPI_WEBHOOK_AUTH_REJECTED]', {
      route: req.originalUrl,
      statusCode: authCheck.status,
      error: authCheck.error,
      ip: req.ip,
    });
    return res.status(authCheck.status).json({ error: authCheck.error });
  }

  // Validate payload
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Bad Request: Missing or invalid JSON body' });
  }

  const result = await VapiService.handleWebhook(req.body);
  if (result.job?.campaignId && result.isTerminal) {
    queueManager.onJobTerminal(result.job.campaignId, result.job.id, {
      isAnswered: result.job.status === 'completed',
      isNoAnswer: result.job.status === 'no_answer',
      isFailed: result.job.status === 'failed',
      status: result.job.status,
    });
  }
  if (result && Array.isArray((result as any).results)) {
    return res.status(200).json({ results: (result as any).results });
  }
  res.json(result);
});

// ==========================================
// 5. SHARED VOICE PROFILES REPOSITORY
// ==========================================
callbridgeRouter.get('/voice-profiles', (req: AuthenticatedRequest, res) => {
  const clientId = resolveTenantId(req);
  const eventType = (req.query.eventType as string) || (req.query.event_type as string) || undefined;
  const profiles = callbridgeStorage.getVoiceProfiles(clientId, eventType);
  res.json({ success: true, profiles });
});

callbridgeRouter.get('/additional-voices', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const probeTts = req.query.probe === '1' || req.query.probe === 'true';
    const result = await getVerifiedAdditionalVoices({ forceRefresh, probeTts });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to verify additional voices' });
  }
});

callbridgeRouter.post('/voice-profiles/approve', async (req: AuthenticatedRequest, res) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;
    const voiceId = (req.body?.voiceProfileId || req.body?.voice_id || req.body?.voiceId || req.body?.id || '').trim();
    const eventType = (req.body?.eventType || req.body?.event_type || '').trim();
    const eventId = (req.body?.eventId || req.body?.event_id || '').trim();

    if (!voiceId) {
      return res.status(400).json({ success: false, error: 'voiceId is required' });
    }

    const voiceAccess = await verifyVoiceProfileAccess(voiceId, clientId);
    if (!voiceAccess.allowed) {
      return res.status(403).json({
        success: false,
        error: voiceAccess.reason || 'Unauthorized: Voice profile does not belong to this user',
      });
    }
    const existing = voiceAccess.profile;
    if (existing && eventType && existing.eventType && existing.eventType !== eventType) {
      return res.status(400).json({
        success: false,
        error: `Event mismatch: Voice profile belongs to ${existing.eventType}, cannot approve for ${eventType}`,
      });
    }

    const resolvedEventType = eventType || existing?.eventType || 'public_survey';
    const updatedTenant = callbridgeStorage.setTenantApprovedVoice(clientId, voiceId, resolvedEventType, eventId);
    await voiceProfileStorage.approveVoice(clientId, voiceId, resolvedEventType, eventId).catch(() => null);

    console.log('[VOICE_APPROVAL_COMPLETED]', {
      clientId,
      eventType: resolvedEventType,
      eventId: eventId || null,
      voiceId,
      approvedVoiceName: updatedTenant?.approvedVoiceName || voiceId,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, tenant: updatedTenant, eventType: resolvedEventType });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5.1 VOICE SELECTION (DATABASE-MAPPED & EVENT-BOUND)
// ==========================================
callbridgeRouter.post('/voice-profiles/select', async (req: AuthenticatedRequest, res) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;
    const voiceProfileId = (req.body?.voiceProfileId || req.body?.voice_id || req.body?.voiceId || req.body?.id || '').trim();
    const eventType = (req.body?.eventType || req.body?.event_type || '').trim();
    const eventId = (req.body?.eventId || req.body?.event_id || '').trim();

    if (!voiceProfileId) {
      return res.status(400).json({ success: false, error: 'voiceProfileId is required' });
    }

    // 1. Retrieve voice profile from database
    const profile = callbridgeStorage.getVoiceProfile(voiceProfileId) || (await voiceProfileStorage.getProfileById(voiceProfileId));
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Voice profile not found in database' });
    }

    // 2. Verify authenticated user ownership (deny cross-tenant and unowned legacy profiles)
    const profileClientId = (profile as any).clientId || (profile as any).client_id || (profile as any).user_id;
    if (!isSharedPlatformVoice(voiceProfileId, profile) && (!isValidTenantId(profileClientId) || profileClientId !== clientId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Voice profile does not belong to this user account',
      });
    }

    // 3. Verify current event ownership/boundary
    if (eventType && profile.eventType && profile.eventType !== eventType) {
      return res.status(400).json({
        success: false,
        error: `Event mismatch: Voice profile belongs to '${profile.eventType}', cannot select for '${eventType}'`,
      });
    }

    // 4. Verify ElevenLabs Voice ID exists
    const elevenLabsVoiceId = (profile as any).elevenLabsVoiceId || (profile as any).providerVoiceId || (profile as any).voice_id;
    if (!elevenLabsVoiceId || typeof elevenLabsVoiceId !== 'string' || !elevenLabsVoiceId.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid voice profile: Missing ElevenLabs Voice ID' });
    }

    // 5. Verify the voice is approved
    const isApproved = profile.isApproved || (profile as any).approvalStatus === 'approved';
    if (!isApproved) {
      return res.status(400).json({
        success: false,
        error: 'Cannot select an unapproved voice profile. Please approve this voice profile before selecting it.',
      });
    }

    const resolvedEventType = (eventType || profile.eventType || 'public_survey') as any;

    // 6. Save the selected voice profile ID against the correct user and event
    const selectResult = callbridgeStorage.selectVoiceProfile(clientId, profile.id, resolvedEventType, eventId);
    if (!selectResult.success) {
      return res.status(400).json({ success: false, error: selectResult.error });
    }

    console.log('[VOICE_SELECTED_FOR_EVENT]', {
      clientId,
      eventType: resolvedEventType,
      eventId: eventId || selectResult.event?.id || null,
      voiceProfileId: profile.id,
      voiceName: (profile as any).name || (profile as any).voiceName,
      elevenLabsVoiceId,
    });

    res.json({
      success: true,
      selected: true,
      profile: selectResult.profile,
      event: selectResult.event,
      tenant: selectResult.tenant,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5.2 PRE-CALL DIAGNOSTICS ENDPOINT
// ==========================================
callbridgeRouter.post('/pre-call-diagnostics', async (req: AuthenticatedRequest, res) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;
    const eventType = (req.body?.eventType || 'public_survey').trim();
    const eventId = (req.body?.eventId || '').trim();
    const voiceProfileId = (req.body?.voiceProfileId || '').trim();

    // 1. Verify user exists
    const tenant = callbridgeStorage.getTenant(clientId);
    const userVerified = Boolean(tenant);

    // 2. Resolve voice profile (tenant-isolated)
    let profile: VoiceProfileRecord | undefined = undefined;
    if (voiceProfileId) {
      const voiceAccess = await verifyVoiceProfileAccess(voiceProfileId, clientId);
      if (!voiceAccess.allowed) {
        return res.status(403).json({
          success: false,
          valid: false,
          error: voiceAccess.reason || 'Forbidden: Voice profile belongs to another customer.',
        });
      }
      profile = callbridgeStorage.getVoiceProfile(voiceProfileId);
    }
    if (!profile && eventId) {
      const ev = callbridgeStorage.getEvent(eventId, clientId);
      if (ev?.selectedVoiceProfileId) {
        profile = callbridgeStorage.getVoiceProfile(ev.selectedVoiceProfileId);
      }
    }
    if (!profile) {
      profile = callbridgeStorage.getApprovedVoiceProfile(clientId, eventType, eventId);
    }

    if (!profile) {
      return res.json({
        success: true,
        valid: false,
        error: `No voice profile assigned or approved for ${eventType}. Please open Voice Studio to record and approve a voice first.`,
        diagnostics: {
          eventType,
          clientId,
          userVerified,
          voiceProfileFound: false,
        },
      });
    }

    // 3. User ownership
    const isShared = isSharedPlatformVoice(profile.providerVoiceId || profile.id, profile);
    const isOwner = isShared || (isValidTenantId(profile.clientId) && profile.clientId === clientId);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        valid: false,
        error: 'Forbidden: Voice profile belongs to another customer or has unverified ownership.',
        diagnostics: {
          eventType,
          clientId,
          userVerified,
          isOwner: false,
        },
      });
    }

    // 4. Event boundary check
    const eventMatch = !profile.eventType || profile.eventType === eventType;
    if (!eventMatch) {
      return res.json({
        success: true,
        valid: false,
        error: `Cross-event mismatch: Voice profile belongs to '${profile.eventType}', but call is for '${eventType}'.`,
        diagnostics: {
          eventType,
          profileEventType: profile.eventType,
          eventMatch: false,
        },
      });
    }

    // 5. Approval check
    const isApproved = Boolean(profile.isApproved || profile.approvalStatus === 'approved');
    if (!isApproved) {
      return res.json({
        success: true,
        valid: false,
        error: `Voice profile '${profile.name}' is not approved. Please click 'Approve Voice' in Voice Studio first.`,
        diagnostics: {
          eventType,
          voiceProfileName: profile.name,
          isApproved: false,
        },
      });
    }

    // 6. ElevenLabs Voice ID check
    const elevenLabsVoiceId = profile.elevenLabsVoiceId || profile.providerVoiceId;
    if (!elevenLabsVoiceId || elevenLabsVoiceId.startsWith('mock_') || elevenLabsVoiceId === '4XvBGCPMXWyVQa75dbZg') {
      return res.json({
        success: true,
        valid: false,
        error: `Invalid ElevenLabs Voice ID on profile '${profile.name}'.`,
        diagnostics: {
          eventType,
          voiceProfileName: profile.name,
          elevenLabsVoiceId,
          validFormat: false,
        },
      });
    }

    // 7. Verify voice exists and is accessible in ElevenLabs
    const elevenLabsCheck = await ElevenLabsService.verifyVoiceExists(elevenLabsVoiceId);
    if (!elevenLabsCheck.valid) {
      return res.json({
        success: true,
        valid: false,
        error: `ElevenLabs voice access check failed: ${elevenLabsCheck.error}`,
        diagnostics: {
          eventType,
          voiceProfileName: profile.name,
          elevenLabsVoiceId,
          elevenLabsAccessible: false,
          elevenLabsError: elevenLabsCheck.error,
        },
      });
    }

    // 8. Vapi config check
    const vapiConfig = VapiService.getConfigStatus();

    return res.json({
      success: true,
      valid: true,
      diagnostics: {
        eventType,
        clientId,
        userVerified,
        voiceProfileName: profile.name || profile.voiceName,
        voiceProfileId: profile.id,
        elevenLabsVoiceId,
        approvalStatus: 'approved',
        eventOwnershipValid: true,
        elevenLabsAccessVerified: true,
        vapiConfigured: vapiConfig.isConfigured,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


callbridgeRouter.delete('/voice-profiles/:id', async (req: AuthenticatedRequest, res: any) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;
    const { id } = req.params;
    const profile = callbridgeStorage.getVoiceProfile(id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Voice profile not found' });
    }
    if (!isValidTenantId(profile.clientId) || profile.clientId !== clientId) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: Cannot delete another user's or shared voice profile",
      });
    }

    // Attempt ElevenLabs deletion if provider is elevenlabs and not a protected voice
    let elevenLabsStatus: any = null;
    if (
      profile.provider === 'elevenlabs' &&
      profile.providerVoiceId &&
      profile.providerVoiceId !== '4XvBGCPMXWyVQa75dbZg'
    ) {
      try {
        elevenLabsStatus = await ElevenLabsService.deleteVoice(profile.providerVoiceId);
      } catch (e: any) {
        console.warn('ElevenLabs delete voice warning:', e.message);
      }
    }

    const deletion = callbridgeStorage.deleteVoiceProfile(id, clientId);
    if (!deletion.success) {
      return res.status(400).json({ success: false, error: deletion.error });
    }

    // Mirror deletion to voiceProfileStorage
    await voiceProfileStorage.deleteProfile(
      profile.elevenLabsVoiceId || profile.providerVoiceId || id,
      clientId
    ).catch(() => null);

    res.json({
      success: true,
      message: 'Voice profile deleted successfully',
      deletedId: id,
      elevenLabsStatus,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alias for clients that POST for deletion
callbridgeRouter.post('/voice-profiles/:id/delete', async (req: AuthenticatedRequest, res: any) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;
    const { id } = req.params;
    const profile = callbridgeStorage.getVoiceProfile(id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Voice profile not found' });
    }
    if (!isValidTenantId(profile.clientId) || profile.clientId !== clientId) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: Cannot delete another user's or shared voice profile",
      });
    }

    let elevenLabsStatus: any = null;
    if (
      profile.provider === 'elevenlabs' &&
      profile.providerVoiceId &&
      profile.providerVoiceId !== '4XvBGCPMXWyVQa75dbZg'
    ) {
      try {
        elevenLabsStatus = await ElevenLabsService.deleteVoice(profile.providerVoiceId);
      } catch (e: any) {
        console.warn('ElevenLabs delete voice warning:', e.message);
      }
    }

    const deletion = callbridgeStorage.deleteVoiceProfile(id, clientId);
    if (!deletion.success) {
      return res.status(400).json({ success: false, error: deletion.error });
    }

    // Mirror deletion to voiceProfileStorage
    await voiceProfileStorage.deleteProfile(
      profile.elevenLabsVoiceId || profile.providerVoiceId || id,
      clientId
    ).catch(() => null);

    res.json({
      success: true,
      message: 'Voice profile deleted successfully',
      deletedId: id,
      elevenLabsStatus,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

callbridgeRouter.post(
  '/voice-profiles/record-clone',
  (upload.any() as any),
  async (req: any, res: any) => {
    try {
      const name = (
        req.body.name ||
        req.body.voiceName ||
        req.body.voice_name ||
        req.body.profileName ||
        ''
      ).trim();

      const clientId = requireTenantId(req, res);
      if (!clientId) return;

      const provider = req.body.provider || 'elevenlabs';

      // Specific validation: Voice Name
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Voice Name is required. Please enter a name for your voice profile.',
          field: 'name',
        });
      }

      // Specific validation: Audio file
      const files = req.files as Express.Multer.File[] | undefined;
      const file =
        req.file ||
        (files && Array.isArray(files) && files.length > 0 ? files[0] : null);

      if (!file || !file.buffer || file.buffer.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Audio recording file is required. Please record a voice sample first.',
          field: 'audio',
        });
      }

      if (file.buffer.length < 500) {
        return res.status(400).json({
          success: false,
          error:
            'Audio recording is empty or corrupt. Please record at least 5 seconds of clear speech.',
          field: 'audio',
        });
      }

      const eventType = (req.body.eventType || req.body.event_type || 'public_survey').toString().trim();
      const eventId = (req.body.eventId || req.body.event_id || '').toString().trim();

      const apiKey = ElevenLabsService.getApiKey();
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error:
            'ELEVENLABS_API_KEY is not configured on the server. Please check environment configuration.',
        });
      }

      let providerVoiceId = '';
      try {
        const cloneRes = await ElevenLabsService.cloneVoice({
          clientId,
          userId: clientId,
          eventType,
          eventId,
          voiceName: name,
          audioBuffer: file.buffer,
          fileName: file.originalname || 'voice_sample.webm',
          mimeType: file.mimetype || 'audio/webm',
          description: `Authorized voice profile for client ${clientId} [${eventType}]: ${name}`,
        });
        providerVoiceId = cloneRes.voice_id;
      } catch (cloneErr: any) {
        console.warn('Voice cloning provider error:', cloneErr.message);
        return res.status(400).json({
          success: false,
          error: `ElevenLabs voice cloning failed: ${cloneErr.message}`,
        });
      }

      const now = new Date().toISOString();
      const profileId = `vp_${clientId}_${eventType}_${Date.now()}`;
      const newProfile = callbridgeStorage.saveVoiceProfile({
        id: profileId,
        clientId,
        eventType: eventType as any,
        eventId: eventId || undefined,
        name,
        voiceName: name,
        provider: provider,
        providerVoiceId,
        elevenLabsVoiceId: providerVoiceId,
        status: 'active',
        voiceStatus: 'ready',
        approvalStatus: 'pending_review',
        isApproved: false,
        languageCapabilities: ['te', 'hi', 'en'],
        createdAt: now,
        updatedAt: now,
        previewAudioUrl: `/api/voice-profile/preview-audio/${encodeURIComponent(providerVoiceId)}`,
      });

      // Synchronize with voiceProfileStorage
      await voiceProfileStorage.saveProfile({
        id: profileId,
        client_id: clientId,
        user_id: clientId,
        eventType,
        eventId: eventId || undefined,
        voiceName: name,
        voice_id: providerVoiceId,
        elevenLabsVoiceId: providerVoiceId,
        provider: 'elevenlabs',
        status: 'active',
        voice_status: 'ready',
        approvalStatus: 'pending_review',
        isApproved: false,
        created_at: now,
        updated_at: now,
        preview_audio_url: `/api/voice-profile/preview-audio/${encodeURIComponent(providerVoiceId)}`,
        metadata: {
          original_filename: file.originalname || 'voice_sample.webm',
          file_size_bytes: file.buffer.length,
          mime_type: file.mimetype || 'audio/webm',
          description: `Authorized voice profile for client ${clientId} [${eventType}]: ${name}`,
          elevenlabs_name: name,
          is_mock: false,
        },
      }).catch((e) => console.warn('Could not mirror voice profile to voiceProfileStorage:', e));

      console.log('[DATABASE_SAVE_SUCCESSFUL]', {
        clientId,
        eventType,
        eventId: eventId || null,
        voiceProfileId: newProfile.id,
        providerVoiceId,
        status: 'pending_review',
      });

      res.json({ success: true, profile: newProfile });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ==========================================
// 5.5 REAL TEST VOICE (TTS AUDIO GENERATION & STREAMING)
// ==========================================
callbridgeRouter.post('/test-voice', async (req: AuthenticatedRequest, res) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;

    const { text, voiceProfileId, eventId, language = 'te' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Approved script text is required for voice generation.',
      });
    }

    // 1. Resolve Voice Profile and verify strict tenant ownership
    let providerVoiceId = '';
    let profileName = 'Authorized Cloned Voice';
    let resolvedProfile: VoiceProfileRecord | undefined = undefined;

    if (voiceProfileId) {
      const voiceAccess = await verifyVoiceProfileAccess(String(voiceProfileId), clientId);
      if (!voiceAccess.allowed) {
        return res.status(403).json({
          success: false,
          error: voiceAccess.reason || 'Forbidden: Voice profile does not belong to this customer',
        });
      }
      if (voiceAccess.profile) {
        resolvedProfile = voiceAccess.profile;
        profileName = voiceAccess.profile.name || voiceAccess.profile.voiceName || profileName;
      }
      providerVoiceId = voiceAccess.providerVoiceId || String(voiceProfileId).trim();
    }

    if (!providerVoiceId && eventId) {
      const rawEvent = callbridgeStorage.getEvent(eventId);
      if (rawEvent && !isSharedDefaultEvent(eventId) && (!isValidTenantId(rawEvent.clientId) || rawEvent.clientId !== clientId)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Event belongs to another customer',
        });
      }
      const event = callbridgeStorage.getEvent(eventId, clientId);
      if (event?.selectedVoiceProfileId) {
        const voiceAccess = await verifyVoiceProfileAccess(event.selectedVoiceProfileId, clientId);
        if (voiceAccess.allowed) {
          resolvedProfile = voiceAccess.profile;
          providerVoiceId = voiceAccess.providerVoiceId || event.selectedVoiceProfileId;
          profileName = event.selectedVoiceName || voiceAccess.profile?.name || profileName;
        }
      }
    }

    // If still no voice profile resolved, check approved profile for THIS authenticated client only
    if (!providerVoiceId) {
      const approvedProfile = callbridgeStorage.getApprovedVoiceProfile(clientId);
      if (approvedProfile?.providerVoiceId && approvedProfile.providerVoiceId !== '4XvBGCPMXWyVQa75dbZg') {
        resolvedProfile = approvedProfile;
        providerVoiceId = approvedProfile.providerVoiceId;
        profileName = approvedProfile.name;
      }
    }

    // Populate verified metadata for Additional Voices if not yet cached
    if (providerVoiceId && isAdditionalVoiceId(providerVoiceId) && !getCachedAdditionalVoice(providerVoiceId)) {
      await getVerifiedAdditionalVoices().catch(() => null);
      const refreshed = callbridgeStorage.getVoiceProfile(providerVoiceId);
      if (refreshed) {
        resolvedProfile = refreshed;
        profileName = refreshed.name;
      }
    }

    // Guard: Never use Madhavi voice ID
    if (providerVoiceId === '4XvBGCPMXWyVQa75dbZg') {
      providerVoiceId = '';
    }

    // Require voice profile
    if (!providerVoiceId) {
      return res.status(400).json({
        success: false,
        error: 'No authorized voice profile selected. Please select or create an authorized voice profile in Voice Studio.',
      });
    }

    // 2. Check ElevenLabs API key
    const apiKey = ElevenLabsService.getApiKey();
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'ELEVENLABS_API_KEY is not configured on the server. Please provide a valid ElevenLabs API key to generate speech audio.',
      });
    }

    // 3. Clean and sanitize script for speech synthesis
    const cleanText = sanitizeScriptForSpeech(text.trim());
    if (!cleanText) {
      return res.status(400).json({
        success: false,
        error: 'The script contains unresolved placeholder tokens or empty speech text. Please complete the campaign fields.',
      });
    }

    const resolvedVoiceId = resolveVoiceId(providerVoiceId);

    console.log('[TEST_VOICE_REQUEST]', {
      clientId,
      voiceId: resolvedVoiceId,
      originalVoiceId: providerVoiceId,
      profileName,
      textLength: cleanText.length,
      language,
    });

    const customSettings = resolvedProfile
      ? {
          stability: resolvedProfile.stability,
          similarity_boost: resolvedProfile.similarityBoost,
          style: resolvedProfile.style,
          use_speaker_boost: resolvedProfile.speakerBoost,
          speed: resolvedProfile.speed,
        }
      : undefined;

    // 4. Synthesize actual speech with ElevenLabs (preserving campaign script text verbatim)
    const { buffer, contentType, isMock } = await ElevenLabsService.synthesizeSpeech(
      resolvedVoiceId,
      cleanText,
      resolvedProfile?.modelId,
      3,
      customSettings
    );

    // 5. Return actual audio buffer with proper MIME headers
    res.set({
      'Content-Type': contentType || 'audio/mpeg',
      'Content-Length': buffer.length,
      'X-Voice-Id': resolvedVoiceId,
      'X-Profile-Name': encodeURIComponent(profileName),
      'X-Is-Mock': isMock ? 'true' : 'false',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Accept-Ranges': 'bytes',
    });

    return res.send(buffer);
  } catch (err: any) {
    console.error('Error in /api/callbridge/test-voice:', err);
    const msg = err?.message || 'Please check your voice profile and API permissions.';
    const isValidation = msg.includes('does not support') || msg.includes('unavailable') || msg.includes('not accessible');
    return res.status(isValidation ? 422 : 502).json({
      success: false,
      error: isValidation ? msg : `Voice generation failed with provider: ${msg}`,
    });
  }
});

// GET direct audio endpoint for <audio src="..."> element embedding (strictly tenant-isolated)
callbridgeRouter.get('/test-voice-audio', async (req: AuthenticatedRequest, res) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;

    const text = ((req.query.text as string) || '').trim();
    const voiceProfileId = ((req.query.voiceProfileId as string) || '').trim();
    const eventId = ((req.query.eventId as string) || '').trim();

    if (!text) {
      return res.status(400).send('Text is required');
    }

    let providerVoiceId = '';
    if (voiceProfileId) {
      const voiceAccess = await verifyVoiceProfileAccess(voiceProfileId, clientId);
      if (!voiceAccess.allowed) {
        return res.status(403).json({
          success: false,
          error: voiceAccess.reason || 'Forbidden: Voice profile does not belong to this customer',
        });
      }
      providerVoiceId = voiceAccess.providerVoiceId || voiceProfileId;
    }
    if (!providerVoiceId && eventId) {
      const rawEvent = callbridgeStorage.getEvent(eventId);
      if (rawEvent && !isSharedDefaultEvent(eventId) && (!isValidTenantId(rawEvent.clientId) || rawEvent.clientId !== clientId)) {
        return res.status(403).json({ success: false, error: 'Forbidden: Event belongs to another customer' });
      }
      const event = callbridgeStorage.getEvent(eventId, clientId);
      if (event?.selectedVoiceProfileId) {
        const voiceAccess = await verifyVoiceProfileAccess(event.selectedVoiceProfileId, clientId);
        if (voiceAccess.allowed) {
          providerVoiceId = voiceAccess.providerVoiceId || event.selectedVoiceProfileId;
        }
      }
    }
    if (!providerVoiceId) {
      const clientProfiles = callbridgeStorage.getVoiceProfiles(clientId);
      if (clientProfiles.length > 0) providerVoiceId = clientProfiles[0].providerVoiceId;
    }
    if (!providerVoiceId) {
      return res.status(400).send('No voice profile available');
    }

    const cleanText = sanitizeScriptForSpeech(text);
    const resolvedVoiceId = resolveVoiceId(providerVoiceId);
    const { buffer, contentType } = await ElevenLabsService.synthesizeSpeech(resolvedVoiceId, cleanText);
    res.set({
      'Content-Type': contentType || 'audio/mpeg',
      'Content-Length': buffer.length,
      'X-Voice-Id': resolvedVoiceId,
      'Cache-Control': 'no-cache',
    });
    return res.send(buffer);
  } catch (err: any) {
    return res.status(502).send(err?.message || 'Voice synthesis failed');
  }
});

// ==========================================
// 5.6 REAL OUTBOUND PHONE CALL (VAPI + TWILIO + ELEVENLABS)
// ==========================================
callbridgeRouter.get('/telephony/config-status', (req, res) => {
  const status = VapiService.getConfigStatus();
  const hasElevenLabs = Boolean(ElevenLabsService.getApiKey() || status.hasElevenlabsCredential);
  const hasOpenAI = Boolean((process.env.OPENAI_MODEL_API_KEY || process.env.OPENAI_API_KEY)?.trim());
  res.json({
    success: true,
    ...status,
    vapiConfigured: status.isConfigured,
    phoneNumberConfigured: status.hasPhoneNumberId,
    assistantConfigured: status.hasAssistantId,
    elevenlabsConfigured: hasElevenLabs,
    openaiConfigured: hasOpenAI,
  });
});

callbridgeRouter.post('/telephony/config', (req: AuthenticatedRequest, res) => {
  if (req.authUser) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Shared platform telephony credentials cannot be modified by customer accounts.',
    });
  }
  const { apiKey, phoneNumberId, assistantId, elevenlabsCredentialId, privateApiKey, webhookSecret } = req.body;
  const effectiveApiKey = apiKey || privateApiKey;
  VapiService.setRuntimeConfig(effectiveApiKey, phoneNumberId, assistantId, elevenlabsCredentialId, webhookSecret);
  const status = VapiService.getConfigStatus();
  res.json({ success: true, message: 'Telephony credentials updated securely on server.', ...status });
});

callbridgeRouter.get('/telephony/phone-numbers', async (req: AuthenticatedRequest, res) => {
  if (req.authUser) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Shared platform telephony configuration is restricted to server administrators.',
    });
  }
  try {
    const phoneNumbers = await VapiService.listAccountPhoneNumbers();
    res.json({
      success: true,
      phoneNumbers,
      count: phoneNumbers.length,
      currentPhoneNumberId: VapiService.getPhoneNumberId() || null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to list phone numbers from Vapi.' });
  }
});

callbridgeRouter.get('/telephony/call-status/:callId', async (req: AuthenticatedRequest, res) => {
  try {
    const { callId } = req.params;
    if (!callId || callId === 'undefined' || callId === 'null') {
      return res.status(200).json({
        success: false,
        error: 'Invalid or missing call ID provided for status check.',
        isTerminal: true,
      });
    }

    const details = await VapiService.getCallStatus(callId);
    const isError = details.status === 'error';
    const resolvedJob = details.job || callbridgeStorage.getCallJob(callId) || callbridgeStorage.getCallJobByProviderId(callId);
    if (req.authUser && resolvedJob && (!isValidTenantId(resolvedJob.clientId) || resolvedJob.clientId !== req.authUser.tenantId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Call record belongs to another customer or has unverified ownership',
      });
    }

    return res.status(200).json({
      success: !isError,
      details,
      job: resolvedJob,
      isTerminal: Boolean(details.isTerminal),
      error: isError ? details.error : undefined,
    });
  } catch (err: any) {
    console.error('Error in /telephony/call-status:', err);
    return res.status(200).json({ success: false, error: err.message, isTerminal: true });
  }
});


callbridgeRouter.post('/test-phone-call', async (req: AuthenticatedRequest, res) => {
  let acquiredTestLeaseJobId: string | null = null;
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;

    const {
      eventId,
      phoneNumber,
      contactName = 'Test Recipient',
      script,
    } = req.body;

    if (!phoneNumber || !phoneNumber.trim()) {
      return res.status(400).json({ success: false, error: 'Phone number is required for test outbound call.' });
    }

    const { normalized, isValid } = ContactService.normalizePhoneNumber(phoneNumber);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format. Please enter a valid 10-digit mobile number.' });
    }

    // Pre-flight SaaS Subscription and Duration Check for Test Calls
    const eligibility = callbridgeStorage.checkCallEligibility(clientId, true);
    if (!eligibility.allowed) {
      return res.status(402).json({
        success: false,
        error: 'Your available call duration has been exhausted. Please upgrade your plan.',
        upgradeRequired: true,
        reason: eligibility.reason,
      });
    }

    const event = eventId ? callbridgeStorage.getEvent(eventId, clientId) : null;
    const eventType = (event?.type as any) || req.body.eventType || req.body.event_type || 'public_survey';
    const moduleType = eventType;

    // Pre-call validation: Resolve customer's approved ElevenLabs cloned voice for THIS event/eventType
    let requestedVoiceId = req.body.voiceProfileId || req.body.voiceId;
    let profile: VoiceProfileRecord | undefined = undefined;

    if (requestedVoiceId) {
      const voiceAccess = await verifyVoiceProfileAccess(String(requestedVoiceId), clientId);
      if (!voiceAccess.allowed) {
        return res.status(403).json({
          success: false,
          error: voiceAccess.reason || `Unauthorized: Voice profile does not belong to user account ${clientId}`,
        });
      }
      profile = callbridgeStorage.getVoiceProfile(requestedVoiceId);
    }

    if (!profile && event?.selectedVoiceProfileId) {
      profile = callbridgeStorage.getVoiceProfile(event.selectedVoiceProfileId);
    }

    if (!profile) {
      profile = callbridgeStorage.getApprovedVoiceProfile(clientId, eventType, event?.id);
    }

    if (!profile) {
      return res.status(400).json({
        success: false,
        error: `No approved voice profile found for ${eventType}. Please record and approve a cloned voice in Voice Studio before initiating phone calls.`,
      });
    }

    // Security check 1: Client ownership (Multi-user tenant isolation; deny unowned legacy non-shared voices)
    const isShared = isSharedPlatformVoice(profile.providerVoiceId || profile.id, profile);
    if (!isShared && (!isValidTenantId(profile.clientId) || profile.clientId !== clientId)) {
      return res.status(403).json({
        success: false,
        error: `Unauthorized: Voice profile does not belong to user account ${clientId}`,
      });
    }

    // Security check 2: Event type match (Strict multi-event isolation)
    if (profile.eventType && profile.eventType !== eventType) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Voice profile belongs to event type '${profile.eventType}', but call is being initiated from '${eventType}'. Cross-event voice calls are strictly forbidden.`,
      });
    }

    // Security check 3: Must be approved
    if (!profile.isApproved && profile.approvalStatus !== 'approved') {
      return res.status(400).json({
        success: false,
        error: `Voice profile '${profile.name}' is pending review and has not been approved for ${eventType}.`,
      });
    }

    const rawVoiceId = profile.providerVoiceId || profile.elevenLabsVoiceId || profile.id;
    const voiceId = ElevenLabsService.resolveVoiceId(rawVoiceId, { eventId: event?.id, eventType });
    const voiceName = profile.name || profile.voiceName || 'Approved Voice';

    // Guard: strictly forbid dummy, mock, or Madhavi reference voice IDs
    if (!voiceId || voiceId === '6wa317UxpFQae2t7ZA0Y' || voiceId === '4XvBGCPMXWyVQa75dbZg' || voiceId.startsWith('mock_')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or mock voice profile ID. Please record and approve a valid voice sample.',
      });
    }

    // Structured diagnostic tag [VOICE]
    console.log('[VOICE]', {
      eventType,
      eventId: event?.id || eventId || null,
      userId: clientId,
      voiceProfileId: profile.id,
      elevenLabsVoiceId: voiceId,
      rawVoiceId,
      isApproved: Boolean(profile.isApproved || profile.approvalStatus === 'approved'),
    });

    const activeScript = sanitizeScriptForSpeech(
      script || event?.config?.approvedScript || event?.config?.renderedScript || 'నమస్కారం! ఇది కాల్‌బ్రిడ్జ్ టెస్ట్ కాల్.'
    );

    // Pre-call ElevenLabs access verification check
    const verification = await ElevenLabsService.verifyVoiceExists(voiceId);
    if (!verification.valid) {
      console.error('[ELEVENLABS_VOICE_VERIFICATION_REJECTED]', {
        voiceId,
        voiceName,
        error: verification.error,
      });
      return res.status(400).json({
        success: false,
        error: `ElevenLabs voice validation failed for '${voiceName}' (${voiceId}): ${verification.error}. Outbound call blocked to prevent immediate carrier failure.`,
      });
    }

    const rawHost = req.get('host') || '';
    const isLocal = rawHost.includes('localhost') || rawHost.includes('127.0.0.1');
    const appBaseUrl = rawHost ? `${isLocal ? req.protocol : 'https'}://${rawHost}` : undefined;

    // Enforce per-tenant active-call lock & shared provider capacity for test calls too
    const preLeaseJobId = `test_call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const slotResult = providerCapacityController.tryAcquire(clientId, preLeaseJobId, 'test_campaign_direct');
    if (!slotResult.acquired) {
      if (slotResult.reason === 'tenant_busy') {
        return res.status(409).json({
          success: false,
          error: 'Another outbound call is already active on your account. Please wait for it to finish before placing a test call.',
        });
      }
      return res.status(429).json({
        success: false,
        error: 'Shared calling line is currently at full provider capacity. Please retry shortly.',
      });
    }
    acquiredTestLeaseJobId = preLeaseJobId;

    // Structured diagnostic tag [VAPI] (pre-dispatch)
    console.log('[VAPI]', {
      callId: null,
      to: normalized,
      voiceId,
      moduleType,
      status: 'dispatching',
    });

    const vapiResult = await VapiService.createOutboundCall({
      phoneNumber: normalized,
      contactName: contactName.trim(),
      voiceId,
      voiceName,
      moduleType,
      script: activeScript,
      language: event?.language || 'te',
      dtmfOptions: event?.config?.dtmfOptions || [],
      campaignId: 'test_campaign_direct',
      eventId: eventId || 'event_test',
      contactId: 'contact_test',
      clientId,
      userId: clientId,
      appBaseUrl,
      maxDurationSeconds: eligibility.maxPermittedSeconds,
    });

    // Bind active lease to the actual created job/provider call ID so terminal webhooks release it cleanly
    const actualJobId = vapiResult.callId || preLeaseJobId;
    if (actualJobId !== preLeaseJobId) {
      providerCapacityController.releaseOnConfirmedTerminal(preLeaseJobId);
      providerCapacityController.restoreLeaseFromPersistence({
        jobId: actualJobId,
        tenantId: clientId,
        campaignId: 'test_campaign_direct',
        providerCallId: vapiResult.providerCallId || undefined,
        state: 'active',
      });
    } else if (vapiResult.providerCallId) {
      providerCapacityController.attachProviderCallId(preLeaseJobId, vapiResult.providerCallId);
    }
    acquiredTestLeaseJobId = null;

    // Structured diagnostic tag [VAPI] (post-dispatch)
    console.log('[VAPI]', {
      callId: vapiResult.callId,
      to: normalized,
      voiceId,
      moduleType,
      status: vapiResult.status || 'dispatched',
    });

    const job = vapiResult.callId ? callbridgeStorage.getCallJob(vapiResult.callId) : undefined;

    return res.json({
      success: true,
      message: vapiResult.message || `Outbound phone call dispatched to ${normalized}.`,
      providerCallId: vapiResult.providerCallId,
      callId: vapiResult.callId,
      job,
      isSimulated: vapiResult.isSimulated,
      voiceId,
      voiceName,
      eventType,
    });
  } catch (err: any) {
    if (acquiredTestLeaseJobId) {
      if (err?.isRateLimit || err?.statusCode === 429) {
        providerCapacityController.recordProviderRateLimit(acquiredTestLeaseJobId, err?.retryAfterMs);
      } else {
        providerCapacityController.releaseOnConfirmedTerminal(acquiredTestLeaseJobId);
      }
    }
    console.error('Error in /test-phone-call:', err);
    return res.status(err?.statusCode === 429 ? 429 : 500).json({ success: false, error: err?.message || 'Failed to place test phone call' });
  }
});

// ==========================================
// SAAS SUBSCRIPTION & DURATION BILLING APIS
// ==========================================

// Get available subscription plans
callbridgeRouter.get('/billing/plans', (req, res) => {
  const plans = callbridgeStorage.getPlanConfigs();
  res.json({ success: true, plans: Object.values(plans) });
});

// Get user subscription details and current balance
callbridgeRouter.get('/billing/subscription', (req: AuthenticatedRequest, res) => {
  const requestedUserId = (req.query?.userId as string) || (req.query?.clientId as string);
  if (req.authUser && requestedUserId && requestedUserId !== req.authUser.tenantId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot access another customer subscription' });
  }
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const subscription = callbridgeStorage.getSubscription(clientId);
  const plan = callbridgeStorage.getPlanConfig(subscription.planId);
  const transactions = callbridgeStorage.getUsageTransactions(clientId);
  const testingMode = callbridgeStorage.getTestingModeUsage(clientId);

  const totalCalls = transactions.length;
  const billedCalls = transactions.filter((t) => t.billingStatus === 'billed').length;

  res.json({
    success: true,
    subscription,
    plan,
    testingMode,
    usage: {
      totalSeconds: subscription.totalSeconds,
      usedSeconds: subscription.usedSeconds,
      remainingSeconds: subscription.remainingSeconds,
      formattedPurchased: formatDurationSecs(subscription.totalSeconds),
      formattedUsed: formatDurationSecs(subscription.usedSeconds),
      formattedRemaining: formatDurationSecs(subscription.remainingSeconds),
      percentUsed: subscription.totalSeconds > 0
        ? Math.min(100, Math.round((subscription.usedSeconds / subscription.totalSeconds) * 100))
        : 100,
      totalCalls,
      billedCalls,
      completedTestCalls: testingMode.completedTestCalls,
      isTestingModeActive: testingMode.active,
      freeCallsUsed: subscription.freeCallsUsed,
      freeCallsAllowed: subscription.freeCallsAllowed,
    },
    recentTransactions: transactions.slice(0, 10),
  });
});

// Helper for UI duration representation
function formatDurationSecs(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(s / 60);
  const remSecs = s % 60;
  if (mins === 0) return `${remSecs}s`;
  if (remSecs === 0) return `${mins}m`;
  return `${mins}m ${remSecs}s`;
}

// Create a payment order for upgrade
callbridgeRouter.post('/billing/order', (req: AuthenticatedRequest, res) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;
    const { planId } = req.body;
    if (!planId || !['pro', 'max_pro'].includes(planId)) {
      return res.status(400).json({ success: false, error: 'Valid planId (pro or max_pro) is required' });
    }

    const order = callbridgeStorage.createPaymentOrder(clientId, planId);
    res.json({ success: true, order });
  } catch (err: any) {
    console.error('Error in /billing/order:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify payment signature and activate plan credits
callbridgeRouter.post('/billing/verify', (req: AuthenticatedRequest, res) => {
  try {
    const clientId = requireTenantId(req, res);
    if (!clientId) return;
    const { orderId, paymentId, signature, planId } = req.body;
    if (!orderId || !paymentId || !planId) {
      return res.status(400).json({ success: false, error: 'orderId, paymentId, and planId are required' });
    }

    const result = callbridgeStorage.verifyPaymentAndActivate({
      userId: clientId,
      orderId,
      paymentId,
      signature,
      planId,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error in /billing/verify:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin endpoint to update plan configuration
callbridgeRouter.put('/billing/admin/plans/:planId', (req: AuthenticatedRequest, res) => {
  if (req.authUser) {
    return res.status(403).json({ success: false, error: 'Forbidden: Customer accounts cannot modify platform plans' });
  }
  try {
    const planId = req.params.planId as any;
    if (!['free', 'pro', 'max_pro'].includes(planId)) {
      return res.status(400).json({ success: false, error: 'Invalid planId' });
    }
    const updated = callbridgeStorage.updatePlanConfig(planId, req.body);
    res.json({ success: true, plan: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Usage audit history
callbridgeRouter.get('/billing/transactions', (req: AuthenticatedRequest, res) => {
  const requestedUserId = (req.query?.clientId as string) || (req.query?.userId as string);
  if (req.authUser && requestedUserId && requestedUserId !== req.authUser.tenantId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot access another customer billing transactions' });
  }
  const clientId = requireTenantId(req, res);
  if (!clientId) return;
  const transactions = callbridgeStorage.getUsageTransactions(clientId);
  res.json({ success: true, transactions });
});

// ==========================================
// 6. CALL HISTORY & STATISTICS (MULTI-TENANT)
// ==========================================
callbridgeRouter.get('/calls', (req: AuthenticatedRequest, res) => {
  const { eventId, campaignId, clientId: queryClientId } = req.query as {
    eventId?: string;
    campaignId?: string;
    clientId?: string;
  };
  const authTenantId = req.authUser?.tenantId;

  if (authTenantId && queryClientId && queryClientId !== authTenantId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot query another customer call history' });
  }
  if (authTenantId && campaignId) {
    const camp = callbridgeStorage.getCampaign(campaignId);
    if (camp && (!isValidTenantId(camp.clientId) || camp.clientId !== authTenantId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Campaign belongs to another customer or has unverified ownership',
      });
    }
  }

  const effectiveClientId = authTenantId || queryClientId;
  let jobs: CallJobRecord[] = [];

  if (campaignId) {
    jobs = callbridgeStorage.getCallJobs(campaignId);
    if (effectiveClientId) {
      jobs = jobs.filter((j) => j.clientId === effectiveClientId);
    }
  } else if (eventId) {
    jobs = callbridgeStorage.getCallJobsByEvent(eventId, effectiveClientId);
  } else if (effectiveClientId) {
    jobs = callbridgeStorage.getCallJobsByClient(effectiveClientId);
  } else {
    // Return all calls sorted by recent
    jobs = (Object.values((callbridgeStorage as any).data?.callJobs || {}) as CallJobRecord[]).sort(
      (a: CallJobRecord, b: CallJobRecord) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  res.json({ success: true, calls: jobs });
});

callbridgeRouter.get('/statistics', (req: AuthenticatedRequest, res) => {
  const { clientId: queryClientId, eventId } = req.query as { clientId?: string; eventId?: string };
  const authTenantId = req.authUser?.tenantId;
  if (authTenantId && queryClientId && queryClientId !== authTenantId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot query another customer statistics' });
  }
  const effectiveClientId = authTenantId || queryClientId;
  let jobs: CallJobRecord[] = Object.values((callbridgeStorage as any).data?.callJobs || {}) as CallJobRecord[];

  if (effectiveClientId) {
    jobs = jobs.filter((j) => j.clientId === effectiveClientId);
  }
  if (eventId) {
    jobs = jobs.filter((j) => j.eventId === eventId);
  }

  const totalCalls = jobs.length;
  const answeredCalls = jobs.filter((j) => j.status === 'completed' || (j.durationSeconds && j.durationSeconds > 0)).length;
  const failedCalls = jobs.filter((j) => j.status === 'failed').length;
  const inProgressCalls = jobs.filter((j) => j.status === 'in_progress').length;
  const noAnswerCalls = jobs.filter((j) => j.status === 'no_answer' || j.status === 'busy').length;

  // DTMF keypad counts
  const yesResponses = jobs.filter((j) => j.dtmfDigitReceived === '1').length;
  const noResponses = jobs.filter((j) => j.dtmfDigitReceived === '2').length;

  // Module-wise breakdown
  const moduleBreakdown: Record<string, number> = {
    public_survey: 0,
    political_campaign: 0,
    marriage_event: 0,
  };

  jobs.forEach((j) => {
    const ev = callbridgeStorage.getEvent(j.eventId, effectiveClientId);
    if (ev?.type && moduleBreakdown[ev.type] !== undefined) {
      moduleBreakdown[ev.type]++;
    }
  });

  res.json({
    success: true,
    totalCalls,
    answeredCalls,
    failedCalls,
    inProgressCalls,
    noAnswerCalls,
    yesResponses,
    noResponses,
    moduleBreakdown,
  });
});

callbridgeRouter.post('/telephony/webhook', (req, res) => {
  const authCheck = VapiService.verifyWebhookAuth(req);
  if (!authCheck.authorized) {
    console.warn('[TELEPHONY_WEBHOOK_AUTH_REJECTED]', {
      route: req.originalUrl,
      statusCode: authCheck.status,
      error: authCheck.error,
      ip: req.ip,
    });
    return res.status(authCheck.status).json({ success: false, error: authCheck.error });
  }
  const result = queueManager.handleTelephonyWebhook({
    callId: req.body?.call_id || req.body?.CallSid || req.body?.callId,
    status: req.body?.status || req.body?.CallStatus || 'completed',
    duration: req.body?.duration ? parseInt(req.body.duration, 10) : undefined,
    digits: req.body?.digits || req.body?.Digits,
    failureReason: req.body?.error_message || req.body?.errorMessage,
  });

  res.json(result);
});

// ==========================================
// 7. PURE CONVERSATIONAL MODEL ENDPOINT
// (For developers / headless API usage)
// ==========================================
callbridgeRouter.get('/model/info', (req, res) => {
  res.json({
    model_name: 'CallBridge Conversational Voice Model v3',
    version: '3.4.0',
    capabilities: [
      'Stateful Dialogue Memory & State Tracking',
      'Dynamic Follow-up Generation (Zero-hallucination)',
      'Multi-Language Authentic Script Generation (Telugu te, Hindi hi, English en)',
      'DTMF Interactive Keypad Collection Engine',
      'Instant Outbound Telephony Calling Queue',
    ],
    supported_languages: [
      { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
      { code: 'en', name: 'English', nativeName: 'English' },
    ],
    endpoints: {
      interact: 'POST /api/survey/interact',
      model_turn: 'POST /api/model/turn',
      events: 'GET /api/callbridge/events',
      voice_tts: 'POST /api/voice-profile/tts',
    },
  });
});

// ==========================================
// 8. AI ASSISTANT FOR CUSTOMIZED EVENTS
// ==========================================
callbridgeRouter.post('/ai-suggest-event', async (req, res) => {
  const { name, eventType = 'announcement', description = '', language = 'te' } = req.body;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const prompt = `You are an enterprise voice campaign architect for CallBridge AI.
The client wants to build a customized outbound voice campaign:
Event Name: ${name || 'Custom Outreach'}
Event Type / Purpose: ${eventType}
Event Description: ${description || 'Community and customer communication'}
Target Language: ${language} (te = Telugu, hi = Hindi, en = English)

CRITICAL ZERO-INVENTION RULES:
1. Provide a spoken greeting in ${language === 'te' ? 'authentic Telugu script' : language === 'hi' ? 'Hindi script' : 'English'}.
2. Provide a natural spoken campaign script template using {{placeholders}} like {{event_name}}, {{event_date}}, {{event_time}}, {{event_location}}, {{organization_name}}, {{recipient_name}}, {{custom_message}}.
   NEVER invent hardcoded facts like specific dates (e.g. "May 10th"), phone numbers, candidate names, or addresses. Always use clean {{placeholder}} tokens.
3. Suggest 3 to 6 dynamic conditional fields suitable for this exact event type. Each field must have:
   - key: snake_case string (e.g. "event_date", "venue_location", "registration_link", "discount_offer", "rsvp_contact")
   - label: Human-readable English label
   - placeholderText: Helpful hint
   - required: boolean
   - type: "text" | "textarea" | "date" | "time"
4. Suggest 0 to 2 optional follow-up questions if appropriate.
5. Provide a spoken closing message in ${language === 'te' ? 'authentic Telugu script' : language === 'hi' ? 'Hindi script' : 'English'}.

Respond ONLY with valid JSON in this exact structure:
{
  "greeting": "...",
  "customScript": "...",
  "suggestedFields": [
    { "key": "event_date", "label": "Event Date", "placeholderText": "e.g. Next Saturday", "required": true, "type": "date" }
  ],
  "suggestedQuestions": [
    { "id": "Q1", "text": "...", "category": "feedback", "allowFollowUp": true }
  ],
  "closingMessage": "..."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = response.text?.trim() || '{}';
      const parsed = JSON.parse(text);
      return res.json({ success: true, ...parsed });
    }
  } catch (err: any) {
    console.warn('Gemini AI suggest fallback:', err.message);
  }

  // Heuristic template fallback
  const isTelugu = language === 'te';
  const isHindi = language === 'hi';

  const defaultGreeting = isTelugu
    ? 'నమస్కారం అండి! ఒక ముఖ్యమైన సమాచారం కోసం కాల్ చేస్తున్నాము.'
    : isHindi
    ? 'नमस्ते! एक महत्वपूर्ण जानकारी के लिए कॉल किया गया है।'
    : 'Hello! Calling with an important announcement.';

  const defaultScript = isTelugu
    ? 'నమస్కారం! {{organization_name}} తరపున {{recipient_name}} గారికి తెలియజేస్తున్నాం. {{event_name}} కార్యక్రమం {{event_date}} నాడు {{event_time}} కు {{event_location}} లో జరుగుతుంది. {{custom_message}}'
    : isHindi
    ? 'नमस्ते! {{organization_name}} की ओर से {{recipient_name}} जी के लिए सूचना। {{event_name}} कार्यक्रम {{event_date}} को {{event_time}} बजे {{event_location}} में आयोजित किया जाएगा। {{custom_message}}'
    : 'Hello! Calling on behalf of {{organization_name}} for {{recipient_name}}. The {{event_name}} will take place on {{event_date}} at {{event_time}} at {{event_location}}. {{custom_message}}';

  const defaultClosing = isTelugu
    ? 'మీ సమయానికి చాలా ధన్యవాదాలు. శుభదినం!'
    : isHindi
    ? 'आपके समय के लिए धन्यवाद। आपका दिन शुभ हो!'
    : 'Thank you for your time. Have a wonderful day!';

  res.json({
    success: true,
    greeting: defaultGreeting,
    customScript: defaultScript,
    suggestedFields: [
      { key: 'organization_name', label: 'Organization / Company Name', placeholderText: 'e.g. Apex Community Forum', required: true, type: 'text' },
      { key: 'event_name', label: 'Event / Announcement Title', placeholderText: 'e.g. Annual General Assembly', required: true, type: 'text' },
      { key: 'event_date', label: 'Event Date', placeholderText: 'e.g. 24th November 2026', required: true, type: 'text' },
      { key: 'event_time', label: 'Event Time', placeholderText: 'e.g. 10:00 AM IST', required: true, type: 'text' },
      { key: 'event_location', label: 'Venue / Link', placeholderText: 'e.g. Community Hall / Virtual Meeting', required: true, type: 'text' },
      { key: 'custom_message', label: 'Main Announcement Details', placeholderText: 'Key details or agenda', required: true, type: 'textarea' },
    ],
    suggestedQuestions: [
      {
        id: 'Q1',
        text: isTelugu ? 'ఈ కార్యక్రమానికి మీరు హాజరు కాగలరా?' : isHindi ? 'क्या आप इस कार्यक्रम में शामिल हो सकेंगे?' : 'Will you be able to attend this event?',
        category: 'attendance',
        allowFollowUp: true,
      },
    ],
    closingMessage: defaultClosing,
  });
});

callbridgeRouter.post('/model/turn', async (req, res) => {
  const { prompt, language = 'te', context = [], eventId, questions = [] } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Resolve questions if eventId provided
  let activeQuestions = questions;
  if ((!activeQuestions || activeQuestions.length === 0) && eventId) {
    const evt = callbridgeStorage.getEvent(eventId);
    if (evt?.config?.questions && Array.isArray(evt.config.questions) && evt.config.questions.length > 0) {
      activeQuestions = evt.config.questions;
    }
  }

  // Sequential question flow for surveys
  if (activeQuestions && activeQuestions.length > 0) {
    // Count how many questions have already been asked in the conversation history
    const askedQuestionsCount = (context || []).filter(
      (m: any) => m.role === 'agent' && !m.text.includes('నమస్కారం అండి! పరీక్ష కాల్') && !m.text.includes('ప్రారంభమైంది')
    ).length;

    const nextIndex = askedQuestionsCount;
    if (nextIndex >= activeQuestions.length) {
      const completionReply =
        language === 'en'
          ? 'Thank you very much for answering all the questions. Your feedback has been recorded. Have a great day!'
          : language === 'hi'
          ? 'सभी प्रश्नों के उत्तर देने के लिए आपका बहुत-बहुत धन्यवाद। आपकी प्रतिक्रिया दर्ज कर ली गई है। आपका दिन शुभ हो!'
          : 'సర్వేలోని అన్ని ప్రశ్నలకు సమాధానాలు ఇచ్చినందుకు చాలా ధన్యవాదాలు అండి. మీ విలువైన అభిప్రాయాలను నమోదు చేశాం. సెలవు, శుభదినం!';
      return res.json({
        success: true,
        reply: completionReply,
        isCompleted: true,
        currentQuestionIndex: activeQuestions.length,
        language,
      });
    }

    const nextQ = activeQuestions[nextIndex];
    let ack = 'సరే అండి, మీ సమాధానం నమోదైంది.';
    if (language === 'en') ack = 'Understood, thank you.';
    else if (language === 'hi') ack = 'जी धन्यवाद, नोट कर लिया गया है।';

    const reply = `${ack} ${nextQ.text}`;
    return res.json({
      success: true,
      reply,
      isCompleted: false,
      currentQuestionIndex: nextIndex,
      currentQuestionId: nextQ.id,
      language,
    });
  }

  // Heuristic conversational generation
  const lower = prompt.toLowerCase();
  let reply = 'సరే అండి. మీ సమాచారం నమోదైంది. ఇంకేమైనా చెప్పగలరా?';
  if (language === 'en') {
    reply = 'Understood. Thank you for sharing your thoughts. Would you like to add anything else?';
  } else if (language === 'hi') {
    reply = 'जी धन्यवाद। आपकी बात नोट कर ली गई है। क्या आप कुछ और बताना चाहेंगे?';
  } else if (/నీరు|నీళ్లు|water/i.test(lower)) {
    reply = 'అవునా అండి, నీటి సమస్య గురించి అర్థమైంది. సాధారణంగా వారానికి ఎన్ని రోజులు సమస్య ఎదురవుతోంది?';
  } else if (/రోడ్లు|రోడ్డు|road/i.test(lower)) {
    reply = 'అలాగే అండి, రోడ్ల పరిస్థితిని గుర్తించాను. వర్షం సమయంలో నీరు నిలుస్తోందా?';
  }

  res.json({
    success: true,
    language,
    reply,
    latency_ms: 120,
    model: 'callbridge-agent-te-v3',
    timestamp: new Date().toISOString(),
  });
});
