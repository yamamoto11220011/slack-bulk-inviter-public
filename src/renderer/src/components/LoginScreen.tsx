import { useState } from 'react'
import { useAppStore } from '../stores/app-store'

export function LoginScreen() {
  const [workspaceUrl, setWorkspaceUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setAuth = useAppStore((s) => s.setAuth)

  const handleLogin = async () => {
    if (!workspaceUrl.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.api.login(workspaceUrl.trim())
      setAuth(true, result.workspace)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 px-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Slack Bulk Inviter</h1>
          <p className="text-sm text-muted-foreground">
            ワークスペースにログインして始めましょう
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="workspace" className="text-sm font-medium">
              ワークスペース
            </label>
            <div className="flex items-center gap-2">
              <input
                id="workspace"
                type="text"
                placeholder="your-workspace"
                value={workspaceUrl}
                onChange={(e) => setWorkspaceUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading}
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">.slack.com</span>
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={isLoading || !workspaceUrl.trim()}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'ログイン中...' : 'Slack にログイン'}
          </button>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            ブラウザウィンドウが開きます。<br />
            Google アカウントでログインしてください。
          </p>
        </div>
      </div>
    </div>
  )
}
