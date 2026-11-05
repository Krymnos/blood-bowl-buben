import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { getRoster } from '../rules/data'
import { teamValue } from '../logic/team'
import { teamRecord } from '../logic/stats'
import { gp } from '../logic/format'
import { Button, Card, Empty, H2, LinkButton, Page } from '../components/ui'
import { seedDemo } from '../demo'
import { CloudStatusLine } from '../components/CloudBackup'
import { useCloudConfig } from '../logic/cloud'

export default function Home() {
  const nav = useNavigate()
  const cloud = useCloudConfig()
  const data = useLiveQuery(async () => {
    const teams = await db.teams.toArray()
    const players = await db.players.toArray()
    const matches = await db.matches.toArray()
    return { teams, players, matches }
  }, [])
  if (!data) return null
  const open = data.matches.filter((m) => m.status !== 'done')
  return (
    <Page title="Sevens Dugout" sub="Blood Bowl Sevens · Team manager" right={<LinkButton to="/team/new" className="!px-3 !py-1.5">+ Team</LinkButton>}>
      {open.length > 0 && (
        <>
          <H2>Games in progress</H2>
          {open.map((m) => {
            const t = data.teams.find((x) => x.id === m.teamId)
            return (
              <Card key={m.id} onClick={() => nav(`/match/${m.id}`)} className="border-gold/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {t?.name} vs {m.opponent.name || 'Opponent'}
                    </div>
                    <div className="text-xs text-white/50">
                      {m.status === 'setup' ? 'Pre-game' : m.status === 'live' ? `Live · Half ${m.half} · Turn ${m.turn}` : 'Post-game'}
                    </div>
                  </div>
                  <div className="text-2xl font-black tabular-nums">
                    {m.score.us}–{m.score.them}
                  </div>
                </div>
              </Card>
            )
          })}
        </>
      )}
      <H2>My teams</H2>
      {data.teams.length === 0 && (
        <Empty>
          <p className="mb-3">No team yet. Draft a new one, or load a demo Gnome team to explore.</p>
          <div className="flex justify-center gap-2">
            <LinkButton to="/team/new">Draft a team</LinkButton>
            <Button variant="soft" onClick={async () => nav(`/team/${await seedDemo()}`)}>
              Load demo
            </Button>
          </div>
        </Empty>
      )}
      {data.teams.map((t) => {
        const ps = data.players.filter((p) => p.teamId === t.id)
        const { tv, ctv } = teamValue(t, ps)
        const rec = teamRecord(data.matches.filter((m) => m.teamId === t.id))
        const r = getRoster(t.rosterId)
        return (
          <Card key={t.id} onClick={() => nav(`/team/${t.id}`)}>
            <div className="flex items-center gap-3">
              <div className="h-12 w-2 rounded-full" style={{ background: t.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold">{t.name}</div>
                <div className="text-xs text-white/50">
                  {r?.name} · {ps.filter((p) => p.status === 'active').length} players · {rec.w}-{rec.d}-{rec.l}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">TV {gp(tv)}</div>
                {ctv !== tv && <div className="text-xs text-white/50">CTV {gp(ctv)}</div>}
                <div className="text-xs text-gold">{gp(t.treasury)} 💰</div>
              </div>
            </div>
          </Card>
        )
      })}
      {data.teams.length > 0 && (
        <div className="px-1 pt-2 text-center text-xs" onClick={() => nav('/settings')}>
          {cloud ? <CloudStatusLine /> : <span className="text-amber-300/80">💾 Data is only on this phone · set up cloud backup in Settings ›</span>}
        </div>
      )}
    </Page>
  )
}
