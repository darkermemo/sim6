/**
 * Unit tests for useSearchAPI hooks
 *
 * Tests the core API layer that powers the entire application
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCompile, useExecute, useSchemaFields, useSchemaEnums, useGrammar, } from '../useSearchAPI';
import * as http from '../../lib/http';
// Mock the HTTP module
jest.mock('../../lib/http');
const mockHttp = http;
// Test wrapper with QueryClient
const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                staleTime: 0,
            },
        },
    });
    const Wrapper = ({ children }) => {
        return React.createElement(QueryClientProvider, { client: queryClient }, children);
    };
    return Wrapper;
};
describe('useSearchAPI hooks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('useCompile', () => {
        it('should compile query successfully', async () => {
            const mockResponse = {
                sql: 'SELECT * FROM dev.events WHERE tenant_id = \'hr\'',
                warnings: [],
            };
            mockHttp.post.mockResolvedValueOnce(mockResponse);
            const { result } = renderHook(() => useCompile({
                tenant_id: 'hr',
                q: '*',
                time: { last_seconds: 3600 },
            }), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
            });
            expect(result.current.data).toEqual(mockResponse);
            expect(mockHttp.post).toHaveBeenCalledWith('/search/compile', {
                tenant_id: 'hr',
                q: '*',
                time: { last_seconds: 3600 },
            });
        });
        it('should handle compile errors gracefully', async () => {
            const mockError = new Error('Syntax error in query');
            mockHttp.post.mockRejectedValueOnce(mockError);
            const { result } = renderHook(() => useCompile({
                tenant_id: 'hr',
                q: 'invalid query syntax',
                time: { last_seconds: 3600 },
            }), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isError).toBe(true);
            });
            expect(result.current.error).toEqual(mockError);
        });
    });
    describe('useExecute', () => {
        it('should execute query and return results', async () => {
            const mockResponse = {
                sql: 'SELECT * FROM dev.events',
                data: {
                    meta: [
                        { name: 'event_id', type: 'String' },
                        { name: 'message', type: 'String' },
                    ],
                    data: [
                        { event_id: '123', message: 'Test event' },
                    ],
                    rows: 1,
                    rows_before_limit_at_least: 1,
                    statistics: {},
                },
                took_ms: 15,
            };
            mockHttp.post.mockResolvedValueOnce(mockResponse);
            const { result } = renderHook(() => useExecute({
                tenant_id: 'hr',
                q: '*',
                time: { last_seconds: 3600 },
                limit: 100,
                sort: [{ field: 'event_timestamp', direction: 'desc' }],
            }), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
            });
            expect(result.current.data).toEqual(mockResponse);
            expect(result.current.data?.data.data).toHaveLength(1);
            expect(result.current.data?.data.meta).toHaveLength(2);
        });
        it('should be disabled when enabled option is false', () => {
            const { result } = renderHook(() => useExecute({
                tenant_id: 'hr',
                q: '*',
                time: { last_seconds: 3600 },
                limit: 100,
                sort: [{ field: 'event_timestamp', direction: 'desc' }],
            }, { enabled: false }), { wrapper: createWrapper() });
            expect(result.current.isFetching).toBe(false);
            expect(mockHttp.post).not.toHaveBeenCalled();
        });
    });
    describe('useSchemaFields', () => {
        it('should fetch schema fields successfully', async () => {
            const mockResponse = {
                fields: [
                    { name: 'event_id', type: 'String' },
                    { name: 'message', type: 'String' },
                    { name: 'event_timestamp', type: 'DateTime' },
                ],
            };
            mockHttp.getOptional.mockResolvedValueOnce(mockResponse);
            const { result } = renderHook(() => useSchemaFields('events'), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
            });
            expect(result.current.data).toEqual(mockResponse);
            expect(mockHttp.getOptional).toHaveBeenCalledWith('/schema/fields?table=events');
        });
        it('should handle missing schema endpoint gracefully', async () => {
            mockHttp.getOptional.mockResolvedValueOnce(undefined);
            const { result } = renderHook(() => useSchemaFields('events'), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
            });
            expect(result.current.data).toEqual({ fields: [] });
        });
    });
    describe('useSchemaEnums', () => {
        it('should fetch schema enums successfully', async () => {
            const mockResponse = {
                enums: {
                    severity: ['high', 'medium', 'low'],
                    event_type: ['login', 'logout', 'file_access'],
                },
            };
            mockHttp.getOptional.mockResolvedValueOnce(mockResponse);
            const { result } = renderHook(() => useSchemaEnums({ tenant_id: 'hr', last_seconds: 3600 }), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
            });
            expect(result.current.data).toEqual(mockResponse);
            expect(mockHttp.getOptional).toHaveBeenCalledWith('/schema/enums?tenant_id=hr&last_seconds=3600');
        });
        it('should handle missing enums endpoint gracefully', async () => {
            mockHttp.getOptional.mockResolvedValueOnce(undefined);
            const { result } = renderHook(() => useSchemaEnums(), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
            });
            expect(result.current.data).toEqual({ enums: {} });
        });
    });
    describe('useGrammar', () => {
        it('should fetch grammar successfully', async () => {
            const mockResponse = {
                operators: ['AND', 'OR', 'NOT'],
                field_ops: {
                    equals: 'field:value',
                    phrase: '"quoted phrase"',
                },
                fields: ['message', 'event_type', 'severity'],
            };
            mockHttp.getOptional.mockResolvedValueOnce(mockResponse);
            const { result } = renderHook(() => useGrammar(), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
            });
            expect(result.current.data).toEqual(mockResponse);
            expect(mockHttp.getOptional).toHaveBeenCalledWith('/search/grammar');
        });
        it('should handle missing grammar endpoint gracefully', async () => {
            mockHttp.getOptional.mockResolvedValueOnce(undefined);
            const { result } = renderHook(() => useGrammar(), { wrapper: createWrapper() });
            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true);
            });
            expect(result.current.data).toBeNull();
        });
    });
});
