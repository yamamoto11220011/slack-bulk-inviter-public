import { useAppStore } from '../stores/app-store'

export function Header() {
  const { workspace, team, setAuth, activeTab, setActiveTab } = useAppStore()

  const handleLogout = async () => {
    await window.api.logout()
    setAuth(false)
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-4 drag-region sticky top-0 z-50">
      <div className="flex items-center gap-6 no-drag">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <span className="text-[10px] font-black">SB</span>
          </div>
          <h1 className="text-sm font-bold tracking-tight">Slack Bulk Inviter</h1>
        </div>

        {/* ページ切り替えタブ */}
        <nav className="flex items-center bg-muted/50 rounded-lg p-1 border border-border/50">
          <button
            onClick={() => setActiveTab('invite')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'invite'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            <span>🧳</span> ユーザー招待
          </button>
          <button
            onClick={() => setActiveTab('broadcast')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'broadcast'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            <span>🚀</span> メッセージ送信
          </button>
          <button
            onClick={() => setActiveTab('directMessage')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'directMessage'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            <span>✉️</span> 個別DM
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-4 no-drag">
        {workspace && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-secondary/80 border border-border px-3 py-1 text-[10px] font-medium text-secondary-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            {team || workspace}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
        >
          ログアウト
        </button>
      </div>
    </header>
  )
}
