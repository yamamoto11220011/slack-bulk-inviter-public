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
      <div className="h-screen bg-background text-foreground bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-background to-background">
        <LoginScreen />
        <ErrorToast />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background selection:bg-blue-500/30 selection:text-blue-900 font-sans antialiased">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Suspense
          fallback={<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading...</div>}
        >
          {activeTab === 'invite' && (
            <div className="flex flex-1 animate-in fade-in duration-700">
              <InviteView />
            </div>
          )}
          {activeTab === 'broadcast' && (
            <div className="flex flex-1 animate-in fade-in duration-700">
              <BroadcastView />
            </div>
          )}
          {activeTab === 'directMessage' && (
            <div className="flex flex-1 animate-in fade-in duration-700">
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
