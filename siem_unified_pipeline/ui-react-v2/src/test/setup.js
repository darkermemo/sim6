/**
 * Jest setup file for testing environment
 */
import '@testing-library/jest-dom';
// Mock IntersectionObserver for virtualization tests
global.IntersectionObserver = class IntersectionObserver {
    constructor() { }
    disconnect() { }
    observe() { }
    unobserve() { }
};
// Mock ResizeObserver for chart tests
global.ResizeObserver = class ResizeObserver {
    constructor() { }
    disconnect() { }
    observe() { }
    unobserve() { }
};
// Mock matchMedia for theme tests
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});
// Mock EventSource for SSE tests
global.EventSource = class EventSource {
    constructor(url) {
        this.url = url;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.readyState = 0;
        this.CONNECTING = 0;
        this.OPEN = 1;
        this.CLOSED = 2;
        this.url = '';
        this.withCredentials = false;
    }
    close() { }
    addEventListener() { }
    removeEventListener() { }
    dispatchEvent() { return true; }
};
