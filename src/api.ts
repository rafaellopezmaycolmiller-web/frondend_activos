import type {
  Area,
  AreaInput,
  Asset,
  AssetPage,
  AssetCategory,
  AssetLocation,
  AssetStatus,
  AccessRecoveryRequest,
  AuditEvent,
  Custodianship,
  DashboardMetrics,
  MfaChallengeResponse,
  PaginatedResponse,
  ResourceResponse,
  Role,
  User,
  UserInput,
  MovementRequest,
  InventoryCampaign,
  InventoryCheck,
  ReconciliationRun,
  ReconciliationDifference,
  TechnicalEvaluation,
  DisposalRequest,
  ReportResult,
} from './types'

interface ApiErrorPayload {
  readonly message?: string
  readonly errors?: Record<string, readonly string[]>
}

const configuredApiBase = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '')
// An empty value deliberately uses Vite's local /api proxy. Never fall back to
// a hosted demo: a local test must fail locally instead of mutating Railway.
const API_BASE = configuredApiBase

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
    if (csrfToken !== null) {
      // The API endpoint returns the plain session token. Laravel expects
      // that value in X-CSRF-TOKEN; X-XSRF-TOKEN is reserved for the
      // encrypted cookie value.
      headers.set('X-CSRF-TOKEN', csrfToken)
    } else if (token !== null) {
      headers.set('X-XSRF-TOKEN', token)
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

  if ('requires_mfa' in response) {
    return response
  }

  // CompleteLogin also regenerates the session for accounts without MFA.
  await initializeCsrf()

  return response.data
}

