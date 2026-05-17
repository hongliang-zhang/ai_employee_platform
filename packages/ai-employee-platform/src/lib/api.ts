const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export const employeesApi = {
  list: () => api.get('/employees'),
  get: (id: string) => api.get(`/employees/${id}`),
  create: (data: unknown) => api.post('/employees', data),
  update: (id: string, data: unknown) => api.put(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
}

export const sessionsApi = {
  list: (employeeId?: string) => api.get(`/sessions${employeeId ? `?employeeId=${employeeId}` : ''}`),
  get: (id: string) => api.get(`/sessions/${id}`),
  create: (data: unknown) => api.post('/sessions', data),
  stop: (id: string) => api.post(`/sessions/${id}/stop`),
}

export const analyticsApi = {
  getOverview: () => api.get('/analytics/overview'),
  getEmployeeStats: (employeeId: string) => api.get(`/analytics/employee/${employeeId}`),
}

export default api
