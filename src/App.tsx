import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import {
  archiveAuditEvent,
  assetCustodianships,
  assetByCode,
  assignCustodian,
  ApiError,
  assetCategories,
  assetLocations,
  assets,
  assetStatuses,
  areas,
  auditEvents,
  decideMovement,
  createMovement,
  movementRecipients,
  createInventoryCampaign,
  startInventoryCampaign,
  closeInventoryCampaign,
  recordInventoryCheck,
  reconciliations,
  reconciliationDetails,
  createReconciliation,
  updateReconciliationDifference,
  currentUser,
  custodianshipCandidates,
  dashboard,
  login,
  logout as logoutRequest,
  movementRequests,
  inventoryCampaigns,
  receiveMovement,
  requestAccessRecovery,
  accessRecoveryRequests,
  resolveAccessRecovery,
  resetPassword,
  roles,
  users,
  verifyMfa,
  technicalEvaluations,
  createTechnicalEvaluation,
  updateTechnicalEvaluation,
  disposalRequests,
  createDisposalRequest,
  reviewDisposalRequest,
  uploadTechnicalEvaluationDocument,
  uploadDisposalDocument,
  reports,
  reportExportUrl,
} from './api'
import { AreaEditor, UserEditor } from './IdentityForms'
import { AssetEditor, ASSET_TYPES, technicalFields } from './AssetForms'
import type { Area, Asset, AssetCategory, AssetLocation, AssetPage, AssetStatus, AuditEvent, Custodianship, DashboardMetrics, InventoryCampaign, MovementRequest, Role, User, ReconciliationRun, TechnicalEvaluation, DisposalRequest, ReportResult } from './types'

type AuthView = 'login' | 'forgot' | 'mfa' | 'reset'
type SectionKey = 'dashboard' | 'assets' | 'movements' | 'inventory' | 'reconciliation' | 'evaluations' | 'disposals' | 'reports' | 'users' | 'areas' | 'audit'

function compactAreaName(area: { readonly code: string; readonly name: string } | null | undefined): string {
  if (area === null || area === undefined) return 'No registrada'

  const labels: Record<string, string> = {
    PAT: 'Patrimonio',
    LOG: 'Logística y Almacén',
    TI: 'Tecnología de Información',
    OCI: 'Órgano de Control',
  }

  return labels[area.code] ?? area.name
}

function compactCreatorLabel(creator: Asset['creator']): string {
  if (creator === null || creator === undefined) return 'No identificado'
  const area = creator.area?.toLowerCase() ?? ''
  const job = creator.job_title?.toLowerCase() ?? ''
  if (job.includes('asistente') && area.includes('patrimonio')) return 'Asist. Patrimonio'
  if (job.includes('asistente') && area.includes('tecnolog')) return 'Asist. TI'
  if (area.includes('patrimonio')) return 'Patrimonio'
  if (area.includes('tecnolog')) return 'TI'
  if (area.includes('control institucional')) return 'OCI'
  return 'Registrador'
}

function usefulLifeEndDate(asset: Asset): string {
  if (asset.acquisition_date === null || asset.useful_life_years === null) return 'No calculado'
  const date = new Date(asset.acquisition_date + 'T00:00:00')
  date.setFullYear(date.getFullYear() + asset.useful_life_years)
  return date.toLocaleDateString('es-PE')
}

function movementStatusLabel(status: string): string {
  return ({ pending: 'Pendiente de revisión', approved: 'Aprobado', rejected: 'Rechazado', received: 'Recibido' } as Record<string, string>)[status] ?? status
}

function inventoryStatusLabel(status: string): string {
  return ({ planned: 'Planificada', in_progress: 'En curso', closed: 'Cerrada' } as Record<string, string>)[status] ?? status
}

function inventoryProgressLabel(record: InventoryCampaign): string {
  const verified = record.checks_count ?? 0
  const total = record.assets_total ?? 0
  return total > 0 ? `${verified} de ${total} bienes verificados` : 'Sin bienes incluidos'
}

function reconciliationDifferenceLabel(type: string): string {
  return ({ missing_in_system: 'Bien en referencia, no en sistema', missing_in_reference: 'Bien en sistema, no en referencia', location_mismatch: 'Ubicación diferente', area_mismatch: 'Área diferente', status_mismatch: 'Estado diferente', duplicate_reference: 'Código duplicado en referencia' } as Record<string, string>)[type] ?? type
}

function reconciliationStatusLabel(status: string): string {
  return ({ pending: 'Pendiente', in_review: 'En revisión', resolved: 'Resuelta', pending_external: 'Pendiente de validación externa' } as Record<string, string>)[status] ?? status
}

function evaluationStatusLabel(status: string): string {
  return ({ requested: 'Solicitada', assigned: 'Responsable asignado', evaluated: 'Evaluada', reviewed: 'Revisada' } as Record<string, string>)[status] ?? status
}

function disposalStatusLabel(status: string): string {
  return ({ pending: 'Pendiente de revisión', under_review: 'En revisión', pending_authority: 'Pendiente de autoridad', rejected: 'Observada' } as Record<string, string>)[status] ?? status
}

function authorityStatusLabel(status: string): string {
  return ({ pending_validation: 'Pendiente de validación institucional', not_required: 'No corresponde', validated: 'Validada' } as Record<string, string>)[status] ?? status
}

interface NavigationItem {
  readonly key: SectionKey
  readonly label: string
  readonly permission: string
  readonly description: string
}

const navigation: readonly NavigationItem[] = [
  { key: 'dashboard', label: 'Resumen', permission: 'dashboard.view', description: 'Vista general del sistema' },
  { key: 'assets', label: 'Activos', permission: 'assets.view', description: 'Registro y consulta de bienes' },
  { key: 'movements', label: 'Movimientos', permission: 'movements.view', description: 'Traslados y entregas' },
  { key: 'inventory', label: 'Inventario', permission: 'inventory.view', description: 'Verificación física' },
  { key: 'reconciliation', label: 'Conciliación', permission: 'reconciliation.view', description: 'Comparar padrones' },
  { key: 'evaluations', label: 'Evaluaciones', permission: 'evaluations.view', description: 'Diagnóstico técnico' },
  { key: 'disposals', label: 'Bajas', permission: 'disposals.view', description: 'Expedientes de baja' },
  { key: 'reports', label: 'Reportes', permission: 'reports.view', description: 'Consultas y exportaciones' },
  { key: 'users', label: 'Usuarios', permission: 'users.view', description: 'Cuentas institucionales' },
  { key: 'areas', label: 'Áreas', permission: 'areas.view', description: 'Organización municipal' },
  { key: 'audit', label: 'Auditoría', permission: 'audit.view', description: 'Trazabilidad de acciones' },
]

export function navigationFor(user: Pick<User, 'permissions'>): readonly NavigationItem[] {
  return navigation.filter((item) => user.permissions.includes(item.permission))
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const firstValidationMessage = Object.values(error.errors)[0]?.[0]

    return firstValidationMessage ?? error.message
  }

  return 'Ocurrió un problema inesperado. Intente nuevamente.'
}

function Logo() {
  return (
    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/25 bg-white shadow-xl shadow-black/20">
      <img alt="Escudo de la Municipalidad Distrital de Morales" className="size-full object-contain p-1" src="/logo-morales.png" />
    </div>
  )
}

function Icon({ children, className = 'size-5' }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      {children}
    </svg>
  )
}

function NavigationIcon({ section }: { readonly section: SectionKey }) {
  const paths: Record<SectionKey, ReactNode> = {
    dashboard: <><rect height="7" rx="1.5" width="7" x="3" y="3" /><rect height="7" rx="1.5" width="7" x="14" y="3" /><rect height="7" rx="1.5" width="7" x="3" y="14" /><rect height="7" rx="1.5" width="7" x="14" y="14" /></>,
    assets: <><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" /></>,
    movements: <><path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4" /></>,
    inventory: <><rect height="17" rx="2" width="15" x="4.5" y="4" /><path d="M9 4V2.5h6V4M8 9h8M8 13h8M8 17h5" /></>,
    reconciliation: <><path d="M4 6h16M4 12h16M4 18h10" /><circle cx="18" cy="18" r="3" /></>,
    evaluations: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    disposals: <><path d="M5 4h14v16H5z" /><path d="M8 9h8M8 13h5" /><path d="m15 15 4 4" /></>,
    reports: <><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M3 20h18" /></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M18 9a3 3 0 0 1 0 6M22 20v-2a4 4 0 0 0-3-3.9" /></>,
    areas: <><path d="M4 21V8l8-5 8 5v13M2 21h20M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" /></>,
    audit: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h3M9 17h2" /><circle cx="16" cy="15" r="3" /><path d="m18.3 17.3 2 2" /></>,
  }

  return <Icon className="size-[18px]">{paths[section]}</Icon>
}