export async function verifyMfa(challengeId: string, code: string): Promise<User> {
  const response = await request<ResourceResponse<User>>('/api/v1/auth/mfa', {
    method: 'POST',
    body: JSON.stringify({ challenge_id: challengeId, code }),
  })

  // CompleteLogin regenerates the session and therefore the CSRF token.
  // Refresh it before the first authenticated mutation after MFA.
  await initializeCsrf()

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

export async function requestAccessRecovery(email: string): Promise<string> {
  await initializeCsrf()
  const response = await request<{ readonly message: string }>('/api/v1/auth/access-recovery-requests', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  return response.message
}

export async function accessRecoveryRequests(): Promise<readonly AccessRecoveryRequest[]> {
  const response = await request<{ readonly data: readonly AccessRecoveryRequest[] }>('/api/v1/access-recovery-requests')
  return response.data
}

export async function resolveAccessRecovery(id: number, status: 'approved' | 'rejected', resolutionNote = ''): Promise<{ readonly message: string; readonly temporary_password: string | null }> {
  const response = await request<{ readonly message: string; readonly temporary_password: string | null }>(`/api/v1/access-recovery-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, resolution_note: resolutionNote }),
  })
  return response
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

export async function assets(page = 1, search = '', mine = false, status = '', category = '', assetType = ''): Promise<AssetPage> {
  const query = `${search === '' ? '' : `&search=${encodeURIComponent(search)}`}${mine ? '&mine=1' : ''}${status === '' ? '' : `&status=${encodeURIComponent(status)}`}${category === '' ? '' : `&category=${encodeURIComponent(category)}`}${assetType === '' ? '' : `&asset_type=${encodeURIComponent(assetType)}`}`
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

export async function assetCustodianships(assetId: number): Promise<readonly Custodianship[]> {
  const response = await request<PaginatedResponse<Custodianship>>('/api/v1/assets/' + assetId + '/custodianships?per_page=50')
  return response.data
}

export async function custodianshipCandidates(assetId: number): Promise<readonly User[]> {
  const response = await request<{ readonly data: readonly User[] }>('/api/v1/assets/' + assetId + '/custodianship-candidates')
  return response.data
}

export async function assignCustodian(assetId: number, input: { user_id?: number | null; area_id: number; location_id?: number | null; responsible_name?: string | null; responsible_document?: string | null; notes: string }): Promise<Custodianship> {
  const response = await request<ResourceResponse<Custodianship>>('/api/v1/assets/' + assetId + '/custodianships', {
    method: 'POST',
    body: JSON.stringify({ ...input, notes: input.notes.trim() === '' ? null : input.notes.trim() }),
  })
  return response.data
}

export async function movementRequests(): Promise<readonly MovementRequest[]> {
  const response = await request<PaginatedResponse<MovementRequest>>('/api/v1/movement-requests?per_page=50')
  return response.data
}

export async function createMovement(input: { asset_id: number; to_area_id: number; to_location_id?: number | null; to_user_id?: number | null; reason: string }): Promise<MovementRequest> { const response = await request<ResourceResponse<MovementRequest>>('/api/v1/movement-requests', { method: 'POST', body: JSON.stringify(input) }); return response.data }
export async function movementRecipients(areaId: number): Promise<readonly User[]> { const response = await request<{ readonly data: readonly User[] }>(`/api/v1/movement-recipient-candidates?area_id=${areaId}`); return response.data }

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
export async function createInventoryCampaign(input: { code: string; name: string; area_id: number; notes?: string }): Promise<InventoryCampaign> { const response = await request<ResourceResponse<InventoryCampaign>>('/api/v1/inventory-campaigns', { method: 'POST', body: JSON.stringify(input) }); return response.data }
export async function startInventoryCampaign(id: number): Promise<InventoryCampaign> { const response = await request<ResourceResponse<InventoryCampaign>>(`/api/v1/inventory-campaigns/${id}/start`, { method: 'POST' }); return response.data }
export async function closeInventoryCampaign(id: number): Promise<InventoryCampaign> { const response = await request<ResourceResponse<InventoryCampaign>>(`/api/v1/inventory-campaigns/${id}/close`, { method: 'POST' }); return response.data }
export async function recordInventoryCheck(id: number, input: { asset_id: number; result: string; observed_location_id?: number | null; notes?: string }): Promise<InventoryCheck> { const response = await request<ResourceResponse<InventoryCheck>>(`/api/v1/inventory-campaigns/${id}/checks`, { method: 'POST', body: JSON.stringify(input) }); return response.data }
export async function reconciliations(): Promise<readonly ReconciliationRun[]> { const response = await request<PaginatedResponse<ReconciliationRun>>('/api/v1/reconciliations?per_page=50'); return response.data }
export async function reconciliationDetails(id: number): Promise<ReconciliationRun> { const response = await request<ResourceResponse<ReconciliationRun>>(`/api/v1/reconciliations/${id}`); return response.data }
export async function createReconciliation(body: FormData): Promise<ReconciliationRun> { const response = await request<ResourceResponse<ReconciliationRun>>('/api/v1/reconciliations', { method: 'POST', body }); return response.data }
export async function updateReconciliationDifference(id: number, status: string, resolution_notes?: string): Promise<ReconciliationDifference> { const response = await request<ResourceResponse<ReconciliationDifference>>(`/api/v1/reconciliation-differences/${id}`, { method: 'PATCH', body: JSON.stringify({ status, resolution_notes }) }); return response.data }

export async function technicalEvaluations(): Promise<readonly TechnicalEvaluation[]> { const response = await request<PaginatedResponse<TechnicalEvaluation>>('/api/v1/technical-evaluations?per_page=50'); return response.data }
export async function createTechnicalEvaluation(input: { asset_id: number; reason: string; assigned_to?: number | null; observations?: string }): Promise<TechnicalEvaluation> { const response = await request<ResourceResponse<TechnicalEvaluation>>('/api/v1/technical-evaluations', { method: 'POST', body: JSON.stringify(input) }); return response.data }
export async function updateTechnicalEvaluation(id: number, input: Record<string, unknown>): Promise<TechnicalEvaluation> { const response = await request<ResourceResponse<TechnicalEvaluation>>(`/api/v1/technical-evaluations/${id}`, { method: 'PUT', body: JSON.stringify(input) }); return response.data }
export async function disposalRequests(): Promise<readonly DisposalRequest[]> { const response = await request<PaginatedResponse<DisposalRequest>>('/api/v1/disposal-requests?per_page=50'); return response.data }
export async function createDisposalRequest(assetId: number, input: { reason: string; cause: string; technical_evaluation_id?: number | null; documentation_notes?: string }): Promise<DisposalRequest> { const response = await request<ResourceResponse<DisposalRequest>>(`/api/v1/assets/${assetId}/disposal-requests`, { method: 'POST', body: JSON.stringify(input) }); return response.data }
export async function reviewDisposalRequest(id: number, input: { decision: 'pending_authority' | 'rejected'; decision_notes: string }): Promise<DisposalRequest> { const response = await request<ResourceResponse<DisposalRequest>>(`/api/v1/disposal-requests/${id}/review`, { method: 'POST', body: JSON.stringify(input) }); return response.data }
export async function uploadTechnicalEvaluationDocument(id: number, file: File): Promise<TechnicalEvaluation> { const body = new FormData(); body.append('file', file); return request<TechnicalEvaluation>(`/api/v1/technical-evaluations/${id}/documents`, { method: 'POST', body }) }
export async function uploadDisposalDocument(id: number, file: File): Promise<DisposalRequest> { const body = new FormData(); body.append('file', file); return request<DisposalRequest>(`/api/v1/disposal-requests/${id}/documents`, { method: 'POST', body }) }
export async function reports(report: string, params: Record<string, string> = {}): Promise<ReportResult> { const query = new URLSearchParams({ report, ...Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '')) }); return request<ReportResult>(`/api/v1/reports?${query.toString()}`) }
export function reportExportUrl(report: string, params: Record<string, string> = {}): string { const query = new URLSearchParams({ report, ...Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '')) }); return `${API_BASE}/api/v1/reports/export.csv?${query.toString()}` }

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
