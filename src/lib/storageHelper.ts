/**
 * Safe Storage & Image Compression Utilities
 * Prevents LocalStorage QuotaExceededError and optimizes image storage.
 */

// In-memory fallback map if localStorage quota is completely exhausted
const inMemoryFallback = new Map<string, string>();

/**
 * Resizes and compresses an image file using an HTML5 canvas.
 * Reduces raw 2-10MB photos into compact 5-15KB WebP/JPEG data URLs.
 */
export async function compressImageFile(
  file: File,
  maxDimension = 140,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    // If already SVG or tiny file, read as is
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve((e.target?.result as string) || '');
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Prefer webp with fallback to jpeg
        let compressedDataUrl = '';
        try {
          compressedDataUrl = canvas.toDataURL('image/webp', quality);
        } catch {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(compressedDataUrl);
      };
      img.onerror = () => {
        resolve((e.target?.result as string) || '');
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Cleans up any bloated or stale keys in localStorage when quota is near limit.
 */
export function cleanupStorageQuota(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const keysToRemoveIfOversized = [
      'rgc_active_company',
      'rgc_company_registry',
      'rgc_profiles',
      'rgc_ledgers'
    ];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const val = localStorage.getItem(key) || '';
      // If a single key is over 400KB, sanitize or purge heavy sub-fields
      if (val.length > 400000) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.map((item) => {
              if (item && typeof item === 'object') {
                const clone = { ...item };
                if (clone.logo && clone.logo.length > 50000) clone.logo = null;
                if (clone.logoBase64 && clone.logoBase64.length > 50000) clone.logoBase64 = null;
                return clone;
              }
              return item;
            });
            localStorage.setItem(key, JSON.stringify(sanitized));
          } else if (parsed && typeof parsed === 'object') {
            const clone = { ...parsed };
            if (clone.logo && clone.logo.length > 50000) clone.logo = null;
            if (clone.logoBase64 && clone.logoBase64.length > 50000) clone.logoBase64 = null;
            localStorage.setItem(key, JSON.stringify(clone));
          }
        } catch {
          // If unparseable and huge, remove
          if (keysToRemoveIfOversized.includes(key)) {
            localStorage.removeItem(key);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Storage cleanup warning:', e);
  }
}

/**
 * Safely sets an item in localStorage with automatic quota recovery,
 * compression/stripping of heavy assets, and in-memory fallback.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.setItem(key, value);
    inMemoryFallback.set(key, value);
    return true;
  } catch (error: any) {
    console.warn(`LocalStorage quota exceeded when saving key "${key}". Initiating recovery...`, error);

    // 1. Run cleanup on oversized stored items
    cleanupStorageQuota();

    // 2. Try sanitizing the current value if it contains large base64 strings
    let sanitizedValue = value;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map((item) => {
          if (item && typeof item === 'object') {
            const copy = { ...item };
            if (copy.logo && copy.logo.length > 20000) copy.logo = null;
            if (copy.logoBase64 && copy.logoBase64.length > 20000) copy.logoBase64 = null;
            return copy;
          }
          return item;
        });
        sanitizedValue = JSON.stringify(cleaned);
      } else if (parsed && typeof parsed === 'object') {
        const copy = { ...parsed };
        if (copy.logo && copy.logo.length > 20000) copy.logo = null;
        if (copy.logoBase64 && copy.logoBase64.length > 20000) copy.logoBase64 = null;
        sanitizedValue = JSON.stringify(copy);
      }
    } catch {
      // not json
    }

    try {
      localStorage.setItem(key, sanitizedValue);
      inMemoryFallback.set(key, sanitizedValue);
      return true;
    } catch (secondErr) {
      // 3. Fallback to memory map so runtime never crashes
      inMemoryFallback.set(key, value);
      return false;
    }
  }
}

/**
 * Safely gets an item from localStorage with in-memory fallback.
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return inMemoryFallback.get(key) || null;

  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val;
    return inMemoryFallback.get(key) || null;
  } catch {
    return inMemoryFallback.get(key) || null;
  }
}

// Automatically run storage cleanup when module loads
if (typeof window !== 'undefined') {
  try {
    cleanupStorageQuota();
  } catch (_) {}
}
