import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { ApiError, createAsset, updateAsset, uploadAssetDocument } from './api'
import type { Area, Asset, AssetCategory, AssetLocation, AssetStatus } from './types'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const message = Object.values(error.errors)[0]?.[0]

    if (message === 'validation.unique') {
      return 'El código de activo ya está registrado. Usa otro código o edita el activo existente.'
    }

    return message ?? error.message
  }

  return 'No se pudo guardar el activo.'
}

function FormSection({ title, description, step, children }: {
  readonly title: string
  readonly description: string
  readonly step: string
  readonly children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,35,70,0.04)] sm:p-7">
      <div className="mb-6 flex items-start gap-3 border-b border-slate-100 pb-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-xs font-black text-[#174a86]">{step}</span>
        <div>
          <h3 className="text-base font-black tracking-[-0.01em] text-slate-900">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export function AssetEditor({ record, areas, categories, statuses, locations, registeredAreaName, canUpload, onClose, onSaved }: {
  readonly record: Asset | null
  readonly areas: readonly Area[]
  readonly categories: readonly AssetCategory[]
  readonly statuses: readonly AssetStatus[]
  readonly locations: readonly AssetLocation[]
  readonly registeredAreaName: string | null
  readonly canUpload: boolean
  readonly onClose: () => void
  readonly onSaved: () => void
}) {
  const defaultStatusId = statuses.find((status) => status.code === 'OPERATIVO')?.id.toString() ?? ''
  const [form, setForm] = useState({
    assetCode: record?.asset_code ?? '',
    inventoryCode: record?.inventory_code ?? '',
    name: record?.name ?? '',
    categoryId: record?.category.id.toString() ?? '',
    statusId: record?.status.id.toString() ?? defaultStatusId,
    areaId: record?.area.id.toString() ?? '',
    locationId: record?.location?.id.toString() ?? '',
    brand: record?.brand ?? '',
    model: record?.model ?? '',
    serialNumber: record?.serial_number ?? '',
    description: record?.description ?? '',
    reason: '',
  })
  const [isActive, setIsActive] = useState(record?.is_active ?? true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(record?.documents?.find((document) => document.document_type === 'photo')?.url ?? null)

  useEffect(() => {
    if (file === null) setPreview(record?.documents?.find((document) => document.document_type === 'photo')?.url ?? null)
  }, [file, record])

  const activeLocations = locations.filter((location) => location.is_active && location.area_id === Number(form.areaId))

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'areaId' ? { locationId: '' } : {}),
    }))
  }

  function field(label: string, key: keyof typeof form, options: { required?: boolean; placeholder?: string } = {}) {
    return (
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        {label}
        <input
          className="h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-3 font-medium outline-none transition placeholder:text-slate-400 focus:border-[#2d6bb5] focus:bg-white focus:ring-4 focus:ring-blue-100"
          onChange={(event) => update(key, event.target.value)}
          placeholder={options.placeholder}
          required={options.required ?? true}
          value={form[key]}
        />
      </label>
    )
  }

  function select(label: string, key: keyof typeof form, options: readonly { id: number; label: string }[], required = true) {
    return (
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        {label}
        <select
          className="h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-3 font-medium outline-none transition focus:border-[#2d6bb5] focus:bg-white focus:ring-4 focus:ring-blue-100"
          onChange={(event) => update(key, event.target.value)}
          required={required}
          value={form[key]}
        >
          <option value="">{required ? 'Seleccione una opción' : 'Sin especificar'}</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    )
  }

  function choosePhoto(selected: File | null) {
    if (preview !== null) URL.revokeObjectURL(preview)
    setFile(selected)
    setPreview(selected === null ? null : URL.createObjectURL(selected))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')

    const input = {
      ...(record === null ? { asset_code: form.assetCode } : {}),
      inventory_code: form.inventoryCode || null,
      name: form.name,
      category_id: Number(form.categoryId),
      status_id: Number(form.statusId),
      area_id: Number(form.areaId),
      location_id: form.locationId ? Number(form.locationId) : null,
      brand: form.brand || null,
      model: form.model || null,
      serial_number: form.serialNumber || null,
      description: form.description || null,
      is_active: isActive,
      ...(record === null ? {} : { reason: form.reason }),
    }

    try {
      const saved = record === null ? await createAsset(input) : await updateAsset(record.id, input)

      if (file !== null) {
        await uploadAssetDocument(saved.id, 'photo', file)
      }

      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div aria-modal="true" className="fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" role="dialog">
      <div className="m-auto w-full max-w-6xl overflow-hidden rounded-[26px] bg-[#f4f7fb] shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#0a2146] to-[#174a86] px-6 py-5 text-white sm:px-8 sm:py-6">
          <div className="flex items-center gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
              <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" /></svg>
            </span>
            <div>
              <h2 className="text-xl font-black sm:text-2xl">{record === null ? 'Registrar activo' : 'Actualizar activo'}</h2>
              <p className="mt-1 text-xs text-blue-100/70">Complete la información necesaria para identificar y ubicar el bien.</p>
            </div>
          </div>
          <button aria-label="Cerrar" className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-xl font-bold transition hover:bg-white/20" onClick={onClose} type="button">×</button>
        </header>

        <form className="grid gap-6 p-4 sm:p-7" onSubmit={(event) => void submit(event)}>
          <div className={canUpload ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start' : 'grid gap-6'}>
            <div className="grid gap-6">
              <FormSection description="Datos básicos para reconocer el equipo o mueble." step="01" title="Identificación del activo">
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-6">
                  {record === null && field('Código patrimonial', 'assetCode', { placeholder: 'Ej. MDM-TEC-0002' })}
                  {field('Nombre del activo', 'name', { placeholder: 'Ej. Computadora de escritorio' })}
                  {select('Tipo de bien', 'categoryId', categories.filter((item) => item.is_active).map((item) => ({ id: item.id, label: item.name })))}
                  {select('Estado actual', 'statusId', statuses.filter((item) => item.is_active).map((item) => ({ id: item.id, label: item.name })))}
                </div>
              </FormSection>

              <FormSection description="El área registrada se toma automáticamente de su cuenta. Seleccione únicamente el destino y la ubicación del bien." step="02" title="Asignación del activo">
                <div className="grid gap-4">
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    Registrando desde el área: <strong className="text-[#174a86]">{registeredAreaName ?? 'Área no asignada'}</strong>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-6">
                  {select('Área designada', 'areaId', areas.filter((item) => item.is_active && item.code !== 'MDM').map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` })))}
                  {select('Ubicación física dentro del área', 'locationId', activeLocations.map((item) => ({ id: item.id, label: item.name })), false)}
                  </div>
                </div>
              </FormSection>

              <FormSection description="Complete lo que figure en la etiqueta, factura o ficha del bien." step="03" title="Datos técnicos">
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-6">
                  {field('Código de inventario', 'inventoryCode', { required: false, placeholder: 'Opcional' })}
                  {field('Número de serie', 'serialNumber', { required: false, placeholder: 'Opcional' })}
                  {field('Marca', 'brand', { required: false, placeholder: 'Opcional' })}
                  {field('Modelo', 'model', { required: false, placeholder: 'Opcional' })}
                </div>
                <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
                  Observaciones
                  <textarea className="min-h-24 rounded-xl border border-slate-300 bg-slate-50 p-3 font-medium outline-none transition placeholder:text-slate-400 focus:border-[#2d6bb5] focus:bg-white focus:ring-4 focus:ring-blue-100" onChange={(event) => update('description', event.target.value)} placeholder="Características, estado físico u otra información relevante" value={form.description} />
                </label>
              </FormSection>

              {record !== null && (
                <FormSection description="Este dato quedará registrado en el historial del activo." step="04" title="Control de actualización">
                  {field('Motivo del cambio', 'reason', { placeholder: 'Explique brevemente qué información se modificó' })}
                  <label className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700"><input checked={isActive} className="size-4 accent-[#174a86]" onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />Activo vigente</label>
                </FormSection>
              )}
            </div>

            {canUpload && (
              <aside className="h-fit rounded-2xl border border-blue-100 bg-white p-6 shadow-[0_8px_24px_rgba(15,35,70,0.05)] lg:sticky lg:top-5">
                <div className="mb-4">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-blue-50 text-xs font-black text-[#174a86]">04</span>
                    <h3 className="text-base font-black tracking-[-0.01em] text-slate-900">Fotografía del activo</h3>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Agregue una imagen clara para facilitar su identificación.</p>
                </div>
                <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50">
                  {preview !== null
                    ? <img alt="Vista previa del activo" className="size-full object-contain p-3" src={preview} />
                    : <div className="grid place-items-center gap-3 px-5 text-center text-blue-400"><svg aria-hidden="true" className="size-9" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><rect height="15" rx="2" width="18" x="3" y="5" /><circle cx="9" cy="10" r="2" /><path d="m3 18 5-5 4 4 3-3 6 5" /></svg><span className="text-xs font-bold">Sin fotografía seleccionada</span></div>}
                </div>
                <label className="mt-4 grid cursor-pointer gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 transition hover:border-blue-300 hover:bg-blue-50/50">
                  <input accept=".jpg,.jpeg,.png,.webp" className="sr-only" onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)} type="file" />
                  <span className="grid h-10 place-items-center rounded-lg bg-[#174a86] text-xs font-black text-white shadow-sm">Seleccionar fotografía</span>
                  <span className="truncate px-1 text-center text-[11px] font-semibold text-slate-500">{file?.name ?? 'Ningún archivo seleccionado'}</span>
                </label>
                <p className="mt-3 text-[11px] leading-5 text-slate-400">Formatos JPG, PNG o WEBP. Tamaño máximo: 10 MB.</p>
              </aside>
            )}
          </div>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button className="h-11 rounded-xl px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-200" onClick={onClose} type="button">Cancelar</button>
            <button className="h-11 rounded-xl bg-[#174a86] px-7 text-sm font-black text-white shadow-lg shadow-blue-950/15 transition hover:bg-[#0f376a] disabled:cursor-wait disabled:opacity-60" disabled={busy} type="submit">{busy ? 'Guardando…' : record === null ? 'Registrar activo' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
