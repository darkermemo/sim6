import CryptoJS from 'crypto-js';

// Generate a key from user session data (this is a simple approach)
// In production, you might want to use a more sophisticated key derivation
const getEncryptionKey = (): string => {
  // Use a more stable key or clear data if key changes
  let sessionId = sessionStorage.getItem('session-id');
  if (!sessionId) {
    // If no session ID exists, clear any existing encrypted data
    // as it would be unreadable with a new key
    sessionStorage.removeItem('siem-auth-encrypted');
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('session-id', sessionId);
  }
  return sessionId;
};

interface SecureStorageData {
  accessToken: string | null;
  refreshToken: string | null;
  tenantId: string | null;
  isAuthenticated: boolean;
}

export class SecureStorage {
  private static readonly STORAGE_KEY = 'siem-auth-encrypted';
  private static readonly encryptionKey = getEncryptionKey();

  static setAuthData(data: SecureStorageData): void {
    try {
      const jsonString = JSON.stringify(data);
      const encrypted = CryptoJS.AES.encrypt(jsonString, this.encryptionKey).toString();
      sessionStorage.setItem(this.STORAGE_KEY, encrypted);
    } catch (error) {
      console.error('Failed to store auth data securely:', error);
    }
  }

  static getAuthData(): SecureStorageData | null {
    try {
      const encrypted = sessionStorage.getItem(this.STORAGE_KEY);
      if (!encrypted) return null;

      const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptionKey);
      const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!jsonString || jsonString.trim() === '') {
        console.warn('Decrypted data is empty, clearing corrupted auth data');
        this.clearAuthData();
        return null;
      }
      
      // Validate JSON before parsing
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        console.warn('Invalid auth data structure, clearing corrupted data');
        this.clearAuthData();
        return null;
      }
      
      return parsed as SecureStorageData;
    } catch (error) {
      console.error('Failed to retrieve auth data securely:', error);
      // Clear corrupted data on any error
      this.clearAuthData();
      return null;
    }
  }

  static clearAuthData(): void {
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
      sessionStorage.removeItem('session-id');
    } catch (error) {
      console.error('Failed to clear auth data:', error);
    }
  }

  static isAvailable(): boolean {
    try {
      const test = 'test';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }
}

// Fallback for when sessionStorage is not available
export class MemoryStorage {
  private static authData: SecureStorageData | null = null;

  static setAuthData(data: SecureStorageData): void {
    this.authData = data;
  }

  static getAuthData(): SecureStorageData | null {
    return this.authData;
  }

  static clearAuthData(): void {
    this.authData = null;
  }
}

// Main storage interface that chooses the best available option
export const authStorage = {
  setAuthData: (data: SecureStorageData) => {
    if (SecureStorage.isAvailable()) {
      SecureStorage.setAuthData(data);
    } else {
      MemoryStorage.setAuthData(data);
    }
  },

  getAuthData: (): SecureStorageData | null => {
    if (SecureStorage.isAvailable()) {
      return SecureStorage.getAuthData();
    } else {
      return MemoryStorage.getAuthData();
    }
  },

  clearAuthData: () => {
    if (SecureStorage.isAvailable()) {
      SecureStorage.clearAuthData();
    } else {
      MemoryStorage.clearAuthData();
    }
  }
};