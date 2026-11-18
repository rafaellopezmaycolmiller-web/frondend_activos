export interface Area {
  readonly id: number
  readonly parent_id: number | null
  readonly code: string
  readonly name: string
  readonly description: string | null
  readonly is_active: boolean
}

export interface Role {
  readonly id: number
  readonly code: string
  readonly name: string
  readonly description: string | null
  readonly is_system: boolean
  readonly scope?: 'own_area' | 'global'
  readonly permissions: readonly string[]
}

export interface User {
  readonly id: number
  readonly name: string
  readonly document_number: string | null
  readonly job_title: string | null
  readonly phone: string | null
  readonly email: string
  readonly is_active: boolean
  readonly mfa_required: boolean
  readonly last_login_at: string | null
  readonly area: Area | null
  readonly roles: readonly Role[]
  readonly permissions: readonly string[]
}

export interface DashboardMetrics {
  readonly users_total: number
  readonly users_active: number
  readonly areas_active: number
  readonly assets_total: number
  readonly assets_active: number
  readonly audit_events_24h: number | null
  readonly phase: string
  readonly phase_name: string
}

export interface AuditEvent {
  readonly id: number
  readonly event: string
  readonly actor: {
    readonly id: number
    readonly name: string
    readonly email: string
    readonly job_title: string | null
    readonly area: Pick<Area, 'id' | 'code' | 'name'> | null
    readonly roles: readonly Pick<Role, 'id' | 'code' | 'name'>[]
  } | null
  readonly area: Area | null
  readonly subject_type: string | null
  readonly subject_id: string | null
  readonly subject: {
    readonly id: string
    readonly type: 'asset' | 'movement' | 'disposal' | 'custody' | 'inventory_check' | 'inventory_campaign' | 'user' | 'area' | 'record'
    readonly label: string
    readonly reference: string | null
    readonly context: string | null
    readonly asset: { readonly id: number; readonly name: string; readonly asset_code: string } | null
  } | null
  readonly request_id: string
  readonly ip_address: string | null
  readonly metadata: Record<string, unknown> | null
  readonly occurred_at: string
}

export interface PaginatedResponse<T> {
  readonly data: readonly T[]
  readonly meta?: {
    readonly current_page: number
    readonly last_page: number
    readonly per_page: number
    readonly total: number
  }
}

export interface AssetPage {
  readonly data: readonly Asset[]
  readonly meta: NonNullable<PaginatedResponse<Asset>['meta']>
}

export interface ResourceResponse<T> {
  readonly data: T
}

export interface MfaChallengeResponse {
  readonly message: string
  readonly requires_mfa: true
  readonly challenge_id: string
  readonly expires_at: string
  readonly delivery_channel: 'sms'
  readonly destination_hint: string
}

export interface RoleAssignmentInput {
  readonly role_id: number
  readonly scope: 'own_area' | 'global'
}

export interface UserInput {
  readonly area_id: number
  readonly name: string
  readonly document_number: string
  readonly job_title: string
  readonly phone: string | null
  readonly email: string
  readonly is_active: boolean
  readonly role_assignments: readonly RoleAssignmentInput[]
  readonly password?: string
  readonly password_confirmation?: string
}

export interface AreaInput {
  readonly parent_id: number | null
  readonly code: string
  readonly name: string
  readonly description: string | null
  readonly is_active: boolean
}

