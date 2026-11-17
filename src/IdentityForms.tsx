import { useState, type FormEvent, type ReactNode } from 'react'

import { ApiError, createArea, createUser, updateArea, updateUser } from './api'
import type { Area, AreaInput, Role, RoleAssignmentInput, User, UserInput } from './types'

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) {
    return Object.values(error.errors)[0]?.[0] ?? error.message
  }

  return 'No se pudo guardar la información. Intente nuevamente.'
}

function Editor({ title, subtitle, onClose, children }: {
  readonly title: string
  readonly subtitle: string
  readonly onClose: () => void
  readonly children: ReactNode
}) {
  return (
    <div aria-labelledby="editor-title" aria-modal="true" className="fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm sm:p-8" role="dialog">
      <div className="m-auto w-full max-w-3xl rounded-3xl border border-white/60 bg-white shadow-2xl shadow-slate-950/30">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-6 sm:p-8">
          <div>
            <p className="text-[10px] font-black tracking-[0.16em] text-[#1e4f97]">ADMINISTRACIÓN AUTORIZADA</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950" id="editor-title">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
          </div>
          <button aria-label="Cerrar" className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xl font-bold text-slate-600 hover:bg-slate-200" onClick={onClose} type="button">×</button>
        </header>
        <div className="p-6 sm:p-8">{children}</div>
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, type = 'text', required = true, autoComplete }: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly type?: string
  readonly required?: boolean
  readonly autoComplete?: string
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <input
        autoComplete={autoComplete}
        className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  )
}

