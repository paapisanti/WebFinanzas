import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCategories } from '../lib/hooks'
import type { Category } from '../lib/types'

const PALETTE = ['#E0B25A', '#6FCF9F', '#7FB2F0', '#EF8A7C', '#B79CED', '#F0A36B', '#5EC8D4', '#D98BB5', '#A3C76B', '#8FA0C0', '#E6C86E', '#78C0A8']
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export default function CategoriesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const cats = useCategories().data ?? []
  const [kind, setKind] = useState<'gasto' | 'ingreso'>('gasto')
  const [editing, setEditing] = useState<Category | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [error, setError] = useState('')

  const tops = cats.filter((c) => c.kind === kind && !c.parent_id)
  const subsOf = (id: string) => cats.filter((c) => c.parent_id === id)
  const refresh = () => qc.invalidateQueries()
  const closeForm = () => { setShowForm(false); setEditing(null); setName(''); setParentId(''); setColor(PALETTE[0]); setError('') }
  const openNew = (parent?: Category) => { closeForm(); if (parent) { setParentId(parent.id); setColor(parent.color ?? PALETTE[0]) } setShowForm(true) }
  const openEdit = (c: Category) => { setEditing(c); setName(c.name); setParentId(c.parent_id ?? ''); setColor(c.color ?? PALETTE[0]); setError(''); setShowForm(true) }

  const save = useMutation({
    mutationFn: async () => {
      const n = name.trim()
      if (!n) throw new Error('Escribe un nombre.')
      const parent = parentId ? cats.find((c) => c.id === parentId) : undefined
      const k = parent ? parent.kind : editing ? editing.kind : kind
      if (cats.some((c) => c.kind === k && c.id !== editing?.id && same(c.name, n))) throw new Error('Ya existe una categoría con ese nombre.')
      if (editing && parent && subsOf(editing.id).length > 0) throw new Error('Esta categoría tiene subcategorías, así que no puede pasar a ser subcategoría.')
      const row = { name: n, kind: k, parent_id: parent?.id ?? null, color }
      const r = editing
        ? await supabase.from('categories').update(row).eq('id', editing.id)
        : await supabase.from('categories').insert({ ...row, sort: cats.filter((c) => c.kind === k).length + 1 })
      if (r.error) throw r.error
    },
    onSuccess: () => { closeForm(); refresh() },
    onError: (e: Error) => setError(e.message),
  })

  const toggle = useMutation({
    mutationFn: async (c: Category) => {
      const q = supabase.from('categories').update({ active: !c.active })
      const r = c.parent_id ? await q.eq('id', c.id) : await q.or(`id.eq.${c.id},parent_id.eq.${c.id}`)
      if (r.error) throw r.error
    },
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  })

  const del = useMutation({
    mutationFn: async (c: Category) => {
      const kids = subsOf(c.id).length
      if (!confirm(kids ? `¿Eliminar "${c.name}"? Sus ${kids} subcategorías pasarán a ser categorías principales.` : `¿Eliminar "${c.name}"?`)) return
      const r = await supabase.from('categories').delete().eq('id', c.id)
      if (r.error) throw new Error(r.error.code === '23503' ? 'Tiene movimientos, presupuestos o suscripciones asociados. Desactívala en su lugar.' : r.error.message)
    },
    onSuccess: () => { setError(''); refresh() },
    onError: (e: Error) => setError(e.message),
  })

  const Row = ({ c, sub }: { c: Category; sub?: boolean }) => (
    <div className={`flex flex-wrap items-center gap-2 ${sub ? 'pl-6' : ''} ${c.active ? '' : 'opacity-50'}`}>
      <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: c.color ?? '#8A93AA' }} />
      <span className="flex-1 min-w-0 truncate text-white">{c.name}{!c.active && <span className="text-xs text-mute"> · desactivada</span>}</span>
      <button className="btn-ghost text-xs" onClick={() => openEdit(c)}>Editar</button>
      {!sub && <button className="btn-ghost text-xs" onClick={() => openNew(c)}>+ Sub</button>}
      <button className="btn-ghost text-xs" onClick={() => toggle.mutate(c)}>{c.active ? 'Desactivar' : 'Activar'}</button>
      <button className="btn-ghost text-xs text-neg" onClick={() => del.mutate(c)}>Eliminar</button>
    </div>
  )

  const parentOptions = tops.filter((c) => c.id !== editing?.id)
  const lockedParent = !!editing && subsOf(editing.id).length > 0

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-panel border border-line w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Categorías</h2>
          <button type="button" className="text-mute px-2" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-raise p-1 rounded-lg" role="tablist">
          {([['gasto', 'Gastos'], ['ingreso', 'Ingresos']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); closeForm() }}
              className={`py-2 rounded-md text-sm ${kind === k ? 'bg-brass text-ink font-semibold' : 'text-mute'}`}>{l}</button>
          ))}
        </div>

        <ul className="space-y-3">
          {tops.map((c) => (
            <li key={c.id} className="space-y-2">
              <Row c={c} />
              {subsOf(c.id).map((s) => <Row key={s.id} c={s} sub />)}
            </li>
          ))}
        </ul>
        {tops.length === 0 && <p className="text-sm text-mute">No hay categorías de este tipo.</p>}

        {!showForm && <button type="button" className="btn-ghost w-full" onClick={() => openNew()}>+ Nueva categoría</button>}
        {error && !showForm && <p className="text-neg text-sm" role="alert">{error}</p>}

        {showForm && (
          <form className="space-y-3 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
            <h3 className="text-white font-semibold">{editing ? 'Editar' : parentId ? 'Nueva subcategoría' : 'Nueva categoría'} de {kind === 'gasto' ? 'gastos' : 'ingresos'}</h3>
            <div><label className="label" htmlFor="cn">Nombre</label>
              <input id="cn" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
            <div><label className="label" htmlFor="cp">Dentro de</label>
              <select id="cp" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={lockedParent}>
                <option value="">Ninguna (categoría principal)</option>
                {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><span className="label">Color</span>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((p) => (
                  <button key={p} type="button" aria-label={`Color ${p}`} aria-pressed={color === p} onClick={() => setColor(p)}
                    className={`h-8 w-8 rounded-full border-2 ${color === p ? 'border-white' : 'border-transparent'}`} style={{ background: p }} />
                ))}
              </div></div>
            {error && <p className="text-neg text-sm" role="alert">{error}</p>}
            <div className="flex gap-2"><button className="btn" disabled={save.isPending}>{editing ? 'Guardar cambios' : 'Crear'}</button>
              <button type="button" className="btn-ghost" onClick={closeForm}>Cancelar</button></div>
          </form>
        )}
        <p className="text-xs text-mute">Desactivar una categoría la oculta al apuntar movimientos, pero conserva el historial. Las subcategorías suman en su categoría principal en los gráficos y presupuestos.</p>
      </div>
    </div>
  )
}
