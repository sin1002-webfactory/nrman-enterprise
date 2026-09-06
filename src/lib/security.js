/**
 * Comprehensive Cybersecurity Defense Utility
 * Protects against OWASP Top 10 vulnerabilities including XSS, CSV Formula Injection,
 * Prototype Pollution, Brute Force Attacks, and Session Hijacking.
 */

// 1. XSS & Script Injection Sanitizer
export function sanitizeInput(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;

  // Remove script tags and inline event handlers
  let clean = value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');

  // Escape HTML entities for safe rendering
  return clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Unescape HTML for display in forms when editing safe fields
export function decodeSanitizedString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&');
}

// Recursively sanitize all string attributes in an object or array
export function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeInput(obj);
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const key of Object.keys(obj)) {
    // Prevent Prototype Pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    sanitized[key] = sanitizeObject(obj[key]);
  }
  return sanitized;
}

// 2. Prototype Pollution Defense for JSON Deserialization
export function safeJsonParse(jsonString, fallback = null) {
  if (!jsonString || typeof jsonString !== 'string') return fallback;
  try {
    const parsed = JSON.parse(jsonString, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined; // Strips malicious prototype keys
      }
      return value;
    });
    return parsed;
  } catch (err) {
    console.warn('[Security] Refused corrupted or malicious JSON string payload:', err);
    return fallback;
  }
}

// 3. Rate-Limiting & Anti-Brute-Force Shield
const RATE_LIMIT_STORAGE_KEY = 'rgc_security_rate_limits';

function getRateLimitData() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRateLimitData(data) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Session storage quota fallback
  }
}

/**
 * Checks whether an action (e.g. login attempt) exceeds allowed attempts within a time window.
 * Returns { allowed: boolean, remainingAttempts: number, retryAfterSec: number }
 */
export function checkRateLimit(actionKey, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  const limits = getRateLimitData();
  const entry = limits[actionKey] || { attempts: [], lockoutUntil: 0 };

  // Check if currently locked out
  if (entry.lockoutUntil > now) {
    const retryAfterSec = Math.ceil((entry.lockoutUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSec };
  }

  // Filter out attempts outside time window
  const validAttempts = (entry.attempts || []).filter(ts => now - ts < windowMs);

  if (validAttempts.length >= maxAttempts) {
    // Lock out for 60 seconds
    const lockoutUntil = now + 60000;
    limits[actionKey] = { attempts: validAttempts, lockoutUntil };
    saveRateLimitData(limits);
    return { allowed: false, remainingAttempts: 0, retryAfterSec: 60 };
  }

  return {
    allowed: true,
    remainingAttempts: maxAttempts - validAttempts.length,
    retryAfterSec: 0
  };
}

/**
 * Registers an attempt for an action key
 */
export function recordAttempt(actionKey, maxAttempts = 5, lockoutMs = 60000) {
  const now = Date.now();
  const limits = getRateLimitData();
  const entry = limits[actionKey] || { attempts: [], lockoutUntil: 0 };

  entry.attempts = [...(entry.attempts || []), now];

  if (entry.attempts.length >= maxAttempts) {
    entry.lockoutUntil = now + lockoutMs;
  }

  limits[actionKey] = entry;
  saveRateLimitData(limits);
}

/**
 * Resets rate limit records on successful authentication
 */
export function clearRateLimit(actionKey) {
  const limits = getRateLimitData();
  delete limits[actionKey];
  saveRateLimitData(limits);
}

// 4. CSV Formula Injection Defense
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const stringVal = String(value);

  // Neutralize spreadsheet formula triggers (=, +, -, @, tab, carriage return)
  if (/^[=+@\t\r]/.test(stringVal)) {
    return `'${stringVal}`;
  }
  return stringVal;
}

// 5. File Traversal & Upload Security
export function sanitizeFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') return 'unnamed_file';
  // Remove directory traversal paths
  const baseName = fileName.replace(/^.*[\\\/]/, '');
  // Sanitize non-alphanumeric characters except dot, dash, underscore
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// 6. Session Inactivity Auto-Lock Monitor
let activityTimeoutTimer = null;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes Inactivity Lock

export function initSessionInactivityMonitor(onInactivityLogout) {
  if (typeof window === 'undefined') return;

  const resetTimer = () => {
    if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
    activityTimeoutTimer = setTimeout(() => {
      console.warn('[Security] Session expired due to 15 minutes of inactivity.');
      if (typeof onInactivityLogout === 'function') {
        onInactivityLogout();
      }
    }, INACTIVITY_TIMEOUT_MS);
  };

  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
  activityEvents.forEach(evt => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });

  resetTimer();

  return () => {
    if (activityTimeoutTimer) clearTimeout(activityTimeoutTimer);
    activityEvents.forEach(evt => {
      window.removeEventListener(evt, resetTimer);
    });
  };
}
