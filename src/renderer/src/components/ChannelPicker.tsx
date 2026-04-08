import { Hash, LockKeyhole, RefreshCw } from 'lucide-react'
import { useState, useMemo, useDeferredValue } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../stores/app-store'

export function ChannelPicker() {
  const { channels, selectedBroadcastChannelIds, toggleBroadcastChannel, selectAllBroadcastChannels, clearBroadcastChannels, setChannels, setSyncProgress, setSyncMeta } = useAppStore(useShallow(state => ({
    channels: state.channels,
    selectedBroadcastChannelIds: state.selectedBroadcastChannelIds,
    toggleBroadcastChannel: state.toggleBroadcastChannel,
    selectAllBroadcastChannels: state.selectAllBroadcastChannels,
    clearBroadcastChannels: state.clearBroadcastChannels,
    setChannels: state.setChannels,
    setSyncProgress: state.setSyncProgress,
    setSyncMeta: state.setSyncMeta
  })))
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [isSyncing, setIsSyncing] = useState(false)
  const selectedChannelIdSet = useMemo(
    () => new Set(selectedBroadcastChannelIds),
    [selectedBroadcastChannelIds]
  )

  const handleSync = async () => {
    setIsSyncing(true)
    const cleanup = window.api.onSyncProgress((data: any) => {
      setSyncProgress(data)
    })
    try {
      await window.api.syncChannels()
      const newChannels = await window.api.getChannels()
      setChannels(newChannels)
      const meta = await window.api.getSyncMeta()
      setSyncMeta(
        meta.lastUserSync ? new Date(meta.lastUserSync) : null,
        meta.lastChannelSync ? new Date(meta.lastChannelSync) : null,
        meta.lastMessageSync ? new Date(meta.lastMessageSync) : null
      )
    } catch (err) {
      console.error('Failed to sync channels:', err)
    } finally {
      setIsSyncing(false)
      setSyncProgress(null)
      cleanup()
    }
  }


  const allChannels = useMemo(() =>
    [...channels]
      .sort((a, b) => a.name.localeCompare(b.name)),
    [channels]
  )
  const memberChannelsCount = useMemo(() => channels.filter(c => c.isMember).length, [channels])

  const filtered = useMemo(() => {
    let list = allChannels
    if (deferredSearch) {
      const q = deferredSearch.toLowerCase()
      list = list.filter((c) => c.name.toLowerCase().includes(q))
    }
    return list
  }, [allChannels, deferredSearch])

  const renderedChannels = useMemo(() => {
    if (filtered.length === 0) {
      return (
        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
          {channels.length === 0 ? 'チャンネルデータがありません' : '見つかりません'}
        </div>
      )
    }

    return filtered.slice(0, 100).map((channel) => {
      const checked = selectedChannelIdSet.has(channel.id)
      return (
        <label
          key={channel.id}
          className={`flex cursor-pointer items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm transition-all hover:border-border/60 hover:bg-accent/45 ${!channel.isMember ? 'opacity-60' : ''}`}
        >
          <div className="flex flex-col">
            <span className="flex items-center gap-2">
              {channel.isPrivate ? <LockKeyhole size={14} className="text-muted-foreground" /> : <Hash size={14} className="text-muted-foreground" />}
              {channel.name}
              {!channel.isMember && (
                <span className="ml-1 text-[8px] font-bold uppercase bg-muted px-1 rounded text-muted-foreground">
                  未参加
                </span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">
              メンバー: {channel.memberCount}人
            </span>
          </div>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleBroadcastChannel(channel.id)}
            className="rounded"
          />
        </label>
      )
    })
  }, [filtered, selectedChannelIdSet, toggleBroadcastChannel])

  const allSelected = allChannels.length > 0 && selectedBroadcastChannelIds.length === allChannels.length

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          送信先チャンネル
        </h3>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/75 px-3 py-1.5 text-[10px] font-semibold text-primary transition-all hover:bg-background disabled:opacity-50"
        >
          <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? '同期中...' : '同期'}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{selectedBroadcastChannelIds.length} / {allChannels.length} 件選択中 (参加済み: {memberChannelsCount})</span>
        <div className="flex gap-2">
          {!allSelected && (
            <button onClick={selectAllBroadcastChannels} className="hover:text-foreground font-medium text-primary">
              全選択
            </button>
          )}
          {selectedBroadcastChannelIds.length > 0 && (
            <button onClick={clearBroadcastChannels} className="hover:text-foreground">
              クリア
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="チャンネルを検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="flex h-10 w-full rounded-xl border border-input bg-background/75 px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="relative max-h-56 overflow-auto rounded-2xl border border-border/70 bg-background/55">
        {search !== deferredSearch && (
            <div className="absolute inset-0 bg-background/50 animate-pulse z-10" />
        )}
        {renderedChannels}
      </div>
    </div>
  )
}
