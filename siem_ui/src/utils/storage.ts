/**
 * Storage abstraction for dependency injection and testing
 */
export interface StorageProvider {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/**
 * Browser localStorage implementation
 */
export class BrowserStorageProvider implements StorageProvider {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('Failed to access localStorage:', error);
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to write to localStorage:', error);
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  }

  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }
}

/**
 * In-memory storage implementation for testing
 */
export class MemoryStorageProvider implements StorageProvider {
  private storage = new Map<string, string>();

  getItem(key: string): string | null {
    return this.storage.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }

  // Additional methods for testing
  size(): number {
    return this.storage.size;
  }

  keys(): string[] {
    return Array.from(this.storage.keys());
  }
}

/**
 * Storage context for React dependency injection
 */
import React, { createContext, useContext, ReactNode } from 'react';

export const StorageContext = createContext<StorageProvider>(new BrowserStorageProvider());

/**
 * Hook to access storage provider from context
 */
export const useStorage = (): StorageProvider => {
  const storage = useContext(StorageContext);
  if (!storage) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  return storage;
};

/**
 * Storage provider component for React context
 */
interface StorageProviderProps {
  children: ReactNode;
  storage?: StorageProvider;
}

export const StorageProviderComponent: React.FC<StorageProviderProps> = ({ 
  children, 
  storage = new BrowserStorageProvider() 
}) => {
  return React.createElement(
    StorageContext.Provider,
    { value: storage },
    children
  );
};