import { Suspense, lazy, useEffect } from 'react'
import { useAppStore } from './stores/app-store'
import { LoginScreen } from './components/LoginScreen'
import { Header } from './components/Header'
import { ErrorToast } from './components/ErrorToast'

const InviteView = lazy(() =>
  import('./components/InviteView').then((module) => ({ default: module.InviteView }))
)
const BroadcastView = lazy(() =>
  import('./components/BroadcastView').then((module) => ({ default: module.BroadcastView }))
)
const DirectMessageView = lazy(() =>
  import('./components/DirectMessageView').then((module) => ({ default: module.DirectMessageView }))
)

function App(): React.JSX.Element {
  const { isLoggedIn, setAuth, setUsers, setChannels, setCategories, setSyncMeta, activeTab } = useAppStore()

  // 起動時に認証状態を確認
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const status = await window.api.getAuthStatus()
        if (status.loggedIn) {
          setAuth(true, status.workspace, status.team)
          // データを読み込む
          const [users, channels, categories, syncMeta] = await Promise.all([
            window.api.getUsers(),
            window.api.getChannels(),
            window.api.getCategories(),
            window.api.getSyncMeta()
          ])
          setUsers(users)
          setChannels(channels)
          setCategories(categories)
          setSyncMeta(
            syncMeta.lastUserSync ? new Date(syncMeta.lastUserSync) : null,
            syncMeta.lastChannelSync ? new Date(syncMeta.lastChannelSync) : null,
            syncMeta.lastMessageSync ? new Date(syncMeta.lastMessageSync) : null
          )
        }
      } catch {
        // 未ログイン状態
      }
    }
    checkAuth()
  }, [setAuth, setUsers, setChannels, setCategories, setSyncMeta])

  if (!isLoggedIn) {
    return (
      <div className="relative h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,_rgba(229,9,20,0.22),transparent_56%)]" />
          <div className="absolute -left-32 top-28 h-80 w-80 rounded-full bg-primary/18 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px]" />
        </div>
        <div className="relative z-10 h-full">
          <LoginScreen />
          <ErrorToast />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground selection:bg-primary/15 selection:text-foreground antialiased">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(229,9,20,0.18),transparent_60%)]" />
        <div className="absolute -left-28 bottom-8 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px] opacity-50" />
      </div>
      <Header />
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="rounded-2xl border border-border/70 bg-card/85 px-5 py-3 text-sm text-muted-foreground shadow-[0_24px_70px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                画面を読み込んでいます...
              </div>
            </div>
          }
        >
          {activeTab === 'invite' && (
            <div className="flex flex-1 animate-in fade-in duration-500">
              <InviteView />
            </div>
          )}
          {activeTab === 'broadcast' && (
            <div className="flex flex-1 animate-in fade-in duration-500">
              <BroadcastView />
            </div>
          )}
          {activeTab === 'directMessage' && (
            <div className="flex flex-1 animate-in fade-in duration-500">
              <DirectMessageView />
            </div>
          )}
        </Suspense>
      </div>
      <ErrorToast />
    </div>
  )
}

export default App
