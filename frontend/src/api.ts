import type { ApiPage, CorrectiveAction, Dashboard, Equipment, Reading, Station, User } from './types'

const API_BASE = (import.meta as any).env?.VITE_API_BASE || ''
let currentToken: string | null = null
export function setToken(token: string | null) { currentToken = token }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try { const body = await response.json(); message = body.detail || body.message || message } catch { /* keep status message */ }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function params(values: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams()
  Object.entries(values).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v) !== '' && String(v) !== 'ALL') search.set(k, String(v)) })
  return search.toString() ? `?${search.toString()}` : ''
}

export const api = {
  login: (username: string, password: string) => request<{access_token: string; token_type: string; user: User}>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request<User>('/api/auth/me'),
  models: () => request<{id:number;name:string;equipment_count:number}[]>('/api/models'),
  dashboard: (model: string, zone: string) => request<Dashboard>(`/api/dashboard${params({ model, zone })}`),
  equipment: (filters: Record<string, string | number | undefined | null>) => request<ApiPage<Equipment>>(`/api/equipment${params(filters)}`),
  equipmentDetail: (id: number) => request<Equipment>(`/api/equipment/${id}`),
  stations: (model: string, zone?: string) => request<Station[]>(`/api/stations${params({ model, zone })}`),
  stationDetail: (id: number, model: string) => request<any>(`/api/stations/${id}${params({ model })}`),
  transformerDetail: (id: number, model: string) => request<any>(`/api/transformers/${id}${params({ model })}`),
  poGunDetail: (id: number, model: string) => request<any>(`/api/po-guns/${id}${params({ model })}`),
  readings: (id: number) => request<Reading[]>(`/api/equipment/${id}/readings`),
  addReading: (id: number, data: {parameter_name: string; value: number; unit: string; observed_at: string; note?: string}) => request<{reading: Reading; equipment: Equipment}>(`/api/equipment/${id}/readings`, { method: 'POST', body: JSON.stringify(data) }),
  actions: (filters: Record<string, string | number | undefined | null>) => request<ApiPage<CorrectiveAction>>(`/api/corrective-actions${params(filters)}`),
  createAction: (data: Record<string, unknown>) => request<CorrectiveAction>('/api/corrective-actions', { method: 'POST', body: JSON.stringify(data) }),
  updateAction: (id: number, data: Record<string, unknown>) => request<CorrectiveAction>(`/api/corrective-actions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  reportSummary: (model: string, zone: string) => request<any>(`/api/reports/summary${params({ model, zone })}`),
  trends: (model: string, parameter?: string) => request<{items:any[]; available:boolean; message?:string}>(`/api/reports/trends${params({ model, parameter })}`),
  importEquipment: async (file: File, confirm: boolean) => {
    const form = new FormData(); form.append('file', file); form.append('confirm', String(confirm))
    return request<any>('/api/import/equipment', { method: 'POST', body: form })
  },
  exportEquipment: async (model: string) => {
    const query = params({ model })
    const headers = new Headers(); if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`)
    const res = await fetch(`${API_BASE}/api/export/equipment.csv${query}`, { headers })
    if (!res.ok) throw new Error('Equipment export failed')
    const blob = await res.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a')
    link.href = url; link.download = 'po-gun-equipment-register.csv'; link.click(); URL.revokeObjectURL(url)
  },
  health: () => request<any>('/api/health'),
}
