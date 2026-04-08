import { useMemo, useState } from 'react'
import { useAppStore } from '../stores/app-store'
import { useInvite } from '../hooks/useInvite'
import { ChannelPicker } from './ChannelPicker'
import { InviteConfirm } from './InviteConfirm'

export function InvitePanel() {
  const { selectedUserIds, selectedBroadcastChannelIds, channels, users, categories } = useAppStore()
  const { isInviting, inviteProgress, executeInvite, cancelInvite } = useInvite()
  const [showConfirm, setShowConfirm] = useState(false)
  const [result, setResult] = useState<{
    totalSucceeded: number
    totalFailed: number
    totalAlreadyInChannel: number
    cancelled: boolean
  } | null>(null)

  const selectedChannelIdSet = useMemo(
    () => new Set(selectedBroadcastChannelIds),
    [selectedBroadcastChannelIds]
  )

  const selectedChannels = useMemo(
    () => channels.filter((channel) => selectedChannelIdSet.has(channel.id)),
    [channels, selectedChannelIdSet]
  )

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIds.has(user.id)),
    [users, selectedUserIds]
  )

  const canInvite = selectedUserIds.size > 0 && selectedBroadcastChannelIds.length > 0 && !isInviting

  const handleInvite = async () => {
    if (selectedBroadcastChannelIds.length === 0) return
    setShowConfirm(false)
    const res = await executeInvite(selectedBroadcastChannelIds, Array.from(selectedUserIds))
    setResult(res)
  }

  const selectionSummary = () => {
    const summary: Record<string, number> = {}
    for (const user of selectedUsers) {
      const label = user.categoryId
        ? categories.find((category) => category.id === user.categoryId)?.label ?? '未分類'
        : '未分類'
      summary[label] = (summary[label] || 0) + 1
    }
    return summary
  }

  return (
    <div className="flex flex-col h-full bg-background selection:bg-blue-500/10">
      <div className="p-6 space-y-8">
        <header>
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
            Recruitment
          </h2>
          <h3 className="text-lg font-bold tracking-tight">チャンネル招待</h3>
        </header>

        <div className="space-y-6">
          <section className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              1. 送信先チャンネルを選択 (左の一覧から)
            </label>
            <ChannelPicker />
          </section>

          <section className="space-y-4 rounded-2xl bg-secondary/30 p-5 border border-border/50">
            <div className="flex justify-between items-baseline">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                2. 招待対象者
              </label>
              <div className="text-2xl font-black tabular-nums">
                {selectedUserIds.size} <span className="text-xs font-medium opacity-50">名</span>
              </div>
            </div>

            <button
              onClick={() => setShowConfirm(true)}
              disabled={!canInvite}
              className="w-full h-12 rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30 disabled:opacity-30 disabled:shadow-none transition-all active:scale-[0.98]"
            >
              🚀 チャンネルへの招待を実行
            </button>
          </section>

          {isInviting && inviteProgress && (
            <div className="space-y-3 p-4 rounded-xl border border-blue-500/20 bg-blue-50/30 animate-in fade-in">
              <div className="flex justify-between text-[10px] font-bold text-blue-700">
                <span>進行状況</span>
                <span>{inviteProgress.done} / {inviteProgress.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100 shadow-inner">
                <div
                  className="h-full bg-blue-600 shadow-lg shadow-blue-600/50 transition-all duration-300"
                  style={{ width: `${(inviteProgress.done / inviteProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-center font-medium truncate">
                {inviteProgress.channelName} に招待中...
              </p>
              <button
                onClick={() => void cancelInvite()}
                className="w-full text-[10px] text-red-600 font-bold hover:underline"
              >
                招待を中止
              </button>
            </div>
          )}

          {result && !isInviting && (
            <div className="rounded-xl border border-green-500/20 bg-green-50/30 p-4 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <p className="font-bold text-green-800">
                  {result.cancelled ? '招待を停止しました' : '招待が完了しました'}
                </p>
                <button
                  onClick={() => setResult(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <span className="text-lg">×</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-tighter">
                <div className="bg-white/50 p-2 rounded-lg">
                  成功: <span className="text-green-600 text-sm">{result.totalSucceeded}</span>
                </div>
                <div className="bg-white/50 p-2 rounded-lg">
                  既入: <span className="text-blue-600 text-sm">{result.totalAlreadyInChannel}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <InviteConfirm
          userCount={selectedUserIds.size}
          channelNames={selectedChannels.map(
            (channel) => `${channel.isPrivate ? '🔒' : '#'} ${channel.name}`
          )}
          summary={selectionSummary()}
          onConfirm={handleInvite}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
