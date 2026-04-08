import { useState } from 'react'
import { useAppStore } from '../stores/app-store'

export function SyncStatus() {
  const {
    isSyncing,
    syncProgress,
    lastUserSync,
    lastChannelSync,
    lastMessageSync,
    setSyncing,
    setSyncProgress,
    setSyncMeta,
    setUsers,
    setChannels
  } = useAppStore()
  const [error, setError] = useState<string | null>(null)

  const handleSync = async (type: 'users' | 'channels' | 'all') => {
    setSyncing(true)
    setError(null)

    // 進捗リスナー登録
    const cleanup = window.api.onSyncProgress((data) => {
      setSyncProgress(data)
    })

    try {
      if (type === 'users' || type === 'all') {
        await window.api.syncUsers()
        const users = await window.api.getUsers()
        setUsers(users)
      }
      if (type === 'channels' || type === 'all') {
        await window.api.syncChannels()
        const channels = await window.api.getChannels()
        setChannels(channels)
      }
      // メタデータ更新
      const meta = await window.api.getSyncMeta()
      setSyncMeta(
        meta.lastUserSync ? new Date(meta.lastUserSync) : null,
        meta.lastChannelSync ? new Date(meta.lastChannelSync) : null,
        meta.lastMessageSync ? new Date(meta.lastMessageSync) : null
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '同期に失敗しました')
    } finally {
      setSyncing(false)
      setSyncProgress(null)
      cleanup()
    }
  }

  const formatDate = (date: Date | null) => {
    if (!date) return '未同期'
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="border-t border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          データ同期
        </h3>
        <button
          onClick={() => handleSync('all')}
          disabled={isSyncing}
          className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-accent/50 disabled:opacity-50"
        >
          {isSyncing ? '同期中...' : '全て同期'}
        </button>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>ユーザー</span>
          <span>{formatDate(lastUserSync)}</span>
        </div>
        <div className="flex justify-between">
          <span>チャンネル</span>
          <span>{formatDate(lastChannelSync)}</span>
        </div>
      </div>

      {isSyncing && syncProgress && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary animate-pulse w-2/3" />
          </div>
          <p className="text-xs text-muted-foreground">
            {syncProgress.type === 'users' ? 'ユーザー' : 'チャンネル'}: {syncProgress.count} 件取得中...
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-1">
        <button
          onClick={() => handleSync('users')}
          disabled={isSyncing}
          className="flex-1 rounded border border-border px-2 py-1 text-xs transition-colors hover:bg-accent/50 disabled:opacity-50"
        >
          ユーザー
        </button>
        <button
          onClick={() => handleSync('channels')}
          disabled={isSyncing}
          className="flex-1 rounded border border-border px-2 py-1 text-xs transition-colors hover:bg-accent/50 disabled:opacity-50"
        >
          チャンネル
        </button>
      </div>
    </div>
  )
}
