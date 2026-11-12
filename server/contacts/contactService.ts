import { createRequire } from 'module';
import * as XLSX from 'xlsx';
import { callbridgeStorage, type ContactRecord } from '../storage/callbridgeStorage.ts';
import { GoogleGenAI } from '@google/genai';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');

export type ContactImportStatus = 'Valid' | 'Invalid' | 'Duplicate' | 'Needs Review';

export interface ParsedContactPreview {
  name: string;
  phone: string;
  rawPhone: string;
  email?: string;
  locality?: string;
  status: ContactImportStatus;
  reason: string;
  isValid: boolean;
  isDuplicate: boolean;
  sourceLineIndex?: number;
}

export interface ParseResult {
  records: ParsedContactPreview[];
  contacts?: ParsedContactPreview[];
  totalRows: number;
  totalFound: number;
  totalDetected?: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  needsReviewCount: number;
  headers?: string[];
  needsColumnMapping?: boolean;
  availableHeaders?: string[];
  sampleRows?: Record<string, any>[];
  textSample?: string;
  format?: string;
  error?: string;
}

export class ContactService {
  /**
   * Check if a candidate contact name is an invalid non-person label,
   * document keyword, accounting total, or table header.
   */
  public static isInvalidContactName(name: string): boolean {
    if (!name || typeof name !== 'string') return true;
    // Allow Latin, Digits, Telugu (\u0C00-\u0C7F) and Devanagari (\u0900-\u097F)
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9\s\u0C00-\u0C7F\u0900-\u097F]/g, '');
    if (!clean) return true;

    const invalidKeywords = new Set([
      'total', 'subtotal', 'grand total', 'tax', 'gst', 'gstin', 'vat', 'discount',
      'amount', 'balance', 'sum', 'count', 'average', 'reference', 'ref', 'ref no', 'ref id',
      'reference id', 'report', 'report id', 'id', 'invoice', 'invoice no', 'bill', 'bill no',
      'receipt', 'token', 'transaction', 'txn', 'account', 'ac', 'bank ac', 'pin', 'pin code',
      'pincode', 'postal', 'postal code', 'zip', 'zipcode', 'serial', 'sno', 's no', 'item',
      'item no', 'doc', 'document', 'doc ref', 'document ref', 'date', 'time', 'page',
      'confidential', 'copyright', 'note', 'notes', 'remarks', 'status', 'summary',
      'description', 'signature', 'sign', 'card', 'cheque', 'pan', 'aadhaar', 'uid', 'name',
      'phone', 'mobile', 'cell', 'number', 'contact', 'resident', 'phone number',
      'contact number', 'mobile number', 'table', 'column', 'created', 'printed', 'generated',
      'generated date', 'printed date', 'created date', 'header', 'footer', 'title', 'version',
      's no name'
    ]);

    if (invalidKeywords.has(clean)) return true;

    // Check if starts with accounting / metadata keyword
    if (/^(?:total|subtotal|grand\s*total|balance|amount|tax|gst|invoice|bill|receipt|report|pin|token|serial|page|date|time|generated|printed|created|reference|ref|doc)\b/i.test(name.trim())) {
      return true;
    }

    // Reject strings without any alphabetical or Indic letters (pure digits or symbols)
    if (!/[a-zA-Z\u0C00-\u0C7F\u0900-\u097F]/.test(name.trim())) return true;

    return false;
  }

  /**
   * Check if a text line is document metadata, headers, footers, page numbers,
   * reference IDs, invoice numbers, timestamps, PIN codes, accounting totals, etc.
   * that MUST NOT be extracted as phone numbers or contacts.
   */
  public static isUnrelatedDocumentLine(line: string): boolean {
    const t = line.trim();
    if (!t) return true;

    // 1. Page markers: "Page 1", "Page 1 of 5", "p. 2", "- 2 -", "Page: 2", "-- 1 of 1 --"
    if (/^(?:page\s*\d+|p\.\s*\d+|-\s*\d+\s*-|--\s*\d+\s*of\s*\d+\s*--|page\s*:\s*\d+)/i.test(t)) {
      return true;
    }
    if (/^page\s+\d+\s+of\s+\d+$/i.test(t)) {
      return true;
    }

    // 2. Document reference / tracking / transaction IDs
    if (/(?:doc(?:ument)?\s*(?:ref(?:erence)?|id|no)|ref(?:erence)?\s*(?:id|no|#)?)\s*[:\-]/i.test(t)) {
      return true;
    }

    // 3. Invoices, bills, receipts, orders, accounts, PIN codes, tax IDs, totals, balances, barcodes
    if (
      /(?:invoice|bill|receipt|order|ticket|tracking|barcode|account|a\/c|bank\s*a\/c|pan|gst|gstin|cin|tan|uid|aadhaar|pin\s*code|pincode|postal\s*code|total|subtotal|grand\s*total|balance|amount|sum|report\s*id|token)\s*(?:no|number|#|code|id)?\s*[:\-]/i.test(
        t
      )
    ) {
      return true;
    }

    // Line starting with Total / Subtotal / Balance / Amount / Tax / Summary
    if (/^(?:total|subtotal|grand\s*total|balance|amount|sum|tax|gst|summary)\b/i.test(t)) {
      return true;
    }

    // 4. Dates & timestamps
    if (/^(?:date|time|generated|printed|created|timestamp|modified|updated|exported)(?:\s+(?:date|time|at|on|by))?\s*[:\-]/i.test(t)) {
      return true;
    }
    if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(t)) {
      return true;
    }
    if (/^\d{4}-\d{2}-\d{2}(?:T|\s)\d{2}:\d{2}/.test(t)) {
      return true;
    }

    // 5. System footers, disclaimers, headers
    if (/(?:confidential|all rights reserved|copyright|callbridge ai|report id|printed on)/i.test(t)) {
      return true;
    }

    // 6. Coordinates or floating point decimals (e.g. 88.02400000)
    if (/^\d+\.\d{3,}$/.test(t)) {
      return true;
    }

    // 7. Very long isolated digit strings (16+ digits)
    if (/^\d{16,}$/.test(t)) {
      return true;
    }

    return false;
  }

  /**
   * Normalizes standard 10-digit phone numbers with or without country codes (+91, 0, etc.)
   * and preserves international numbers. Returns validity flag, normalized string, and reason.
   */
  public static normalizePhoneNumber(raw: string): {
    normalized: string;
    isValid: boolean;
    isAmbiguous: boolean;
    reason: string;
  } {
    if (!raw || typeof raw !== 'string') {
      return { normalized: '', isValid: false, isAmbiguous: false, reason: 'Empty phone number' };
    }

    const trimmed = raw.trim();
    const hasPlus = trimmed.startsWith('+');

    // Strip non-digit characters except leading plus
    const digitsOnly = trimmed.replace(/\D/g, '');

    if (!digitsOnly) {
      return { normalized: trimmed, isValid: false, isAmbiguous: false, reason: 'No digits found in phone number' };
    }

    // Reject numbers with excessive length (more than 15 digits is not an E.164 phone number)
    if (digitsOnly.length > 15) {
      return {
        normalized: trimmed,
        isValid: false,
        isAmbiguous: false,
        reason: `Invalid digit length (${digitsOnly.length} digits: likely a reference or ID number)`,
      };
    }

    // Reject numbers ending with 4 or more zeros (e.g. 8802400000, 8805100000, 8807800000)
    // These are accounting amounts, rounded balances, or barcode coordinates, not allocated mobile numbers.
    if (/0000+$/.test(digitsOnly)) {
      return {
        normalized: trimmed,
        isValid: false,
        isAmbiguous: false,
        reason: 'Invalid phone number: ends with repetitive zeros (likely an amount or document ID)',
      };
    }

    // Reject all identical repeating digits (e.g. 9999999999, 0000000000)
    if (/^(\d)\1{9,}$/.test(digitsOnly)) {
      return {
        normalized: trimmed,
        isValid: false,
        isAmbiguous: false,
        reason: 'Invalid phone number: all identical repeating digits',
      };
    }

    // Reject dates and timestamps (e.g. 20261112..., starting with 2020-2029)
    if (!hasPlus && digitsOnly.length >= 8 && /^202[0-9]/.test(digitsOnly)) {
      return {
        normalized: trimmed,
        isValid: false,
        isAmbiguous: false,
        reason: 'Invalid phone number: timestamp or date format (starts with year 202x)',
      };
    }

    // 1. Standard Indian 10-digit mobile number: starts with 6, 7, 8, 9
    // Mobile series in India: 7xxx, 8xxx, 9xxx, and 62xx/63xx/64xx (Jio/Airtel/Vi).
    // Numbers starting with 60 or 61 (e.g. 6111123435) are landline/STD codes.
    if (digitsOnly.length === 10) {
      if (/^[7-9]\d{9}$|^6[2-4]\d{8}$/.test(digitsOnly)) {
        return {
          normalized: `+91${digitsOnly}`,
          isValid: true,
          isAmbiguous: false,
          reason: 'Valid 10-digit Indian mobile number',
        };
      } else if (/^6\d{9}$/.test(digitsOnly)) {
        return {
          normalized: digitsOnly,
          isValid: false,
          isAmbiguous: true,
          reason: 'Invalid Indian mobile: 6-series must be active mobile allocation (62/63/64)',
        };
      } else {
        return {
          normalized: digitsOnly,
          isValid: false,
          isAmbiguous: true,
          reason: 'Invalid Indian mobile: 10 digits must start with 6, 7, 8, or 9',
        };
      }
    }

    // 2. 11 digits starting with 0 (Indian landline or mobile with trunk 0)
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      const rest = digitsOnly.slice(1);
      if (/^[7-9]\d{9}$|^6[2-4]\d{8}$/.test(rest)) {
        return {
          normalized: `+91${rest}`,
          isValid: true,
          isAmbiguous: false,
          reason: 'Valid Indian mobile with leading trunk 0',
        };
      }
    }

    // 3. 12 digits starting with 91 (Indian mobile with 91 prefix)
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      const rest = digitsOnly.slice(2);
      if (/^[7-9]\d{9}$|^6[2-4]\d{8}$/.test(rest)) {
        return {
          normalized: `+91${rest}`,
          isValid: true,
          isAmbiguous: false,
          reason: 'Valid Indian mobile with 91 prefix',
        };
      }
    }

    // 4. 13 digits starting with 091
    if (digitsOnly.length === 13 && digitsOnly.startsWith('091')) {
      const rest = digitsOnly.slice(3);
      if (/^[7-9]\d{9}$|^6[2-4]\d{8}$/.test(rest)) {
        return {
          normalized: `+91${rest}`,
          isValid: true,
          isAmbiguous: false,
          reason: 'Valid Indian mobile with 091 prefix',
        };
      }
    }

    // 5. Valid International Number: explicit leading '+' with 7-15 digits
    if (hasPlus && digitsOnly.length >= 7 && digitsOnly.length <= 15) {
      return {
        normalized: `+${digitsOnly}`,
        isValid: true,
        isAmbiguous: false,
        reason: 'Valid international phone number with country code',
      };
    }

    // 6. Ambiguous international number without '+' (e.g. 14155552671)
    if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
      return {
        normalized: `+${digitsOnly}`,
        isValid: true,
        isAmbiguous: true,
        reason: 'International number without leading + (normalized)',
      };
    }

    // 7. Incomplete numbers (less than 10 digits)
    if (digitsOnly.length < 10) {
      return {
        normalized: digitsOnly,
        isValid: false,
        isAmbiguous: false,
        reason: `Incomplete phone number (${digitsOnly.length} digits, expected 10)`,
      };
    }

    return {
      normalized: trimmed,
      isValid: false,
      isAmbiguous: false,
      reason: `Unrecognized phone format (${digitsOnly.length} digits)`,
    };
  }

  /**
   * Helper to evaluate status & duplicate state for an extracted record
   */
  public static evaluateRecordStatus(
    record: {
      name: string;
      rawPhone: string;
      email?: string;
      locality?: string;
    },
    existingPhones: Set<string>,
    seenBatchPhones: Set<string>
  ): ParsedContactPreview {
    const { normalized, isValid, isAmbiguous, reason } = this.normalizePhoneNumber(record.rawPhone);

    const isMissingName = !record.name || record.name.trim() === 'Resident' || record.name.trim() === 'Contact';
    const isDupInBatch = isValid && seenBatchPhones.has(normalized);
    const isDupInDb = isValid && !isDupInBatch && existingPhones.has(normalized);
    const isDuplicate = isDupInBatch || isDupInDb;

    let status: ContactImportStatus = 'Valid';
    let finalReason = reason;

    if (!isValid) {
      if (isAmbiguous) {
        status = 'Needs Review';
        finalReason = reason;
      } else {
        status = 'Invalid';
        finalReason = reason;
      }
    } else if (isDuplicate) {
      status = 'Duplicate';
      finalReason = isDupInBatch
        ? `Duplicate phone number in uploaded file (${normalized})`
        : `Duplicate: Phone number already exists in event directory`;
    } else if (isAmbiguous) {
      status = 'Needs Review';
      finalReason = reason;
    } else if (isMissingName) {
      status = 'Needs Review';
      finalReason = 'Missing contact name in source document (defaulted to Resident)';
    }

    if (isValid && !isDuplicate) {
      seenBatchPhones.add(normalized);
    }

    return {
      name: (record.name || 'Resident').trim(),
      phone: normalized,
      rawPhone: record.rawPhone,
      email: record.email,
      locality: record.locality,
      status,
      reason: finalReason,
      isValid,
      isDuplicate,
    };
  }

  /**
   * Parse CSV or Excel buffer using XLSX library
   */
  public static parseSpreadsheet(
    buffer: Buffer,
    eventId: string,
    options?: { nameCol?: string; phoneCol?: string; localityCol?: string }
  ): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return {
        records: [],
        totalRows: 0,
        totalFound: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        needsReviewCount: 0,
        headers: [],
      };
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

    if (rawRows.length === 0) {
      return {
        records: [],
        totalRows: 0,
        totalFound: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        needsReviewCount: 0,
        headers: [],
      };
    }

    const headers = Object.keys(rawRows[0]);

    // Check custom options or auto-identify
    let nameCol = options?.nameCol;
    let phoneCol = options?.phoneCol;
    let locCol = options?.localityCol;

    if (!nameCol) {
      nameCol = headers.find((h) =>
        /^(?:name|full[\s_]?name|contact[\s_]?name|person|resident|voter|guest|citizen|candidate|పేరు|नाम)$/i.test(h.trim())
      );
      if (!nameCol) {
        nameCol = headers.find((h) => /name|person|resident|పేరు|नाम/i.test(h) && !/file|event|user|client/i.test(h));
      }
    }

    if (!phoneCol) {
      phoneCol = headers.find((h) =>
        /^(?:phone|mobile|cell|contact[\s_]?no|phone[\s_]?no|phone[\s_]?number|mobile[\s_]?number|contact[\s_]?number|cell[\s_]?number|telephone|ఫోన్|నెంబర్|नंबर)$/i.test(
          h.trim()
        )
      );
      if (!phoneCol) {
        phoneCol = headers.find((h) => /phone|mobile|cell|contact|ఫోన్|నెంబర్|नंबर/i.test(h));
      }
    }

    if (!locCol) {
      locCol = headers.find((h) => /^(?:locality|city|village|area|address|ward|స్థలం|గ్రామం)$/i.test(h.trim()));
    }
    const emailCol = headers.find((h) => /email|mail/i.test(h));

    // If neither Name nor Phone can be identified with high confidence, request column mapping
    if (!nameCol || !phoneCol) {
      return {
        records: [],
        totalRows: rawRows.length,
        totalFound: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        needsReviewCount: 0,
        headers,
        needsColumnMapping: true,
        availableHeaders: headers,
        sampleRows: rawRows.slice(0, 5),
      };
    }

    const existingContacts = callbridgeStorage.getContacts(eventId);
    const existingPhones = new Set(existingContacts.map((c) => c.phone));
    const seenBatchPhones = new Set<string>();

    const records: ParsedContactPreview[] = [];

    for (let idx = 0; idx < rawRows.length; idx++) {
      const row = rawRows[idx];
      const rawName = String(row[nameCol] || '').trim();
      const rawPhone = String(row[phoneCol] || '').trim();
      const rawEmail = emailCol ? String(row[emailCol] || '').trim() : undefined;
      const rawLoc = locCol ? String(row[locCol] || '').trim() : undefined;

      // Skip empty row
      if (!rawName && !rawPhone) continue;

      const preview = this.evaluateRecordStatus(
        {
          name: rawName || 'Resident',
          rawPhone,
          email: rawEmail,
          locality: rawLoc,
        },
        existingPhones,
        seenBatchPhones
      );
      preview.sourceLineIndex = idx + 1;
      records.push(preview);
    }

    const validCount = records.filter((r) => r.status === 'Valid').length;
    const invalidCount = records.filter((r) => r.status === 'Invalid').length;
    const duplicateCount = records.filter((r) => r.status === 'Duplicate').length;
    const needsReviewCount = records.filter((r) => r.status === 'Needs Review').length;

    return {
      headers,
      records,
      totalRows: records.length,
      totalFound: records.length,
      validCount,
      invalidCount,
      duplicateCount,
      needsReviewCount,
      format: 'spreadsheet',
    };
  }

  /**
   * Parse PDF text layout-aware to extract ONLY real contact entries.
   * Completely excludes header/footer metadata, page numbers, document reference IDs,
   * invoice numbers, timestamps, and PIN codes.
   */
  public static parsePdfText(
    text: string,
    eventId: string
  ): ParseResult {
    const existingContacts = callbridgeStorage.getContacts(eventId);
    const existingPhones = new Set(existingContacts.map((c) => c.phone));
    const seenBatchPhones = new Set<string>();

    // Normalize unicode non-breaking spaces, zero-width characters, and unicode hyphens/dashes
    const normalizedText = text
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const rawLines = normalizedText.split('\n').map((l) => l.trim());
    const records: ParsedContactPreview[] = [];

    // Filter out obvious document metadata lines (headers, footers, page numbers, doc refs, invoices, totals)
    const linesWithIndex: Array<{ line: string; originalIndex: number }> = [];
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i];
      if (!l) continue;
      if (this.isUnrelatedDocumentLine(l)) {
        continue;
      }
      linesWithIndex.push({ line: l, originalIndex: i });
    }

    const handledIndices = new Set<number>();

    // Pass 1: Detect Tabular PDF with Column Headers (Format 3)
    let isTableMode = false;
    let tableHeaderIndex = -1;
    let nameColIdx = -1;
    let phoneColIdx = -1;

    for (let i = 0; i < linesWithIndex.length; i++) {
      const line = linesWithIndex[i].line;
      const colSplit = line.split(/\t+| {2,}|\|/).map((p) => p.trim()).filter(Boolean);
      if (colSplit.length >= 2) {
        const nIdx = colSplit.findIndex((p) => /^(?:name|full[\s_]?name|contact[\s_]?name|person|resident|పేరు|नाम)$/i.test(p));
        const pIdx = colSplit.findIndex((p) =>
          /^(?:phone|mobile|cell|contact[\s_]?no|phone[\s_]?no|phone[\s_]?number|mobile[\s_]?number|contact[\s_]?number|number|ఫోన్|నెంబర్|नंबर)$/i.test(
            p
          )
        );
        if (nIdx !== -1 && pIdx !== -1) {
          isTableMode = true;
          tableHeaderIndex = i;
          nameColIdx = nIdx;
          phoneColIdx = pIdx;
          handledIndices.add(i);
          break;
        }
      }
    }

    if (isTableMode && tableHeaderIndex !== -1) {
      for (let i = tableHeaderIndex + 1; i < linesWithIndex.length; i++) {
        const item = linesWithIndex[i];
        const line = item.line;

        if (
          /^(?:total|subtotal|grand\s*total|balance|amount|sum|tax|gst|report|note|notes|terms|disclaimer|signature)\b/i.test(line) ||
          this.isUnrelatedDocumentLine(line)
        ) {
          break;
        }

        const cols = line.split(/\t+| {2,}|\|/).map((p) => p.trim()).filter(Boolean);
        if (cols.length > Math.max(nameColIdx, phoneColIdx)) {
          const rawName = cols[nameColIdx];
          const rawPhone = cols[phoneColIdx];

          if (
            rawPhone &&
            !this.isUnrelatedDocumentLine(rawPhone) &&
            !this.isInvalidContactName(rawName)
          ) {
            const preview = this.evaluateRecordStatus(
              { name: rawName, rawPhone },
              existingPhones,
              seenBatchPhones
            );
            preview.sourceLineIndex = item.originalIndex + 1;
            records.push(preview);
            handledIndices.add(i);
          }
        }
      }
    }

    // Pass 2: Detect Labeled Multi-line Contact Blocks (Format 2)
    // Example:
    // Name: Ravi
    // Number: 9876543210
    for (let i = 0; i < linesWithIndex.length; i++) {
      if (handledIndices.has(i)) continue;
      const item = linesWithIndex[i];
      const line = item.line;

      const nameMatch = line.match(/^(?:name|person|resident|contact|full[\s_]?name)\s*[:\-]\s*(.+)$/i);
      if (nameMatch) {
        const candidateName = nameMatch[1].trim();
        if (!this.isInvalidContactName(candidateName)) {
          let lookAhead = 1;
          while (i + lookAhead < linesWithIndex.length && lookAhead <= 3) {
            const nextItem = linesWithIndex[i + lookAhead];
            const nextLine = nextItem.line;
            const phoneMatch = nextLine.match(
              /^(?:phone|mobile|number|cell|contact[\s_]?no|phone[\s_]?no|mobile[\s_]?number)\s*[:\-]\s*(\+?\d[\d\s\-]{7,15}\d)$/i
            );
            if (phoneMatch) {
              handledIndices.add(i);
              handledIndices.add(i + lookAhead);
              if (i > 0 && /^\d+[\.\)]?$/.test(linesWithIndex[i - 1].line)) {
                handledIndices.add(i - 1);
              }
              const preview = this.evaluateRecordStatus(
                { name: candidateName, rawPhone: phoneMatch[1].trim() },
                existingPhones,
                seenBatchPhones
              );
              preview.sourceLineIndex = item.originalIndex + 1;
              records.push(preview);
              i += lookAhead;
              break;
            }
            lookAhead++;
          }
        }
      }
    }

    // Pass 3: Detect Unlabelled Multi-line Pairs (Format 2 variant)
    // Line i: Candidate Name (e.g. "Ravi" or "1. Suresh")
    // Line i+1: Phone Number (e.g. "9876543210" or "+919123456780")
    const standalonePhoneRegex = /^(\+?\d[\d\s\-]{8,15}\d)$/;
    for (let i = 0; i < linesWithIndex.length - 1; i++) {
      if (handledIndices.has(i) || handledIndices.has(i + 1)) continue;
      const curLine = linesWithIndex[i].line.trim();
      const nextLine = linesWithIndex[i + 1].line.trim();

      if (standalonePhoneRegex.test(nextLine)) {
        let candidateName = curLine.replace(/^[0-9]+[\.\)\-\:\s]+/, '').trim();
        if (
          candidateName.length >= 2 &&
          candidateName.length <= 50 &&
          !standalonePhoneRegex.test(candidateName) &&
          !this.isInvalidContactName(candidateName) &&
          !this.isUnrelatedDocumentLine(candidateName)
        ) {
          handledIndices.add(i);
          handledIndices.add(i + 1);
          const preview = this.evaluateRecordStatus(
            { name: candidateName, rawPhone: nextLine },
            existingPhones,
            seenBatchPhones
          );
          preview.sourceLineIndex = linesWithIndex[i].originalIndex + 1;
          records.push(preview);
          i++;
        }
      }
    }

    // Pass 4 & Pass 5: Single-line Delimited, Space-separated, Numbered Lists & Bare Phone lines (Format 1 & Format 4)
    // Examples:
    // "Ravi – 9876543210"
    // "1. Suresh: 9123456780"
    // "Geetha | 9988776655"
    // "Ramesh, 9876543210"
    // "Ravi 9876543210"
    // "1. Ravi 9876543210"
    // "రవి 9876543210"
    // "+919876543210"
    // "1. 9876543210"
    const phoneScanRegex = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\+?\d{1,4}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b|\b[6-9]\d{9}\b|\b\d{10,13}\b/;

    for (let i = 0; i < linesWithIndex.length; i++) {
      if (handledIndices.has(i)) continue;
      const item = linesWithIndex[i];
      const line = item.line;

      if (this.isUnrelatedDocumentLine(line)) continue;

      const match = line.match(phoneScanRegex);
      if (match) {
        const rawPhone = match[0].trim();
        const pIdx = match.index ?? 0;
        let before = line.slice(0, pIdx).trim();
        let after = line.slice(pIdx + match[0].length).trim();

        before = before.replace(/[\:\-\–\—\|\,\t\s]+$/, '').trim();
        before = before.replace(/^[0-9]+[\.\)\-\:\s]+/, '').trim();
        before = before.replace(/^(?:name|contact)\s*[:\-]?\s*/i, '').trim();
        after = after.replace(/^[\:\-\–\—\|\,\t\s]+/, '').trim();

        let candidateName = 'Resident';
        if (
          before &&
          !this.isInvalidContactName(before) &&
          !this.isUnrelatedDocumentLine(before)
        ) {
          candidateName = before;
        }

        const locality = after && after.length < 50 && !this.isUnrelatedDocumentLine(after) ? after : undefined;

        const preview = this.evaluateRecordStatus(
          { name: candidateName, rawPhone, locality },
          existingPhones,
          seenBatchPhones
        );
        preview.sourceLineIndex = item.originalIndex + 1;
        records.push(preview);
        handledIndices.add(i);
      }
    }

    const validCount = records.filter((r) => r.status === 'Valid').length;
    const invalidCount = records.filter((r) => r.status === 'Invalid').length;
    const duplicateCount = records.filter((r) => r.status === 'Duplicate').length;
    const needsReviewCount = records.filter((r) => r.status === 'Needs Review').length;

    console.log('[PDF_IMPORT_CONTACT_CANDIDATES]', { candidateCount: records.length });
    console.log('[PDF_IMPORT_VALIDATION_RESULT]', {
      validCount,
      invalidCount,
      duplicateCount,
      needsReviewCount,
      totalDetected: records.length,
    });

    return {
      records,
      contacts: records,
      totalRows: records.length,
      totalFound: records.length,
      totalDetected: records.length,
      validCount,
      invalidCount,
      duplicateCount,
      needsReviewCount,
      textSample: text.slice(0, 300),
      format: 'pdf',
    };
  }

  /**
   * Parse real binary PDF buffer using modern PDFParse.
   * Never falls back to raw binary UTF-8 regex string searching.
   * If PDF is a scanned image with no text layer, uses Gemini OCR if API key exists.
   */
  public static async parsePdfBuffer(
    buffer: Buffer,
    eventId: string
  ): Promise<ParseResult> {
    try {
      // 1. Try modern PDFParse class
      let extractedText = '';
      let pageCount = 1;

      try {
        if (pdfParseModule?.PDFParse) {
          console.log('[PDF_IMPORT_PARSER_INITIALIZED]', { parser: 'PDFParse (class)' });
          const parser = new pdfParseModule.PDFParse({ data: buffer });
          const res = await parser.getText();
          pageCount = Array.isArray(res.pages) && res.pages.length > 0 ? res.pages.length : (res.total || 1);
          console.log('[PDF_IMPORT_PAGE_COUNT]', { pageCount });
          extractedText = res.text || '';
          if (Array.isArray(res.pages) && res.pages.length > 0) {
            extractedText = res.pages.map((p: any) => p.text || '').join('\n');
          }
          await parser.destroy();
        } else if (typeof pdfParseModule === 'function') {
          console.log('[PDF_IMPORT_PARSER_INITIALIZED]', { parser: 'pdf-parse (function)' });
          const res = await pdfParseModule(buffer);
          pageCount = res.numpages || 1;
          console.log('[PDF_IMPORT_PAGE_COUNT]', { pageCount });
          extractedText = res.text || '';
        }
      } catch (parseErr: any) {
        console.warn('[PDF_PARSER_TEXT_WARN]', parseErr?.message || parseErr);
      }

      console.log('[PDF_IMPORT_EXTRACTED_TEXT_LENGTH]', { length: (extractedText || '').length });
      console.log('[PDF_IMPORT_EXTRACTED_TEXT_PREVIEW]', {
        preview: (extractedText || '').slice(0, 200).replace(/\r?\n/g, ' '),
      });

      // 2. If extractedText has valid content, run layout-aware parser
      if (extractedText && extractedText.trim().length > 3) {
        return this.parsePdfText(extractedText, eventId);
      }

      // 3. If extractedText is empty/sparse, this is likely a scanned image PDF.
      // Use Gemini OCR if GEMINI_API_KEY is available.
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: 'application/pdf',
                      data: buffer.toString('base64'),
                    },
                  },
                  {
                    text: `Extract all contact entries from this scanned PDF document.
Return ONLY valid JSON with this exact array structure:
[
  { "name": "Contact Name", "rawPhone": "9876543210", "locality": "Optional Locality" }
]
CRITICAL RULES:
- Extract ONLY genuine contact entries with their associated phone numbers.
- Do NOT extract reference IDs, dates, page numbers, invoice numbers, tax IDs, or PIN codes.
- Do NOT guess, invent, or fabricate numbers.
- Preserve original document row order.`,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
            },
          });

          const jsonText = response.text || '[]';
          const ocrContacts = JSON.parse(jsonText);
          if (Array.isArray(ocrContacts) && ocrContacts.length > 0) {
            const existingContacts = callbridgeStorage.getContacts(eventId);
            const existingPhones = new Set(existingContacts.map((c) => c.phone));
            const seenBatchPhones = new Set<string>();

            const records: ParsedContactPreview[] = ocrContacts.map((c: any, idx: number) => {
              const preview = this.evaluateRecordStatus(
                { name: c.name, rawPhone: c.rawPhone || c.phone, locality: c.locality },
                existingPhones,
                seenBatchPhones
              );
              preview.sourceLineIndex = idx + 1;
              return preview;
            });

            console.log('[PDF_IMPORT_CONTACT_CANDIDATES]', { candidateCount: records.length, source: 'gemini_ocr' });

            return {
              records,
              contacts: records,
              totalRows: records.length,
              totalFound: records.length,
              totalDetected: records.length,
              validCount: records.filter((r) => r.status === 'Valid').length,
              invalidCount: records.filter((r) => r.status === 'Invalid').length,
              duplicateCount: records.filter((r) => r.status === 'Duplicate').length,
              needsReviewCount: records.filter((r) => r.status === 'Needs Review').length,
              format: 'pdf_ocr',
            };
          }
        } catch (ocrErr: any) {
          console.warn('[GEMINI_PDF_OCR_WARN]', ocrErr?.message || ocrErr);
        }
      }

      // If text extraction yielded nothing and no OCR succeeded, return empty records with clear notice
      return {
        records: [],
        contacts: [],
        totalRows: 0,
        totalFound: 0,
        totalDetected: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        needsReviewCount: 0,
        format: 'pdf',
        error:
          'No selectable contact text found in this PDF. If this is a scanned document image, please provide a searchable PDF, CSV, or Excel file.',
      };
    } catch (fatalErr: any) {
      return {
        records: [],
        contacts: [],
        totalRows: 0,
        totalFound: 0,
        totalDetected: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        needsReviewCount: 0,
        format: 'pdf',
        error: `Failed to parse PDF document: ${fatalErr?.message || fatalErr}`,
      };
    }
  }

  /**
   * Parse manual pasted text containing names and phone numbers
   */
  public static parseManualPasted(
    pastedText: string,
    eventId: string
  ): ParseResult {
    const existingContacts = callbridgeStorage.getContacts(eventId);
    const existingPhones = new Set(existingContacts.map((c) => c.phone));
    const seenBatchPhones = new Set<string>();

    const rawLines = pastedText.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const records: ParsedContactPreview[] = [];

    for (let idx = 0; idx < rawLines.length; idx++) {
      const rawLine = rawLines[idx];
      let name = 'Resident';
      let phone = rawLine;
      let locality: string | undefined;

      // Comma, colon, tab, or pipe separated: "Ramesh, 9876543210, Ward 4" or "Ravi - +91 98765 43210"
      if (rawLine.includes(',') || rawLine.includes('\t') || rawLine.includes(':') || rawLine.includes('|') || rawLine.includes('–') || rawLine.includes('—') || rawLine.includes('-')) {
        const parts = rawLine.split(/[,:\t|–—\-]+/).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const p0Digits = parts[0].replace(/\D/g, '').length;
          const p1Digits = parts[1].replace(/\D/g, '').length;

          if (p1Digits > 0 && p0Digits === 0) {
            name = parts[0];
            phone = parts[1];
            if (parts.length > 2) locality = parts[2];
          } else if (p0Digits > 0 && p1Digits === 0) {
            phone = parts[0];
            name = parts[1];
            if (parts.length > 2) locality = parts[2];
          } else if (p1Digits >= 7 && p0Digits < 7) {
            name = parts[0];
            phone = parts[1];
            if (parts.length > 2) locality = parts[2];
          } else if (p0Digits >= 7 && p1Digits < 7) {
            phone = parts[0];
            name = parts[1];
            if (parts.length > 2) locality = parts[2];
          } else if (/[a-zA-Z\u0C00-\u0C7F\u0900-\u097F]/.test(parts[0])) {
            name = parts[0];
            phone = parts[1];
            if (parts.length > 2) locality = parts[2];
          } else {
            phone = parts[0];
          }
        }
      }

      // Strip leading serial numbers from name
      name = name.replace(/^[0-9]+[\.\)\-\:\s]+/, '').trim();

      const preview = this.evaluateRecordStatus(
        { name, rawPhone: phone, locality },
        existingPhones,
        seenBatchPhones
      );
      preview.sourceLineIndex = idx + 1;
      records.push(preview);
    }

    const validCount = records.filter((r) => r.status === 'Valid').length;
    const invalidCount = records.filter((r) => r.status === 'Invalid').length;
    const duplicateCount = records.filter((r) => r.status === 'Duplicate').length;
    const needsReviewCount = records.filter((r) => r.status === 'Needs Review').length;

    return {
      records,
      totalRows: records.length,
      totalFound: records.length,
      validCount,
      invalidCount,
      duplicateCount,
      needsReviewCount,
      format: 'manual_paste',
    };
  }
}
