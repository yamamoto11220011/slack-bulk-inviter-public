import { Lock, Megaphone, ShieldCheck, UsersRound } from 'lucide-react'
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
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/8 bg-card/88 shadow-[0_44px_140px_-56px_rgba(0,0,0,0.9)] backdrop-blur-xl lg:grid-cols-[1.15fr_0.9fr]">
        <section className="border-b border-border/70 bg-[linear-gradient(160deg,#050505,#160406_42%,#5c050b_72%,#0c0c0c)] px-8 py-10 text-primary-foreground lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
          <div className="inline-flex rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-white/78 uppercase">
            Slack Operations
          </div>
          <div className="mt-8 max-w-lg space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight leading-tight">
              招待も、DMも、配信も。
              <br />
              ひとつの画面で安全に運用する。
            </h1>
            <p className="text-sm leading-7 text-white/72">
              Slack の大量オペレーションを、ローカル完結の管理コンソールとして扱えます。
              セグメント選択、プレビュー、履歴、再実行までまとめて管理できます。
            </p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <UsersRound size={18} className="text-white/84" />
              <div className="mt-3 text-sm font-semibold">Audience Control</div>
              <p className="mt-1 text-[11px] leading-5 text-white/65">カテゴリ・CSV・除外条件で対象を丁寧に絞り込みます。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <Megaphone size={18} className="text-white/84" />
              <div className="mt-3 text-sm font-semibold">Message Ops</div>
              <p className="mt-1 text-[11px] leading-5 text-white/65">一斉送信、個別DM、予約送信を同じUXで扱えます。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <ShieldCheck size={18} className="text-white/84" />
              <div className="mt-3 text-sm font-semibold">Safety Layer</div>
              <p className="mt-1 text-[11px] leading-5 text-white/65">dry-run、確認導線、履歴保存で誤送信リスクを抑えます。</p>
            </div>
          </div>
        </section>

        <section className="px-8 py-10 lg:px-10 lg:py-12">
          <div className="mx-auto max-w-md space-y-7">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                <Lock size={13} />
                Workspace Sign In
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">ワークスペースに接続</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                接続先の Slack ワークスペースを入力すると、ブラウザでログインウィンドウを開きます。
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="workspace" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Workspace
                </label>
                <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background/90 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_16px_42px_-36px_rgba(0,0,0,0.8)]">
                  <input
                    id="workspace"
                    type="text"
                    placeholder="your-workspace"
                    value={workspaceUrl}
                    onChange={(e) => setWorkspaceUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    disabled={isLoading}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">.slack.com</span>
                </div>
              </div>

              <button
                onClick={handleLogin}
                disabled={isLoading || !workspaceUrl.trim()}
                className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_28px_56px_-28px_rgba(229,9,20,0.62)] transition-all hover:-translate-y-0.5 hover:bg-[#f6121d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'ログイン中...' : 'Slack にログイン'}
              </button>

              {error && (
                <p className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="rounded-2xl border border-border/70 bg-muted/45 px-4 py-3 text-xs leading-6 text-muted-foreground">
                ブラウザウィンドウが開きます。Slack 側でログイン後、この画面に戻ると接続が完了します。
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
