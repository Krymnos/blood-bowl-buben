import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, mergeSettings } from '../db'
import { d } from '../logic/dice'

export function useSettings() {
  const row = useLiveQuery(() => db.settings.get('league'), [])
  return mergeSettings(row?.value)
}

export function Page({ title, back, right, children, sub }: { title: ReactNode; sub?: ReactNode; back?: string | true; right?: ReactNode; children: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-white/10 bg-ink/90 px-3 py-2.5 backdrop-blur">
        {back && (
          <button className="-ml-1 rounded-lg px-2 py-1 text-xl text-white/70 active:bg-white/10" onClick={() => (back === true ? nav(-1) : nav(back))} aria-label="Back">
            ‹
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
          {sub && <div className="truncate text-xs text-white/50">{sub}</div>}
        </div>
        {right}
      </header>
      <main className="mx-auto max-w-xl space-y-3 p-3">{children}</main>
    </div>
  )
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`rounded-2xl border border-white/10 bg-panel p-3 ${onClick ? 'cursor-pointer active:bg-white/5' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">{children}</h2>
      {right}
    </div>
  )
}

type Variant = 'primary' | 'ghost' | 'danger' | 'soft'
const vcls: Record<Variant, string> = {
  primary: 'bg-turf text-white active:bg-turf/80 disabled:bg-white/10 disabled:text-white/30',
  soft: 'bg-white/10 text-white active:bg-white/20 disabled:text-white/30',
  ghost: 'text-white/80 active:bg-white/10 disabled:text-white/30',
  danger: 'bg-blood/90 text-white active:bg-blood disabled:opacity-40',
}
export function Button({ children, variant = 'primary', className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${vcls[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}
export function LinkButton({ to, children, variant = 'primary', className = '' }: { to: string; children: ReactNode; variant?: Variant; className?: string }) {
  return (
    <Link to={to} className={`inline-block rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${vcls[variant]} ${className}`}>
      {children}
    </Link>
  )
}

export function Stepper({ value, onChange, min = 0, max = 99, label, sub }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        {sub && <div className="text-xs text-white/50">{sub}</div>}
      </div>
      <button className="h-9 w-9 rounded-lg bg-white/10 text-lg active:bg-white/20 disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <div className="w-7 text-center text-lg font-bold tabular-nums">{value}</div>
      <button className="h-9 w-9 rounded-lg bg-white/10 text-lg active:bg-white/20 disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-white/60">{label}</span>
      {children}
    </label>
  )
}
export const inputCls = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-base outline-none focus:border-turf'

export function NumberInput({ value, onChange, step = 1, className = '' }: { value: number; onChange: (v: number) => void; step?: number; className?: string }) {
  const [txt, setTxt] = useState(String(value))
  useEffect(() => setTxt(String(value)), [value])
  return (
    <input
      inputMode="numeric"
      className={`${inputCls} ${className}`}
      value={txt}
      step={step}
      onChange={(e) => {
        setTxt(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && !Number.isNaN(n)) onChange(n)
      }}
    />
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button className="rounded-lg px-2 text-white/60" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'gold' | 'red' | 'green' | 'blue' }) {
  const t = {
    default: 'bg-white/10 text-white/80',
    gold: 'bg-gold/20 text-gold',
    red: 'bg-blood/25 text-red-300',
    green: 'bg-turf/30 text-green-300',
    blue: 'bg-sky-500/20 text-sky-300',
  }[tone]
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>
}

/** Roll dice in-app or type the physical roll. */
export function DiceInput({ label, sides = 6, count = 1, value, onChange }: { label: string; sides?: number; count?: number; value?: number; onChange: (v: number) => void }) {
  const [spin, setSpin] = useState(false)
  const rollIt = () => {
    setSpin(true)
    setTimeout(() => {
      let t = 0
      for (let i = 0; i < count; i++) t += d(sides)
      onChange(t)
      setSpin(false)
    }, 350)
  }
  const max = count * sides
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm">{label}</span>
      <select className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-base" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
        <option value="">–</option>
        {Array.from({ length: max - count + 1 }, (_, i) => i + count).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button onClick={rollIt} className={`rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold active:bg-white/20 ${spin ? 'animate-spin' : ''}`}>
        🎲 {count > 1 ? count : ''}D{sides}
      </button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/50">{children}</div>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-turf' : 'bg-white/15'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </label>
  )
}

/** Numbered step of a match sequence, with its rule text. */
export function Step({ n, title, rule, children }: { n: number | string; title: string; rule: string; children: ReactNode }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-turf text-lg font-black text-gold">{n}</div>
        <div>
          <div className="font-bold">{title}</div>
          <div className="text-xs leading-snug text-white/50">{rule}</div>
        </div>
      </div>
      {children}
    </Card>
  )
}
