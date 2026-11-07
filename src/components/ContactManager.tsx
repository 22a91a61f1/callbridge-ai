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
} from 'lucide-react';
import { ContactRecord } from '../types/callbridge';

interface ContactManagerProps {
  eventId: string;
  eventName: string;
  onSwitchToCalling?: () => void;
}

export function ContactManager({ eventId, eventName, onSwitchToCalling }: ContactManagerProps) {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isQuickSelecting, setIsQuickSelecting] = useState(false);
  const [showQuickSelectMenu, setShowQuickSelectMenu] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

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

  // Edit Contact Modal
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocality, setEditLocality] = useState('');
  const [editConsent, setEditConsent] = useState<'granted' | 'unconfirmed'>('granted');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Upload Modal & Preview
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<{
    format: string;
    totalRows?: number;
    validCount?: number;
    invalidCount?: number;
    duplicateCount?: number;
    records: Array<{
      name: string;
      phone: string;
      rawPhone: string;
      email?: string;
      locality?: string;
      isValid: boolean;
      isDuplicate: boolean;
      validationError?: string;
    }>;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch contacts for this event
  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts`);
      const data = await res.json();
      if (data.contacts) {
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
    } catch (err: any) {
      setAddError(err.message);
    }
  };

  // Handle Pasted Numbers submission -> opens preview review table
  const handleParsePaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;

    setIsParsingPaste(true);
    setPasteError(null);

    try {
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts/paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastedText }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse pasted numbers');
      }

      setShowPasteModal(false);
      setPastedText('');
      setUploadPreview({
        format: 'manual_paste',
        ...data,
      });
      setShowUploadModal(true);
    } catch (err: any) {
      setPasteError(err.message);
    } finally {
      setIsParsingPaste(false);
    }
  };

  // Handle File Upload & Parsing
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/callbridge/events/${eventId}/contacts/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse file');
      }

      setUploadPreview(data);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Commit Bulk Upload / Pasted
  const handleCommitBulk = async () => {
    if (!uploadPreview || !uploadPreview.records) return;

    try {
      const validRecords = uploadPreview.records.filter((r) => r.isValid && !r.isDuplicate);
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts/commit-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validRecords,
          source: uploadPreview.format || 'import',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save contacts');
      }

      setShowUploadModal(false);
      setUploadPreview(null);
      await fetchContacts();
    } catch (err: any) {
      setUploadError(err.message);
    }
  };

  // Remove single row from review preview
  const handleRemovePreviewRow = (idx: number) => {
    if (!uploadPreview) return;
    const updated = [...uploadPreview.records];
    updated.splice(idx, 1);
    const validCount = updated.filter((r) => r.isValid && !r.isDuplicate).length;
    const invalidCount = updated.filter((r) => !r.isValid).length;
    const duplicateCount = updated.filter((r) => r.isDuplicate).length;
    setUploadPreview({
      ...uploadPreview,
      records: updated,
      validCount,
      invalidCount,
      duplicateCount,
      totalRows: updated.length,
    });
  };

  // Remove all invalid and duplicate rows from review preview
  const handleRemoveAllInvalid = () => {
    if (!uploadPreview) return;
    const updated = uploadPreview.records.filter((r) => r.isValid && !r.isDuplicate);
    setUploadPreview({
      ...uploadPreview,
      records: updated,
      validCount: updated.length,
      invalidCount: 0,
      duplicateCount: 0,
      totalRows: updated.length,
    });
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
        setActionFeedback(`Selected all ${allIds.size} contacts for queue`);
      } else if (type === 'first5') {
        const top5 = new Set(filteredContacts.slice(0, 5).map((c) => c.id));
        setSelectedIds(top5);
        setActionFeedback(`Selected top ${top5.size} contacts for queue`);
      } else if (type === 'first10') {
        const top10 = new Set(filteredContacts.slice(0, 10).map((c) => c.id));
        setSelectedIds(top10);
        setActionFeedback(`Selected top ${top10.size} contacts for queue`);
      } else {
        setSelectedIds(new Set());
        setActionFeedback('Cleared contact selection');
      }
    } finally {
      setTimeout(() => setIsQuickSelecting(false), 200);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // "Proceed with the data I have given": saves data, updates queue, and starts calling
  const handleProceedWithData = async (reviewedRecords?: any[]) => {
    setIsProceeding(true);
    setUploadError(null);
    try {
      const payload: any = {};
      if (reviewedRecords && reviewedRecords.length > 0) {
        payload.contacts = reviewedRecords.filter((r) => r.isValid && !r.isDuplicate);
        payload.source = uploadPreview?.format || 'import';
      }

      // If specific contacts are selected via Quick Select, include them
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
        onSwitchToCalling();
      }
    } catch (err: any) {
      setUploadError(err.message);
      setActionFeedback(`Notice: ${err.message}`);
    } finally {
      setIsProceeding(false);
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
    } catch (err: any) {
      setEditError(err.message);
    }
  };

  // Delete single contact
  const handleDeleteContact = async (contactId: string) => {
    if (!contactId) return;

    // 1. Optimistic local state update
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(contactId);
      return next;
    });
    setActionFeedback('Deleting contact...');

    try {
      // 2. Persistent storage deletion via API
      const res = await fetch(`/api/callbridge/events/${eventId}/contacts/${contactId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to delete contact from storage');
      }
      setActionFeedback('Contact deleted successfully.');
      // 3. Resync from backend
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

    // 1. Optimistic local state update
    setContacts((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setActionFeedback(`Deleting ${idsToDelete.length} selected contacts...`);

    try {
      // 2. Persistent storage deletion via API
      await Promise.all(
        idsToDelete.map(async (id) => {
          const res = await fetch(`/api/callbridge/events/${eventId}/contacts/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            console.warn(`Failed to delete contact ${id}`);
          }
        })
      );
      setActionFeedback(`Successfully deleted ${idsToDelete.length} contacts.`);
      // 3. Resync from backend
      await fetchContacts();
    } catch (e: any) {
      console.warn('Delete selected contacts error:', e);
      setActionFeedback(`Error: ${e.message || 'Failed to delete some contacts'}`);
      await fetchContacts();
    } finally {
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Filtered contacts
  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.locality && c.locality.toLowerCase().includes(q))
    );
  });

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

          {contacts.length > 0 && (
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
            placeholder="Search contacts by name, mobile, or locality..."
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

      {/* Action / Selection Notification Feedback Banner */}
      {actionFeedback && (
        <div className="flex items-center space-x-2 p-3 rounded-xl bg-indigo-50 text-indigo-900 text-xs border border-indigo-200 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Contacts Table */}
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
                <th className="px-4 py-3">Locality</th>
                <th className="px-4 py-3">Consent Status</th>
                <th className="px-4 py-3">Import Source</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
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
                      <td className="px-4 py-3 text-slate-500">{contact.locality || '—'}</td>
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
                      <td className="px-4 py-3 uppercase text-[10px] tracking-wide text-slate-400">
                        {contact.importSource}
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
              Paste a list of numbers or "Name, Phone Number" pairs. Separate multiple entries with newlines or commas.
            </p>

            <form onSubmit={handleParsePaste} className="space-y-4">
              <div>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Ramesh Kumar, 9876543210&#10;Suresh Reddy, 9876543211&#10;9876543212&#10;+91 98765 43213"
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

      {/* Modal: Edit Contact */}
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

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Locality</label>
                <input
                  type="text"
                  value={editLocality}
                  onChange={(e) => setEditLocality(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

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

      {/* Modal: Bulk Upload / Review Table */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 border border-slate-200 my-8">
            <div className="flex items-center justify-between mb-2">
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

            {/* If no preview yet, show upload file dropzone with Cancel button */}
            {!uploadPreview && (
              <div className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-8 border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/30 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex items-center space-x-3 text-blue-600 mb-2">
                    <FileSpreadsheet className="w-6 h-6" />
                    <FileText className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium text-slate-700">Click to browse file</p>
                  <p className="text-[11px] text-slate-400 mt-1">Supports CSV, Excel (.xlsx, .xls), and PDF documents</p>
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
              <div className="py-4 text-center text-xs text-blue-600 font-medium animate-pulse">
                Parsing document structure, normalizing phone numbers...
              </div>
            )}

            {uploadError && (
              <div className="mt-4 flex items-center space-x-2 p-3 rounded-lg bg-red-50 text-red-600 text-xs border border-red-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Review parsed records */}
            {uploadPreview && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-lg font-bold text-slate-800">{uploadPreview.records.length}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Detected</div>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <div className="text-lg font-bold text-emerald-700">{uploadPreview.validCount || 0}</div>
                    <div className="text-[10px] text-emerald-600 uppercase font-semibold">Valid Contacts</div>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                    <div className="text-lg font-bold text-rose-700">
                      {(uploadPreview.invalidCount || 0) + (uploadPreview.duplicateCount || 0)}
                    </div>
                    <div className="text-[10px] text-rose-600 uppercase font-semibold">Invalid / Duplicates</div>
                  </div>
                </div>

                {((uploadPreview.invalidCount || 0) + (uploadPreview.duplicateCount || 0)) > 0 && (
                  <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                    <span className="text-amber-800">
                      Remove {(uploadPreview.invalidCount || 0) + (uploadPreview.duplicateCount || 0)} invalid or duplicate numbers before proceeding?
                    </span>
                    <button
                      onClick={handleRemoveAllInvalid}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] cursor-pointer shadow-sm"
                    >
                      Remove All Invalid
                    </button>
                  </div>
                )}

                <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Phone</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {uploadPreview.records.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                          <td className="px-3 py-2 font-mono">{r.phone || r.rawPhone}</td>
                          <td className="px-3 py-2">
                            {r.isDuplicate ? (
                              <span className="text-amber-600 font-semibold text-[10px]">Duplicate</span>
                            ) : r.isValid ? (
                              <span className="text-emerald-600 font-semibold text-[10px]">Valid</span>
                            ) : (
                              <span className="text-red-500 font-semibold text-[10px]">Invalid format</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => handleRemovePreviewRow(i)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                              title="Remove this contact from import"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">
                    Total Valid Contacts Ready: <strong className="text-emerald-700">{uploadPreview.validCount}</strong>
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
                    <button
                      onClick={handleCommitBulk}
                      disabled={!uploadPreview.validCount || uploadPreview.validCount === 0}
                      className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      Save to Directory Only
                    </button>
                    <button
                      onClick={() => handleProceedWithData(uploadPreview.records)}
                      disabled={isProceeding || !uploadPreview.validCount || uploadPreview.validCount === 0}
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isProceeding ? 'Starting...' : 'Proceed with the data I have given'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