function SubmitBar({ busy, onClose }: { readonly busy: boolean; readonly onClose: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
      <button className="h-11 rounded-xl px-5 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">Cancelar</button>
      <button className="h-11 rounded-xl bg-[#163a73] px-6 text-sm font-black text-white shadow-lg shadow-blue-950/15 hover:bg-[#102a56] disabled:cursor-wait disabled:opacity-60" disabled={busy} type="submit">
        {busy ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  )
}

export function UserEditor({ record, areas, roles, onClose, onSaved }: {
  readonly record: User | null
  readonly areas: readonly Area[]
  readonly roles: readonly Role[]
  readonly onClose: () => void
  readonly onSaved: () => void
}) {
  const [name, setName] = useState(record?.name ?? '')
  const [documentNumber, setDocumentNumber] = useState(record?.document_number ?? '')
  const [jobTitle, setJobTitle] = useState(record?.job_title ?? '')
  const [phone, setPhone] = useState(record?.phone ?? '')
  const [email, setEmail] = useState(record?.email ?? '')
  const [areaId, setAreaId] = useState(record?.area?.id.toString() ?? '')
  const [isActive, setIsActive] = useState(record?.is_active ?? true)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [assignments, setAssignments] = useState<readonly RoleAssignmentInput[]>(
    record?.roles.map((role) => ({ role_id: role.id, scope: role.scope ?? 'own_area' })) ?? [],
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function toggleRole(roleId: number) {
    setAssignments((current) => current.some((item) => item.role_id === roleId)
      ? current.filter((item) => item.role_id !== roleId)
      : [...current, { role_id: roleId, scope: 'own_area' }])
  }

  function changeScope(roleId: number, scope: RoleAssignmentInput['scope']) {
    setAssignments((current) => current.map((item) => item.role_id === roleId ? { ...item, scope } : item))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (assignments.length === 0) {
      setError('Seleccione al menos un rol para la cuenta.')
      return
    }

    setBusy(true)
    const input: UserInput = {
      area_id: Number(areaId),
      name,
      document_number: documentNumber,
      job_title: jobTitle,
      phone: phone.trim() === '' ? null : phone,
      email,
      is_active: isActive,
      role_assignments: assignments,
      ...(record === null ? { password, password_confirmation: passwordConfirmation } : {}),
    }

    try {
      if (record === null) await createUser(input)
      else await updateUser(record.id, input)

      onSaved()
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setBusy(false)
    }
  }

  const administratorSelected = assignments.some((assignment) =>
    roles.some((role) => role.id === assignment.role_id && role.code === 'administrador_tecnico'),
  )

  return (
    <Editor onClose={onClose} subtitle="Registre sus datos y seleccione el perfil de trabajo que tendrá dentro del sistema." title={record === null ? 'Registrar usuario' : 'Actualizar usuario'}>
      <form className="grid gap-6" onSubmit={(event) => void submit(event)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nombres y apellidos" onChange={setName} value={name} />
          <TextField label="Documento de identidad" onChange={setDocumentNumber} value={documentNumber} />
          <TextField label="Cargo" onChange={setJobTitle} value={jobTitle} />
          <TextField label={administratorSelected ? 'Celular para código SMS' : 'Teléfono (opcional)'} onChange={setPhone} required={administratorSelected} value={phone} />
          <TextField autoComplete="email" label="Correo de acceso" onChange={setEmail} type="email" value={email} />
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Área
            <select className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => setAreaId(event.target.value)} required value={areaId}>
              <option value="">Seleccione un área</option>
              {areas.filter((area) => area.is_active && ['PAT', 'TI', 'OCI'].includes(area.code)).map((area) => <option key={area.id} value={area.id}>{area.code} · {area.name}</option>)}
            </select>
          </label>
          {record === null && (
            <>
              <TextField autoComplete="new-password" label="Contraseña temporal" onChange={setPassword} type="password" value={password} />
              <TextField autoComplete="new-password" label="Confirmar contraseña" onChange={setPasswordConfirmation} type="password" value={passwordConfirmation} />
            </>
          )}
        </div>

        {record === null && <p className="-mt-3 text-xs leading-5 text-slate-500">Mínimo 12 caracteres con mayúsculas, minúsculas, números y símbolos. Entréguela por un canal seguro.</p>}

        <fieldset className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <legend className="px-2 text-sm font-black text-slate-800">Perfil de acceso</legend>
          <p className="text-xs leading-5 text-slate-500">Los permisos se aplican automáticamente según el perfil seleccionado.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.filter((role) => record !== null || ['asistente_ti', 'asistente_patrimonio', 'asistente_oci'].includes(role.code)).map((role) => {
              const assignment = assignments.find((item) => item.role_id === role.id)

              return (
                <div className={`rounded-xl border bg-white p-3 transition ${assignment !== undefined ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`} key={role.id}>
                  <label className="flex items-start gap-3 text-sm font-bold text-slate-700">
                    <input checked={assignment !== undefined} className="mt-0.5 size-4 accent-[#163a73]" onChange={() => toggleRole(role.id)} type="checkbox" />
                    <span>{role.name}<span className="mt-1 block text-[11px] font-medium leading-4 text-slate-400">{role.description ?? 'Perfil institucional del sistema.'}</span></span>
                  </label>
                  {assignment !== undefined && (
                    <select aria-label={`Alcance de ${role.name}`} className="mt-3 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 text-xs font-bold" onChange={(event) => changeScope(role.id, event.target.value as RoleAssignmentInput['scope'])} value={assignment.scope}>
                      <option value="own_area">Trabaja únicamente con su área</option>
                      <option value="global">Puede consultar todas las áreas</option>
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 rounded-xl bg-slate-50 p-4">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input checked={isActive} className="size-4 accent-[#163a73]" onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />Cuenta activa</label>
          <p className={`rounded-xl border p-3 text-xs font-semibold leading-5 ${administratorSelected ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600'}`}>
            {administratorSelected
              ? 'Seguridad de TI: esta cuenta exigirá un código SMS en cada inicio de sesión. El celular es obligatorio.'
              : 'Acceso estándar: esta cuenta ingresará con correo y contraseña, sin código SMS.'}
          </p>
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <SubmitBar busy={busy} onClose={onClose} />
      </form>
    </Editor>
  )
}

export function AreaEditor({ record, areas, onClose, onSaved }: {
  readonly record: Area | null
  readonly areas: readonly Area[]
  readonly onClose: () => void
  readonly onSaved: () => void
}) {
  const [parentId, setParentId] = useState(record?.parent_id?.toString() ?? '')
  const [code, setCode] = useState(record?.code ?? '')
  const [name, setName] = useState(record?.name ?? '')
  const [description, setDescription] = useState(record?.description ?? '')
  const [isActive, setIsActive] = useState(record?.is_active ?? true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')

    const input: AreaInput = {
      parent_id: parentId === '' ? null : Number(parentId),
      code,
      name,
      description: description.trim() === '' ? null : description,
      is_active: isActive,
    }

    try {
      if (record === null) await createArea(input)
      else await updateArea(record.id, input)

      onSaved()
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Editor onClose={onClose} subtitle="La jerarquía evita ciclos y no permite desactivar un área con usuarios activos." title={record === null ? 'Registrar área' : 'Actualizar área'}>
      <form className="grid gap-6" onSubmit={(event) => void submit(event)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Código institucional" onChange={(value) => setCode(value.toUpperCase())} value={code} />
          <TextField label="Nombre del área" onChange={setName} value={name} />
          <label className="grid gap-2 text-sm font-bold text-slate-700 sm:col-span-2">
            Área superior
            <select className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => setParentId(event.target.value)} value={parentId}>
              <option value="">Sin área superior</option>
              {areas.filter((area) => area.id !== record?.id).map((area) => <option key={area.id} value={area.id}>{area.code} · {area.name}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700 sm:col-span-2">
            Descripción (opcional)
            <textarea className="min-h-28 rounded-xl border border-slate-300 bg-slate-50 p-3 font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" maxLength={1000} onChange={(event) => setDescription(event.target.value)} value={description} />
          </label>
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700"><input checked={isActive} className="size-4 accent-[#163a73]" onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />Área activa</label>
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <SubmitBar busy={busy} onClose={onClose} />
      </form>
    </Editor>
  )
}
