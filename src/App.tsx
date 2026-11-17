import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  assetCategories,
  assetLocations,
  assets,
  assetStatuses,
  areas,
  auditEvents,
  decideMovement,
  currentUser,
  dashboard,
  login,
  logout as logoutRequest,
  movementRequests,
  inventoryCampaigns,
  receiveMovement,
  requestPasswordReset,
  resetPassword,
  roles,
  users,
  verifyMfa,
} from './api'
import { AreaEditor, UserEditor } from './IdentityForms'
import { AssetEditor } from './AssetForms'
import type { Area, Asset, AssetCategory, AssetLocation, AssetStatus, AuditEvent, DashboardMetrics, InventoryCampaign, MovementRequest, Role, User } from './types'

type AuthView = 'login' | 'forgot' | 'mfa' | 'reset'
type SectionKey = 'dashboard' | 'assets' | 'movements' | 'inventory' | 'users' | 'areas' | 'roles' | 'audit'

interface NavigationItem {
  readonly key: SectionKey
  readonly label: string
  readonly permission: string
  readonly description: string
}

const navigation: readonly NavigationItem[] = [
  { key: 'dashboard', label: 'Resumen', permission: 'dashboard.view', description: '' },
  { key: 'assets', label: 'Activos', permission: 'assets.view', description: '' },
  { key: 'movements', label: 'Movimientos', permission: 'movements.view', description: '' },
  { key: 'inventory', label: 'Inventario', permission: 'inventory.view', description: '' },
  { key: 'users', label: 'Usuarios', permission: 'users.view', description: '' },
  { key: 'areas', label: 'Áreas', permission: 'areas.view', description: '' },
  { key: 'roles', label: 'Roles', permission: 'roles.view', description: '' },
  { key: 'audit', label: 'Auditoría', permission: 'audit.view', description: '' },
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

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  readonly title: string
  readonly subtitle: string
  readonly children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-[#eef3f9] text-slate-900">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3" href="#formulario-acceso">
        Saltar al formulario
      </a>
      <div className="flex min-h-screen items-center justify-center">
        <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">
          <div className="w-full max-w-[470px] rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_30px_80px_rgba(15,35,65,0.14)] sm:p-10">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Logo />
              <div>
                <p className="font-extrabold text-[#102a56]">CCM Activos Morales</p>
              </div>
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-slate-950">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
            <div className="mt-8" id="formulario-acceso">{children}</div>
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
}: {
  readonly label: string
  readonly type?: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly autoComplete?: string
  readonly inputMode?: 'email' | 'numeric' | 'text'
  readonly maxLength?: number
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <input
        autoComplete={autoComplete}
        className="h-12 rounded-xl border border-slate-300 bg-slate-50 px-4 font-medium outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
  )
}

function PrimaryButton({ children, busy }: { readonly children: ReactNode; readonly busy: boolean }) {
  return (
    <button
      className="flex h-12 w-full items-center justify-center rounded-xl bg-[#163a73] px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-950/15 transition hover:bg-[#102a56] disabled:cursor-wait disabled:opacity-65"
      disabled={busy}
      type="submit"
    >
      {busy ? 'Procesando…' : children}
    </button>
  )
}

function LoginView({
  onAuthenticated,
  onMfa,
  onForgot,
}: {
  readonly onAuthenticated: (user: User) => void
  readonly onMfa: (challengeId: string, expiresAt: string) => void
  readonly onForgot: () => void
}) {
  const [email, setEmail] = useState('auditor@ccm.test')
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
        onMfa(result.challenge_id, result.expires_at)
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
    <AuthLayout title="Iniciar sesión" subtitle="Use su cuenta de acceso.">
      <form className="grid gap-5" onSubmit={submit}>
        <Field autoComplete="username" inputMode="email" label="Correo de acceso" onChange={setEmail} type="email" value={email} />
        <Field autoComplete="current-password" label="Contraseña" onChange={setPassword} type="password" value={password} />
        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input checked={remember} className="size-4 accent-[#163a73]" onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
            Recordar sesión
          </label>
          <button className="text-sm font-bold text-[#1e4f97] hover:underline" onClick={onForgot} type="button">
            Olvidé mi contraseña
          </button>
        </div>
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <PrimaryButton busy={busy}>Ingresar</PrimaryButton>
      </form>
    </AuthLayout>
  )
}

