import type {
  Area,
  AreaInput,
  Asset,
  AssetPage,
  AssetCategory,
  AssetLocation,
  AssetStatus,
  AuditEvent,
  DashboardMetrics,
  MfaChallengeResponse,
  PaginatedResponse,
  ResourceResponse,
  Role,
  User,
  UserInput,
  MovementRequest,
  InventoryCampaign,
} from './types'

interface ApiErrorPayload {
  readonly message?: string
  readonly errors?: Record<string, readonly string[]>
}

const configuredApiBase = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '')
// Keep the hosted demo usable if Railway saves a wrapped/truncated VITE_API_URL.
const API_BASE = configuredApiBase.startsWith('https://backendactivos-') && configuredApiBase !== 'https://backendactivos-production.up.railway.app'
  ? 'https://backendactivos-production.up.railway.app'
  : configuredApiBase

let csrfToken: string | null = null

export class ApiError extends Error {
  readonly status: number
  readonly errors: Record<string, readonly string[]>

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message ?? 'No se pudo completar la solicitud.')
    this.name = 'ApiError'
    this.status = status
    this.errors = payload.errors ?? {}
  }
}

function xsrfToken(): string | null {
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith('XSRF-TOKEN='))

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : null
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method?.toUpperCase() ?? 'GET'
  const token = xsrfToken()
  const headers = new Headers(init.headers)

  headers.set('Accept', 'application/json')

  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const requestToken = csrfToken ?? token
    if (requestToken !== null) {
      headers.set('X-XSRF-TOKEN', requestToken)
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })

  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null) as unknown

  if (!response.ok) {
    throw new ApiError(response.status, (payload ?? {}) as ApiErrorPayload)
  }

  return payload as T
}

async function initializeCsrf(): Promise<void> {
  const response = await request<{ readonly token: string }>('/api/v1/auth/csrf-token')
  csrfToken = response.token
}

export async function currentUser(): Promise<User> {
  const response = await request<ResourceResponse<User>>('/api/v1/auth/me')

  return response.data
}

export async function login(
  email: string,
  password: string,
  remember: boolean,
): Promise<User | MfaChallengeResponse> {
  await initializeCsrf()

  const response = await request<ResourceResponse<User> | MfaChallengeResponse>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password, remember }),
    },
  )

  return 'requires_mfa' in response ? response : response.data
}

export async function verifyMfa(challengeId: string, code: string): Promise<User> {
  const response = await request<ResourceResponse<User>>('/api/v1/auth/mfa', {
    method: 'POST',
    body: JSON.stringify({ challenge_id: challengeId, code }),
  })

  return response.data
}

export async function logout(): Promise<void> {
  await request('/api/v1/auth/logout', { method: 'POST' })
}

export async function requestPasswordReset(email: string): Promise<string> {
  await initializeCsrf()

  const response = await request<{ readonly message: string }>(
    '/api/v1/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  )

  return response.message
}

export async function resetPassword(
  token: string,
  email: string,
  password: string,
  passwordConfirmation: string,
): Promise<string> {
  await initializeCsrf()

  const response = await request<{ readonly message: string }>(
    '/api/v1/auth/reset-password',
    {
      method: 'POST',
      body: JSON.stringify({
        token,
        email,
        password,
        password_confirmation: passwordConfirmation,
      }),
    },
  )

  return response.message
}

export async function dashboard(): Promise<DashboardMetrics> {
  const response = await request<ResourceResponse<DashboardMetrics>>('/api/v1/dashboard')

  return response.data
}

export async function users(): Promise<readonly User[]> {
  const response = await request<PaginatedResponse<User>>('/api/v1/users?per_page=50')

  return response.data
}

export async function createUser(input: UserInput): Promise<User> {
  const response = await request<ResourceResponse<User>>('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  return response.data
}

export async function updateUser(userId: number, input: UserInput): Promise<User> {
  const response = await request<ResourceResponse<User>>(`/api/v1/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })

  return response.data
}

export async function areas(): Promise<readonly Area[]> {
  const response = await request<PaginatedResponse<Area>>('/api/v1/areas')

  return response.data
}

export async function createArea(input: AreaInput): Promise<Area> {
  const response = await request<ResourceResponse<Area>>('/api/v1/areas', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  return response.data
}

export async function updateArea(areaId: number, input: AreaInput): Promise<Area> {
  const response = await request<ResourceResponse<Area>>(`/api/v1/areas/${areaId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })

  return response.data
}

export async function roles(): Promise<readonly Role[]> {
  const response = await request<PaginatedResponse<Role>>('/api/v1/roles')

  return response.data
}

export async function auditEvents(): Promise<readonly AuditEvent[]> {
  const response = await request<PaginatedResponse<AuditEvent>>('/api/v1/audit-events?per_page=100')

  return response.data
}

export async function archiveAuditEvent(id: number, reason: string): Promise<void> {
  await request(`/api/v1/audit-events/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function assets(page = 1, search = ''): Promise<AssetPage> {
  const query = search === '' ? '' : `&search=${encodeURIComponent(search)}`
  const response = await request<AssetPage>(`/api/v1/assets?per_page=12&page=${page}${query}`)
  return response
}

export async function assetByCode(code: string): Promise<Asset> {
  const response = await request<ResourceResponse<Asset>>(`/api/v1/assets/code/${encodeURIComponent(code)}`)
  return response.data
}

export async function assetCategories(): Promise<readonly AssetCategory[]> {
  const response = await request<PaginatedResponse<AssetCategory>>('/api/v1/asset-categories')
  return response.data
}

export async function assetStatuses(): Promise<readonly AssetStatus[]> {
  const response = await request<PaginatedResponse<AssetStatus>>('/api/v1/asset-statuses')
  return response.data
}

export async function assetLocations(): Promise<readonly AssetLocation[]> {
  const response = await request<PaginatedResponse<AssetLocation>>('/api/v1/asset-locations')
  return response.data
}

export async function movementRequests(): Promise<readonly MovementRequest[]> {
  const response = await request<PaginatedResponse<MovementRequest>>('/api/v1/movement-requests?per_page=50')
  return response.data
}

export async function decideMovement(id: number, decision: 'approved' | 'rejected', rejectionReason?: string): Promise<MovementRequest> {
  const response = await request<ResourceResponse<MovementRequest>>(`/api/v1/movement-requests/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision, rejection_reason: rejectionReason }) })
  return response.data
}

export async function receiveMovement(id: number): Promise<MovementRequest> {
  const response = await request<ResourceResponse<MovementRequest>>(`/api/v1/movement-requests/${id}/receive`, { method: 'POST' })
  return response.data
}

export async function inventoryCampaigns(): Promise<readonly InventoryCampaign[]> {
  const response = await request<PaginatedResponse<InventoryCampaign>>('/api/v1/inventory-campaigns?per_page=50')
  return response.data
}

export async function createAsset(input: Record<string, unknown>): Promise<Asset> {
  const response = await request<ResourceResponse<Asset>>('/api/v1/assets', { method: 'POST', body: JSON.stringify(input) })
  return response.data
}

export async function updateAsset(id: number, input: Record<string, unknown>): Promise<Asset> {
  const response = await request<ResourceResponse<Asset>>(`/api/v1/assets/${id}`, { method: 'PUT', body: JSON.stringify(input) })
  return response.data
}

export async function uploadAssetDocument(assetId: number, documentType: string, file: File): Promise<void> {
  const body = new FormData()
  body.append('document_type', documentType)
  body.append('file', file)
  await request(`/api/v1/assets/${assetId}/documents`, { method: 'POST', body })
}
