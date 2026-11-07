import { createRequire } from 'module';
import * as XLSX from 'xlsx';
import { callbridgeStorage, type ContactRecord } from '../storage/callbridgeStorage.ts';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export interface ParsedContactPreview {
  name: string;
  phone: string;
  rawPhone: string;
  email?: string;
  locality?: string;
  isValid: boolean;
  validationError?: string;
  isDuplicate: boolean;
}

export class ContactService {
  /**
   * Normalizes standard 10-digit phone numbers with or without country codes (+91, 0, etc.)
   */
  public static normalizePhoneNumber(raw: string): { normalized: string; isValid: boolean } {
    if (!raw) return { normalized: '', isValid: false };
    const cleaned = raw.replace(/[^\d+]/g, '');
    const digitsOnly = cleaned.replace(/\D/g, '');

    // Common Indian mobile patterns: 10 digits starting with 6, 7, 8, 9
    if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
      return { normalized: `+91${digitsOnly}`, isValid: true };
    }

    // 11 digits starting with 0
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0') && /^[6-9]/.test(digitsOnly.slice(1))) {
      return { normalized: `+91${digitsOnly.slice(1)}`, isValid: true };
    }

    // 12 digits starting with 91
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91') && /^[6-9]/.test(digitsOnly.slice(2))) {
      return { normalized: `+${digitsOnly}`, isValid: true };
    }

    // Generic international (min 10, max 15 digits)
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      return { normalized: cleaned.startsWith('+') ? cleaned : `+${digitsOnly}`, isValid: true };
    }

    return { normalized: cleaned, isValid: false };
  }

  /**
   * Parse CSV or Excel buffer using XLSX library
   */
  public static parseSpreadsheet(
    buffer: Buffer,
    eventId: string
  ): {
    headers: string[];
    records: ParsedContactPreview[];
    totalRows: number;
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
  } {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

    if (rawRows.length === 0) {
      return {
        headers: [],
        records: [],
        totalRows: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
      };
    }

    const headers = Object.keys(rawRows[0]);
    // Identify name and phone columns automatically
    const nameCol = headers.find((h) => /name|contact_name|person|full_name|పేరు|नाम/i.test(h)) || headers[0];
    const phoneCol = headers.find((h) => /phone|mobile|cell|contact_no|number|ఫోన్|नंबर/i.test(h)) || headers[1] || headers[0];
    const emailCol = headers.find((h) => /email|mail/i.test(h));
    const locCol = headers.find((h) => /locality|city|village|area|address|స్థలం|గ్రామం/i.test(h));

    const existingContacts = callbridgeStorage.getContacts(eventId);
    const existingPhones = new Set(existingContacts.map((c) => c.phone));

    const records: ParsedContactPreview[] = [];
    const seenBatchPhones = new Set<string>();

    for (const row of rawRows) {
      const rawName = String(row[nameCol] || '').trim();
      const rawPhone = String(row[phoneCol] || '').trim();
      const rawEmail = emailCol ? String(row[emailCol] || '').trim() : undefined;
      const rawLoc = locCol ? String(row[locCol] || '').trim() : undefined;

      if (!rawName && !rawPhone) continue;

      const { normalized, isValid } = this.normalizePhoneNumber(rawPhone);
      const isDuplicate = existingPhones.has(normalized) || seenBatchPhones.has(normalized);

      records.push({
        name: rawName || 'Resident',
        phone: normalized,
        rawPhone,
        email: rawEmail,
        locality: rawLoc,
        isValid,
        validationError: !isValid ? 'Invalid phone format (must be 10 digits)' : undefined,
        isDuplicate,
      });

      if (isValid) {
        seenBatchPhones.add(normalized);
      }
    }

    const validCount = records.filter((r) => r.isValid && !r.isDuplicate).length;
    const invalidCount = records.filter((r) => !r.isValid).length;
    const duplicateCount = records.filter((r) => r.isDuplicate).length;

    return {
      headers,
      records,
      totalRows: records.length,
      validCount,
      invalidCount,
      duplicateCount,
    };
  }

  /**
   * Parse PDF text to extract phone numbers and likely names
   */
  public static parsePdfText(
    text: string,
    eventId: string
  ): {
    records: ParsedContactPreview[];
    totalFound: number;
  } {
    const existingContacts = callbridgeStorage.getContacts(eventId);
    const existingPhones = new Set(existingContacts.map((c) => c.phone));
    const seenBatchPhones = new Set<string>();

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const records: ParsedContactPreview[] = [];

    // Regex for phone numbers in various formats: +91 9876543210, 98765-43210, etc.
    const phoneRegex = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;

    for (const line of lines) {
      const match = line.match(phoneRegex);
      if (match) {
        for (const rawPhone of match) {
          const { normalized, isValid } = this.normalizePhoneNumber(rawPhone);
          const namePart = line.replace(rawPhone, '').replace(/[,\-:|]/g, '').trim();
          const cleanName = namePart.length > 2 && namePart.length < 40 ? namePart : 'Contact from Document';
          const isDuplicate = existingPhones.has(normalized) || seenBatchPhones.has(normalized);

          records.push({
            name: cleanName,
            phone: normalized,
            rawPhone,
            isValid,
            isDuplicate,
          });

          if (isValid) seenBatchPhones.add(normalized);
        }
      }
    }

    return {
      records,
      totalFound: records.length,
    };
  }

  /**
   * Parse real binary PDF buffer with pdf-parse
   */
  public static async parsePdfBuffer(
    buffer: Buffer,
    eventId: string
  ): Promise<{
    records: ParsedContactPreview[];
    totalRows: number;
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
    textSample?: string;
  }> {
    try {
      const data = await pdf(buffer);
      const text = data.text || '';
      const parsed = this.parsePdfText(text, eventId);
      const validCount = parsed.records.filter((r) => r.isValid && !r.isDuplicate).length;
      const invalidCount = parsed.records.filter((r) => !r.isValid).length;
      const duplicateCount = parsed.records.filter((r) => r.isDuplicate).length;

      return {
        records: parsed.records,
        totalRows: parsed.records.length,
        validCount,
        invalidCount,
        duplicateCount,
        textSample: text.slice(0, 300),
      };
    } catch {
      // Fallback
      const fallbackText = buffer.toString('utf-8');
      const parsed = this.parsePdfText(fallbackText, eventId);
      const validCount = parsed.records.filter((r) => r.isValid && !r.isDuplicate).length;
      const invalidCount = parsed.records.filter((r) => !r.isValid).length;
      const duplicateCount = parsed.records.filter((r) => r.isDuplicate).length;

      return {
        records: parsed.records,
        totalRows: parsed.records.length,
        validCount,
        invalidCount,
        duplicateCount,
      };
    }
  }

  /**
   * Parse manual pasted text containing names and phone numbers
   */
  public static parseManualPasted(
    pastedText: string,
    eventId: string
  ): {
    records: ParsedContactPreview[];
    totalRows: number;
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
  } {
    const existingContacts = callbridgeStorage.getContacts(eventId);
    const existingPhones = new Set(existingContacts.map((c) => c.phone));
    const seenBatchPhones = new Set<string>();

    const lines = pastedText.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const records: ParsedContactPreview[] = [];

    for (const rawLine of lines) {
      let name = 'Resident';
      let phone = rawLine;

      if (rawLine.includes(',') || rawLine.includes('\t') || rawLine.includes(':') || rawLine.includes('|')) {
        const parts = rawLine.split(/[,:\t|]+/).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const p0Phone = /[\d+]{7,}/.test(parts[0]);
          const p1Phone = /[\d+]{7,}/.test(parts[1]);
          if (p1Phone && !p0Phone) {
            name = parts[0];
            phone = parts[1];
          } else if (p0Phone && !p1Phone) {
            phone = parts[0];
            name = parts[1];
          } else {
            phone = parts[0];
          }
        }
      }

      const { normalized, isValid } = this.normalizePhoneNumber(phone);
      const isDuplicate = existingPhones.has(normalized) || seenBatchPhones.has(normalized);

      records.push({
        name,
        phone: normalized,
        rawPhone: phone,
        isValid,
        validationError: !isValid ? 'Invalid phone format (must be 10 digits)' : undefined,
        isDuplicate,
      });

      if (isValid) {
        seenBatchPhones.add(normalized);
      }
    }

    const validCount = records.filter((r) => r.isValid && !r.isDuplicate).length;
    const invalidCount = records.filter((r) => !r.isValid).length;
    const duplicateCount = records.filter((r) => r.isDuplicate).length;

    return {
      records,
      totalRows: records.length,
      validCount,
      invalidCount,
      duplicateCount,
    };
  }
}