export interface AssetCategory { readonly id: number; readonly code: string; readonly name: string; readonly description: string | null; readonly is_active: boolean }
export interface AssetStatus { readonly id: number; readonly code: string; readonly name: string; readonly description: string | null; readonly is_active: boolean }
export interface AssetLocation { readonly id: number; readonly area_id: number; readonly code: string; readonly name: string; readonly description: string | null; readonly is_active: boolean; readonly area?: Area }
export interface AssetDocument { readonly id: number; readonly document_type: string; readonly file_name: string; readonly mime_type: string; readonly size: number; readonly sha256: string; readonly uploaded_by: number | null; readonly url: string; readonly created_at: string }
export interface AssetVersion { readonly id: number; readonly version: number; readonly action: string; readonly snapshot: Record<string, unknown>; readonly changed_by: number | null; readonly reason: string | null; readonly created_at: string }
export interface Asset { readonly id: number; readonly asset_code: string; readonly inventory_code: string | null; readonly name: string; readonly description: string | null; readonly brand: string | null; readonly model: string | null; readonly serial_number: string | null; readonly acquisition_date: string | null; readonly acquisition_value: string | null; readonly useful_life_years: number | null; readonly current_version: number; readonly is_active: boolean; readonly category: AssetCategory; readonly status: AssetStatus; readonly area: Area; readonly registered_area?: Pick<Area, 'id' | 'code' | 'name'> | null; readonly creator?: { readonly id: number; readonly name: string; readonly job_title: string | null; readonly area: string | null } | null; readonly location: AssetLocation | null; readonly documents?: readonly AssetDocument[]; readonly versions?: readonly AssetVersion[] }
export interface MovementRequest { readonly id: number; readonly asset_id: number; readonly asset?: Asset; readonly from_area_id: number; readonly from_area?: Area; readonly from_location_id?: number | null; readonly to_area_id: number; readonly to_area?: Area; readonly to_location_id?: number | null; readonly to_user_id?: number | null; readonly status: 'pending' | 'approved' | 'rejected' | 'received'; readonly reason: string; readonly rejection_reason: string | null; readonly requested_at: string; readonly decided_at: string | null; readonly received_at: string | null }
export interface InventoryCampaign { readonly id: number; readonly code: string; readonly name: string; readonly area_id: number; readonly area?: Area; readonly status: 'planned' | 'in_progress' | 'closed'; readonly checks_count?: number; readonly assets_total?: number; readonly found_count?: number; readonly not_found_count?: number; readonly location_mismatch_count?: number; readonly pending_count?: number; readonly started_at: string | null; readonly closed_at: string | null; readonly notes?: string | null }
export interface InventoryCheck { readonly id: number; readonly campaign_id: number; readonly asset_id: number; readonly asset?: Asset; readonly result: 'found' | 'not_found' | 'location_mismatch'; readonly observed_location_id?: number | null; readonly notes?: string | null; readonly checked_at: string }
export interface ReconciliationDifference { readonly id: number; readonly asset_code: string; readonly difference_type: string; readonly system_snapshot: Record<string, unknown> | null; readonly reference_snapshot: Record<string, unknown> | null; readonly status: 'pending' | 'in_review' | 'resolved' | 'pending_external'; readonly resolution_notes: string | null }
export interface ReconciliationRun { readonly id: number; readonly code: string; readonly name: string; readonly source_file_name: string; readonly status: string; readonly executed_at: string; readonly total_differences?: number; readonly pending_differences?: number; readonly resolved_differences?: number; readonly differences?: readonly ReconciliationDifference[] }
export interface Custodianship { readonly id: number; readonly asset_id: number; readonly user_id: number; readonly assigned_by: number | null; readonly user?: Pick<User, 'id' | 'name' | 'email'>; readonly assigner?: Pick<User, 'id' | 'name' | 'email'>; readonly status: 'active' | 'ended'; readonly notes: string | null; readonly started_at: string; readonly ended_at: string | null }
export interface TechnicalEvaluation { readonly id: number; readonly asset_id: number; readonly asset?: Asset; readonly requested_by: number; readonly assigned_to: number | null; readonly specialist?: Pick<User, 'id' | 'name' | 'email'> | null; readonly status: 'requested' | 'assigned' | 'evaluated' | 'reviewed'; readonly reason: string; readonly physical_condition: string | null; readonly diagnosis: string | null; readonly recommendations: string | null; readonly observations: string | null; readonly documents?: readonly { readonly id: number; readonly file_name: string; readonly mime_type: string; readonly size: number }[] }
export interface DisposalDocument { readonly id: number; readonly file_name: string; readonly mime_type: string; readonly size: number }
export interface DisposalRequest { readonly id: number; readonly asset_id: number; readonly asset?: Asset; readonly technical_evaluation_id: number | null; readonly status: 'pending' | 'under_review' | 'pending_authority' | 'rejected' | 'approved'; readonly authority_status: string; readonly cause: string | null; readonly reason: string; readonly decision_notes: string | null; readonly documents?: readonly DisposalDocument[]; readonly requester?: Pick<User, 'id' | 'name' | 'email'>; readonly reviewer?: Pick<User, 'id' | 'name' | 'email'> }
export interface ReportResult { readonly data: readonly Record<string, unknown>[]; readonly report: string; readonly generated_at: string; readonly prototype: boolean }
