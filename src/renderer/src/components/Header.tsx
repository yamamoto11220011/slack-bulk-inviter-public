import { LogOut, Mail, Megaphone, UsersRound } from 'lucide-react'
import { useAppStore } from '../stores/app-store'

export function Header() {
  const { workspace, team, setAuth, activeTab, setActiveTab } = useAppStore()

  const navigation = [
    { id: 'invite' as const, label: 'ユーザー招待', Icon: UsersRound },
    { id: 'broadcast' as const, label: 'メッセージ送信', Icon: Megaphone },
    { id: 'directMessage' as const, label: '個別DM', Icon: Mail }
  ]

  const handleLogout = async () => {
    await window.api.logout()
    setAuth(false)
  }

  return (
    <header className="drag-region sticky top-0 z-50 border-b border-border/70 bg-background/82 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-5 no-drag">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#4e0004,#e50914_55%,#2c0002)] text-primary-foreground shadow-[0_28px_70px_-32px_rgba(229,9,20,0.55)]">
              <span className="ml-[0.22rem] text-[10px] font-black tracking-[0.28em]">SBI</span>
            </div>
            <div className="space-y-0.5">
              <h1 className="text-sm font-semibold tracking-tight">Slack Bulk Inviter</h1>
              <p className="text-[11px] text-muted-foreground">Cinematic Operations Console</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 rounded-2xl border border-border/80 bg-card/88 p-1.5 shadow-[0_16px_44px_-28px_rgba(0,0,0,0.65)]">
            {navigation.map(({ id, label, Icon }) => {
              const isActive = activeTab === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-[0_22px_44px_-24px_rgba(229,9,20,0.6)]'
                      : 'text-muted-foreground hover:bg-white/4 hover:text-foreground'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 no-drag">
          {workspace && (
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-[11px] font-medium text-secondary-foreground shadow-[0_16px_40px_-30px_rgba(15,23,42,0.4)]">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_rgba(229,9,20,0.75)]" />
              {team || workspace}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card/70 px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:border-destructive/25 hover:bg-destructive/8 hover:text-destructive"
          >
            <LogOut size={14} />
            ログアウト
          </button>
        </div>
      </div>
    </header>
  )
}
