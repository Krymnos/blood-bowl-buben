export const gp = (n: number | undefined | null) => {
  if (n == null || Number.isNaN(n)) return '–'
  const k = n / 1000
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`
}
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
export const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
