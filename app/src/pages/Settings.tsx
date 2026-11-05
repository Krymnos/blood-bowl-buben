import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { DEFAULT_SETTINGS, type LeagueSettings } from '../rules/sevens'
import { exportAll, importAll } from '../logic/backup'
import { seedDemo } from '../demo'
import CloudBackup from '../components/CloudBackup'
import { Button, Card, H2, NumberInput, Page, useSettings } from '../components/ui'

const SPP_LABELS: Record<keyof LeagueSettings['spp'], string> = {
  td: 'Touchdown', cas: 'Casualty (Block)', casStar: 'CAS on Star Player', completion: 'Completion', interception: 'Interception', deflection: 'Deflection', mvp: 'MVP', ttmThrow: 'Superb TTM throw', ttmLand: 'TTM landing',
}
const ADV_LABELS: Record<keyof LeagueSettings['advCost'], string> = {
  randomPrimary: 'Random primary', chosenPrimary: 'Chosen primary', chosenSecondary: 'Chosen secondary', characteristic: 'Characteristic',
}

const VALUE_LABELS: Record<keyof LeagueSettings['valueIncrease'], string> = {
  randomPrimary: 'Random primary', primary: 'Chosen primary', secondary: 'Secondary', elite: 'Elite skill extra', ma: '+1 MA', st: '+1 ST', ag: '+1 AG', pa: '+1 PA', av: '+1 AV',
}

export default function Settings() {
  const s = useSettings()
  const nav = useNavigate()
  const save = (v: LeagueSettings) => db.settings.put({ id: 'league', value: v })

  return (
    <Page title="Settings" sub="League house rules · data">
      <H2>SPP awards</H2>
      <Card className="grid grid-cols-2 gap-x-3 gap-y-2">
        {(Object.keys(SPP_LABELS) as (keyof LeagueSettings['spp'])[]).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{SPP_LABELS[k]}</span>
            <NumberInput className="!w-16 !py-1.5 text-center" value={s.spp[k]} onChange={(v) => save({ ...s, spp: { ...s.spp, [k]: v } })} />
          </label>
        ))}
      </Card>

      <H2>Advancement cost (SPP) by advancement #</H2>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-white/40">
              <th className="text-left font-normal">Type</th>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <th key={n} className="font-normal">{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(ADV_LABELS) as (keyof LeagueSettings['advCost'])[]).map((k) => (
              <tr key={k}>
                <td className="pr-2 text-xs">{ADV_LABELS[k]}</td>
                {s.advCost[k].map((v, i) => (
                  <td key={i} className="p-0.5">
                    <NumberInput
                      className="!w-11 !px-1 !py-1 text-center text-sm"
                      value={v}
                      onChange={(x) => {
                        const arr = [...s.advCost[k]]
                        arr[i] = x
                        save({ ...s, advCost: { ...s.advCost, [k]: arr } })
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <H2>Value increases (k)</H2>
      <Card className="grid grid-cols-2 gap-x-3 gap-y-2">
        {(Object.keys(s.valueIncrease) as (keyof LeagueSettings['valueIncrease'])[]).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{VALUE_LABELS[k]}</span>
            <NumberInput className="!w-16 !py-1.5 text-center" value={s.valueIncrease[k] / 1000} onChange={(v) => save({ ...s, valueIncrease: { ...s.valueIncrease, [k]: v * 1000 } })} />
          </label>
        ))}
      </Card>

      <H2>Other</H2>
      <Card>
        <label className="flex items-center gap-2 text-sm">
          <span className="flex-1">Re-roll cost after the draft (k)</span>
          <NumberInput className="!w-20 !py-1.5 text-center" value={s.rerollCostLeague / 1000} onChange={(v) => save({ ...s, rerollCostLeague: v * 1000 })} />
        </label>
        <Button variant="ghost" className="mt-2 w-full text-xs" onClick={() => confirm('Reset all house rules to the league defaults (Verfassung Vol. 3)?') && save(DEFAULT_SETTINGS)}>
          Reset to league defaults (Verfassung Vol. 3)
        </Button>
      </Card>

      <H2>Cloud backup (GitHub)</H2>
      <CloudBackup />

      <H2>Data</H2>
      <Card className="space-y-2">
        <div className="text-xs text-white/50">Data lives on this device. Without cloud backup, export a file now and then (photos included).</div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={exportAll}>⬇️ Export backup</Button>
          <label className="cursor-pointer rounded-xl bg-white/10 px-4 py-2.5 text-center text-sm font-semibold active:bg-white/20">
            ⬆️ Import backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (!confirm('Import replaces ALL data on this device. Continue?')) return
                await importAll(await f.text())
                nav('/')
              }}
            />
          </label>
        </div>
        <Button variant="soft" className="w-full" onClick={async () => nav(`/team/${await seedDemo()}`)}>
          Load demo Gnome team
        </Button>
        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            if (!confirm('Delete ALL teams, matches and photos on this device?')) return
            await Promise.all([db.teams.clear(), db.players.clear(), db.matches.clear(), db.events.clear(), db.photos.clear()])
            nav('/')
          }}
        >
          Delete all data
        </Button>
      </Card>
      <div className="px-1 pb-4 text-[11px] leading-relaxed text-white/30">
        Rules: league Verfassung Vol. 3 (overrides the official rules) + Blood Bowl Sevens (Spike! Journal 22) + Third Season Edition. Rosters & skills from bloodbowlbase.ru. Unofficial fan tool, not affiliated with Games Workshop.
      </div>
    </Page>
  )
}
