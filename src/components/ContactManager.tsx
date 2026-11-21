import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  UserPlus,
  Upload,
  FileSpreadsheet,
  FileText,
  Search,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Check,
  ClipboardPaste,
  Edit2,
  X,
  CheckSquare,
  ChevronDown,
  Filter,
  CheckCircle,
  HelpCircle,
  Copy,
  ArrowRight,
  PhoneCall,
} from 'lucide-react';
import { ContactRecord } from '../types/callbridge';

interface ContactManagerProps {
  eventId: string;
  eventName: string;
  onSwitchToCalling?: (campaignId?: string) => void;
  namePhoneOnly?: boolean;
  isWizardContactFlow?: boolean;
}

export type ReviewStatusFilter = 'all' | 'valid' | 'invalid' | 'duplicate' | 'needs_review';

export function ContactManager({
  eventId,
  eventName,
  onSwitchToCalling,
  namePhoneOnly = false,
  isWizardContactFlow = false,
}: ContactManagerProps) {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);
  const [isConfirmingBulk, setIsConfirmingBulk] = useState(false);
  const [lastConfirmedBatch, setLastConfirmedBatch] = useState<{
    contactIds: string[];
    sourceFileNames: string[];
    count: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isQuickSelecting, setIsQuickSelecting] = useState(false);
  const [showQuickSelectMenu, setShowQuickSelectMenu] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [continueError, setContinueError] = useState<string | null>(null);

  // Manual Add Form
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newLocality, setNewLocality] = useState('');
  const [newConsent, setNewConsent] = useState<'granted' | 'unconfirmed'>('granted');
  const [addError, setAddError] = useState<string | null>(null);

  // Paste Multiple Numbers Form
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [isParsingPaste, setIsParsingPaste] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Edit Contact Modal (for directory contacts)
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocality, setEditLocality] = useState('');
  const [editConsent, setEditConsent] = useState<'granted' | 'unconfirmed'>('granted');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Upload Modal & Review Table Preview
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [lastUploadedFiles, setLastUploadedFiles] = useState<File[]>([]);
  const [reviewFilter, setReviewFilter] = useState<ReviewStatusFilter>('all');
  const [uploadPreview, setUploadPreview] = useState<{
    format?: string;
    uploadedFileNames?: string[];
    sourceFileName?: string;
    totalRows?: number;
    totalFound?: number;
    validCount?: number;
    invalidCount?: number;
    duplicateCount?: number;
    needsReviewCount?: number;
    needsColumnMapping?: boolean;
    availableHeaders?: string[];
    sampleRows?: Record<string, any>[];
    textSample?: string;
    error?: string;
    records: Array<{
      name: string;
      phone: string;
      rawPhone: string;
      email?: string;
      locality?: string;
      sourceFileName?: string;
      status: 'Valid' | 'Invalid' | 'Duplicate' | 'Needs Review';
      reason: string;
      isValid: boolean;
      isDuplicate: boolean;
      sourceLineIndex?: number;
    }>;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Inline edit state in Review Table
  const [editingReviewIdx, setEditingReviewIdx] = useState<number | null>(null);
  const [reviewEditName, setReviewEditName] = useState('');
  const [reviewEditPhone, setReviewEditPhone] = useState('');

  // Column Mapping state
  const [customNameCol, setCustomNameCol] = useState('');
  const [customPhoneCol, setCustomPhoneCol] = useState('');
  const [customLocCol, setCustomLocCol] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch contacts for this event (cache-busted so newly committed contacts always appear immediately)
  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (Array.isArray(data.contacts)) {
        setContacts(data.contacts);
      }
    } catch (e: any) {
      console.warn('Error fetching contacts:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
    setSelectedIds(new Set());
    setLastConfirmedBatch(null);
    setContinueError(null);
  }, [eventId]);

  // Handle Manual Add
  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!newPhone.trim()) {
      setAddError('Phone number is required');
      return;
    }

    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim() || 'Resident',
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
          locality: newLocality.trim() || undefined,
          consentStatus: newConsent,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to add contact');
      }

      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewLocality('');
      setShowAddModal(false);
      await fetchContacts();
      if (isWizardContactFlow && data.contact?.id) {
        setLastConfirmedBatch((prev) => ({
          contactIds: [...(prev?.contactIds || []), data.contact.id],
          sourceFileNames: prev?.sourceFileNames || [],
          count: (prev?.count || 0) + 1,
        }));
      }
      setActionFeedback(`Added contact ${data.contact?.name || ''}`);
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Handle Pasted Numbers submission -> opens review table
  const handleParsePaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;

    setIsParsingPaste(true);
    setPasteError(null);

    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts/paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastedText, namePhoneOnly }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse pasted numbers');
      }

      setShowPasteModal(false);
      setPastedText('');
      setUploadPreview(data);
      setReviewFilter('all');
      setShowUploadModal(true);
    } catch (err: any) {
      setPasteError(err.message);
    } finally {
      setIsParsingPaste(false);
    }
  };

  // Handle File Upload & Parsing (supports single or multiple files)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    setLastUploadedFiles(selectedFiles);
    setUploadError(null);
    setIsUploadingFile(true);

    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append('file', file);
      }
      if (namePhoneOnly) {
        formData.append('namePhoneOnly', 'true');
      }

      const targetEventId = eventId || 'default_event';
      const res = await fetch(`/api/callbridge/events/${targetEventId}/contacts/upload`, {
        method: 'POST',
        body: formData,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const rawBody = await res.text();
        console.error('[Upload API non-JSON response]:', rawBody.slice(0, 300));
        throw new Error(
          `Server returned an invalid response (HTTP ${res.status}). Please check network connectivity and retry.`
        );
      }

      let data: any;
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        throw new Error('Failed to read response from server as valid JSON. Please try uploading again.');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse file');
      }

      const incomingRecords: any[] = Array.isArray(data.records)
        ? data.records
        : Array.isArray(data.contacts)
        ? data.contacts
        : [];
      const incomingFileNames: string[] = Array.isArray(data.uploadedFileNames)
        ? data.uploadedFileNames
        : selectedFiles.map((f) => f.name);

      // If adding more files while a preview is already open, merge them cleanly
      const existingRecords = uploadPreview && !uploadPreview.needsColumnMapping ? uploadPreview.records : [];
      const existingFileNames = uploadPreview?.uploadedFileNames || [];

      let mergedRecords = incomingRecords;
      let mergedFileNames = incomingFileNames;

      if (existingRecords.length > 0 && !data.needsColumnMapping) {
        const seenPhones = new Set(
          existingRecords.filter((r) => r.phone && r.isValid).map((r) => r.phone)
        );
        const dedupedIncoming = incomingRecords.map((r) => {
          if (r.isValid && !r.isDuplicate && seenPhones.has(r.phone)) {
            return {
              ...r,
              isDuplicate: true,
              status: 'Duplicate' as const,
              reason: `Duplicate phone number across uploaded files (${r.phone})`,
            };
          }
          if (r.isValid && r.phone) seenPhones.add(r.phone);
          return r;
        });
        mergedRecords = [...existingRecords, ...dedupedIncoming];
        mergedFileNames = Array.from(new Set([...existingFileNames, ...incomingFileNames]));
      }

      const normalizedPreview = {
        ...data,
        uploadedFileNames: mergedFileNames,
        sourceFileName: mergedFileNames[0],
        records: mergedRecords,
        contacts: mergedRecords,
        totalRows: mergedRecords.length,
        totalFound: mergedRecords.length,
        totalDetected: mergedRecords.length,
        validCount: mergedRecords.filter((r) => r.status === 'Valid').length,
        invalidCount: mergedRecords.filter((r) => r.status === 'Invalid').length,
        duplicateCount: mergedRecords.filter((r) => r.status === 'Duplicate').length,
        needsReviewCount: mergedRecords.filter((r) => r.status === 'Needs Review').length,
      };

      console.log('[PDF_IMPORT_FRONTEND_STATE_UPDATED]', {
        files: mergedFileNames,
        totalDetected: mergedRecords.length,
        validCount: normalizedPreview.validCount,
        invalidCount: normalizedPreview.invalidCount,
        duplicateCount: normalizedPreview.duplicateCount,
        needsReviewCount: normalizedPreview.needsReviewCount,
      });

      setUploadPreview(normalizedPreview);
      setReviewFilter('all');
      if (data.availableHeaders && data.availableHeaders.length > 0) {
        setCustomNameCol(data.availableHeaders[0] || '');
        setCustomPhoneCol(data.availableHeaders[1] || data.availableHeaders[0] || '');
      }
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Re-run column mapping for spreadsheet
  const handleApplyColumnMapping = async () => {
    if (lastUploadedFiles.length === 0) return;
    setIsUploadingFile(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      for (const file of lastUploadedFiles) {
        formData.append('file', file);
      }
      if (customNameCol) formData.append('nameCol', customNameCol);
      if (customPhoneCol) formData.append('phoneCol', customPhoneCol);
      if (!namePhoneOnly && customLocCol) formData.append('localityCol', customLocCol);
      if (namePhoneOnly) formData.append('namePhoneOnly', 'true');

      const targetEventId = eventId || 'default_event';
      const res = await fetch(`/api/callbridge/events/${targetEventId}/contacts/upload`, {
        method: 'POST',
        body: formData,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const rawBody = await res.text();
        console.error('[Upload Column Mapping non-JSON response]:', rawBody.slice(0, 300));
        throw new Error(
          `Server returned an invalid response (HTTP ${res.status}). Please check network connectivity and retry.`
        );
      }

      let data: any;
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        throw new Error('Failed to read response from server as valid JSON.');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to apply column mapping');
      }

      setUploadPreview(data);
      setReviewFilter('all');
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Recalculate summary metrics after an edit or delete in the preview table
  const recalculatePreviewCounts = (records: any[]) => {
    const validCount = records.filter((r) => r.status === 'Valid').length;
    const invalidCount = records.filter((r) => r.status === 'Invalid').length;
    const duplicateCount = records.filter((r) => r.status === 'Duplicate').length;
    const needsReviewCount = records.filter((r) => r.status === 'Needs Review').length;
    setUploadPreview((prev) =>
      prev
        ? {
            ...prev,
            records,
            validCount,
            invalidCount,
            duplicateCount,
            needsReviewCount,
            totalRows: records.length,
            totalFound: records.length,
          }
        : null
    );
  };

  // Start inline editing row in review table
  const handleStartReviewEdit = (idx: number) => {
    if (!uploadPreview) return;
    const r = uploadPreview.records[idx];
    setEditingReviewIdx(idx);
    setReviewEditName(r.name);
    setReviewEditPhone(r.rawPhone || r.phone);
  };

  // Save inline edit in review table
  const handleSaveReviewEdit = (idx: number) => {
    if (!uploadPreview) return;
    const updated = [...uploadPreview.records];
    const item = { ...updated[idx] };

    const rawPhone = reviewEditPhone.trim();
    const rawName = reviewEditName.trim() || 'Resident';

    const digitsOnly = rawPhone.replace(/\D/g, '');
    let normalized = rawPhone;
    let isValid = false;
    let reason = '';

    if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
      normalized = `+91${digitsOnly}`;
      isValid = true;
      reason = 'Valid 10-digit Indian mobile number';
    } else if (rawPhone.startsWith('+') && digitsOnly.length >= 7 && digitsOnly.length <= 15) {
      normalized = `+${digitsOnly}`;
      isValid = true;
      reason = 'Valid international phone number with country code';
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0') && /^[6-9]/.test(digitsOnly.slice(1))) {
      normalized = `+91${digitsOnly.slice(1)}`;
      isValid = true;
      reason = 'Valid Indian mobile with leading 0';
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91') && /^[6-9]/.test(digitsOnly.slice(2))) {
      normalized = `+${digitsOnly}`;
      isValid = true;
      reason = 'Valid Indian mobile with 91 prefix';
    } else {
      normalized = rawPhone;
      isValid = false;
      reason = digitsOnly.length < 10
        ? `Incomplete phone number (${digitsOnly.length} digits, expected 10)`
        : `Invalid phone number format (${digitsOnly.length} digits)`;
    }

    // Check duplicate against other items in the batch
    const isDuplicate = isValid && updated.some((r, i) => i !== idx && r.phone === normalized && r.isValid);

    item.name = rawName;
    item.phone = normalized;
    item.rawPhone = rawPhone;
    item.isValid = isValid;
    item.isDuplicate = isDuplicate;

    if (!isValid) {
      item.status = 'Invalid';
      item.reason = reason;
    } else if (isDuplicate) {
      item.status = 'Duplicate';
      item.reason = `Duplicate phone number in uploaded list (${normalized})`;
    } else if (rawName === 'Resident' || !rawName) {
      item.status = 'Needs Review';
      item.reason = 'Missing contact name in source';
    } else {
      item.status = 'Valid';
      item.reason = reason;
    }

    updated[idx] = item;
    recalculatePreviewCounts(updated);
    setEditingReviewIdx(null);
  };

  // Remove single row from review preview
  const handleRemovePreviewRow = (idx: number) => {
    if (!uploadPreview) return;
    const updated = [...uploadPreview.records];
    updated.splice(idx, 1);
    recalculatePreviewCounts(updated);
  };

  // Remove all invalid and duplicate rows from review preview
  const handleRemoveAllInvalid = () => {
    if (!uploadPreview) return;
    const updated = uploadPreview.records.filter((r) => r.status === 'Valid' || r.status === 'Needs Review');
    recalculatePreviewCounts(updated);
  };

  // Commit Bulk Upload / Pasted to Directory (Confirm Contacts without auto-starting calls)
  const handleCommitBulk = async () => {
    if (!uploadPreview || !uploadPreview.records || isConfirmingBulk) return;
    setIsConfirmingBulk(true);
    setUploadError(null);

    try {
      const validRecords = uploadPreview.records.filter((r) => r.status !== 'Invalid' && !r.isDuplicate);
      const uploadedNames = uploadPreview.uploadedFileNames || (uploadPreview.sourceFileName ? [uploadPreview.sourceFileName] : []);
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts/commit-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validRecords,
          source: uploadPreview.format || 'import',
          sourceFileName: uploadPreview.sourceFileName,
          namePhoneOnly,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save contacts');
      }

      const committedContacts: ContactRecord[] = Array.isArray(data.contacts) ? data.contacts : [];
      const savedIds = committedContacts.map((c) => c.id);
      const savedFileNames: string[] = Array.from(
        new Set([
          ...uploadedNames,
          ...committedContacts.map((c) => c.sourceFileName).filter((f): f is string => Boolean(f)),
        ])
      );

      if (committedContacts.length > 0) {
        setContacts((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const added = committedContacts.filter((c) => !existingIds.has(c.id));
          return [...prev, ...added];
        });
      }

      setLastConfirmedBatch({
        contactIds: savedIds,
        sourceFileNames: savedFileNames,
        count: data.count || savedIds.length,
      });
      setContinueError(null);

      setShowUploadModal(false);
      setUploadPreview(null);
      await fetchContacts();
      setActionFeedback(
        isWizardContactFlow
          ? `Confirmed ${data.count} contacts in exact source order. Click "Continue to Sequential Calling" to prepare your queue batch.`
          : `Successfully saved ${data.count} contacts to directory in exact source order.`
      );
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsConfirmingBulk(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  const eligibleContacts = contacts.filter((c) => !c.optOut && c.consentStatus !== 'revoked');
  const hasEligibleContacts = eligibleContacts.length > 0;

  // Wizard flow (Public Survey & Political Campaign): Prepare DRAFT batch & navigate to Sequential Calling WITHOUT starting calls
  const handleContinueToSequentialCalling = async () => {
    if (isProceeding) return;
    setContinueError(null);
    setUploadError(null);

    if (!hasEligibleContacts) {
      setContinueError('No eligible confirmed contacts available. Please import and confirm at least one valid contact first.');
      return;
    }

    setIsProceeding(true);
    try {
      let targetContactIds: string[] | undefined;
      let targetSourceFileNames: string[] | undefined;

      if (selectedIds.size > 0) {
        const orderedSelected = filteredContacts.filter(
          (c) => selectedIds.has(c.id) && !c.optOut && c.consentStatus !== 'revoked'
        );
        if (orderedSelected.length === 0) {
          setContinueError('None of the selected contacts are eligible for calling. Select at least one opted-in contact.');
          setIsProceeding(false);
          return;
        }
        targetContactIds = orderedSelected.map((c) => c.id);
        targetSourceFileNames = Array.from(
          new Set(orderedSelected.map((c) => c.sourceFileName).filter((f): f is string => Boolean(f)))
        );
      } else if (lastConfirmedBatch && lastConfirmedBatch.contactIds.length > 0) {
        const eligibleIdSet = new Set(eligibleContacts.map((c) => c.id));
        const validBatchIds = lastConfirmedBatch.contactIds.filter((id) => eligibleIdSet.has(id));
        if (validBatchIds.length > 0) {
          targetContactIds = validBatchIds;
          targetSourceFileNames = lastConfirmedBatch.sourceFileNames;
        }
      }

      const res = await fetch(`/api/callbridge/events/${eventId}/campaigns/prepare-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: targetContactIds,
          sourceFileNames: targetSourceFileNames,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to prepare sequential calling batch');
      }

      if (onSwitchToCalling) {
        onSwitchToCalling(data.campaign?.id);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to prepare sequential calling batch';
      setContinueError(msg);
      setActionFeedback(`Notice: ${msg}`);
    } finally {
      setIsProceeding(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Legacy/Marriage Events: "Proceed with the data I have given": saves reviewed data, updates queue in exact source order, and starts calling
  const handleProceedWithData = async (reviewedRecords?: any[]) => {
    setIsProceeding(true);
    setUploadError(null);
    try {
      const payload: any = {};
      if (reviewedRecords && reviewedRecords.length > 0) {
        payload.contacts = reviewedRecords.filter((r) => r.status !== 'Invalid' && !r.isDuplicate);
        payload.source = uploadPreview?.format || 'import';
      }

      // If specific contacts are selected via Quick Select and not committing from modal
      if (selectedIds.size > 0 && (!reviewedRecords || reviewedRecords.length === 0)) {
        payload.selectedContactIds = Array.from(selectedIds);
      }

      const res = await fetch(`/api/callbridge/events/${eventId}/proceed-with-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to proceed with data');
      }

      setShowUploadModal(false);
      setUploadPreview(null);
      await fetchContacts();

      // Automatically switch to calling screen
      if (onSwitchToCalling) {
        onSwitchToCalling(data.campaign?.id);
      }
    } catch (err: any) {
      setUploadError(err.message);
      setActionFeedback(`Notice: ${err.message}`);
    } finally {
      setIsProceeding(false);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Quick Select handler with debouncing / double-click prevention
  const handleQuickSelect = (type: 'all' | 'first5' | 'first10' | 'clear') => {
    if (isQuickSelecting) return;
    setIsQuickSelecting(true);
    setShowQuickSelectMenu(false);

    try {
      if (type === 'all') {
        const allIds = new Set(filteredContacts.map((c) => c.id));
        setSelectedIds(allIds);
        setActionFeedback(`Selected all ${allIds.size} contacts for queue in source order`);
      } else if (type === 'first5') {
        const top5 = new Set(filteredContacts.slice(0, 5).map((c) => c.id));
        setSelectedIds(top5);
        setActionFeedback(`Selected top ${top5.size} contacts for queue in source order`);
      } else if (type === 'first10') {
        const top10 = new Set(filteredContacts.slice(0, 10).map((c) => c.id));
        setSelectedIds(top10);
        setActionFeedback(`Selected top ${top10.size} contacts for queue in source order`);
      } else {
        setSelectedIds(new Set());
        setActionFeedback('Cleared contact selection');
      }
    } finally {
      setTimeout(() => setIsQuickSelecting(false), 200);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Start editing contact
  const handleStartEditContact = (c: ContactRecord) => {
    setEditingContact(c);
    setEditName(c.name);
    setEditPhone(c.originalPhone || c.phone);
    setEditLocality(c.locality || '');
    setEditConsent(c.consentStatus === 'revoked' || c.optOut ? 'unconfirmed' : (c.consentStatus || 'granted'));
    setEditNotes(c.notes || '');
    setEditError(null);
  };

  // Save edited contact
  const handleSaveEditedContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    setEditError(null);

    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts/${editingContact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim() || 'Resident',
          phone: editPhone.trim(),
          locality: editLocality.trim() || undefined,
          consentStatus: editConsent,
          optOut: editConsent === 'unconfirmed',
          notes: editNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update contact');
      }
      setEditingContact(null);
      await fetchContacts();
      setActionFeedback('Contact details updated successfully.');
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Delete single contact
  const handleDeleteContact = async (contactId: string) => {
    if (!contactId) return;

    setContacts((prev) => prev.filter((c) => c.id !== contactId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(contactId);
      return next;
    });

    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts/${contactId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to delete contact from storage');
      }
      setActionFeedback('Contact deleted successfully.');
      await fetchContacts();
    } catch (e: any) {
      console.warn('Delete contact error:', e);
      setActionFeedback(`Error: ${e.message || 'Failed to delete contact'}`);
      await fetchContacts();
    } finally {
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Delete selected
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const idsToDelete = Array.from(selectedIds);

    setContacts((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setActionFeedback(`Deleting ${idsToDelete.length} selected contacts...`);

    try {
      await Promise.all(
        idsToDelete.map(async (id) => {
          await fetch(`/api/callbridge/events/${eventId}/contacts/${id}`, { method: 'DELETE' });
        })
      );
      setActionFeedback(`Successfully deleted ${idsToDelete.length} contacts.`);
      await fetchContacts();
    } catch (e: any) {
      console.warn('Delete selected error:', e);
      setActionFeedback(`Error: ${e.message || 'Failed to delete some contacts'}`);
      await fetchContacts();
    } finally {
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Filtered contacts in Directory table
  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.locality && c.locality.toLowerCase().includes(q))
    );
  });

  // Filtered records in Review Modal table
  const filteredReviewRecords = (uploadPreview?.records || []).filter((r) => {
    if (reviewFilter === 'valid') return r.status === 'Valid';
    if (reviewFilter === 'invalid') return r.status === 'Invalid';
    if (reviewFilter === 'duplicate') return r.status === 'Duplicate';
    if (reviewFilter === 'needs_review') return r.status === 'Needs Review';
    return true;
  });

  const validContactsReadyCount = (uploadPreview?.records || []).filter(
    (r) => r.status !== 'Invalid' && !r.isDuplicate
  ).length;

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Target Contacts &amp; Directory</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dedicated contact list for {eventName} (Total: {contacts.length})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Single</span>
          </button>

          <button
            onClick={() => {
              setPastedText('');
              setPasteError(null);
              setShowPasteModal(true);
            }}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <ClipboardPaste className="w-4 h-4 text-indigo-600" />
            <span>Paste Multiple Numbers</span>
          </button>

          <button
            onClick={() => {
              setUploadPreview(null);
              setUploadError(null);
              setLastUploadedFiles([]);
              setShowUploadModal(true);
            }}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Import CSV / Excel / PDF</span>
          </button>

          <a
            href={`/api/callbridge/events/${eventId}/export/contacts.csv`}
            download
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </a>

          {!isWizardContactFlow && contacts.length > 0 && (
            <button
              onClick={() => handleProceedWithData()}
              disabled={isProceeding}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isProceeding ? 'Starting Queue...' : 'Proceed with the data I have given'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and filters bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white rounded-xl border border-slate-200">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={namePhoneOnly ? 'Search contacts by name or phone number...' : 'Search contacts by name, mobile, or locality...'}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
          />
        </div>

        <div className="flex items-center space-x-2">
          {/* Quick Select Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowQuickSelectMenu((prev) => !prev)}
              disabled={isQuickSelecting || filteredContacts.length === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
              title="Quick select contacts for calling batch"
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
              <span>
                Quick Select {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
            </button>

            {showQuickSelectMenu && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-30 text-xs">
                <button
                  onClick={() => handleQuickSelect('all')}
                  className="w-full text-left px-3.5 py-2 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 font-medium flex items-center justify-between cursor-pointer"
                >
                  <span>Select All Contacts</span>
                  <span className="font-mono text-[10px] text-slate-400">({filteredContacts.length})</span>
                </button>
                <button
                  onClick={() => handleQuickSelect('first5')}
                  className="w-full text-left px-3.5 py-2 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 font-medium flex items-center justify-between cursor-pointer"
                >
                  <span>Select Top 5 Contacts</span>
                  <span className="font-mono text-[10px] text-slate-400">({Math.min(5, filteredContacts.length)})</span>
                </button>
                <button
                  onClick={() => handleQuickSelect('first10')}
                  className="w-full text-left px-3.5 py-2 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 font-medium flex items-center justify-between cursor-pointer"
                >
                  <span>Select Top 10 Contacts</span>
                  <span className="font-mono text-[10px] text-slate-400">({Math.min(10, filteredContacts.length)})</span>
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={() => handleQuickSelect('clear')}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold border border-red-200 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedIds.size})</span>
            </button>
          )}

          <button
            onClick={fetchContacts}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Action / Notification Feedback Banner */}
      {actionFeedback && (
        <div className="flex items-center space-x-2 p-3 rounded-xl bg-indigo-50 text-indigo-900 text-xs border border-indigo-200 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Contacts Table (Preserves Source Order) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredContacts.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
                      else setSelectedIds(new Set());
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Normalized Phone</th>
                {!namePhoneOnly && <th className="px-4 py-3">Locality</th>}
                <th className="px-4 py-3">Consent Status</th>
                <th className="px-4 py-3">Import Source</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={namePhoneOnly ? 7 : 8} className="px-4 py-8 text-center text-slate-400">
                    {searchQuery ? 'No contacts match your search query.' : 'No contacts added for this event yet.'}
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact, idx) => {
                  const isChecked = selectedIds.has(contact.id);
                  return (
                    <tr
                      key={contact.id}
                      className={`hover:bg-slate-50/80 transition-colors ${isChecked ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const newSet = new Set(selectedIds);
                            if (e.target.checked) newSet.add(contact.id);
                            else newSet.delete(contact.id);
                            setSelectedIds(newSet);
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-400 text-xs">
                        #{idx + 1}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{contact.name}</td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">{contact.phone}</td>
                      {!namePhoneOnly && (
                        <td className="px-4 py-3 text-slate-500">{contact.locality || '—'}</td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            contact.consentStatus === 'granted'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {contact.consentStatus === 'granted' ? 'Authorized' : 'Unconfirmed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-500">
                        {contact.sourceFileName ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                            <FileText className="w-3 h-3 text-slate-400" />
                            <span>{contact.sourceFileName}</span>
                          </span>
                        ) : (
                          <span className="uppercase text-[10px] tracking-wide text-slate-400">
                            {contact.importSource}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <button
                          onClick={() => handleStartEditContact(contact)}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                          title="Edit contact"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          className="p-1 rounded text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                          title="Delete contact"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isWizardContactFlow && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border ${
            hasEligibleContacts
              ? 'bg-emerald-50/70 border-emerald-200'
              : 'bg-amber-50/70 border-amber-200'
          }`}
        >
          <div className="text-xs space-y-1">
            {hasEligibleContacts ? (
              <div className="text-emerald-950">
                <span className="font-bold">
                  {lastConfirmedBatch && lastConfirmedBatch.count > 0
                    ? `${lastConfirmedBatch.count} contacts confirmed from ${lastConfirmedBatch.sourceFileNames.length > 0 ? lastConfirmedBatch.sourceFileNames.join(', ') : 'recent import'}.`
                    : `${eligibleContacts.length} eligible confirmed contacts ready in directory.`}
                </span>{' '}
                <span className="text-emerald-800">
                  Click Continue to Sequential Calling to prepare your queue batch without placing calls yet.
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-amber-900 font-medium">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {contacts.length === 0
                    ? 'No confirmed contacts available yet. Import or add contacts and confirm them to enable Sequential Calling.'
                    : 'No eligible contacts available (all contacts are opted out or unconfirmed). Confirm at least one eligible contact to continue.'}
                </span>
              </div>
            )}
            {continueError && (
              <div className="text-rose-700 font-semibold">{continueError}</div>
            )}
          </div>
          <button
            type="button"
            onClick={handleContinueToSequentialCalling}
            disabled={isProceeding || !hasEligibleContacts}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <PhoneCall className="w-4 h-4" />
            <span>{isProceeding ? 'Preparing Queue...' : 'Continue to Sequential Calling'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal: Manual Add Contact */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto my-auto">
            <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center space-x-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              <span>Add Single Contact</span>
            </h3>

            <form onSubmit={handleAddManual} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="e.g. 9876543210 or +919876543210"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {!namePhoneOnly && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Locality / Area</label>
                  <input
                    type="text"
                    value={newLocality}
                    onChange={(e) => setNewLocality(e.target.value)}
                    placeholder="e.g. Ward 14, Main Road"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Consent Status</label>
                <select
                  value={newConsent}
                  onChange={(e) => setNewConsent(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="granted">Consent Verified &amp; Authorized</option>
                  <option value="unconfirmed">Unconfirmed</option>
                </select>
              </div>

              {addError && (
                <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-red-50 text-red-600 text-xs border border-red-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Paste Multiple Numbers */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <ClipboardPaste className="w-5 h-5 text-indigo-600" />
                <span>Paste Multiple Phone Numbers</span>
              </h3>
              <button onClick={() => setShowPasteModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Paste contacts as a list. Supports:
              <br />• <strong>Numbered / Delimited:</strong> "Ravi – 9876543210" or "1. Suresh: 9123456780"
              <br />• <strong>Separate lines:</strong> Name on one line, Number on the next
              <br />• <strong>Comma-separated:</strong> "Ramesh, 9876543210, Ward 4"
            </p>

            <form onSubmit={handleParsePaste} className="space-y-4">
              <div>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Ravi – 9876543210&#10;Suresh – 9123456780&#10;Geetha – 9988776655"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                  required
                />
              </div>

              {pasteError && (
                <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-red-50 text-red-600 text-xs border border-red-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{pasteError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isParsingPaste || !pastedText.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  {isParsingPaste ? 'Parsing Numbers...' : 'Review & Validate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Contact Details */}
      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <span>Edit Contact Details</span>
              </h3>
              <button onClick={() => setEditingContact(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedContact} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {!namePhoneOnly && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Locality</label>
                  <input
                    type="text"
                    value={editLocality}
                    onChange={(e) => setEditLocality(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Consent Status</label>
                <select
                  value={editConsent}
                  onChange={(e) => setEditConsent(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="granted">Consent Granted &amp; Authorized</option>
                  <option value="unconfirmed">Opted Out / Unconfirmed</option>
                </select>
              </div>

              {editError && (
                <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-red-50 text-red-600 text-xs border border-red-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingContact(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bulk Upload / Import Review Table (Section F) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 border border-slate-200 my-8 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <span>Import Contacts Review Table</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadPreview(null);
                  setUploadError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Review extracted numbers, duplicate checks, and validation flags before committing contacts to the outbound calling queue.
            </p>

            {/* Hidden shared multi-file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Dropzone if no preview yet */}
            {!uploadPreview && (
              <div className="space-y-4 my-auto py-6">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-10 border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/30 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors"
                >
                  <div className="flex items-center space-x-3 text-blue-600 mb-3">
                    <FileSpreadsheet className="w-8 h-8" />
                    <FileText className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Click to browse or drop one or more files</p>
                  <p className="text-xs text-slate-400 mt-1">Supports multiple PDFs (.pdf), CSV (.csv), and Excel (.xlsx, .xls)</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {namePhoneOnly
                      ? 'Strict extraction: extracts ONLY Name and Phone Number'
                      : 'Strict extraction: extracts only verified contact entries'}
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadPreview(null);
                      setUploadError(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isUploadingFile && (
              <div className="py-6 text-center text-xs text-blue-600 font-medium animate-pulse">
                Parsing document structure, normalizing phone numbers...
              </div>
            )}

            {uploadError && (
              <div className="mb-4 flex items-center space-x-2 p-3 rounded-lg bg-red-50 text-red-600 text-xs border border-red-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Column Mapping Selector (if spreadsheet columns could not be identified confidently) */}
            {uploadPreview?.needsColumnMapping && (
              <div className="p-4 mb-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <div className="flex items-center space-x-2 text-amber-900 font-semibold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Column Mapping Required: Please identify the Name and Phone columns from your header</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Name Column</label>
                    <select
                      value={customNameCol}
                      onChange={(e) => setCustomNameCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      {(uploadPreview.availableHeaders || []).map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phone Column</label>
                    <select
                      value={customPhoneCol}
                      onChange={(e) => setCustomPhoneCol(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      {(uploadPreview.availableHeaders || []).map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleApplyColumnMapping}
                      disabled={isUploadingFile}
                      className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer shadow-sm transition-colors"
                    >
                      Extract Contacts with Mapping
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Review parsed records */}
            {uploadPreview && !uploadPreview.needsColumnMapping && (
              uploadPreview.records.length === 0 ? (
                <div className="p-8 my-auto text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">No Contact Records Detected in Document</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      {uploadPreview.error ||
                        'The uploaded file did not contain recognizable contact phone numbers, or may be an image/scanned PDF without a selectable text layer.'}
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 max-w-md mx-auto text-left text-[11px] text-slate-600 space-y-1.5">
                    <div className="font-semibold text-slate-700">Supported Contact Organization Formats:</div>
                    <div className="flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span><strong>Format 1 (Numbered / List):</strong> Ravi – 9876543210</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span><strong>Format 2 (Multi-line):</strong> Name: Ravi &amp; Number: 9876543210</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span><strong>Format 3 (Tabular):</strong> Columns for Name and Phone Number</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span><strong>Format 4 (Spreadsheet):</strong> CSV or Excel (.xlsx) file</span>
                    </div>
                  </div>
                  <div className="pt-2 flex justify-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUploadPreview(null);
                        setUploadError(null);
                        fileInputRef.current?.click();
                      }}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors inline-flex items-center space-x-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Another File</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadModal(false);
                        setUploadPreview(null);
                        setUploadError(null);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                {/* 5 Metric Summary Cards (Section F) */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center shrink-0">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-base font-bold text-slate-800">{uploadPreview.records.length}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Detected</div>
                  </div>
                  <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                    <div className="text-base font-bold text-emerald-700">{uploadPreview.validCount || 0}</div>
                    <div className="text-[10px] text-emerald-600 uppercase font-semibold">Valid Contacts</div>
                  </div>
                  <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200">
                    <div className="text-base font-bold text-rose-700">{uploadPreview.invalidCount || 0}</div>
                    <div className="text-[10px] text-rose-600 uppercase font-semibold">Invalid Contacts</div>
                  </div>
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="text-base font-bold text-amber-700">{uploadPreview.duplicateCount || 0}</div>
                    <div className="text-[10px] text-amber-600 uppercase font-semibold">Duplicate Contacts</div>
                  </div>
                  <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="text-base font-bold text-blue-700">{uploadPreview.needsReviewCount || 0}</div>
                    <div className="text-[10px] text-blue-600 uppercase font-semibold">Needs Review</div>
                  </div>
                </div>

                {/* Uploaded Filenames Banner */}
                {uploadPreview.uploadedFileNames && uploadPreview.uploadedFileNames.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs shrink-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-blue-900 mr-1">
                        Uploaded Files ({uploadPreview.uploadedFileNames.length}):
                      </span>
                      {uploadPreview.uploadedFileNames.map((fn) => (
                        <span
                          key={fn}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-white text-blue-800 border border-blue-200 text-[11px] font-medium"
                        >
                          <FileText className="w-3 h-3 text-blue-600" />
                          <span>{fn}</span>
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingFile}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Add Another File</span>
                    </button>
                  </div>
                )}

                {/* Filter Tabs & Quick Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center space-x-1 p-1 bg-slate-100 rounded-lg text-[11px] font-medium">
                    <button
                      onClick={() => setReviewFilter('all')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        reviewFilter === 'all' ? 'bg-white text-slate-800 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({uploadPreview.records.length})
                    </button>
                    <button
                      onClick={() => setReviewFilter('valid')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        reviewFilter === 'valid' ? 'bg-white text-emerald-700 font-bold shadow-xs' : 'text-slate-600 hover:text-emerald-700'
                      }`}
                    >
                      Valid ({uploadPreview.validCount || 0})
                    </button>
                    {(uploadPreview.invalidCount || 0) > 0 && (
                      <button
                        onClick={() => setReviewFilter('invalid')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          reviewFilter === 'invalid' ? 'bg-white text-rose-700 font-bold shadow-xs' : 'text-slate-600 hover:text-rose-700'
                        }`}
                      >
                        Invalid ({uploadPreview.invalidCount})
                      </button>
                    )}
                    {(uploadPreview.duplicateCount || 0) > 0 && (
                      <button
                        onClick={() => setReviewFilter('duplicate')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          reviewFilter === 'duplicate' ? 'bg-white text-amber-700 font-bold shadow-xs' : 'text-slate-600 hover:text-amber-700'
                        }`}
                      >
                        Duplicate ({uploadPreview.duplicateCount})
                      </button>
                    )}
                    {(uploadPreview.needsReviewCount || 0) > 0 && (
                      <button
                        onClick={() => setReviewFilter('needs_review')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          reviewFilter === 'needs_review' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600 hover:text-blue-700'
                        }`}
                      >
                        Needs Review ({uploadPreview.needsReviewCount})
                      </button>
                    )}
                  </div>

                  {((uploadPreview.invalidCount || 0) + (uploadPreview.duplicateCount || 0)) > 0 && (
                    <button
                      onClick={handleRemoveAllInvalid}
                      className="px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-xs cursor-pointer shadow-xs transition-colors flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Remove All Invalid &amp; Duplicates ({((uploadPreview.invalidCount || 0) + (uploadPreview.duplicateCount || 0))})</span>
                    </button>
                  )}
                </div>

                {/* Review Table */}
                <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl min-h-[220px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        {!namePhoneOnly && <th className="px-3 py-2 w-12 text-slate-400">Order</th>}
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">{namePhoneOnly ? 'Phone Number' : 'Extracted Phone Number'}</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredReviewRecords.length === 0 ? (
                        <tr>
                          <td colSpan={namePhoneOnly ? 5 : 6} className="px-4 py-8 text-center text-slate-400">
                            No records in this category.
                          </td>
                        </tr>
                      ) : (
                        filteredReviewRecords.map((r, i) => {
                          const originalIdx = uploadPreview.records.indexOf(r);
                          const isEditing = editingReviewIdx === originalIdx;

                          return (
                            <tr
                              key={originalIdx}
                              className={`hover:bg-slate-50 transition-colors ${
                                r.status === 'Invalid'
                                  ? 'bg-rose-50/20'
                                  : r.status === 'Duplicate'
                                  ? 'bg-amber-50/20'
                                  : r.status === 'Needs Review'
                                  ? 'bg-blue-50/20'
                                  : ''
                              }`}
                            >
                              {!namePhoneOnly && (
                                <td className="px-3 py-2 font-mono font-bold text-slate-400">
                                  #{originalIdx + 1}
                                </td>
                              )}

                              {/* Name column with inline edit support */}
                              <td className="px-3 py-2 font-medium text-slate-800">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={reviewEditName}
                                    onChange={(e) => setReviewEditName(e.target.value)}
                                    className="px-2 py-1 rounded border border-blue-400 text-xs w-full bg-white"
                                    autoFocus
                                  />
                                ) : (
                                  <span>{r.name}</span>
                                )}
                              </td>

                              {/* Phone column with inline edit support */}
                              <td className="px-3 py-2 font-mono">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={reviewEditPhone}
                                    onChange={(e) => setReviewEditPhone(e.target.value)}
                                    className="px-2 py-1 rounded border border-blue-400 text-xs w-full bg-white font-mono"
                                  />
                                ) : (
                                  <div>
                                    <span className="font-semibold text-slate-800">{r.phone || r.rawPhone}</span>
                                    {r.rawPhone && r.rawPhone !== r.phone && (
                                      <span className="block text-[10px] text-slate-400 font-sans">
                                        Raw: {r.rawPhone}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Status Badge */}
                              <td className="px-3 py-2">
                                {r.status === 'Valid' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Valid
                                  </span>
                                ) : r.status === 'Duplicate' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Duplicate
                                  </span>
                                ) : r.status === 'Needs Review' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                    Needs Review
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                    Invalid
                                  </span>
                                )}
                              </td>

                              {/* Reason Column */}
                              <td className="px-3 py-2 text-[11px] text-slate-500 max-w-xs truncate" title={r.reason}>
                                {r.reason || '—'}
                              </td>

                              {/* Action Column */}
                              <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveReviewEdit(originalIdx)}
                                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold cursor-pointer"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingReviewIdx(null)}
                                      className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleStartReviewEdit(originalIdx)}
                                      className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors cursor-pointer"
                                      title="Edit contact name or number"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleRemovePreviewRow(originalIdx)}
                                      className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                                      title="Remove this contact from import"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 shrink-0">
                  <span className="text-xs text-slate-500">
                    Total Valid Contacts Ready: <strong className="text-emerald-700 font-bold">{validContactsReadyCount}</strong>
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setShowUploadModal(false);
                        setUploadPreview(null);
                      }}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    {isWizardContactFlow ? (
                      <button
                        onClick={handleCommitBulk}
                        disabled={isConfirmingBulk || validContactsReadyCount === 0}
                        className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isConfirmingBulk ? 'Confirming...' : 'Confirm Contacts'}</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleCommitBulk}
                          disabled={isConfirmingBulk || validContactsReadyCount === 0}
                          className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          Save to Directory Only
                        </button>
                        <button
                          onClick={() => handleProceedWithData(uploadPreview.records)}
                          disabled={isProceeding || validContactsReadyCount === 0}
                          className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>{isProceeding ? 'Starting...' : 'Proceed with the data I have given'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