function AuthLayout({
  title,
  subtitle,
  showBadge = true,
  children,
}: {
  readonly title: string
  readonly subtitle: string
  readonly showBadge?: boolean
  readonly children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-[#eef3f9] text-slate-900">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3" href="#formulario-acceso">
        Saltar al formulario
      </a>
      <div className="grid min-h-screen lg:h-screen lg:overflow-hidden lg:grid-cols-[minmax(0,1.08fr)_minmax(470px,0.92fr)]">
        <section className="auth-brand-panel relative hidden min-h-screen overflow-hidden px-12 py-4 text-white lg:flex lg:flex-col xl:px-18 xl:py-5">
          <div className="relative z-10 mt-0 mb-auto max-w-[680px] py-0 text-center">
            <p className="mx-auto max-w-[560px] text-3xl font-bold leading-tight tracking-[-0.025em] text-white xl:text-4xl">Sistema de Gestión de Activos <span className="text-[#f5c84c]">Morales</span></p>
            <div className="mx-auto my-3 h-0.5 w-40 rounded-full bg-[#f5c84c]" />
            <div className="mb-4 flex justify-center">
              <div className="grid size-72 place-items-center p-1 xl:size-80">
                <img alt="Logo municipal de Morales" className="size-full object-contain" src="/logo-morales.png" />
              </div>
            </div>
            <p className="mx-auto max-w-[520px] text-sm leading-6 text-blue-100/75">
              Centralice el registro, ubicación e historial de los bienes institucionales en una plataforma segura y trazable.
            </p>

            <div className="mx-auto mt-4 grid max-w-[640px] gap-3 sm:grid-cols-3">
              {[
                ['01', 'Inventario centralizado', 'M12 3v18M3 12h18'],
                ['02', 'Trazabilidad de cambios', 'M4 12a8 8 0 1 0 16 0M12 4v8l4 2'],
                ['03', 'Acceso por funciones', 'M12 3 5 6v5c0 4.6 2.9 8.1 7 10 4.1-1.9 7-5.4 7-10V6l-7-3Z'],
              ].map(([number, label, path]) => (
                <div className="group rounded-2xl border border-blue-300/45 bg-white/[0.09] p-4 text-center shadow-[0_10px_28px_rgba(0,0,0,0.16)] backdrop-blur-sm transition-colors hover:bg-white/[0.14]" key={number}>
                  <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl border border-white/35 bg-white/10 text-white shadow-lg shadow-black/15">
                    <Icon className="size-9"><path d={path} /></Icon>
                  </div>
                  <p className="text-base font-bold leading-5 text-blue-50">{label}</p>
                </div>
              ))}
            </div>
          </div>

        </section>

        <section className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#f5f8fc] p-5 sm:p-10 lg:h-screen lg:overflow-hidden lg:p-12">
          <div className="auth-form-panel w-full max-w-[500px] rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_25px_70px_rgba(15,35,65,0.12)] sm:p-10">
            <div className="mb-6 flex justify-center lg:hidden">
              <img alt="Escudo de la Municipalidad Distrital de Morales" className="size-28 object-contain" src="/logo-morales.png" />
            </div>
            {showBadge && <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-5 py-2 text-[11px] font-black tracking-[0.12em] text-[#1e5ca8]"><Icon className="size-4"><rect height="9" rx="1.5" width="12" x="6" y="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>ACCESO INSTITUCIONAL</span>}
            <h2 className="mt-6 text-center text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-[2.8rem]">{title}</h2>
            <div className="mx-auto mt-5 h-1 w-24 rounded-full bg-[#f5c84c]" />
            {subtitle && <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">{subtitle}</p>}
            <div className="mt-8" id="formulario-acceso">{children}</div>
            <div className="mt-8 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-400">
              ¿Necesita ayuda para ingresar? Comuníquese con el área de TI.
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  inputMode,
  maxLength,
  placeholder,
}: {
  readonly label: string
  readonly type?: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly autoComplete?: string
  readonly inputMode?: 'email' | 'numeric' | 'text'
  readonly maxLength?: number
  readonly placeholder?: string
}) {
  const fieldId = useId()
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const resolvedType = isPassword && revealed ? 'text' : type

  const fieldIcon = type === 'email'
    ? <Icon><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></Icon>
    : isPassword
      ? <Icon><rect height="10" rx="2" width="16" x="4" y="11" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>
      : <Icon><path d="M12 3 5 6v5c0 4.6 2.9 8.1 7 10 4.1-1.9 7-5.4 7-10V6l-7-3Z" /></Icon>

  return (
    <div className="grid gap-2">
      <label className="text-sm font-bold text-slate-700" htmlFor={fieldId}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 grid w-12 place-items-center text-slate-400">{fieldIcon}</span>
        <input
          autoComplete={autoComplete}
          className={`h-[52px] w-full rounded-xl border border-slate-300 bg-slate-50 pl-12 font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2d6bb5] focus:bg-white focus:ring-4 focus:ring-blue-100 ${isPassword ? 'pr-12' : 'pr-4'}`}
          id={fieldId}
          inputMode={inputMode}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          type={resolvedType}
          value={value}
        />
        {isPassword && (
          <button
            aria-label={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-400 transition hover:text-[#1e5ca8]"
            onClick={() => setRevealed((current) => !current)}
            type="button"
          >
            <Icon>{revealed ? <><path d="m3 3 18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" /><path d="M9.8 4.2A10.8 10.8 0 0 1 12 4c5 0 9 4 10 8a11.8 11.8 0 0 1-2.1 4.1M6.2 6.2A11.7 11.7 0 0 0 2 12c1 4 5 8 10 8 1.7 0 3.3-.5 4.7-1.3" /></> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}</Icon>
          </button>
        )}
      </div>
    </div>
  )
}

function PrimaryButton({ children, busy }: { readonly children: ReactNode; readonly busy: boolean }) {
  return (
    <button
      className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#163a73] px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-950/15 transition hover:-translate-y-0.5 hover:bg-[#102a56] hover:shadow-xl disabled:cursor-wait disabled:opacity-65 disabled:hover:translate-y-0"
      disabled={busy}
      type="submit"
    >
      {busy ? 'Procesando…' : <><Icon className="size-5"><path d="M9 8V5l-5 5 5 5v-3h6a3 3 0 0 1 3 3v1" /><path d="M19 18v1H8" /></Icon>{children}</>}
    </button>
  )
}

export function LoginView({
  onAuthenticated,
  onMfa,
  onForgot,
}: {
  readonly onAuthenticated: (user: User) => void
  readonly onMfa: (challengeId: string, expiresAt: string, destinationHint: string) => void
  readonly onForgot: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const result = await login(email, password, remember)

      if ('requires_mfa' in result) {
        onMfa(result.challenge_id, result.expires_at, result.destination_hint)
      } else {
        onAuthenticated(result)
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout showBadge={false} title="Bienvenido" subtitle="">
      <form className="grid gap-5" onSubmit={submit}>
        <Field autoComplete="username" inputMode="email" label="Correo institucional" onChange={setEmail} placeholder="nombre@moralesmuni.gob.pe" type="email" value={email} />
        <Field autoComplete="current-password" label="Contraseña" onChange={setPassword} placeholder="Ingrese su contraseña" type="password" value={password} />
        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2.5 text-sm text-slate-600">
            <input checked={remember} className="size-4 rounded accent-[#163a73]" onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
            Recordar sesión
          </label>
          <button className="text-right text-sm font-bold text-[#1e4f97] hover:underline" onClick={onForgot} type="button">
            Recuperar acceso
          </button>
        </div>
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <PrimaryButton busy={busy}>Ingresar al sistema</PrimaryButton>
      </form>
    </AuthLayout>
  )
}

function MfaView({
  challengeId,
  expiresAt,
  destinationHint,
  onAuthenticated,
  onBack,
}: {
  readonly challengeId: string
  readonly expiresAt: string
  readonly destinationHint: string
  readonly onAuthenticated: (user: User) => void
  readonly onBack: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      onAuthenticated(await verifyMfa(challengeId, code))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Verifique su identidad" subtitle={`Enviamos un código de verificación al ${destinationHint}. Ingréselo antes de las ${new Date(expiresAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}.`}>
      <form className="grid gap-5" onSubmit={submit}>
        <Field autoComplete="one-time-code" inputMode="numeric" label="Código de un solo uso" maxLength={6} onChange={(value) => setCode(value.replace(/\D/g, ''))} value={code} />
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <PrimaryButton busy={busy}>Verificar e ingresar</PrimaryButton>
        <button className="text-sm font-bold text-slate-500 hover:text-[#1e4f97]" onClick={onBack} type="button">Volver al inicio</button>
      </form>
    </AuthLayout>
  )
}

function ForgotView({ onBack }: { readonly onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      setMessage(await requestAccessRecovery(email))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Recupere su acceso" subtitle="La solicitud será revisada por el área de TI y atendida por un administrador autorizado.">
      <form className="grid gap-5" onSubmit={submit}>
        <Field autoComplete="email" inputMode="email" label="Correo de acceso" onChange={setEmail} type="email" value={email} />
        {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700" role="status">{message}</p>}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <PrimaryButton busy={busy}>Enviar solicitud a TI</PrimaryButton>
        <button className="text-sm font-bold text-slate-500 hover:text-[#1e4f97]" onClick={onBack} type="button">Volver al inicio</button>
      </form>
    </AuthLayout>
  )
}

function ResetView({ token, email, onFinished }: { readonly token: string; readonly email: string; readonly onFinished: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      setMessage(await resetPassword(token, email, password, confirmation))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Defina una contraseña nueva" subtitle="Use al menos 12 caracteres, mayúsculas, minúsculas, números y símbolos.">
      <form className="grid gap-5" onSubmit={submit}>
        <Field autoComplete="new-password" label="Nueva contraseña" onChange={setPassword} type="password" value={password} />
        <Field autoComplete="new-password" label="Confirmar contraseña" onChange={setConfirmation} type="password" value={confirmation} />
        {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700" role="status">{message}</p>}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        {!message && <PrimaryButton busy={busy}>Guardar contraseña</PrimaryButton>}
        <button className="text-sm font-bold text-slate-500 hover:text-[#1e4f97]" onClick={onFinished} type="button">Ir al inicio de sesión</button>
      </form>
    </AuthLayout>
  )
}

function MetricCard({ label, value, note, tone }: { readonly label: string; readonly value: number | string; readonly note: string; readonly tone: string }) {
  return (
    <article className="group rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,35,65,0.05)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,35,65,0.1)]">
      <div className="flex items-start justify-between gap-3"><span className={`inline-flex rounded-xl px-2.5 py-1 text-[10px] font-black tracking-wider ${tone}`}>{label}</span><span className="grid size-8 place-items-center rounded-xl bg-slate-50 text-slate-400 transition group-hover:bg-blue-50 group-hover:text-blue-600">↗</span></div>
      <strong className="mt-5 block text-3xl font-black tracking-tight text-slate-950">{value}</strong>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </article>
  )
}

function LoadingPanel() {
  return <div className="grid min-h-[280px] place-items-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-500">Cargando información autorizada…</div>
}

function DashboardContent({ metrics, user }: { readonly metrics: DashboardMetrics; readonly user: User }) {
  const isTechnologyArea = user.area?.code === 'TI'
  return (
    <div className="grid gap-3">
      <section className="rounded-2xl bg-[#0a2146] p-6 text-white shadow-sm">
        <h2 className="text-2xl font-black">Resumen</h2>
        <p className="mt-1 text-sm text-blue-100/75">Indicadores del sistema</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores institucionales">
        <MetricCard label="USUARIOS" note="Total" tone="bg-blue-50 text-blue-700" value={metrics.users_total} />
        <MetricCard label="USUARIOS ACTIVOS" note="Cuentas habilitadas" tone="bg-emerald-50 text-emerald-700" value={metrics.users_active} />
        <MetricCard label="ÁREAS" note="Activas" tone="bg-amber-50 text-amber-700" value={metrics.areas_active} />
        <MetricCard label="ACTIVOS" note="Registrados" tone="bg-violet-50 text-violet-700" value={metrics.assets_total} />
      </section>
      <section className="grid gap-4 sm:grid-cols-2"><MetricCard label="EVENTOS" note="Últimas 24 horas" tone="bg-blue-50 text-blue-700" value={metrics.audit_events_24h ?? '—'} /><MetricCard label="ACTIVOS VIGENTES" note="Estado activo" tone="bg-emerald-50 text-emerald-700" value={metrics.assets_active} /></section>
      {isTechnologyArea && <section aria-label="Alerta de mantenimiento" className={`rounded-2xl border p-5 ${metrics.assets_maintenance > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex items-center justify-between gap-4"><div><p className={`text-xs font-black uppercase tracking-[0.14em] ${metrics.assets_maintenance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{metrics.assets_maintenance > 0 ? 'Atención requerida por TI' : 'Mantenimiento al día'}</p><h3 className="mt-1 text-lg font-black text-slate-900">{metrics.assets_maintenance > 0 ? `Hay ${metrics.assets_maintenance} activo${metrics.assets_maintenance === 1 ? '' : 's'} en mantenimiento` : 'No hay activos pendientes de mantenimiento'}</h3><p className="mt-1 text-sm text-slate-600">Consulta el menú Activos y revisa las etiquetas amarillas “En mantenimiento” para coordinar la atención.</p></div><span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-black ${metrics.assets_maintenance > 0 ? 'bg-amber-200 text-amber-800' : 'bg-emerald-200 text-emerald-800'}`}>{metrics.assets_maintenance}</span></div></section>}
    </div>
  )
}

function SectionHeading({ title, description, action }: { readonly title: string; readonly description: string; readonly action?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      {action}
    </div>
  )
}

function ActionButton({ children, onClick }: { readonly children: ReactNode; readonly onClick: () => void }) {
  return <button className="h-11 rounded-xl bg-[#163a73] px-5 text-sm font-black text-white shadow-lg shadow-blue-950/15 hover:bg-[#102a56]" onClick={onClick} type="button">{children}</button>
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function UsersContent({ records, areas, roles, currentUserId, canCreate, canUpdate, canManageRecovery, onChanged }: {
  readonly records: readonly User[]
  readonly areas: readonly Area[]
  readonly roles: readonly Role[]
  readonly currentUserId: number
  readonly canCreate: boolean
  readonly canUpdate: boolean
  readonly canManageRecovery: boolean
  readonly onChanged: () => void
}) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [target, setTarget] = useState<User | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPrincipalId, setSelectedPrincipalId] = useState<number | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)
  const [recoveryRequests, setRecoveryRequests] = useState<Awaited<ReturnType<typeof accessRecoveryRequests>>>([])

  useEffect(() => {
    if (canManageRecovery) void accessRecoveryRequests().then(setRecoveryRequests).catch(() => setRecoveryRequests([]))
  }, [canManageRecovery])

  async function resolveRecovery(id: number, status: 'approved' | 'rejected'): Promise<void> {
    const result = await resolveAccessRecovery(id, status)
    if (result.temporary_password) setTemporaryPassword(result.temporary_password)
    setRecoveryRequests(await accessRecoveryRequests())
  }

  function openEditor(record: User | null) {
    setTarget(record)
    setEditorOpen(true)
  }

  const matchesSearch = (record: User): boolean => [record.name, record.email, record.job_title, record.area?.name, ...record.roles.map((role) => role.name)].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase())
  const principalRoleCodes = ['administrador_tecnico', 'jefe_patrimonio', 'oci_auditor']
  const assistantRoleCodes = ['asistente_ti', 'asistente_patrimonio', 'asistente_oci']
  const principals = records.filter((record) => record.roles.some((role) => principalRoleCodes.includes(role.code)) && matchesSearch(record))
  const assistants = records.filter((record) => record.roles.some((role) => assistantRoleCodes.includes(role.code)))
  const selectedPrincipal = principals.find((record) => record.id === selectedPrincipalId) ?? null
  const selectedAssistants = selectedPrincipal === null ? [] : assistants.filter((assistant) => assistant.area?.id === selectedPrincipal.area?.id)
  const activeUsers = records.filter((record) => record.is_active).length
  const representedAreas = new Set(records.map((record) => record.area?.id).filter((id): id is number => id !== undefined)).size

  return (
    <div className="grid gap-6">
      <SectionHeading action={canCreate ? <ActionButton onClick={() => openEditor(null)}>+ Registrar trabajador</ActionButton> : undefined} description="Personas autorizadas para ingresar y trabajar en el sistema." title="Usuarios del sistema" />

      <section aria-label="Resumen de usuarios" className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Usuarios registrados', value: records.length, note: 'Cuentas creadas', tone: 'bg-blue-50 text-blue-700' },
          { label: 'Cuentas activas', value: activeUsers, note: 'Con acceso habilitado', tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'Áreas representadas', value: representedAreas, note: 'Oficinas con usuarios', tone: 'bg-amber-50 text-amber-700' },
        ].map((item) => <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={item.label}><span className={`grid size-11 place-items-center rounded-xl text-lg font-black ${item.tone}`}>{item.value}</span><div><h3 className="text-sm font-black text-slate-800">{item.label}</h3><p className="mt-0.5 text-xs text-slate-400">{item.note}</p></div></article>)}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative block">
          <span className="pointer-events-none absolute inset-y-0 left-0 grid w-11 place-items-center text-slate-400"><Icon className="size-4"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon></span>
          <input className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-[#2d6bb5] focus:bg-white focus:ring-4 focus:ring-blue-100" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, perfil, correo o área" value={search} />
        </label>
      </section>

      {canManageRecovery && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <h3 className="font-black text-amber-950">Solicitudes de recuperación de acceso</h3>
        <p className="mt-1 text-sm text-amber-800">Solo TI puede atender estas solicitudes. Nunca se muestra la contraseña actual.</p>
        <div className="mt-3 grid gap-2">
          {recoveryRequests.filter((item) => item.status === 'pending').length === 0 && <p className="rounded-xl border border-amber-200 bg-white p-4 text-sm font-semibold text-slate-500">No hay solicitudes pendientes.</p>}
          {recoveryRequests.filter((item) => item.status === 'pending').map((item) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3" key={item.id}>
            <div><p className="font-black text-slate-800">{item.user.name}</p><p className="text-xs text-slate-500">{item.email} · {item.user.area?.name ?? 'Sin área'}</p></div>
            <div className="flex gap-2"><button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white" onClick={() => void resolveRecovery(item.id, 'approved')} type="button">Aprobar restablecimiento</button><button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700" onClick={() => void resolveRecovery(item.id, 'rejected')} type="button">Rechazar</button></div>
          </div>)}
        </div>
      </section>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Cuentas principales">
        {principals.map((record) => {
          const isCurrent = record.id === currentUserId
          return (
            <article className="group flex min-h-72 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,35,65,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg" key={record.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#174a86] to-[#0a2146] text-sm font-black text-white shadow-md shadow-blue-950/15">{initials(record.name)}</span>
                  <div className="min-w-0"><h3 className="text-base font-black leading-5 text-[#0a2146]">{record.name}</h3><p className="mt-1 truncate text-xs text-slate-400">{record.job_title ?? 'Cargo no registrado'}</p></div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${record.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{record.is_active ? 'Activo' : 'Inactivo'}</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {record.roles.length > 0 ? record.roles.map((role) => <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-black text-[#174a86]" key={role.id}>{role.name}</span>) : <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-500">Sin perfil asignado</span>}
              </div>

              <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-xs">
                <div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-400"><Icon className="size-3.5"><path d="M4 21V8l8-5 8 5v13M2 21h20M9 12h6M9 16h6" /></Icon></span><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Área</dt><dd className="mt-0.5 font-bold leading-5 text-slate-700">{record.area?.name ?? 'Sin área asignada'}</dd></div></div>
                <div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-400"><Icon className="size-3.5"><rect height="14" rx="2" width="18" x="3" y="5" /><path d="m4 7 8 6 8-6" /></Icon></span><div className="min-w-0"><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Correo institucional</dt><dd className="mt-0.5 break-all font-bold leading-5 text-slate-700">{record.email}</dd></div></div>
              </dl>

              <div className="mt-auto pt-5">
                <button className="mb-2 h-10 w-full rounded-xl border border-[#d8e5f5] bg-[#f5f9ff] text-xs font-black text-[#174a86] transition hover:bg-blue-100" onClick={() => setSelectedPrincipalId(record.id)} type="button">
                  Ver asistentes
                </button>
                {canUpdate && !isCurrent && <button className="h-10 w-full rounded-xl border border-blue-100 bg-blue-50/60 text-xs font-black text-[#174a86] transition hover:border-blue-200 hover:bg-blue-100" onClick={() => openEditor(record)} type="button">Administrar usuario</button>}
                {isCurrent && <div className="grid h-10 place-items-center rounded-xl border border-slate-100 bg-slate-50 text-xs font-bold text-slate-400">Esta es tu sesión actual</div>}
              </div>
            </article>
          )
        })}
      </section>
      {selectedPrincipal && <div className="fixed inset-0 z-50 grid place-items-center bg-[#07182f]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Asistentes de ${selectedPrincipal.area?.name ?? selectedPrincipal.name}`}>
        <section className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/60 bg-[#f7faff] p-6 shadow-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#2d6bb5]">Directorio de asistentes</p><h2 className="mt-1 text-2xl font-black text-[#0a2146]">{selectedPrincipal.area?.name ?? 'Área institucional'}</h2><p className="mt-1 text-sm text-slate-500">Responsable: {selectedPrincipal.name}</p></div><button className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-xl font-bold text-slate-500 hover:bg-slate-100" onClick={() => setSelectedPrincipalId(null)} type="button">×</button></div>
          {selectedAssistants.length > 0 ? <div className="mt-6 grid gap-4 sm:grid-cols-2">{selectedAssistants.map((assistant) => <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={assistant.id}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#174a86] to-[#0a2146] text-sm font-black text-white">{initials(assistant.name)}</span><div><h3 className="font-black text-[#0a2146]">{assistant.name}</h3><p className="mt-1 text-xs text-slate-500">{assistant.job_title ?? 'Asistente'}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${assistant.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{assistant.is_active ? 'Activo' : 'Inactivo'}</span></div><dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-xs"><div><dt className="font-black uppercase tracking-wider text-slate-400">Correo institucional</dt><dd className="mt-1 break-all font-bold text-slate-700">{assistant.email}</dd></div><div><dt className="font-black uppercase tracking-wider text-slate-400">Área</dt><dd className="mt-1 font-bold text-slate-700">{assistant.area?.name ?? 'Sin área'}</dd></div></dl></article>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-black text-slate-700">No hay asistentes registrados</p><p className="mt-1 text-sm text-slate-500">Puedes registrar uno desde el botón de usuarios.</p></div>}
        </section>
      </div>}
      {temporaryPassword && <div className="fixed inset-0 z-[60] grid place-items-center bg-[#07182f]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Contraseña temporal generada">
        <section className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-2xl sm:p-8">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Icon className="size-7"><path d="M20 7 9 18l-5-5" /></Icon></div>
          <h2 className="mt-4 text-xl font-black text-slate-950">Contraseña temporal generada</h2>
          <p className="mt-2 text-sm text-slate-500">Cópiala y entrégala por un canal institucional verificado. No volverá a mostrarse.</p>
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><code className="min-w-0 flex-1 break-all text-lg font-black tracking-wider text-emerald-900">{temporaryPassword}</code><button className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800" onClick={() => void navigator.clipboard?.writeText(temporaryPassword)} type="button">Copiar</button></div>
          <button className="mt-5 h-11 w-full rounded-xl bg-[#163a73] text-sm font-black text-white hover:bg-[#102a56]" onClick={() => setTemporaryPassword(null)} type="button">Cerrar</button>
        </section>
      </div>}
      {principals.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-black text-slate-700">No encontramos cuentas principales</p><p className="mt-1 text-sm text-slate-400">Prueba con otro nombre, perfil o área.</p></div>}
      {editorOpen && <UserEditor areas={areas} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); onChanged() }} record={target} roles={roles} />}
    </div>
  )
}

function AreasContent({ records, canManage, onChanged }: { readonly records: readonly Area[]; readonly canManage: boolean; readonly onChanged: () => void }) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [target, setTarget] = useState<Area | null>(null)

  function openEditor(record: Area | null) {
    setTarget(record)
    setEditorOpen(true)
  }

  const institution = records.find((record) => record.parent_id === null)
  const operationalAreas = institution === undefined ? records : records.filter((record) => record.id !== institution.id)
  const activeAreas = records.filter((record) => record.is_active).length

  return (
    <div className="grid gap-6">
      <SectionHeading action={canManage ? <ActionButton onClick={() => openEditor(null)}>+ Registrar área</ActionButton> : undefined} description="Oficinas que participan en la gestión y control de los bienes municipales." title="Áreas del sistema" />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de áreas">
        {[
          { value: records.length, label: 'Registros organizacionales', note: 'Incluye la institución' },
          { value: operationalAreas.length, label: 'Áreas operativas', note: 'Oficinas vinculadas' },
          { value: activeAreas, label: 'Áreas activas', note: 'Disponibles para asignación' },
        ].map((item) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={item.label}><strong className="text-2xl font-black text-[#174a86]">{item.value}</strong><h3 className="mt-1 text-sm font-black text-slate-800">{item.label}</h3><p className="mt-0.5 text-xs text-slate-400">{item.note}</p></article>)}
      </section>

      {institution && (
        <article className="relative overflow-hidden rounded-[22px] bg-gradient-to-r from-[#0a2146] to-[#174a86] p-6 text-white shadow-lg shadow-blue-950/10">
          <span aria-hidden="true" className="absolute -right-12 -top-16 size-48 rounded-full border-[28px] border-white/[0.04]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-blue-100"><Icon className="size-7"><path d="M4 21V8l8-5 8 5v13M2 21h20M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" /></Icon></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Institución principal · {institution.code}</p><h3 className="mt-1 text-xl font-black">{institution.name}</h3><p className="mt-1 text-sm text-blue-100/65">{operationalAreas.length} áreas operativas vinculadas al sistema</p></div></div>
            {canManage && <button className="h-10 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-black text-white transition hover:bg-white/15" onClick={() => openEditor(institution)} type="button">Editar institución</button>}
          </div>
        </article>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Áreas operativas">
        {operationalAreas.map((record) => (
          <article className="group flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,35,65,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg" key={record.id}>
            <div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#eaf2fb] text-[#174a86]"><Icon><path d="M4 21V8l8-5 8 5v13M2 21h20M8 12h3M13 12h3M8 16h3M13 16h3" /></Icon></span><div className="flex items-center gap-2"><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black tracking-wider text-slate-500">{record.code}</span><span className={`size-2 rounded-full ${record.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} title={record.is_active ? 'Área activa' : 'Área inactiva'} /></div></div>
            <h3 className="mt-5 text-lg font-black leading-6 text-[#0a2146]">{record.name}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{record.description ?? 'Área vinculada a la gestión institucional de activos.'}</p>
            <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4"><span className={`text-[11px] font-black ${record.is_active ? 'text-emerald-700' : 'text-red-700'}`}>{record.is_active ? 'Disponible para asignación' : 'Área inactiva'}</span>{canManage && <button className="text-xs font-black text-[#174a86] hover:underline" onClick={() => openEditor(record)} type="button">Editar</button>}</div>
          </article>
        ))}
      </section>
      {editorOpen && <AreaEditor areas={records} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); onChanged() }} record={target} />}
    </div>
  )
}

type AuditCategory = 'assets' | 'access' | 'administration' | 'inventory'

interface AuditPresentation {
  readonly title: string
  readonly category: AuditCategory
  readonly categoryLabel: string
  readonly detail: string
}

const auditEventLabels: Record<string, Omit<AuditPresentation, 'detail'>> = {
  'auth.login.succeeded': { title: 'Inició sesión correctamente', category: 'access', categoryLabel: 'Acceso' },
  'auth.login.failed': { title: 'Intento de acceso rechazado', category: 'access', categoryLabel: 'Seguridad' },
  'auth.mfa.challenge_issued': { title: 'Solicitó un código de verificación', category: 'access', categoryLabel: 'Acceso' },
  'auth.mfa.failed': { title: 'Ingresó un código de verificación incorrecto', category: 'access', categoryLabel: 'Seguridad' },
  'auth.logout': { title: 'Cerró su sesión', category: 'access', categoryLabel: 'Acceso' },
  'auth.password_reset.requested': { title: 'Solicitó recuperar su contraseña', category: 'access', categoryLabel: 'Seguridad' },
  'auth.password_reset.completed': { title: 'Actualizó su contraseña', category: 'access', categoryLabel: 'Seguridad' },
  'identity.user.created': { title: 'Registró una cuenta de trabajador', category: 'administration', categoryLabel: 'Usuarios' },
  'identity.user.updated': { title: 'Actualizó una cuenta de trabajador', category: 'administration', categoryLabel: 'Usuarios' },
  'organization.area.created': { title: 'Registró un área municipal', category: 'administration', categoryLabel: 'Áreas' },
  'organization.area.updated': { title: 'Actualizó un área municipal', category: 'administration', categoryLabel: 'Áreas' },
  'assets.asset.created': { title: 'Registró un activo', category: 'assets', categoryLabel: 'Activos' },
  'assets.asset.updated': { title: 'Actualizó un activo', category: 'assets', categoryLabel: 'Activos' },
  'assets.document.uploaded': { title: 'Adjuntó un archivo al activo', category: 'assets', categoryLabel: 'Activos' },
  'movements.requested': { title: 'Solicitó trasladar un activo', category: 'assets', categoryLabel: 'Movimientos' },
  'movements.approved': { title: 'Aprobó el traslado de un activo', category: 'assets', categoryLabel: 'Movimientos' },
  'movements.rejected': { title: 'Rechazó el traslado de un activo', category: 'assets', categoryLabel: 'Movimientos' },
  'movements.received': { title: 'Confirmó la recepción de un activo', category: 'assets', categoryLabel: 'Movimientos' },
  'custody.assigned': { title: 'Asignó la custodia de un activo', category: 'assets', categoryLabel: 'Custodia' },
  'inventory.campaign_created': { title: 'Creó una campaña de inventario', category: 'inventory', categoryLabel: 'Inventario' },
  'inventory.campaign_started': { title: 'Inició una campaña de inventario', category: 'inventory', categoryLabel: 'Inventario' },
  'inventory.campaign_closed': { title: 'Cerró una campaña de inventario', category: 'inventory', categoryLabel: 'Inventario' },
  'inventory.check_recorded': { title: 'Verificó un activo en inventario', category: 'inventory', categoryLabel: 'Inventario' },
  'disposals.requested': { title: 'Solicitó la baja de un activo', category: 'assets', categoryLabel: 'Bajas' },
  'disposals.approved': { title: 'Aprobó la baja de un activo', category: 'assets', categoryLabel: 'Bajas' },
  'disposals.rejected': { title: 'Rechazó la baja de un activo', category: 'assets', categoryLabel: 'Bajas' },
}

const auditFieldLabels: Record<string, string> = {
  asset_code: 'código patrimonial',
  inventory_code: 'código de inventario',
  category_id: 'tipo de bien',
  status_id: 'estado',
  area_id: 'área',
  location_id: 'ubicación',
  name: 'nombre',
  description: 'observaciones',
  brand: 'marca',
  model: 'modelo',
  serial_number: 'número de serie',
  acquisition_date: 'fecha de adquisición',
  acquisition_value: 'valor de adquisición',
  useful_life_years: 'vida útil',
  is_active: 'vigencia',
  document_number: 'documento de identidad',
  job_title: 'cargo',
  phone: 'teléfono',
  email: 'correo',
  mfa_required: 'verificación de acceso',
}

function changedFields(metadata: Record<string, unknown> | null): readonly string[] {
  const before = metadata?.before
  const after = metadata?.after
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return []

  return Object.keys(after).filter((field) => JSON.stringify((before as Record<string, unknown>)[field]) !== JSON.stringify((after as Record<string, unknown>)[field])).map((field) => auditFieldLabels[field] ?? field.replaceAll('_', ' '))
}

export function auditPresentation(record: AuditEvent): AuditPresentation {
  const presentation = auditEventLabels[record.event] ?? { title: 'Registró una actividad en el sistema', category: 'administration' as const, categoryLabel: 'Sistema' }
  const fields = changedFields(record.metadata)
  const reason = typeof record.metadata?.reason === 'string' && record.metadata.reason !== 'credentials_or_account_status' ? record.metadata.reason : null
  const documentType = typeof record.metadata?.document_type === 'string' ? record.metadata.document_type : null
  const documentLabels: Record<string, string> = { photo: 'fotografía', technical_sheet: 'ficha técnica', invoice: 'comprobante', act: 'acta', other: 'archivo' }
  const details = [
    fields.length > 0 ? `Datos modificados: ${fields.join(', ')}.` : null,
    reason !== null ? `Motivo: ${reason}` : null,
    documentType !== null ? `Archivo agregado: ${documentLabels[documentType] ?? 'documento'}.` : null,
  ].filter((item): item is string => item !== null)

  return {
    ...presentation,
    detail: details.join(' ') || record.subject?.context || 'Acción registrada automáticamente por el sistema.',
  }
}

function auditSubjectLabel(record: AuditEvent): string {
  if (record.subject?.asset !== null && record.subject?.asset !== undefined) return 'Activo involucrado'
  if (record.subject?.type === 'user') return 'Cuenta involucrada'
  if (record.subject?.type === 'area') return 'Área involucrada'
  if (record.subject?.type === 'inventory_campaign') return 'Campaña involucrada'
  return 'Registro involucrado'
}

function AuditCategoryIcon({ category }: { readonly category: AuditCategory }) {
  const paths: Record<AuditCategory, ReactNode> = {
    assets: <><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" /></>,
    access: <><rect height="16" rx="3" width="14" x="5" y="4" /><path d="M9 11h6M12 8v6" /></>,
    administration: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6M17 8v6M14 11h6" /></>,
    inventory: <><rect height="16" rx="2" width="14" x="5" y="4" /><path d="M9 4.5h6V7H9zM9 11h6M9 15h4" /></>,
  }
  return <Icon className="size-5">{paths[category]}</Icon>
}

export function AuditContent({ records, canManage = false }: { readonly records: readonly AuditEvent[]; readonly canManage?: boolean }) {
  const [filter, setFilter] = useState<'all' | AuditCategory>('assets')
  const [search, setSearch] = useState('')
  const [archiving, setArchiving] = useState<number | null>(null)
  const categoryStyles: Record<AuditCategory, string> = {
    assets: 'bg-blue-50 text-blue-700',
    access: 'bg-amber-50 text-amber-700',
    administration: 'bg-violet-50 text-violet-700',
    inventory: 'bg-emerald-50 text-emerald-700',
  }
  const filters: readonly { key: 'all' | AuditCategory; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'assets', label: 'Activos y movimientos' },
    { key: 'inventory', label: 'Inventario' },
    { key: 'administration', label: 'Usuarios y áreas' },
    { key: 'access', label: 'Accesos' },
  ]
  const visibleRecords = records.filter((record) => {
    const presentation = auditPresentation(record)
    const matchesFilter = filter === 'all' || presentation.category === filter
    const searchable = [presentation.title, record.actor?.name, record.actor?.job_title, record.actor?.area?.name, ...(record.actor?.roles.map((role) => role.name) ?? []), record.area?.name, record.subject?.label, record.subject?.reference].filter(Boolean).join(' ').toLowerCase()
    return matchesFilter && searchable.includes(search.trim().toLowerCase())
  })

  async function archive(record: AuditEvent) {
    const confirmed = window.confirm('¿Eliminar este evento del historial? Esta acción es solo para corregir un registro accidental.')
    if (!confirmed) return
    setArchiving(record.id)
    try {
      await archiveAuditEvent(record.id, 'Eliminado por el administrador de TI')
      window.location.reload()
    } finally {
      setArchiving(null)
    }
  }

  return (
    <div className="grid gap-6">
      <SectionHeading description="Consulta quién realizó cada acción, sobre qué registro y desde qué perfil o área." title="Historial del sistema" />

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="relative block">
          <span className="pointer-events-none absolute inset-y-0 left-0 grid w-11 place-items-center text-slate-400"><Icon className="size-4"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon></span>
          <input className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-[#2d6bb5] focus:bg-white focus:ring-4 focus:ring-blue-100" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por trabajador, activo, código, perfil o área" value={search} />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar historial">
          {filters.map((item) => <button className={`rounded-xl px-4 py-2 text-xs font-black transition ${filter === item.key ? 'bg-[#174a86] text-white shadow-md shadow-blue-950/10' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200 hover:text-[#174a86]'}`} key={item.key} onClick={() => setFilter(item.key)} type="button">{item.label}</button>)}
        </div>
      </section>

      <section className="grid gap-2" aria-label="Eventos del historial">
        {visibleRecords.map((record) => {
          const presentation = auditPresentation(record)
          const roleNames = record.actor?.roles.map((role) => role.name).join(', ')
          return (
            <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_14px_rgba(15,35,65,0.035)]" key={record.id}>
              <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${categoryStyles[presentation.category]}`}><AuditCategoryIcon category={presentation.category} /></span>
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${categoryStyles[presentation.category]}`}>{presentation.categoryLabel}</span>
                    <h3 className="mt-1 text-sm font-black text-[#0a2146]">{presentation.title}</h3>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{presentation.detail}</p>
                  </div>
                </div>
                <time className="shrink-0 text-xs font-bold text-slate-400" dateTime={record.occurred_at}>{new Date(record.occurred_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </div>

              <div className="grid gap-2 p-3 lg:grid-cols-[minmax(210px,0.75fr)_minmax(0,1.9fr)]">
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                  <span className="text-[9px] font-black uppercase tracking-[0.1em] text-blue-500">{auditSubjectLabel(record)}</span>
                  <strong className="mt-1 block truncate text-xs font-black text-[#0a2146]" title={record.subject?.label ?? 'Sin registro relacionado'}>{record.subject?.label ?? 'Sin registro relacionado'}</strong>
                  {record.subject?.reference && <span className="mt-0.5 block truncate text-[11px] font-bold text-blue-700">{record.subject.reference}</span>}
                </div>
                <dl className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 sm:grid-cols-3">
                  <div><dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Responsable</dt><dd className="mt-1 text-xs font-bold text-slate-800">{record.actor?.name ?? 'Sistema / sin identificar'}</dd></div>
                  <div><dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Perfil</dt><dd className="mt-1 text-xs font-bold text-slate-800">{roleNames || record.actor?.job_title || 'Sin sesión iniciada'}</dd>{roleNames && record.actor?.job_title && <span className="mt-1 block text-[11px] text-slate-400">{record.actor.job_title}</span>}</div>
                  <div><dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Área</dt><dd className="mt-1 text-xs font-bold text-slate-800">{record.actor?.area?.name ?? record.area?.name ?? 'Sin área asociada'}</dd>{record.area && record.actor?.area?.id !== record.area.id && <span className="mt-1 block text-[11px] text-slate-400">Registro: {record.area.name}</span>}</div>
                </dl>
              </div>
              {canManage && <div className="flex justify-end border-t border-slate-100 px-3 py-1.5"><button className="text-[10px] font-black text-slate-400 transition hover:text-rose-600 disabled:opacity-50" disabled={archiving === record.id} onClick={() => void archive(record)} type="button">{archiving === record.id ? 'Eliminando…' : 'Eliminar del historial'}</button></div>}
            </article>
          )
        })}
        {visibleRecords.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-black text-slate-700">{filter === 'assets' && search.trim() === '' ? 'Aún no hay acciones registradas sobre activos' : 'No se encontraron actividades'}</p><p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-slate-400">{filter === 'assets' && search.trim() === '' ? 'Cuando un trabajador registre, edite, traslade o dé de baja un activo, aquí aparecerán el bien involucrado, el responsable, su perfil y su área.' : 'Prueba con otro filtro o término de búsqueda.'}</p></div>}
      </section>
    </div>
  )
}

function AssetVisualIcon({ record }: { readonly record: Asset }) {
  const photo = record.documents?.find((document) => document.document_type === 'photo')
  if (photo !== undefined) return <img alt={`Fotografía de ${record.name}`} className="size-full object-cover" src={photo.url} />

  const descriptor = `${record.name} ${record.category.name}`.toLowerCase()
  if (descriptor.includes('comput') || descriptor.includes('informát') || descriptor.includes('equipo')) {
    return <Icon className="size-8"><rect height="12" rx="2" width="18" x="3" y="4" /><path d="M8 20h8M12 16v4" /></Icon>
  }
  if (descriptor.includes('mueble') || descriptor.includes('mesa') || descriptor.includes('silla')) {
    return <Icon className="size-8"><path d="M6 11h12v6H6zM8 17v4M16 17v4M8 11V6h8v5" /></Icon>
  }
  return <Icon className="size-8"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" /></Icon>
}

function AssetQr({ record }: { readonly record: Asset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const qrValue = window.location.origin + '/?asset=' + encodeURIComponent(record.asset_code)

  useEffect(() => {
    if (canvasRef.current !== null) void QRCode.toCanvas(canvasRef.current, qrValue, { width: 180, margin: 2, color: { dark: '#0a2146', light: '#ffffff' } })
  }, [qrValue])

  function download() {
    if (canvasRef.current === null) return
    const link = document.createElement('a')
    link.download = `QR-${record.asset_code}.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  return <div className="grid justify-items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Identificador QR</p><canvas aria-label={`Código QR de ${record.name}`} ref={canvasRef} /><p className="text-xs font-black text-[#174a86]">{record.asset_code}</p><button className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-[#174a86] hover:bg-blue-50" onClick={download} type="button">Descargar QR</button></div>
}

function QrScanner({ onClose, onDetected }: { readonly onClose: () => void; readonly onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [message, setMessage] = useState('Opción 1: apunte la cámara al QR del activo. Si no hay cámara, use la opción 2.')
  const [manualCode, setManualCode] = useState('')

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    const detectorConstructor = (window as unknown as { BarcodeDetector?: new (options?: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<readonly { rawValue: string }[]> } }).BarcodeDetector

    async function start() {
    if (videoRef.current === null || !navigator.mediaDevices?.getUserMedia) {
        setMessage('La cámara no está disponible. También puede ingresar el código manualmente.')
        return
      }
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true })
        }
        if (stopped || videoRef.current === null) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = detectorConstructor === undefined ? null : new detectorConstructor({ formats: ['qr_code'] })
        const scan = async () => {
          if (stopped || videoRef.current === null) return
          let rawValue: string | undefined
          if (detector !== null) {
            const results = await detector.detect(videoRef.current).catch(() => [])
            rawValue = results[0]?.rawValue
          } else if (canvasRef.current !== null && videoRef.current.videoWidth > 0) {
            const canvas = canvasRef.current
            canvas.width = videoRef.current.videoWidth
            canvas.height = videoRef.current.videoHeight
            const context = canvas.getContext('2d', { willReadFrequently: true })
            context?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
            const image = context?.getImageData(0, 0, canvas.width, canvas.height)
            rawValue = image === undefined ? undefined : jsQR(image.data, image.width, image.height)?.data
          }
          if (rawValue) {
            let value = rawValue
            try {
              const parsed = new URL(rawValue)
              value = parsed.searchParams.get('asset') ?? decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? rawValue)
            } catch {
              value = decodeURIComponent(rawValue.split('/').pop() ?? rawValue).replace(/^\?asset=/, '')
            }
            value = value.trim()
            onDetected(value)
            return
          }
          window.setTimeout(() => void scan(), 400)
        }
        void scan()
      } catch {
        setMessage('No se pudo acceder a la cámara. Puede ingresar el código manualmente.')
      }
    }
    void start()
    return () => { stopped = true; stream?.getTracks().forEach((track) => track.stop()) }
  }, [onDetected])

  return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-black text-[#0a2146]">Identificar activo</h2><button aria-label="Cerrar lector QR" className="grid size-9 place-items-center rounded-lg bg-slate-100 text-lg font-bold" onClick={onClose} type="button">×</button></div><div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><video aria-label="Vista de cámara para escanear QR" autoPlay className="aspect-square w-full bg-slate-950 object-cover" muted playsInline ref={videoRef} /><div className="bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">Opción 1 · Lectura con cámara</div></div><canvas className="hidden" ref={canvasRef} /><p className="mt-3 text-center text-xs font-semibold text-slate-500">{message}</p><div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="text-[11px] font-black uppercase tracking-wide text-[#174a86]">Opción 2 · Ingreso manual de respaldo</p><div className="mt-2 flex gap-2"><input aria-label="Código patrimonial manual" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm" onChange={(event) => setManualCode(event.target.value)} placeholder="Ej. PAT-0001" value={manualCode} /><button className="h-10 rounded-lg bg-[#174a86] px-3 text-xs font-black text-white disabled:opacity-40" disabled={manualCode.trim() === ''} onClick={() => onDetected(manualCode.trim())} type="button">Usar código</button></div></div></div></div>
}

function AssetDetails({ record, canAssign, onClose, onEdit }: { readonly record: Asset; readonly canAssign: boolean; readonly onClose: () => void; readonly onEdit: () => void }) {
  const photo = record.documents?.find((document) => document.document_type === 'photo')
  const [custodianships, setCustodianships] = useState<readonly Custodianship[]>([])
  const [candidates, setCandidates] = useState<readonly User[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [notes, setNotes] = useState('')
  const [loadingCustody, setLoadingCustody] = useState(true)
  const [savingCustody, setSavingCustody] = useState(false)
  const [custodyMessage, setCustodyMessage] = useState('')

  const loadCustody = useCallback(async () => {
    setLoadingCustody(true)
    try {
      const history = await assetCustodianships(record.id)
      setCustodianships(history)
      if (canAssign) setCandidates(await custodianshipCandidates(record.id))
    } catch (caught) {
      setCustodyMessage(caught instanceof ApiError ? caught.message : 'No se pudo cargar la custodia.')
    } finally {
      setLoadingCustody(false)
    }
  }, [canAssign, record.id])

  useEffect(() => { void loadCustody() }, [loadCustody])

  const specificationLabels: Record<string, string> = { processor: 'Procesador', generation: 'Generación', ram: 'Memoria RAM', ramType: 'Tipo de RAM', storage: 'Almacenamiento', storageType: 'Tipo de disco', gpu: 'Tarjeta gráfica', screenSize: 'Pantalla', os: 'Sistema operativo', connection: 'Conectividad', cores: 'Núcleos', raid: 'RAID', rack: 'Rack', ports: 'Puertos', speed: 'Velocidad', managed: 'Administrable', power: 'PoE / alimentación', uplink: 'Uplink', capacity: 'Capacidad', autonomy: 'Autonomía', outlets: 'Salidas', battery: 'Batería', topology: 'Tipo de UPS', technology: 'Tecnología', resolution: 'Resolución', color: 'Color', paperSize: 'Tamaño de papel', duplex: 'Doble cara', panel: 'Panel', refreshRate: 'Frecuencia', size: 'Tamaño máximo', lumens: 'Brillo', range: 'Alcance', material: 'Material', dimensions: 'Dimensiones', condition: 'Estado de conservación' }

  async function saveCustody() {
    const userId = Number(selectedUserId)
    if (!Number.isInteger(userId) || userId < 1) return
    setSavingCustody(true)
    setCustodyMessage('')
    try {
      await assignCustodian(record.id, userId, notes)
      setSelectedUserId('')
      setNotes('')
      setCustodyMessage('Custodia registrada y la anterior quedó terminada.')
      await loadCustody()
    } catch (caught) {
      setCustodyMessage(caught instanceof ApiError ? caught.message : 'No se pudo registrar la custodia.')
    } finally {
      setSavingCustody(false)
    }
  }

  return (
    <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" role="dialog">
      <div className="m-auto max-h-[calc(100vh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-[26px] bg-[#f4f7fb] shadow-2xl sm:max-h-[calc(100vh-2.5rem)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-gradient-to-r from-[#0a2146] to-[#174a86] px-5 py-4 text-white sm:px-7">
          <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100/70">Ficha detallada del activo</p><h2 className="mt-2 text-2xl font-black">{record.name}</h2><p className="mt-1 text-xs font-bold text-blue-100">{record.asset_code}</p></div>
          <button aria-label="Cerrar" className="grid size-10 place-items-center rounded-xl bg-white/10 text-xl font-bold transition hover:bg-white/20" onClick={onClose} type="button">×</button>
        </header>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="grid content-start gap-3"><div className="aspect-square overflow-hidden rounded-2xl bg-slate-100">{photo === undefined ? <div className="grid size-full place-items-center bg-gradient-to-br from-[#0a2146] via-[#174a86] to-[#2d6bb5] text-white"><AssetVisualIcon record={record} /></div> : <img alt={`Fotografía de ${record.name}`} className="size-full object-contain p-3" src={photo.url} />}</div><AssetQr record={record} /></div>
          <div className="grid content-start gap-3">
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-black ${record.is_active && record.status.code !== 'BAJA' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{record.is_active && record.status.code !== 'BAJA' ? 'Activo vigente' : 'Activo no vigente'}</span><span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-700"><span className={`size-2 rounded-full ${record.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />{record.status.name}</span></div>
            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#174a86]">Identificación y vida útil</p><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Código patrimonial</dt><dd className="mt-0.5 break-words text-sm font-black text-[#0a2146]">{record.asset_code}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tipo de bien</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{record.category.name}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">N.° de serie</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{record.serial_number ?? 'No registrado'}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Código de inventario</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{record.inventory_code ?? 'No registrado'}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fecha de adquisición</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{record.acquisition_date ?? 'No registrada'}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vida útil estimada</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{record.useful_life_years ? record.useful_life_years + ' años · fin estimado ' + usefulLifeEndDate(record) : 'No registrada'}</dd></div></dl></div>
            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#174a86]">Asignación y ubicación</p><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Registrado por</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{compactCreatorLabel(record.creator)} — {record.creator?.name ?? 'No identificado'}<span className="mt-0.5 block text-[11px] font-medium text-slate-400">Área del registrador: {record.creator?.area ?? 'No registrada'}</span></dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Área asignada / destino</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{record.area.name}<span className="mt-0.5 block text-[11px] font-medium text-slate-400">Este campo no indica quién registró el activo.</span></dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ubicación física</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{record.location?.name ?? 'No especificada'}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Marca y modelo</dt><dd className="mt-0.5 break-words text-sm font-bold text-slate-700">{[record.brand, record.model].filter(Boolean).join(' · ') || 'No registrados'}</dd></div></dl></div>
            {(() => {
              const furniture = ['Silla', 'Escritorio', 'Mesa', 'Archivador', 'Armario', 'Estantería', 'Carretilla', 'Módulo de archivo'].includes(record.asset_type ?? '')
              const expected = [...(technicalFields[record.asset_type ?? ''] ?? []), ...(furniture ? [['material', 'Material'], ['dimensions', 'Dimensiones'], ['color', 'Color'], ['condition', 'Estado de conservación']] as const : [])]
              const keys = new Set(expected.map(([key]) => key))
              Object.keys(record.specifications ?? {}).forEach((key) => keys.add(key))
              if (keys.size === 0) return null
              return <div className="grid gap-2 rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#174a86]">Ficha técnica · {record.asset_type ?? 'Activo'}</p><dl className="grid gap-3 sm:grid-cols-2">{Array.from(keys).map((key) => <div key={key}><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{specificationLabels[key] ?? expected.find(([fieldKey]) => fieldKey === key)?.[1] ?? key}</dt><dd className={`mt-0.5 break-words text-sm font-bold ${record.specifications?.[key] ? 'text-slate-700' : 'text-slate-400'}`}>{record.specifications?.[key] ?? 'No registrado · editar activo para completar'}</dd></div>)}</dl></div>
            })()}
            <section aria-label="Custodia del activo" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#174a86]">Custodia y responsable vigente</p>{loadingCustody && <span className="text-[10px] font-bold text-slate-400">Cargando…</span>}</div>{custodianships.length === 0 && !loadingCustody && <p className="text-xs text-slate-500">No hay asignaciones registradas.</p>}{custodianships.map((custody) => <div className="rounded-xl border border-slate-100 bg-slate-50 p-3" key={custody.id}><div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-800">{custody.user?.name ?? 'Usuario #' + custody.user_id}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-black ${custody.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{custody.status === 'active' ? 'Vigente' : 'Terminada'}</span></div><p className="mt-1 text-[11px] text-slate-500">Desde {new Date(custody.started_at).toLocaleString()} {custody.ended_at ? '· hasta ' + new Date(custody.ended_at).toLocaleString() : ''}</p>{custody.notes && <p className="mt-1 text-xs text-slate-600">{custody.notes}</p>}</div>)}{canAssign && <div className="grid gap-2 border-t border-slate-100 pt-3"><label className="text-[10px] font-black uppercase tracking-wider text-slate-400" htmlFor="custodian-select">Asignar custodio del área</label><select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" id="custodian-select" onChange={(event) => setSelectedUserId(event.target.value)} value={selectedUserId}><option value="">Seleccione una persona</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.email}</option>)}</select><textarea className="min-h-16 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" onChange={(event) => setNotes(event.target.value)} placeholder="Nota de la asignación (opcional)" value={notes} /><button className="h-10 rounded-lg bg-[#174a86] px-4 text-xs font-black text-white disabled:opacity-40" disabled={savingCustody || selectedUserId === ''} onClick={() => void saveCustody()} type="button">{savingCustody ? 'Guardando…' : 'Asignar custodio'}</button></div>}{custodyMessage && <p className="text-xs font-bold text-slate-600" role="status">{custodyMessage}</p>}</section>
            {record.description && <div className="rounded-2xl border border-slate-200 bg-white p-5"><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Observaciones</dt><dd className="mt-2 text-sm leading-6 text-slate-600">{record.description}</dd></div>}
            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"><button className="h-10 rounded-xl px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-200" onClick={onClose} type="button">Cerrar</button><button className="h-10 rounded-xl bg-[#174a86] px-5 text-sm font-black text-white transition hover:bg-[#0f376a]" onClick={onEdit} type="button">Editar activo</button></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetsContent({ records, pagination, metrics, areas, categories, statuses, locations, registeredAreaName, initialAssetCode, assetScope, canCreate, canUpdate, canUpload, onChanged, onPageChange, onScopeChange, user }: { readonly records: readonly Asset[]; readonly pagination: AssetPage['meta']; readonly metrics: DashboardMetrics | null; readonly areas: readonly Area[]; readonly categories: readonly AssetCategory[]; readonly statuses: readonly AssetStatus[]; readonly locations: readonly AssetLocation[]; readonly registeredAreaName: string | null; readonly initialAssetCode: string | null; readonly assetScope: 'all' | 'mine'; readonly canCreate: boolean; readonly canUpdate: boolean; readonly canUpload: boolean; readonly onChanged: () => void; readonly onPageChange: (page: number) => void; readonly onScopeChange: (scope: 'all' | 'mine') => void; readonly user: User }) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [target, setTarget] = useState<Asset | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [assetTypeFilter, setAssetTypeFilter] = useState('all')
  const [maintenanceRecords, setMaintenanceRecords] = useState<readonly Asset[]>([])
  const isTechnologyArea = user.area?.code === 'TI'

  useEffect(() => {
    if (!isTechnologyArea) return
    void assets(1, '', false, 'MANTENIMIENTO').then((page) => setMaintenanceRecords(page.data)).catch(() => setMaintenanceRecords([]))
  }, [isTechnologyArea, records])

  useEffect(() => {
    if (initialAssetCode === null || target !== null) return
    const loaded = records.find((record) => record.asset_code === initialAssetCode)
    if (loaded !== undefined) {
      setTarget(loaded)
      setDetailsOpen(true)
      return
    }
    void assetByCode(initialAssetCode).then((asset) => { setTarget(asset); setDetailsOpen(true) }).catch(() => setSearch(initialAssetCode))
  }, [initialAssetCode, records, target])

  const handleQrDetected = useCallback(async (value: string) => {
    try {
      const asset = await assetByCode(value)
      setTarget(asset)
      setDetailsOpen(true)
      setScannerOpen(false)
    } catch {
      setSearch(value)
      setScannerOpen(false)
    }
  }, [])

  function openEditor(record: Asset | null) {
    setTarget(record)
    setDetailsOpen(false)
    setEditorOpen(true)
  }

  function openDetails(record: Asset) {
    setTarget(record)
    setDetailsOpen(true)
  }

  const visibleRecords = records.filter((record) => {
    const matchesCategory = categoryFilter === 'all' || record.category.code === categoryFilter
    const matchesType = assetTypeFilter === 'all' || record.asset_type === assetTypeFilter
    const matchesSearch = `${record.asset_code} ${record.name} ${record.asset_type ?? ''} ${record.serial_number ?? ''} ${record.category.name}`.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesType && matchesSearch
  })

  const statusTone: Record<string, string> = {
    OPERATIVO: 'bg-emerald-500',
    MANTENIMIENTO: 'bg-amber-400',
    BAJA_PROPUESTA: 'bg-orange-500',
    BAJA: 'bg-rose-500',
  }

  const summary = [
    { label: 'Total registrados', value: metrics?.assets_total ?? pagination.total, icon: <><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" /></> },
    { label: 'Activos vigentes', value: metrics?.assets_active ?? records.filter((record) => record.is_active).length, icon: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></> },
    { label: 'Con número de serie', value: metrics?.assets_with_serial ?? records.filter((record) => record.serial_number).length, icon: <><rect height="14" rx="2" width="18" x="3" y="5" /><path d="M7 9h2M12 9h5M7 13h10M7 16h6" /></> },
  ]

  return (
    <div className="grid gap-6">
      {isTechnologyArea && <section aria-label="Mantenimiento TI" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Mantenimiento TI</p><h2 className="mt-1 text-lg font-black text-slate-900">{maintenanceRecords.length === 0 ? 'No hay activos pendientes' : `${maintenanceRecords.length} activo${maintenanceRecords.length === 1 ? '' : 's'} requiere${maintenanceRecords.length === 1 ? '' : 'n'} atención`}</h2><p className="mt-1 text-sm text-slate-600">Revisa el problema, registra la atención y cambia el estado a Operativo cuando el equipo quede reparado.</p></div><span className="grid size-12 place-items-center rounded-2xl bg-amber-200 text-xl font-black text-amber-800">{maintenanceRecords.length}</span></div>{maintenanceRecords.length > 0 && <div className="mt-4 grid gap-2">{maintenanceRecords.map((maintenance) => <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center" key={maintenance.id}><div><p className="text-sm font-black text-[#0a2146]">{maintenance.asset_code} · {maintenance.name}</p><p className="text-xs text-slate-500">{maintenance.area.name} · {maintenance.location?.name ?? 'Sin ubicación'} · Estado: {maintenance.status.name}</p></div><button className="h-9 rounded-lg bg-[#174a86] px-3 text-xs font-black text-white" onClick={() => openDetails(maintenance)} type="button">Ver ficha y atender</button></div>)}</div>}</section>}
      <section aria-label="Resumen de activos" className="grid gap-4 sm:grid-cols-3">
        {summary.map((item) => (
          <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,35,65,0.05)]" key={item.label}>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eaf2fb] text-[#174a86]"><Icon>{item.icon}</Icon></span>
            <div><span className="text-xs font-bold text-slate-500">{item.label}</span><strong className="mt-1 block text-2xl font-black text-[#0a2146]">{item.value}</strong></div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">Bienes registrados</h2>
            <p className="mt-1 text-xs text-slate-500">Consulta y administra los equipos y muebles municipales.</p>
          </div>
          {canCreate && (
            <div className="flex flex-wrap justify-end gap-2"><button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-[#174a86] transition hover:bg-blue-100" onClick={() => setScannerOpen(true)} type="button"><Icon className="size-4"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" /><path d="M8 8h8v8H8z" /></Icon>Escanear QR</button><button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#174a86] px-5 text-sm font-black text-white shadow-lg shadow-blue-950/15 transition hover:-translate-y-0.5 hover:bg-[#0f376a]" onClick={() => openEditor(null)} type="button">
              <Icon className="size-4"><path d="M12 5v14M5 12h14" /></Icon>
              Registrar equipo o mueble
            </button></div>
          )}
        </div>
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.25fr_1.25fr_auto] lg:items-end">
          <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Alcance
            <select aria-label="Alcance de activos" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black normal-case tracking-normal text-[#174a86] shadow-sm outline-none transition focus:border-[#2d6bb5] focus:ring-4 focus:ring-blue-100" onChange={(event) => onScopeChange(event.target.value as 'all' | 'mine')} value={assetScope}>
              <option value="all">Todos los activos autorizados</option>
              <option value="mine">Registrados por mí</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Categoría general
            <select aria-label="Filtrar por categoría" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black normal-case tracking-normal text-[#174a86] shadow-sm outline-none transition focus:border-[#2d6bb5] focus:ring-4 focus:ring-blue-100" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
              <option value="all">Todas las categorías</option>
              {categories.filter((category) => category.is_active).map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Tipo específico
            <select aria-label="Filtrar por tipo de activo" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black normal-case tracking-normal text-[#174a86] shadow-sm outline-none transition focus:border-[#2d6bb5] focus:ring-4 focus:ring-blue-100" onChange={(event) => setAssetTypeFilter(event.target.value)} value={assetTypeFilter}>
              <option value="all">Todos los tipos</option>
              {ASSET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <span className="h-11 rounded-xl border border-blue-100 bg-blue-50 px-4 text-center text-xs font-black leading-[2.75rem] text-[#174a86]">{pagination.total} resultado(s)</span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Fichas de activos">
        {visibleRecords.map((record) => (
          <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,35,65,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg" key={record.id}>
            <div className="grid h-full gap-3 p-2.5">
              {(() => {
                const photo = record.documents?.find((document) => document.document_type === 'photo')

                return photo === undefined ? (
                  <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[#0a2146] via-[#174a86] to-[#2d6bb5] text-white">
                    <span aria-hidden="true" className="absolute -right-8 -top-8 size-28 rounded-full border-[18px] border-white/[0.06]" />
                    <span aria-hidden="true" className="absolute -bottom-5 -left-5 size-20 rounded-full bg-amber-300/10" />
                    <div className="relative text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-lg"><AssetVisualIcon record={record} /></span><span className="mt-3 block text-[10px] font-black tracking-[0.16em] text-blue-100">{record.asset_code}</span></div>
                  </div>
                ) : (
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
                    <img alt={`Fotografía de ${record.name}`} className="absolute inset-0 size-full object-contain" src={photo.url} />
                  </div>
                )
              })()}

              <div className="flex min-w-0 flex-1 flex-col px-1 pb-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="line-clamp-2 min-h-12 text-[15px] font-black leading-6 text-[#0a2146]" title={record.name}>{record.name}</h3>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[9px] font-black text-slate-600" title={record.status.name}>
                    <span aria-hidden="true" className={`size-2 rounded-full ${record.is_active ? (statusTone[record.status.code] ?? 'bg-emerald-500') : 'bg-slate-400'}`} />
                    {record.status.name}
                  </span>
                </div>
                <dl className="mt-2 grid gap-1.5 border-t border-slate-100 pt-2.5">
                  <div className="flex items-start justify-between gap-2"><dt className="pt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Registrado por</dt><dd className="max-w-[150px] rounded-md bg-blue-50 px-2 py-1 text-right text-[10px] font-black leading-4 text-[#174a86]" title={record.creator?.name ?? 'No identificado'}>{compactCreatorLabel(record.creator)}</dd></div>
                  <div className="flex items-start justify-between gap-2"><dt className="pt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Destino</dt><dd className="max-w-[135px] rounded-md bg-slate-100 px-2 py-1 text-right text-[10px] font-black leading-4 text-slate-700" title={record.area.name}>{compactAreaName(record.area)}</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">N.° de serie</dt><dd className="truncate text-right text-xs font-bold text-slate-700">{record.serial_number ?? 'No registrado'}</dd></div>
                </dl>
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-100 pt-3"><button className="h-8 rounded-lg border border-slate-200 bg-white text-[10px] font-black text-[#174a86] transition hover:border-blue-200 hover:bg-blue-50" onClick={() => openDetails(record)} type="button">Ver más</button>{canUpdate && <button className="h-8 rounded-lg bg-[#174a86] text-[10px] font-black text-white shadow-md shadow-blue-950/10 transition hover:bg-[#0f376a]" onClick={() => openEditor(record)} type="button">Editar</button>}</div>
              </div>
            </div>
          </article>
        ))}
      </section>

      {visibleRecords.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-lg font-black text-slate-800">No encontramos activos</p><p className="mt-2 text-sm text-slate-500">Prueba otra búsqueda o registra el primer equipo o mueble.</p></div>}
      {pagination.last_page > 1 && <nav aria-label="Paginación de activos" className="flex flex-wrap items-center justify-center gap-2">
        <button className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" disabled={pagination.current_page === 1} onClick={() => onPageChange(pagination.current_page - 1)} type="button">Anterior</button>
        {Array.from({ length: pagination.last_page }, (_, index) => index + 1).filter((page) => page === 1 || page === pagination.last_page || Math.abs(page - pagination.current_page) <= 2).map((page, index, pages) => <span className="flex items-center gap-2" key={page}>{index > 0 && pages[index - 1] !== page - 1 && <span className="px-1 text-xs font-black text-slate-400">…</span>}<button aria-current={page === pagination.current_page ? 'page' : undefined} className={`grid size-9 place-items-center rounded-lg text-xs font-black transition ${page === pagination.current_page ? 'bg-[#174a86] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-[#174a86]'}`} onClick={() => onPageChange(page)} type="button">{page}</button></span>)}
        <button className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" disabled={pagination.current_page === pagination.last_page} onClick={() => onPageChange(pagination.current_page + 1)} type="button">Siguiente</button>
      </nav>}
      {detailsOpen && target !== null && <AssetDetails canAssign={canUpdate} onClose={() => setDetailsOpen(false)} onEdit={() => openEditor(target)} record={target} />}
      {scannerOpen && <QrScanner onClose={() => setScannerOpen(false)} onDetected={handleQrDetected} />}
      {editorOpen && <AssetEditor areas={areas} canUpload={canUpload} categories={categories} locations={locations} onClose={() => { setEditorOpen(false) }} onSaved={() => { setEditorOpen(false); onChanged() }} record={target} registeredAreaName={registeredAreaName} statuses={statuses} />}
    </div>
  )
}

function MovementsContent({ records, canApprove, canReceive, canCreate, currentAreaId, assets: assetOptions, areas: areaOptions, locations, onChanged }: { readonly records: readonly MovementRequest[]; readonly canApprove: boolean; readonly canReceive: boolean; readonly canCreate: boolean; readonly currentAreaId?: number | undefined; readonly assets: readonly Asset[]; readonly areas: readonly Area[]; readonly locations: readonly AssetLocation[]; readonly onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  const [form, setForm] = useState({ asset_id: '', to_area_id: '', to_location_id: '', to_user_id: '', reason: '' })
  const [recipients, setRecipients] = useState<readonly User[]>([])
  useEffect(() => { if (form.to_area_id !== '') void movementRecipients(Number(form.to_area_id)).then(setRecipients).catch(() => setRecipients([])) }, [form.to_area_id])
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(-1); try { await createMovement({ asset_id: Number(form.asset_id), to_area_id: Number(form.to_area_id), to_location_id: form.to_location_id === '' ? null : Number(form.to_location_id), to_user_id: form.to_user_id === '' ? null : Number(form.to_user_id), reason: form.reason }); setForm({ asset_id: '', to_area_id: '', to_location_id: '', to_user_id: '', reason: '' }); onChanged() } finally { setBusy(null) } }
  async function decide(record: MovementRequest, decision: 'approved' | 'rejected') {
    setBusy(record.id)
    try { const reason = decision === 'rejected' ? window.prompt('Motivo del rechazo:') : undefined; if (decision === 'rejected' && !reason?.trim()) return; await decideMovement(record.id, decision, reason ?? undefined); onChanged() } finally { setBusy(null) }
  }
  async function receive(record: MovementRequest) { setBusy(record.id); try { await receiveMovement(record.id); onChanged() } finally { setBusy(null) } }
  return <div className="grid gap-5"><SectionHeading description="Solicita un traslado, Patrimonio lo revisa y el receptor confirma la entrega." title="Movimientos patrimoniales" />{canCreate && <form className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-5" onSubmit={(event) => void submit(event)}><select className="rounded-lg border p-2 text-sm" required value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })}><option value="">Bien patrimonial</option>{assetOptions.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.asset_code} · {a.name}</option>)}</select><select className="rounded-lg border p-2 text-sm" required value={form.to_area_id} onChange={(e) => setForm({ ...form, to_area_id: e.target.value, to_location_id: '', to_user_id: '' })}><option value="">Área destino</option>{areaOptions.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select className="rounded-lg border p-2 text-sm" value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })}><option value="">Ubicación destino</option>{locations.filter((l) => l.area_id === Number(form.to_area_id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><select className="rounded-lg border p-2 text-sm" value={form.to_user_id} onChange={(e) => setForm({ ...form, to_user_id: e.target.value })}><option value="">Custodio receptor (opcional)</option>{recipients.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><div className="flex gap-2"><input className="min-w-0 flex-1 rounded-lg border p-2 text-sm" required placeholder="Motivo" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /><button className="rounded-lg bg-[#174a86] px-4 text-xs font-black text-white" disabled={busy === -1} type="submit">Solicitar</button></div></form>}<DataTable headers={['Activo', 'Origen', 'Destino', 'Motivo', 'Estado', 'Acción']}>{records.map((record) => <tr className="border-t border-slate-100" key={record.id}><td className="px-5 py-4"><strong>{record.asset?.asset_code ?? `#${record.asset_id}`}</strong><span className="block text-xs text-slate-500">{record.asset?.name ?? 'Activo'}</span></td><td className="px-5 py-4 text-sm text-slate-600">{record.from_area?.name ?? '—'}</td><td className="px-5 py-4 text-sm text-slate-600">{record.to_area?.name ?? '—'}</td><td className="max-w-xs px-5 py-4 text-sm text-slate-600">{record.reason}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-700">{movementStatusLabel(record.status)}</span></td><td className="px-5 py-4"><div className="flex min-h-8 items-center gap-2">{canApprove && record.status === 'pending' && <><button className="text-xs font-black text-emerald-700 hover:underline disabled:opacity-50" disabled={busy === record.id} onClick={() => void decide(record, 'approved')} type="button">Aprobar</button><button className="text-xs font-black text-red-700 hover:underline disabled:opacity-50" disabled={busy === record.id} onClick={() => void decide(record, 'rejected')} type="button">Rechazar</button></>}{canReceive && currentAreaId === record.to_area_id && record.status === 'approved' && <button className="text-xs font-black text-[#1e4f97] hover:underline disabled:opacity-50" disabled={busy === record.id} onClick={() => void receive(record)} type="button">Recibir</button>}{!canApprove && !(canReceive && currentAreaId === record.to_area_id) && <span className="text-xs text-slate-400">Sin acción para este rol</span>}{!canApprove && canReceive && currentAreaId === record.to_area_id && record.status === 'pending' && <span className="text-xs text-slate-400">Esperando revisión</span>}</div></td></tr>)}</DataTable></div>
}

function InventoryContent({ records, areas: areaOptions, assets: assetOptions, locations, restrictedAreaId, canManage, canCheck, onChanged }: { readonly records: readonly InventoryCampaign[]; readonly areas: readonly Area[]; readonly assets: readonly Asset[]; readonly locations: readonly AssetLocation[]; readonly restrictedAreaId?: number | undefined; readonly canManage: boolean; readonly canCheck: boolean; readonly onChanged: () => void }) { const [form,setForm]=useState({code:'',name:'',area_id:restrictedAreaId ? String(restrictedAreaId) : '',notes:''}); const [check,setCheck]=useState({campaign:'',asset:'',result:'found',location:'',notes:''}); const [busy,setBusy]=useState(false); const [scannerOpen,setScannerOpen]=useState(false); async function create(event:FormEvent){event.preventDefault();setBusy(true);try{await createInventoryCampaign({code:form.code,name:form.name,area_id:Number(form.area_id),notes:form.notes});setForm({code:'',name:'',area_id:'',notes:''});onChanged()}finally{setBusy(false)}} async function verify(event:FormEvent){event.preventDefault();setBusy(true);try{const asset=assetOptions.find(a=>a.asset_code===check.asset);if(!asset) throw new Error('Código patrimonial no encontrado');await recordInventoryCheck(Number(check.campaign),{asset_id:asset.id,result:check.result,observed_location_id:check.location?Number(check.location):null,notes:check.notes});setCheck({...check,asset:'',notes:''});onChanged()}finally{setBusy(false)}} return <div className="grid gap-5"><SectionHeading description="Cada jornada agrupa los bienes revisados, resultados y hallazgos de un área." title="Inventario físico" />{canManage&&<form className="grid gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 md:grid-cols-5" onSubmit={(e)=>void create(e)}><input className="rounded-lg border p-2 text-sm" required placeholder="Código de jornada" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><input className="rounded-lg border p-2 text-sm" required placeholder="Nombre" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select className="rounded-lg border p-2 text-sm" required value={form.area_id} onChange={e=>setForm({...form,area_id:e.target.value})}><option value="">Área</option>{areaOptions.filter(a=>restrictedAreaId === undefined || a.id === restrictedAreaId).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><input className="rounded-lg border p-2 text-sm" placeholder="Observaciones" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><button className="rounded-lg bg-emerald-700 px-3 text-xs font-black text-white" disabled={busy} type="submit">Crear jornada</button></form>}{canCheck&&<form className="grid gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-4 md:grid-cols-6" onSubmit={(e)=>void verify(e)}><select className="rounded-lg border p-2 text-sm" required value={check.campaign} onChange={e=>setCheck({...check,campaign:e.target.value})}><option value="">Jornada en curso</option>{records.filter(r=>r.status==='in_progress').map(r=><option key={r.id} value={r.id}>{r.code}</option>)}</select><div className="flex gap-1"><input className="min-w-0 rounded-lg border p-2 text-sm" required placeholder="Código patrimonial" value={check.asset} onChange={e=>setCheck({...check,asset:e.target.value})}/><button className="rounded-lg border bg-white px-2 text-xs font-black" onClick={()=>setScannerOpen(true)} type="button">QR</button></div><select className="rounded-lg border p-2 text-sm" value={check.result} onChange={e=>setCheck({...check,result:e.target.value})}><option value="found">Encontrado</option><option value="not_found">No encontrado</option><option value="location_mismatch">Ubicación distinta</option></select><select className="rounded-lg border p-2 text-sm" value={check.location} onChange={e=>setCheck({...check,location:e.target.value})}><option value="">Ubicación observada</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><button className="rounded-lg bg-amber-700 px-3 text-xs font-black text-white" disabled={busy} type="submit">Registrar verificación</button>{scannerOpen&&<QrScanner onClose={()=>setScannerOpen(false)} onDetected={(code)=>{setCheck({...check,asset:code});setScannerOpen(false)}}/>}</form>}<DataTable headers={['Código','Jornada','Área','Avance','Hallazgos','Estado','Acción']}>{records.map(r=><tr className="border-t border-slate-100" key={r.id}><td className="px-5 py-4 text-xs font-black text-[#1e4f97]">{r.code}</td><td className="px-5 py-4 font-bold">{r.name}</td><td className="px-5 py-4 text-sm">{r.area?.name??'—'}</td><td className="px-5 py-4 text-sm">{inventoryProgressLabel(r)}</td><td className="px-5 py-4 text-sm">No encontrados: {r.not_found_count??0} · Ubicación distinta: {r.location_mismatch_count??0}</td><td className="px-5 py-4 text-sm">{inventoryStatusLabel(r.status)}</td><td className="px-5 py-4">{canManage&&r.status==='planned'&&<button className="text-xs font-black text-emerald-700" onClick={()=>void startInventoryCampaign(r.id).then(onChanged)} type="button">Iniciar</button>}{canManage&&r.status==='in_progress'&&<button className="text-xs font-black text-red-700" onClick={()=>void closeInventoryCampaign(r.id).then(onChanged)} type="button">Cerrar</button>}</td></tr>)}</DataTable></div> }

function ReconciliationContent({ records, canCreate, canReview, onChanged }: { readonly records: readonly ReconciliationRun[]; readonly canCreate: boolean; readonly canReview: boolean; readonly onChanged: () => void }) { const [form,setForm]=useState({code:'',name:'',file:null as File|null}); const [detail,setDetail]=useState<ReconciliationRun|null>(null); const [busy,setBusy]=useState(false); async function submit(e:FormEvent){e.preventDefault();if(!form.file)return;setBusy(true);try{const body=new FormData();body.append('code',form.code);body.append('name',form.name);body.append('file',form.file);await createReconciliation(body);setForm({code:'',name:'',file:null});onChanged()}finally{setBusy(false)}} return <div className="grid gap-5"><SectionHeading description="Compara el padrón del sistema contra un archivo de referencia. Las diferencias requieren revisión; no se corrige automáticamente ningún activo." title="Conciliación patrimonial" />{canCreate&&<form className="flex flex-wrap gap-2 rounded-2xl border border-violet-100 bg-violet-50 p-4" onSubmit={(e)=>void submit(e)}><input className="rounded-lg border p-2 text-sm" required placeholder="Código" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><input className="rounded-lg border p-2 text-sm" required placeholder="Nombre de ejecución" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input className="rounded-lg border bg-white p-2 text-sm" required accept=".csv,.txt" type="file" onChange={e=>setForm({...form,file:e.target.files?.[0]??null})}/><button className="rounded-lg bg-violet-700 px-4 text-xs font-black text-white" disabled={busy} type="submit">Comparar CSV</button></form>}<DataTable headers={['Código','Ejecución','Fuente','Diferencias','Pendientes','Resueltas','Detalle']}>{records.map(r=><tr className="border-t border-slate-100" key={r.id}><td className="px-5 py-4 text-xs font-black text-violet-700">{r.code}</td><td className="px-5 py-4 font-bold">{r.name}</td><td className="px-5 py-4 text-sm">{r.source_file_name}</td><td className="px-5 py-4 text-sm">{r.total_differences??0}</td><td className="px-5 py-4 text-sm">{r.pending_differences??0}</td><td className="px-5 py-4 text-sm">{r.resolved_differences??0}</td><td><button className="text-xs font-black text-violet-700" onClick={()=>void reconciliationDetails(r.id).then(setDetail)} type="button">Revisar</button></td></tr>)}</DataTable>{detail&&<div className="rounded-2xl border border-violet-100 bg-white p-4"><p className="font-black">Diferencias de {detail.code}</p><div className="mt-3 grid gap-2">{detail.differences?.map(d=><div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm" key={d.id}><span><b>{d.asset_code}</b><span className="block text-xs text-slate-600">{reconciliationDifferenceLabel(d.difference_type)} · {reconciliationStatusLabel(d.status)}</span></span>{canReview&&d.status!=='resolved'&&<button className="rounded bg-emerald-700 px-2 py-1 text-xs font-black text-white" disabled={busy} onClick={()=>{setBusy(true);void updateReconciliationDifference(d.id,'resolved','Diferencia revisada en prototipo').then(()=>reconciliationDetails(detail.id)).then(setDetail).then(()=>{setBusy(false);onChanged()})}} type="button">Marcar resuelta</button>}</div>)}</div></div>}</div> }

function EvaluationsContent({ records, assets: assetOptions, users: userOptions, canAssign, canCreate, canUpdate, onChanged }: { readonly records: readonly TechnicalEvaluation[]; readonly assets: readonly Asset[]; readonly users: readonly User[]; readonly canAssign: boolean; readonly canCreate: boolean; readonly canUpdate: boolean; readonly onChanged: () => void }) {
  const [form, setForm] = useState({ asset_id: '', reason: '', assigned_to: '', observations: '', file: null as File | null }); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); try { const created = await createTechnicalEvaluation({ asset_id: Number(form.asset_id), reason: form.reason, assigned_to: form.assigned_to ? Number(form.assigned_to) : null, observations: form.observations }); if (form.file) await uploadTechnicalEvaluationDocument(created.id, form.file); setForm({ asset_id: '', reason: '', assigned_to: '', observations: '', file: null }); onChanged() } finally { setBusy(false) } }
  async function advance(row: TechnicalEvaluation) { setBusy(true); try { const status = row.status === 'requested' ? 'assigned' : row.status === 'assigned' ? 'evaluated' : 'reviewed'; await updateTechnicalEvaluation(row.id, { status, physical_condition: 'En evaluación', diagnosis: 'Diagnóstico registrado en prototipo', recommendations: 'Revisar según informe técnico', observations: row.observations }); onChanged() } finally { setBusy(false) } }
  return <div className="grid gap-5"><SectionHeading description="Revisión técnica de un bien: diagnóstico, responsable y recomendaciones. La recomendación no cambia por sí sola el estado del activo." title="Evaluación técnica" />{canCreate&&<form className="grid gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 md:grid-cols-4" onSubmit={(e)=>void submit(e)}><select className="rounded-lg border p-2 text-sm" required value={form.asset_id} onChange={e=>setForm({...form,asset_id:e.target.value})}><option value="">Activo</option>{assetOptions.filter(a=>a.is_active).map(a=><option key={a.id} value={a.id}>{a.asset_code} · {a.name}</option>)}</select><input className="rounded-lg border p-2 text-sm" required placeholder="Motivo de evaluación" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/>{canAssign&&<select className="rounded-lg border p-2 text-sm" value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})}><option value="">Especialista (opcional)</option>{userOptions.filter(u=>u.is_active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}<input className="rounded-lg border p-2 text-sm" placeholder="Observaciones" value={form.observations} onChange={e=>setForm({...form,observations:e.target.value})}/><input className="rounded-lg border bg-white p-2 text-xs" accept=".pdf,.jpg,.jpeg,.png,.webp" type="file" onChange={e=>setForm({...form,file:e.target.files?.[0]??null})}/><button className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-black text-white" disabled={busy} type="submit">Solicitar evaluación</button></form>}<DataTable headers={['Activo','Motivo','Especialista','Estado','Diagnóstico','Acción']}>{records.map(r=><tr className="border-t border-slate-100" key={r.id}><td className="px-5 py-4 font-black">{r.asset?.asset_code}<br/><span className="font-normal">{r.asset?.name}</span></td><td className="px-5 py-4 text-sm">{r.reason}</td><td className="px-5 py-4 text-sm">{r.specialist?.name??'Pendiente'}</td><td className="px-5 py-4 text-sm">{evaluationStatusLabel(r.status)}</td><td className="px-5 py-4 text-sm">{r.diagnosis??'—'}</td><td className="px-5 py-4">{canUpdate&&r.status!=='reviewed'&&<button className="text-xs font-black text-cyan-700" disabled={busy} onClick={()=>void advance(r)} type="button">Avanzar</button>}</td></tr>)}</DataTable></div>
}

function DisposalsContent({ records, assets: assetOptions, evaluations, canCreate, canReview, onChanged }: { readonly records: readonly DisposalRequest[]; readonly assets: readonly Asset[]; readonly evaluations: readonly TechnicalEvaluation[]; readonly canCreate: boolean; readonly canReview: boolean; readonly onChanged: () => void }) {
  const [form, setForm] = useState({ asset_id: '', cause: '', reason: '', technical_evaluation_id: '', documentation_notes: '', file: null as File | null }); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); try { const created = await createDisposalRequest(Number(form.asset_id), { cause: form.cause, reason: form.reason, technical_evaluation_id: form.technical_evaluation_id ? Number(form.technical_evaluation_id) : null, documentation_notes: form.documentation_notes }); if (form.file) await uploadDisposalDocument(created.id, form.file); setForm({ asset_id: '', cause: '', reason: '', technical_evaluation_id: '', documentation_notes: '', file: null }); onChanged() } finally { setBusy(false) } }
  async function review(row: DisposalRequest, decision: 'pending_authority' | 'rejected') { setBusy(true); try { await reviewDisposalRequest(row.id, { decision, decision_notes: decision === 'rejected' ? 'Expediente observado en prototipo' : 'Expediente listo para validación de autoridad competente' }); onChanged() } finally { setBusy(false) } }
  return <div className="grid gap-5"><SectionHeading description="Expedientes para bienes que podrían darse de baja. La decisión definitiva sigue bloqueada hasta validar la autoridad competente." title="Expedientes de baja patrimonial" />{canCreate&&<form className="grid gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-4 md:grid-cols-4" onSubmit={(e)=>void submit(e)}><select className="rounded-lg border p-2 text-sm" required value={form.asset_id} onChange={e=>setForm({...form,asset_id:e.target.value})}><option value="">Activo</option>{assetOptions.filter(a=>a.is_active).map(a=><option key={a.id} value={a.id}>{a.asset_code} · {a.name}</option>)}</select><input className="rounded-lg border p-2 text-sm" required placeholder="Causal propuesta" value={form.cause} onChange={e=>setForm({...form,cause:e.target.value})}/><input className="rounded-lg border p-2 text-sm" required placeholder="Justificación" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/><select className="rounded-lg border p-2 text-sm" value={form.technical_evaluation_id} onChange={e=>setForm({...form,technical_evaluation_id:e.target.value})}><option value="">Evaluación técnica (opcional)</option>{evaluations.map(v=><option key={v.id} value={v.id}>#{v.id} · {v.status}</option>)}</select><input className="rounded-lg border p-2 text-sm" placeholder="Documentación sustentatoria" value={form.documentation_notes} onChange={e=>setForm({...form,documentation_notes:e.target.value})}/><input className="rounded-lg border bg-white p-2 text-xs" accept=".pdf,.jpg,.jpeg,.png,.webp" type="file" onChange={e=>setForm({...form,file:e.target.files?.[0]??null})}/><button className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-black text-white" disabled={busy} type="submit">Crear expediente</button></form>}<DataTable headers={['Activo','Causal','Estado','Autoridad','Solicitante','Acciones']}>{records.map(r=><tr className="border-t border-slate-100" key={r.id}><td className="px-5 py-4 font-black">{r.asset?.asset_code}<br/><span className="font-normal">{r.asset?.name}</span></td><td className="px-5 py-4 text-sm">{r.cause??'—'}</td><td className="px-5 py-4 text-sm">{disposalStatusLabel(r.status)}</td><td className="px-5 py-4 text-sm">{authorityStatusLabel(r.authority_status)}</td><td className="px-5 py-4 text-sm">{r.requester?.name??'—'}</td><td className="px-5 py-4">{canReview&&r.status==='pending'&&<><button className="mr-2 text-xs font-black text-emerald-700" disabled={busy} onClick={()=>void review(r,'pending_authority')} type="button">Enviar a autoridad</button><button className="text-xs font-black text-red-700" disabled={busy} onClick={()=>void review(r,'rejected')} type="button">Observar</button></>}</td></tr>)}</DataTable></div>
}

function ReportsContent({ initial, canExport }: { readonly initial: ReportResult | null; readonly canExport: boolean }) {
  const [kind, setKind] = useState('assets'); const [result, setResult] = useState<ReportResult | null>(initial); const [busy, setBusy] = useState(false)
  useEffect(() => { setResult(initial) }, [initial])
  async function load() { setBusy(true); try { setResult(await reports(kind)) } finally { setBusy(false) } }
  return <div className="grid gap-5"><SectionHeading description="Consultas calculadas desde datos reales del prototipo; se identifican como reportes no oficiales." title="Reportes y consultas" /><div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4"><select className="rounded-lg border p-2 text-sm" value={kind} onChange={e=>setKind(e.target.value)}><option value="assets">Bienes patrimoniales</option><option value="custodians">Custodios</option><option value="movements">Movimientos</option><option value="inventory">Inventario</option><option value="reconciliations">Conciliaciones</option><option value="evaluations">Evaluaciones técnicas</option><option value="disposals">Expedientes de baja</option><option value="audit">Auditoría</option></select><button className="rounded-lg bg-[#174a86] px-3 py-2 text-xs font-black text-white" disabled={busy} onClick={()=>void load()} type="button">Consultar</button>{canExport&&<a className="rounded-lg border border-[#174a86] px-3 py-2 text-xs font-black text-[#174a86]" href={reportExportUrl(kind)}>Descargar CSV</a>}</div>{result&&<div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4"><p className="mb-3 text-xs font-bold text-slate-500">Reporte del prototipo · generado {new Date(result.generated_at).toLocaleString()}</p><DataTable headers={Object.keys(result.data[0]??{Resultado:'Sin registros'})}>{result.data.map((row,i)=><tr className="border-t border-slate-100" key={i}>{Object.values(row).map((value,j)=><td className="px-5 py-3 text-sm" key={j}>{String(value??'—')}</td>)}</tr>)}</DataTable></div>}</div>
}

function ReportsContentIntegrated({ initial, canExport, areas: areaOptions, categories }: { readonly initial: ReportResult | null; readonly canExport: boolean; readonly areas: readonly Area[]; readonly categories: readonly AssetCategory[] }) {
  void ReportsContent
  const [kind, setKind] = useState('assets'); const [result, setResult] = useState<ReportResult | null>(initial); const [busy, setBusy] = useState(false)
  const [filters, setFilters] = useState({ asset_code: '', area_id: '', category: '', asset_type: '', location_id: '', status: '', from: '', to: '' })
  useEffect(() => setResult(initial), [initial])
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
  async function load() { setBusy(true); try { setResult(await reports(kind, params)) } finally { setBusy(false) } }
  return <div className="grid gap-5"><SectionHeading description="Filtra por unidad organizacional, categoría y tipo; luego consulta y descarga el resultado." title="Reportes patrimoniales" /><div className="report-filters grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-4"><div className="md:col-span-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-[#174a86]">Criterios del reporte</p><p className="mt-1 text-xs text-slate-500">Selecciona una gerencia para incluir automáticamente sus oficinas internas.</p></div><select className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" value={kind} onChange={e=>setKind(e.target.value)}><option value="assets">Bienes patrimoniales</option><option value="custodians">Custodios</option><option value="movements">Movimientos</option><option value="inventory">Inventario</option><option value="reconciliations">Conciliaciones</option><option value="evaluations">Evaluaciones técnicas</option><option value="disposals">Expedientes de baja</option><option value="audit">Auditoría</option></select><select className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" value={filters.area_id} onChange={e=>setFilters({...filters,area_id:e.target.value})}><option value="">Todas las oficinas / áreas</option>{areaOptions.filter(a=>a.is_active).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select><select className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})}><option value="">Todas las categorías</option>{categories.filter(c=>c.is_active).map(c=><option key={c.id} value={c.code}>{c.name}</option>)}</select><select className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" value={filters.asset_type} onChange={e=>setFilters({...filters,asset_type:e.target.value})}><option value="">Todos los tipos</option>{ASSET_TYPES.map(type=><option key={type} value={type}>{type}</option>)}</select><input className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" placeholder="Código patrimonial" value={filters.asset_code} onChange={e=>setFilters({...filters,asset_code:e.target.value})}/><input className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" placeholder="Estado" value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}/><input className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/><input className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/><div className="flex flex-wrap gap-2 md:col-span-4"><button className="rounded-xl bg-[#174a86] px-5 py-3 text-xs font-black text-white shadow-sm" disabled={busy} onClick={()=>void load()} type="button">{busy ? 'Consultando…' : 'Consultar reporte'}</button>{canExport&&<a className="rounded-xl border border-[#174a86] px-5 py-3 text-xs font-black text-[#174a86]" href={reportExportUrl(kind, params)}>Descargar CSV</a>}<button className="rounded-xl border border-emerald-700 px-5 py-3 text-xs font-black text-emerald-700" onClick={()=>window.print()} type="button">Descargar PDF</button></div></div>{result&&<div className="report-print-area overflow-x-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="report-letterhead"><img alt="Escudo de la Municipalidad Distrital de Morales" className="report-logo" src="/logo-morales.png"/><div><p className="report-kicker">Municipalidad Distrital de Morales</p><h2>Reporte de bienes patrimoniales</h2><p>Gestión de activos institucionales</p></div><div className="report-date"><span>Fecha de emisión</span><strong>{new Date(result.generated_at).toLocaleDateString()}</strong></div></div><DataTable headers={Object.keys(result.data[0]??{Resultado:'Sin registros'})}>{result.data.map((row,i)=><tr className="border-t border-slate-100" key={i}>{Object.values(row).map((value,j)=><td className="px-5 py-3 text-sm" key={j}>{formatReportValue(value)}</td>)}</tr>)}</DataTable><div className="report-footer">Documento generado por el Sistema de Activos · Municipalidad Distrital de Morales</div></div>}</div>
}

function formatReportValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object' && !Array.isArray(value)) return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${String(item ?? '—')}`).join(' · ')
  return String(value)
}

function DataTable({ headers, children }: { readonly headers: readonly string[]; readonly children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>{headers.map((header) => <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-black tracking-[0.08em] text-slate-500" key={header}>{header.toUpperCase()}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function DashboardShell({ user, initialAssetCode, onLogout }: { readonly user: User; readonly initialAssetCode: string | null; readonly onLogout: () => void }) {
  const items = useMemo(() => navigationFor(user), [user])
  const sectionStorageKey = `mdm-active-section:${user.id}`
  const [section, setSection] = useState<SectionKey>(() => {
    if (initialAssetCode !== null) return 'assets'
    try {
      const saved = sessionStorage.getItem(sectionStorageKey) as SectionKey | null
      if (saved !== null && items.some((item) => item.key === saved)) return saved
    } catch {
      // La navegación funciona aunque el navegador bloquee el almacenamiento.
    }
    return items[0]?.key ?? 'dashboard'
  })
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [assetRecords, setAssetRecords] = useState<readonly Asset[]>([])
  const [assetPagination, setAssetPagination] = useState<AssetPage['meta']>({ current_page: 1, last_page: 1, per_page: 12, total: 0 })
  const [assetPage, setAssetPage] = useState(1)
  const [assetScope, setAssetScope] = useState<'all' | 'mine'>('all')
  const [assetCategoryRecords, setAssetCategoryRecords] = useState<readonly AssetCategory[]>([])
  const [assetStatusRecords, setAssetStatusRecords] = useState<readonly AssetStatus[]>([])
  const [assetLocationRecords, setAssetLocationRecords] = useState<readonly AssetLocation[]>([])
  const [userRecords, setUserRecords] = useState<readonly User[]>([])
  const [areaRecords, setAreaRecords] = useState<readonly Area[]>([])
  const [roleRecords, setRoleRecords] = useState<readonly Role[]>([])
  const [auditRecords, setAuditRecords] = useState<readonly AuditEvent[]>([])
  const [movementRecords, setMovementRecords] = useState<readonly MovementRequest[]>([])
  const [inventoryRecords, setInventoryRecords] = useState<readonly InventoryCampaign[]>([])
  const [reconciliationRecords, setReconciliationRecords] = useState<readonly ReconciliationRun[]>([])
  const [evaluationRecords, setEvaluationRecords] = useState<readonly TechnicalEvaluation[]>([])
  const [disposalRecords, setDisposalRecords] = useState<readonly DisposalRequest[]>([])
  const [reportResult, setReportResult] = useState<ReportResult | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  const loadSection = useCallback(async () => {
    setBusy(true)
    setError('')

    try {
      if (section === 'dashboard') setMetrics(await dashboard())
      if (section === 'assets') {
        const [nextAssets, nextAreas, nextCategories, nextStatuses, nextLocations, nextMetrics] = await Promise.all([assets(assetPage, '', assetScope === 'mine'), areas(), assetCategories(), assetStatuses(), assetLocations(), dashboard()])
        setAssetRecords(nextAssets.data); setAssetPagination(nextAssets.meta); setAreaRecords(nextAreas); setAssetCategoryRecords(nextCategories); setAssetStatusRecords(nextStatuses); setAssetLocationRecords(nextLocations); setMetrics(nextMetrics)
      }
      if (section === 'users') {
        const [nextUsers, nextAreas, nextRoles] = await Promise.all([users(), areas(), roles()])
        setUserRecords(nextUsers)
        setAreaRecords(nextAreas)
        setRoleRecords(nextRoles)
      }
      if (section === 'areas') setAreaRecords(await areas())
      if (section === 'audit') setAuditRecords(await auditEvents())
      if (section === 'movements') { const [m, a, ar, l] = await Promise.all([movementRequests(), assets(1), areas(), assetLocations()]); setMovementRecords(m); setAssetRecords(a.data); setAreaRecords(ar); setAssetLocationRecords(l) }
      if (section === 'inventory') { const [i, a, ar, l] = await Promise.all([inventoryCampaigns(), assets(1), areas(), assetLocations()]); setInventoryRecords(i); setAssetRecords(a.data); setAreaRecords(ar); setAssetLocationRecords(l) }
      if (section === 'reconciliation') setReconciliationRecords(await reconciliations())
      if (section === 'evaluations') { const [e, a] = await Promise.all([technicalEvaluations(), assets(1)]); setEvaluationRecords(e); setAssetRecords(a.data); setUserRecords(user.permissions.includes('users.view') ? await users() : []) }
      if (section === 'disposals') { const [d, a, e] = await Promise.all([disposalRequests(), assets(1), technicalEvaluations()]); setDisposalRecords(d); setAssetRecords(a.data); setEvaluationRecords(e) }
      if (section === 'reports') setReportResult(await reports('assets'))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [assetPage, assetScope, section])

  useEffect(() => {
    void loadSection()
  }, [loadSection])

  useEffect(() => {
    try { sessionStorage.setItem(sectionStorageKey, section) } catch {
      // No interrumpir el uso del sistema si el almacenamiento no está disponible.
    }
  }, [section, sectionStorageKey])

  const activeItem = items.find((item) => item.key === section) ?? items[0]

  return (
    <div className="min-h-screen bg-[#f3f6fa] text-slate-900 lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sidebar-panel p-4 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:p-4">
        <div className="flex shrink-0 items-center gap-3 px-2 py-1"><Logo /><div className="min-w-0"><p className="truncate font-black tracking-tight">Gestión de activos</p><p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-blue-100/60"><span className="size-1.5 rounded-full bg-emerald-400" />Sistema operativo</p></div></div>
        <nav aria-label="Navegación principal" className="sidebar-navigation mt-5 grid min-h-0 gap-1 sm:grid-cols-2 lg:flex lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pr-1">
          <p className="col-span-2 mb-1 px-3 text-[9px] font-black tracking-[0.2em] text-blue-200/50 lg:col-span-1">GESTIÓN</p>
          {items.filter((item) => ['dashboard', 'assets', 'movements', 'inventory', 'reconciliation', 'evaluations', 'disposals', 'reports'].includes(item.key)).map((item) => (
            <button
              aria-current={section === item.key ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold transition ${section === item.key ? 'bg-white text-[#12345f] shadow-lg shadow-black/10' : 'text-blue-100/75 hover:bg-white/[0.08] hover:text-white'}`}
              key={item.key}
              onClick={() => setSection(item.key)}
              type="button"
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${section === item.key ? 'bg-[#e8f0fa] text-[#174a86]' : 'bg-white/[0.06]'}`}><NavigationIcon section={item.key} /></span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          <p className="col-span-2 mb-1 mt-4 px-3 text-[9px] font-black tracking-[0.2em] text-blue-200/50 lg:col-span-1">ADMINISTRACIÓN</p>
          {items.filter((item) => ['audit', 'users', 'areas'].includes(item.key)).map((item) => (
            <button aria-current={section === item.key ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold transition ${section === item.key ? 'bg-white text-[#12345f] shadow-lg shadow-black/10' : 'text-blue-100/75 hover:bg-white/[0.08] hover:text-white'}`} key={item.key} onClick={() => setSection(item.key)} type="button"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${section === item.key ? 'bg-[#e8f0fa] text-[#174a86]' : 'bg-white/[0.06]'}`}><NavigationIcon section={item.key} /></span><span className="truncate">{item.label}</span></button>
          ))}
        </nav>
        <div className="mt-4 shrink-0 rounded-2xl border border-white/10 bg-white/[0.07] p-3">
          <div className="flex min-w-0 items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[11px] font-black text-[#174a86]">{user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div className="min-w-0"><p className="text-xs font-black leading-4 text-white">{user.name}</p><p className="mt-1 text-[10px] leading-4 text-blue-100/55">{user.roles.map((role) => role.name).join(', ') || user.job_title || user.email}</p></div></div>
          <button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-[11px] font-bold text-blue-100/70 transition hover:bg-white/[0.08] hover:text-white" onClick={onLogout} type="button">
            <Icon className="size-4"><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></Icon>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="dashboard-main min-w-0">
        <header className="dashboard-header flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8 lg:px-10"><div><p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#174a86]">Sistema patrimonial</p><h1 className="text-base font-black text-slate-900">{activeItem?.label === 'Resumen' ? 'Panel general' : activeItem?.label ?? 'Acceso restringido'}</h1><p className="mt-0.5 hidden text-xs text-slate-400 sm:block">{activeItem?.description}</p></div><div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2"><div className="grid size-9 place-items-center rounded-xl bg-[#174a86] text-xs font-black text-white">{user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div className="hidden lg:block"><p className="text-xs font-black text-slate-800">{user.name}</p><p className="text-[10px] text-slate-500">{user.roles[0]?.name ?? user.job_title ?? user.email}</p></div></div>
        </header>
        <div className="dashboard-content p-5 sm:p-8 lg:p-10">
          {error && <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert"><span>{error}</span><button className="font-black underline" onClick={() => void loadSection()} type="button">Reintentar</button></div>}
          {busy ? <LoadingPanel /> : (
            <>
              {section === 'dashboard' && metrics && <DashboardContent metrics={metrics} user={user} />}
              {section === 'assets' && <AssetsContent areas={areaRecords} assetScope={assetScope} canCreate={user.permissions.includes('assets.create')} canUpdate={user.permissions.includes('assets.update')} canUpload={user.permissions.includes('asset_documents.upload')} categories={assetCategoryRecords} initialAssetCode={initialAssetCode} locations={assetLocationRecords} metrics={metrics} onScopeChange={(scope) => { setAssetScope(scope); setAssetPage(1) }} onChanged={() => void loadSection()} onPageChange={setAssetPage} pagination={assetPagination} records={assetRecords} registeredAreaName={user.area?.name ?? null} statuses={assetStatusRecords} user={user} />}
              {section === 'movements' && <MovementsContent areas={areaRecords} assets={assetRecords} canApprove={user.permissions.includes('movements.approve')} canCreate={user.permissions.includes('movements.request')} canReceive={user.permissions.includes('movements.receive')} currentAreaId={user.area?.id} locations={assetLocationRecords} onChanged={() => void loadSection()} records={movementRecords} />}
              {section === 'inventory' && <InventoryContent restrictedAreaId={user.roles.some((role) => ['asistente_patrimonio', 'asistente_ti', 'asistente_oci'].includes(role.code)) ? (user.area?.id ?? undefined) : undefined} areas={areaRecords} assets={assetRecords} canCheck={user.permissions.includes('inventory.check')} canManage={user.permissions.includes('inventory.create') || user.permissions.includes('inventory.manage')} locations={assetLocationRecords} onChanged={() => void loadSection()} records={inventoryRecords} />}
              {section === 'reconciliation' && <ReconciliationContent canCreate={user.permissions.includes('reconciliation.create')} canReview={user.permissions.includes('reconciliation.review')} onChanged={() => void loadSection()} records={reconciliationRecords} />}
              {section === 'evaluations' && <EvaluationsContent assets={assetRecords} canAssign={user.permissions.includes('evaluations.assign')} canCreate={user.permissions.includes('evaluations.create')} canUpdate={user.permissions.includes('evaluations.update')} onChanged={() => void loadSection()} records={evaluationRecords} users={userRecords} />}
              {section === 'disposals' && <DisposalsContent assets={assetRecords} canCreate={user.permissions.includes('disposals.request')} canReview={user.permissions.includes('disposals.review')} evaluations={evaluationRecords} onChanged={() => void loadSection()} records={disposalRecords} />}
              {section === 'reports' && <ReportsContentIntegrated areas={areaRecords} categories={assetCategoryRecords} canExport={user.permissions.includes('reports.export')} initial={reportResult} />}
              {section === 'users' && <UsersContent areas={areaRecords} canCreate={user.permissions.includes('users.create') && user.permissions.includes('roles.assign')} canManageRecovery={user.permissions.includes('access_recovery.manage') || user.roles.some((role) => ['administrador_tecnico', 'asistente_ti'].includes(role.code))} canUpdate={user.permissions.includes('users.update') && user.permissions.includes('roles.assign')} currentUserId={user.id} onChanged={() => void loadSection()} records={userRecords} roles={roleRecords} />}
              {section === 'areas' && <AreasContent canManage={user.permissions.includes('areas.manage')} onChanged={() => void loadSection()} records={areaRecords} />}
          {section === 'audit' && <AuditContent canManage={user.permissions.includes('audit.manage')} records={auditRecords} />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const pathAssetCode = window.location.pathname.startsWith('/activos/') ? decodeURIComponent(window.location.pathname.slice('/activos/'.length)) : null
  const requestedAssetCode = params.get('asset') ?? pathAssetCode
  const resetToken = params.get('token') ?? ''
  const resetEmail = params.get('email') ?? ''
  const isResetPath = window.location.pathname === '/restablecer-contrasena' && resetToken !== '' && resetEmail !== ''

  const [user, setUser] = useState<User | null>(null)
  const [view, setView] = useState<AuthView>(isResetPath ? 'reset' : 'login')
  const [challenge, setChallenge] = useState<{ id: string; expiresAt: string; destinationHint: string } | null>(null)
  const [loading, setLoading] = useState(!isResetPath)

  useEffect(() => {
    if (isResetPath) return

    currentUser()
      .then(setUser)
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error(error)
        }
      })
      .finally(() => setLoading(false))
  }, [isResetPath])

  async function handleLogout() {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
      setView('login')
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#0a2146] text-sm font-bold text-blue-100">Cargando…</main>
  }

  if (user !== null) {
    return <DashboardShell initialAssetCode={requestedAssetCode} onLogout={() => void handleLogout()} user={user} />
  }

  if (view === 'mfa' && challenge !== null) {
    return <MfaView challengeId={challenge.id} destinationHint={challenge.destinationHint} expiresAt={challenge.expiresAt} onAuthenticated={setUser} onBack={() => setView('login')} />
  }

  if (view === 'forgot') {
    return <ForgotView onBack={() => setView('login')} />
  }

  if (view === 'reset') {
    return <ResetView email={resetEmail} onFinished={() => { window.history.replaceState({}, '', '/'); setView('login') }} token={resetToken} />
  }

  return (
    <LoginView
      onAuthenticated={setUser}
      onForgot={() => setView('forgot')}
      onMfa={(id, expiresAt, destinationHint) => {
        setChallenge({ id, expiresAt, destinationHint })
        setView('mfa')
      }}
    />
  )
}

export default App
