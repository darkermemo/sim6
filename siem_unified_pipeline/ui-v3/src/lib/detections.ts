import { http as _http } from '@/lib/http'
import type {
  CompileReq, CompileRes, PreviewReq, PreviewRes,
  CreateDetectionReq, CreateDetectionRes, ListDetectionsRes,
  DetectionRecord, ScheduleReq, RunOnceRes
} from '@/types/detections'

const BASE = '/api/v2/detections'

async function httpGet<T>(path: string): Promise<T> { return _http<T>(path) }
async function httpPost<T>(path: string, body: any): Promise<T> {
  return _http<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
async function httpPut<T>(path: string, body: any): Promise<T> {
  return _http<T>(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
async function httpDelete<T>(path: string): Promise<T> { return _http<T>(path, { method: 'DELETE' }) }

export const DetectionsAPI = {
  compile: (body: CompileReq) => httpPost<CompileRes>(`${BASE}/compile`, body),
  preview: (body: PreviewReq) => httpPost<PreviewRes>(`${BASE}/preview`, body),

  create: (body: CreateDetectionReq) => httpPost<CreateDetectionRes>(`${BASE}`, body),
  update: (id: string, body: Partial<CreateDetectionReq>) => httpPut<DetectionRecord>(`${BASE}/${id}`, body),
  remove: (id: string) => httpDelete<{ ok: true }>(`${BASE}/${id}`),
  list: () => httpGet<ListDetectionsRes>(`${BASE}`),
  get: (id: string) => httpGet<DetectionRecord>(`${BASE}/${id}`),

  runOnce: (id: string) => httpPost<RunOnceRes>(`${BASE}/${id}/run-once`, {}),
  schedule: (id: string, body: ScheduleReq) => httpPost<DetectionRecord>(`${BASE}/${id}/schedule`, body),
}