function MfaView({
  challengeId,
  expiresAt,
  onAuthenticated,
  onBack,
}: {
  readonly challengeId: string
  readonly expiresAt: string
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
    <AuthLayout title="Verifique su identidad" subtitle={`Ingrese el código de seis dígitos. Vence ${new Date(expiresAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}.`}>
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
      setMessage(await requestPasswordReset(email))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Recupere su acceso" subtitle="Si el correo pertenece a una cuenta vigente, recibirá un enlace temporal.">
      <form className="grid gap-5" onSubmit={submit}>
        <Field autoComplete="email" inputMode="email" label="Correo de acceso" onChange={setEmail} type="email" value={email} />
        {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700" role="status">{message}</p>}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <PrimaryButton busy={busy}>Enviar instrucciones</PrimaryButton>
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

function DashboardContent({ metrics }: { readonly metrics: DashboardMetrics }) {
  return (
    <div className="grid gap-6">
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

function UsersContent({ records, areas, roles, currentUserId, canCreate, canUpdate, onChanged }: {
  readonly records: readonly User[]
  readonly areas: readonly Area[]
  readonly roles: readonly Role[]
  readonly currentUserId: number
  readonly canCreate: boolean
  readonly canUpdate: boolean
  readonly onChanged: () => void
}) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [target, setTarget] = useState<User | null>(null)

  function openEditor(record: User | null) {
    setTarget(record)
    setEditorOpen(true)
  }

  return (
    <div className="grid gap-5">
      <SectionHeading action={canCreate ? <ActionButton onClick={() => openEditor(null)}>+ Registrar usuario</ActionButton> : undefined} description="Cuentas y permisos." title="Directorio de usuarios" />
      <DataTable headers={['Persona', 'Área', 'Roles', 'Estado', ...(canUpdate ? ['Acción'] : [])]}>
        {records.map((record) => (
          <tr className="border-t border-slate-100" key={record.id}>
            <td className="px-5 py-4"><strong className="block text-slate-900">{record.name}</strong><span className="text-xs text-slate-500">{record.email}</span></td>
            <td className="px-5 py-4 text-sm text-slate-600">{record.area?.name ?? 'Sin asignar'}</td>
            <td className="px-5 py-4 text-sm text-slate-600">{record.roles.map((role) => role.name).join(', ') || 'Sin rol'}</td>
            <td className="px-5 py-4"><StatusBadge active={record.is_active} /></td>
            {canUpdate && <td className="px-5 py-4"><button className="text-xs font-black text-[#1e4f97] hover:underline disabled:cursor-not-allowed disabled:text-slate-300" disabled={record.id === currentUserId} onClick={() => openEditor(record)} type="button">{record.id === currentUserId ? 'Sesión actual' : 'Editar'}</button></td>}
          </tr>
        ))}
      </DataTable>
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

  return (
    <div className="grid gap-5">
      <SectionHeading action={canManage ? <ActionButton onClick={() => openEditor(null)}>+ Registrar área</ActionButton> : undefined} description="Estructura configurable sin eliminación física de registros." title="Organización municipal" />
      <DataTable headers={['Código', 'Área municipal', 'Descripción', 'Estado', ...(canManage ? ['Acción'] : [])]}>
        {records.map((record) => (
          <tr className="border-t border-slate-100" key={record.id}>
            <td className="px-5 py-4 text-xs font-black text-[#1e4f97]">{record.code}</td>
            <td className="px-5 py-4 font-bold text-slate-900">{record.name}</td>
            <td className="max-w-md px-5 py-4 text-sm text-slate-500">{record.description ?? 'Sin descripción'}</td>
            <td className="px-5 py-4"><StatusBadge active={record.is_active} /></td>
            {canManage && <td className="px-5 py-4"><button className="text-xs font-black text-[#1e4f97] hover:underline" onClick={() => openEditor(record)} type="button">Editar</button></td>}
          </tr>
        ))}
      </DataTable>
      {editorOpen && <AreaEditor areas={records} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); onChanged() }} record={target} />}
    </div>
  )
}

function RolesContent({ records }: { readonly records: readonly Role[] }) {
  const labels: Record<string, string> = { view: 'Consultar', create: 'Registrar', update: 'Editar', manage: 'Administrar', assign: 'Asignar', upload: 'Cargar', request: 'Solicitar', approve: 'Aprobar', receive: 'Recibir', check: 'Verificar', export: 'Exportar' }
  const moduleNames: Record<string, string> = { dashboard: 'Panel', users: 'Usuarios', roles: 'Roles', areas: 'Áreas', audit: 'Auditoría', assets: 'Activos', movements: 'Movimientos', custody: 'Custodia', inventory: 'Inventario', disposals: 'Bajas', locations: 'Ubicaciones', asset_categories: 'Catálogos', asset_statuses: 'Estados', asset_documents: 'Documentos' }
  return (
    <div className="grid gap-6">
      <SectionHeading description="Cada rol define qué puede consultar, registrar o aprobar dentro del alcance asignado." title="Matriz de roles y permisos" />
      <div className="grid gap-5 xl:grid-cols-2">
      {records.map((record) => (
        <article className="group overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg" key={record.id}>
          <div className="border-b border-slate-100 bg-gradient-to-r from-[#0a2146] to-[#163a73] px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black tracking-[0.18em] text-blue-200">{record.code.toUpperCase()}</p><h3 className="mt-2 text-xl font-black tracking-tight">{record.name}</h3></div>{record.is_system && <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold text-blue-100">ROL DEL SISTEMA</span>}</div>
            <p className="mt-3 text-sm leading-5 text-blue-100/70">{record.description ?? 'Rol y permisos.'}</p>
          </div>
          <div className="px-6 py-5"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Facultades asignadas</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{record.permissions.length} permisos</span></div><div className="flex flex-wrap gap-2">{record.permissions.map((permission) => { const [module, action] = permission.split('.'); const moduleLabel = moduleNames[module ?? ''] ?? module ?? 'Módulo'; const actionLabel = labels[action ?? ''] ?? action ?? 'Acceso'; return <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700" key={permission}><span className="size-1.5 rounded-full bg-emerald-400" />{moduleLabel} · {actionLabel}</span> })}</div>
          </div>
        </article>
      ))}
      </div>
    </div>
  )
}

function AuditContent({ records }: { readonly records: readonly AuditEvent[] }) {
  return (
    <DataTable headers={['Evento', 'Actor', 'Área', 'Fecha']}>
      {records.map((record) => (
        <tr className="border-t border-slate-100" key={record.id}>
          <td className="px-5 py-4"><code className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{record.event}</code></td>
          <td className="px-5 py-4 text-sm text-slate-600">{record.actor?.name ?? 'Sistema / no autenticado'}</td>
          <td className="px-5 py-4 text-sm text-slate-600">{record.area?.name ?? 'Sin área'}</td>
          <td className="px-5 py-4 text-xs text-slate-500">{new Date(record.occurred_at).toLocaleString('es-PE')}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function AssetsContent({ records, areas, categories, statuses, locations, canCreate, canUpdate, canUpload, onChanged }: { readonly records: readonly Asset[]; readonly areas: readonly Area[]; readonly categories: readonly AssetCategory[]; readonly statuses: readonly AssetStatus[]; readonly locations: readonly AssetLocation[]; readonly canCreate: boolean; readonly canUpdate: boolean; readonly canUpload: boolean; readonly onChanged: () => void }) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [target, setTarget] = useState<Asset | null>(null)
  const [search, setSearch] = useState('')
  function openEditor(record: Asset | null) { setTarget(record); setEditorOpen(true) }
  const visibleRecords = records.filter((record) => `${record.asset_code} ${record.name} ${record.serial_number ?? ''} ${record.category.name}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="grid gap-6"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1e4f97]">EQUIPOS Y MOBILIARIO MUNICIPAL</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Equipos y mobiliario</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Consulta fichas, evidencia fotográfica, ubicación y versiones de cada equipo o mueble registrado.</p></div>{canCreate && <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#163a73] px-6 text-sm font-black text-white shadow-xl shadow-blue-950/15 transition hover:-translate-y-0.5 hover:bg-[#102a56]" onClick={() => openEditor(null)} type="button"><span className="text-xl leading-none">+</span> Registrar equipo o mueble</button>}</div><section className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-xs font-bold text-slate-500">Total registrados</span><strong className="mt-2 block text-3xl font-black text-slate-950">{records.length}</strong></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5"><span className="text-xs font-bold text-emerald-700">Activos vigentes</span><strong className="mt-2 block text-3xl font-black text-emerald-800">{records.filter((record) => record.is_active).length}</strong></div><div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5"><span className="text-xs font-bold text-blue-700">Con número de serie</span><strong className="mt-2 block text-3xl font-black text-blue-900">{records.filter((record) => record.serial_number).length}</strong></div></section><div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"><div className="relative flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span><input className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código, nombre, serie o categoría…" value={search} /></div><span className="text-xs font-bold text-slate-400">{visibleRecords.length} resultado(s)</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleRecords.map((record) => <article className="group overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl" key={record.id}><div className="flex h-28 items-center justify-between bg-gradient-to-br from-[#eaf2fb] to-[#f8fbff] px-6"><div className="grid size-16 place-items-center rounded-2xl bg-white text-2xl shadow-sm">▣</div><span className={`rounded-full px-3 py-1 text-xs font-black ${record.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{record.is_active ? 'Vigente' : 'Inactivo'}</span></div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black tracking-[0.15em] text-[#1e4f97]">{record.asset_code}</p><h3 className="mt-1 text-lg font-black text-slate-950">{record.name}</h3></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">V{record.current_version}</span></div><div className="mt-4 grid gap-2 text-xs text-slate-500"><div className="flex justify-between"><span>Categoría</span><strong className="text-slate-700">{record.category.name}</strong></div><div className="flex justify-between"><span>Área</span><strong className="text-slate-700">{record.area.code}</strong></div><div className="flex justify-between"><span>Serie</span><strong className="text-slate-700">{record.serial_number ?? 'No registrada'}</strong></div></div>{canUpdate && <button className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-black text-[#1e4f97] transition hover:border-blue-200 hover:bg-blue-50" onClick={() => openEditor(record)} type="button">Ver / editar ficha</button>}</div></article>)}</div>{visibleRecords.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-lg font-black text-slate-800">No encontramos activos</p><p className="mt-2 text-sm text-slate-500">Prueba otra búsqueda o registra el primer equipo o mueble.</p></div>}{editorOpen && <AssetEditor areas={areas} canUpload={canUpload} categories={categories} locations={locations} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); onChanged() }} record={target} statuses={statuses} />}</div>
}

function MovementsContent({ records, canApprove, canReceive, onChanged }: { readonly records: readonly MovementRequest[]; readonly canApprove: boolean; readonly canReceive: boolean; readonly onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  async function decide(record: MovementRequest, decision: 'approved' | 'rejected') {
    setBusy(record.id)
    try { await decideMovement(record.id, decision); onChanged() } finally { setBusy(null) }
  }
  async function receive(record: MovementRequest) { setBusy(record.id); try { await receiveMovement(record.id); onChanged() } finally { setBusy(null) } }
  return <div className="grid gap-5"><SectionHeading description="Solicitudes y estados." title="Movimientos patrimoniales" /><DataTable headers={['Activo', 'Origen', 'Destino', 'Motivo', 'Estado', 'Acción']}>{records.map((record) => <tr className="border-t border-slate-100" key={record.id}><td className="px-5 py-4"><strong>{record.asset?.asset_code ?? `#${record.asset_id}`}</strong><span className="block text-xs text-slate-500">{record.asset?.name ?? 'Activo'}</span></td><td className="px-5 py-4 text-sm text-slate-600">{record.from_area?.name ?? '—'}</td><td className="px-5 py-4 text-sm text-slate-600">{record.to_area?.name ?? '—'}</td><td className="max-w-xs px-5 py-4 text-sm text-slate-600">{record.reason}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-700">{record.status}</span></td><td className="px-5 py-4"><div className="flex gap-2">{canApprove && record.status === 'pending' && <><button className="text-xs font-black text-emerald-700 hover:underline disabled:opacity-50" disabled={busy === record.id} onClick={() => void decide(record, 'approved')} type="button">Aprobar</button><button className="text-xs font-black text-red-700 hover:underline disabled:opacity-50" disabled={busy === record.id} onClick={() => void decide(record, 'rejected')} type="button">Rechazar</button></>}{canReceive && record.status === 'approved' && <button className="text-xs font-black text-[#1e4f97] hover:underline disabled:opacity-50" disabled={busy === record.id} onClick={() => void receive(record)} type="button">Recibir</button>}</div></td></tr>)}</DataTable></div>
}

function InventoryContent({ records }: { readonly records: readonly InventoryCampaign[] }) { return <div className="grid gap-5"><SectionHeading description="Campañas de verificación física y conciliación de diferencias." title="Inventario físico" /><DataTable headers={['Código', 'Campaña', 'Área', 'Verificaciones', 'Estado']}>{records.map((record) => <tr className="border-t border-slate-100" key={record.id}><td className="px-5 py-4 text-xs font-black text-[#1e4f97]">{record.code}</td><td className="px-5 py-4 font-bold">{record.name}</td><td className="px-5 py-4 text-sm text-slate-600">{record.area?.name ?? '—'}</td><td className="px-5 py-4 text-sm text-slate-600">{record.checks_count ?? 0}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-700">{record.status.replace('_', ' ')}</span></td></tr>)}</DataTable></div> }

function DataTable({ headers, children }: { readonly headers: readonly string[]; readonly children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left">
        <thead className="bg-slate-50">
          <tr>{headers.map((header) => <th className="px-5 py-3 text-[10px] font-black tracking-[0.12em] text-slate-500" key={header}>{header.toUpperCase()}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function StatusBadge({ active }: { readonly active: boolean }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{active ? 'Activo' : 'Inactivo'}</span>
}

function DashboardShell({ user, onLogout }: { readonly user: User; readonly onLogout: () => void }) {
  const items = useMemo(() => navigationFor(user), [user])
  const [section, setSection] = useState<SectionKey>(items[0]?.key ?? 'dashboard')
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [assetRecords, setAssetRecords] = useState<readonly Asset[]>([])
  const [assetCategoryRecords, setAssetCategoryRecords] = useState<readonly AssetCategory[]>([])
  const [assetStatusRecords, setAssetStatusRecords] = useState<readonly AssetStatus[]>([])
  const [assetLocationRecords, setAssetLocationRecords] = useState<readonly AssetLocation[]>([])
  const [userRecords, setUserRecords] = useState<readonly User[]>([])
  const [areaRecords, setAreaRecords] = useState<readonly Area[]>([])
  const [roleRecords, setRoleRecords] = useState<readonly Role[]>([])
  const [auditRecords, setAuditRecords] = useState<readonly AuditEvent[]>([])
  const [movementRecords, setMovementRecords] = useState<readonly MovementRequest[]>([])
  const [inventoryRecords, setInventoryRecords] = useState<readonly InventoryCampaign[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  const loadSection = useCallback(async () => {
    setBusy(true)
    setError('')

    try {
      if (section === 'dashboard') setMetrics(await dashboard())
      if (section === 'assets') {
        const [nextAssets, nextAreas, nextCategories, nextStatuses, nextLocations] = await Promise.all([assets(), areas(), assetCategories(), assetStatuses(), assetLocations()])
        setAssetRecords(nextAssets); setAreaRecords(nextAreas); setAssetCategoryRecords(nextCategories); setAssetStatusRecords(nextStatuses); setAssetLocationRecords(nextLocations)
      }
      if (section === 'users') {
        const [nextUsers, nextAreas, nextRoles] = await Promise.all([users(), areas(), roles()])
        setUserRecords(nextUsers)
        setAreaRecords(nextAreas)
        setRoleRecords(nextRoles)
      }
      if (section === 'areas') setAreaRecords(await areas())
      if (section === 'roles') setRoleRecords(await roles())
      if (section === 'audit') setAuditRecords(await auditEvents())
      if (section === 'movements') setMovementRecords(await movementRequests())
      if (section === 'inventory') setInventoryRecords(await inventoryCampaigns())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [section])

  useEffect(() => {
    void loadSection()
  }, [loadSection])

  const activeItem = items.find((item) => item.key === section) ?? items[0]

  return (
    <div className="min-h-screen bg-[#f3f6fa] text-slate-900 lg:grid lg:grid-cols-[276px_minmax(0,1fr)]">
      <aside className="bg-[#203c86] p-4 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:p-5">
        <div className="flex items-center gap-3 px-2"><Logo /><div><p className="font-black tracking-tight">Activos</p><p className="text-[11px] text-blue-100/70">Morales</p></div></div>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.08] p-3.5"><div className="flex items-center gap-2 text-xs font-bold"><span className="size-2 rounded-full bg-emerald-400" />Sistema activo</div></div>
        <nav aria-label="Navegación principal" className="mt-7 grid gap-1 sm:grid-cols-2 lg:flex lg:flex-1 lg:flex-col">
          <p className="mb-2 px-3 text-[10px] font-black tracking-[0.18em] text-blue-200/60">PRINCIPAL</p>
          {items.filter((item) => ['dashboard', 'assets', 'movements', 'inventory'].includes(item.key)).map((item) => (
            <button
              className={`relative flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${section === item.key ? 'bg-white/15 text-white shadow-sm' : 'text-blue-100/75 hover:bg-white/[0.07] hover:text-white'}`}
              key={item.key}
              onClick={() => setSection(item.key)}
              type="button"
            >
              {section === item.key && <span className="absolute -left-4 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-amber-300" />}<Icon><path d="M5 6h14M5 12h14M5 18h10" /></Icon>
              <span><span className="block">{item.label}</span><span className="mt-0.5 block text-[10px] font-medium opacity-55">{item.description}</span></span>
            </button>
          ))}
          <p className="mb-2 mt-7 px-3 text-[10px] font-black tracking-[0.18em] text-blue-200/60">ANÁLISIS Y CONTROL</p>
          {items.filter((item) => ['audit', 'roles', 'users', 'areas'].includes(item.key)).map((item) => (
            <button className={`relative flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${section === item.key ? 'bg-white/15 text-white shadow-sm' : 'text-blue-100/75 hover:bg-white/[0.07] hover:text-white'}`} key={item.key} onClick={() => setSection(item.key)} type="button">{section === item.key && <span className="absolute -left-4 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-amber-300" />}<Icon><path d="M5 6h14M5 12h14M5 18h10" /></Icon><span><span className="block">{item.label}</span><span className="mt-0.5 block text-[10px] font-medium opacity-55">{item.description}</span></span></button>
          ))}
        </nav>
        <div className="mt-5 border-t border-white/10 pt-5">
          <p className="text-sm font-bold">{user.name}</p>
          <p className="mt-1 truncate text-xs text-blue-100/55">{user.job_title ?? user.email}</p>
          <button className="mt-4 flex items-center gap-2 text-xs font-bold text-blue-100/70 hover:text-white" onClick={onLogout} type="button">
            <Icon className="size-4"><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></Icon>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8 lg:px-10"><div className="flex items-center gap-3"><div className="hidden text-sm text-slate-400 sm:block">Activos <span className="mx-2">/</span></div><h1 className="text-sm font-black text-slate-800">{activeItem?.label === 'Resumen' ? 'Panel general' : activeItem?.label ?? 'Acceso restringido'}</h1></div><div className="flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-[#163a73] text-xs font-black text-white">{user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div className="hidden lg:block"><p className="text-xs font-black text-slate-800">{user.name}</p><p className="text-[10px] text-slate-500">{user.job_title ?? user.email}</p></div></div>
        </header>
        <div className="p-5 sm:p-8 lg:p-12">
          {error && <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert"><span>{error}</span><button className="font-black underline" onClick={() => void loadSection()} type="button">Reintentar</button></div>}
          {busy ? <LoadingPanel /> : (
            <>
              {section === 'dashboard' && metrics && <DashboardContent metrics={metrics} />}
              {section === 'assets' && <AssetsContent areas={areaRecords} canCreate={user.permissions.includes('assets.create')} canUpdate={user.permissions.includes('assets.update')} canUpload={user.permissions.includes('asset_documents.upload')} categories={assetCategoryRecords} locations={assetLocationRecords} onChanged={() => void loadSection()} records={assetRecords} statuses={assetStatusRecords} />}
              {section === 'movements' && <MovementsContent canApprove={user.permissions.includes('movements.approve')} canReceive={user.permissions.includes('movements.receive')} onChanged={() => void loadSection()} records={movementRecords} />}
              {section === 'inventory' && <InventoryContent records={inventoryRecords} />}
              {section === 'users' && <UsersContent areas={areaRecords} canCreate={user.permissions.includes('users.create') && user.permissions.includes('roles.assign')} canUpdate={user.permissions.includes('users.update') && user.permissions.includes('roles.assign')} currentUserId={user.id} onChanged={() => void loadSection()} records={userRecords} roles={roleRecords} />}
              {section === 'areas' && <AreasContent canManage={user.permissions.includes('areas.manage')} onChanged={() => void loadSection()} records={areaRecords} />}
              {section === 'roles' && <RolesContent records={roleRecords} />}
              {section === 'audit' && <AuditContent records={auditRecords} />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const resetToken = params.get('token') ?? ''
  const resetEmail = params.get('email') ?? ''
  const isResetPath = window.location.pathname === '/restablecer-contrasena' && resetToken !== '' && resetEmail !== ''

  const [user, setUser] = useState<User | null>(null)
  const [view, setView] = useState<AuthView>(isResetPath ? 'reset' : 'login')
  const [challenge, setChallenge] = useState<{ id: string; expiresAt: string } | null>(null)
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
    return <DashboardShell onLogout={() => void handleLogout()} user={user} />
  }

  if (view === 'mfa' && challenge !== null) {
    return <MfaView challengeId={challenge.id} expiresAt={challenge.expiresAt} onAuthenticated={setUser} onBack={() => setView('login')} />
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
      onMfa={(id, expiresAt) => {
        setChallenge({ id, expiresAt })
        setView('mfa')
      }}
    />
  )
}

export default App
