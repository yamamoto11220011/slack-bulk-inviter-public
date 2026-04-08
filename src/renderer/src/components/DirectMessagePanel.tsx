import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { UserFilter } from '../stores/app-store'
import { DirectMessageConfirm } from './DirectMessageConfirm'
import { getDisplayName } from '../lib/user-utils'

type User = {
  id: string
  name: string
  displayName: string
  realName: string
  avatarUrl: string
  categoryId: string | null
}

type Category = {
  id: string
  label: string
  type?: string
}

type UserStats = {
  allUserIds: string[]
  hasStudentIdUserIds: string[]
  uncategorizedUserIds: string[]
  categoryUserIds: Record<string, string[]>
}

type DirectMessageProgressState = {
  done: number
  total: number
  success: number
  fail: number
  userLabel: string | null
}

interface Props {
  users: User[]
  categories: Category[]
  userStats: UserStats
  activeCategoryFilter: UserFilter
  selectedUserIds: Set<string>
  onSelectUsers: (userIds: string[]) => void
  onDeselectUsers: (userIds: string[]) => void
  setSelectedUserIds: (userIds: string[]) => void
  removeSelectedUser: (userId: string) => void
  clearSelectedUsers: () => void
}

export function DirectMessagePanel({
  users,
  categories,
  userStats,
  activeCategoryFilter,
  selectedUserIds,
  onSelectUsers,
  onDeselectUsers,
  setSelectedUserIds,
  removeSelectedUser,
  clearSelectedUsers
}: Props) {
  const [excludeChannelInput, setExcludeChannelInput] = useState('')
  const [isBuildingAudience, setIsBuildingAudience] = useState(false)
  const [audienceError, setAudienceError] = useState<string | null>(null)
  const [audienceSummary, setAudienceSummary] = useState<{
    channelName: string | null
    channelId: string
    sourceCount: number
    targetCount: number
    excludedCount: number
  } | null>(null)

  const [dmMessage, setDmMessage] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDirectMessaging, setIsDirectMessaging] = useState(false)
  const [dmError, setDmError] = useState<string | null>(null)
  const [dmProgress, setDmProgress] = useState<DirectMessageProgressState | null>(null)
  const [dmResult, setDmResult] = useState<{
    totalSucceeded: number
    totalFailed: number
    cancelled: boolean
  } | null>(null)

  useEffect(() => {
    const cleanup = window.api.onDirectMessageProgress((data) => {
      const user = users.find((item) => item.id === data.userId)
      setDmProgress({
        done: data.done,
        total: data.total,
        success: data.success,
        fail: data.fail,
        userLabel: user ? getDisplayName(user) : data.userId
      })
    })
    return cleanup
  }, [users])

  const currentFilterLabel = useMemo(() => {
    if (activeCategoryFilter === null) return '全員'
    if (activeCategoryFilter === '__has_student_id__') return '学籍番号あり'
    if (activeCategoryFilter === '__uncategorized__') return '未分類'
    return categories.find((category) => category.id === activeCategoryFilter)?.label ?? activeCategoryFilter
  }, [activeCategoryFilter, categories])

  const filteredCandidateIds = useMemo(() => {
    if (activeCategoryFilter === null) return userStats.allUserIds
    if (activeCategoryFilter === '__has_student_id__') return userStats.hasStudentIdUserIds
    if (activeCategoryFilter === '__uncategorized__') return userStats.uncategorizedUserIds
    return userStats.categoryUserIds[activeCategoryFilter] || []
  }, [activeCategoryFilter, userStats])

  const sourceUserIds = useMemo(
    () => (selectedUserIds.size > 0 ? Array.from(selectedUserIds) : filteredCandidateIds),
    [filteredCandidateIds, selectedUserIds]
  )

  const sourceDescription = selectedUserIds.size > 0
    ? `現在の選択中 ${selectedUserIds.size} 名`
    : `${currentFilterLabel} の ${filteredCandidateIds.length} 名`

  const categoryLabelMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.label])),
    [categories]
  )

  const selectedUsers = useMemo(
    () =>
      users
        .filter((user) => selectedUserIds.has(user.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [users, selectedUserIds]
  )

  const uncategorizedUsers = useMemo(
    () => selectedUsers.filter((user) => !user.categoryId),
    [selectedUsers]
  )

  const canBuildAudience =
    sourceUserIds.length > 0 && excludeChannelInput.trim().length > 0 && !isBuildingAudience
  const canDirectMessage =
    selectedUserIds.size > 0 && dmMessage.trim().length > 0 && !isDirectMessaging

  const handleCategoryToggle = (categoryId: string) => {
    const userIds = userStats.categoryUserIds[categoryId] || []
    const allSelected = userIds.length > 0 && userIds.every((userId) => selectedUserIds.has(userId))
    if (allSelected) {
      onDeselectUsers(userIds)
    } else {
      onSelectUsers(userIds)
    }
  }

  const handleBuildAudience = async () => {
    if (!canBuildAudience) return

    setIsBuildingAudience(true)
    setAudienceError(null)
    setAudienceSummary(null)

    try {
      const summary = await window.api.excludeChannelMembers(
        sourceUserIds,
        excludeChannelInput.trim()
      )
      setSelectedUserIds(summary.selectedUserIds)
      setAudienceSummary({
        channelName: summary.channelName,
        channelId: summary.channelId,
        sourceCount: summary.sourceCount,
        targetCount: summary.targetCount,
        excludedCount: summary.excludedCount
      })
    } catch (error) {
      setAudienceError(error instanceof Error ? error.message : '対象抽出に失敗しました')
    } finally {
      setIsBuildingAudience(false)
    }
  }

  const handleDirectMessage = async () => {
    if (!canDirectMessage) return

    setIsDirectMessaging(true)
    setDmError(null)
    setDmResult(null)
    setDmProgress({
      done: 0,
      total: selectedUserIds.size,
      success: 0,
      fail: 0,
      userLabel: null
    })

    try {
      const response = await window.api.executeDirectMessage(
        Array.from(selectedUserIds),
        dmMessage.trim()
      )
      setDmResult({
        totalSucceeded: response.totalSucceeded,
        totalFailed: response.totalFailed,
        cancelled: response.cancelled
      })
      setShowConfirm(false)
    } catch (error) {
      setDmError(error instanceof Error ? error.message : 'DM送信に失敗しました')
    } finally {
      setIsDirectMessaging(false)
      setDmProgress(null)
    }
  }

  return (
    <div className="flex flex-col rounded-3xl border border-border/70 bg-card shadow-[0_24px_70px_-46px_rgba(0,0,0,0.82)]">
      <div className="p-6 space-y-6">
        <header className="text-center space-y-2">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground/60">
            Direct Message
          </h2>
          <h3 className="text-2xl font-bold tracking-tight">カテゴリ選択と安全確認</h3>
          <p className="text-sm text-muted-foreground">
            学籍番号がないユーザーは自動でDM対象から除外されています。
          </p>
        </header>

        <section className="space-y-4 rounded-[1.8rem] border border-border/70 bg-[#0e0e0e] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              1. カテゴリで一括選択
            </label>
            <p className="text-xs text-muted-foreground">
              2025年春入学や N / S / R 校など、送りたいカテゴリをチェックすると全員選択されます。
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {categories.map((category) => {
              const userIds = userStats.categoryUserIds[category.id] || []
              const selectedCount = userIds.filter((userId) => selectedUserIds.has(userId)).length
              const allSelected = userIds.length > 0 && selectedCount === userIds.length

              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryToggle(category.id)}
                  className={`group flex items-center justify-between rounded-[1.35rem] border px-5 py-4 text-left transition-all ${
                    allSelected
                      ? 'border-[#7a1016] bg-[linear-gradient(180deg,rgba(46,7,10,0.88),rgba(18,18,18,0.98))] text-foreground shadow-[0_24px_50px_-28px_rgba(229,9,20,0.34)]'
                      : 'border-[#2d2d2d] bg-[#101010] hover:border-[#4a1418] hover:bg-[#151515]'
                  }`}
                >
                  <div>
                    <div className={`text-sm font-semibold tracking-tight ${allSelected ? 'text-white' : 'text-foreground'}`}>
                      {category.label}
                    </div>
                    <div className={`mt-1 text-[11px] ${allSelected ? 'text-zinc-300' : 'text-muted-foreground'}`}>
                      {selectedCount} / {userIds.length} 選択中
                    </div>
                  </div>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-black transition-all ${
                      allSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_20px_rgba(229,9,20,0.45)]'
                        : 'border-[#343434] text-zinc-500 group-hover:border-[#585858]'
                    }`}
                  >
                    {allSelected ? <Check size={12} /> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-4 rounded-[1.8rem] border border-border/70 bg-[#0e0e0e] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              2. 未参加者だけを抽出
            </label>
            <p className="text-xs text-muted-foreground">
              すでに選んだ人たち、または左の表示フィルター対象から、指定チャンネルに入っていない人だけへ絞ります。
            </p>
          </div>

          <div className="rounded-[1.2rem] border border-[#4d1418] bg-[linear-gradient(180deg,rgba(48,8,11,0.76),rgba(16,16,16,0.96))] p-3 text-xs text-zinc-100">
            現在の抽出元: <span className="font-bold">{sourceDescription}</span>
          </div>

          <input
            type="text"
            value={excludeChannelInput}
            onChange={(event) => setExcludeChannelInput(event.target.value)}
            placeholder="例: https://app.slack.com/client/T.../C08G6PS153M"
            className="w-full rounded-[1.2rem] border border-[#2f2f2f] bg-[#121212] px-3 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-ring"
          />

          <button
            onClick={handleBuildAudience}
            disabled={!canBuildAudience}
            className="w-full h-12 rounded-[1.2rem] border border-[#5d151a] bg-[#151515] text-sm font-semibold text-white transition-all hover:border-primary hover:bg-[linear-gradient(180deg,rgba(55,8,12,0.92),rgba(21,21,21,0.98))] disabled:opacity-40"
          >
            {isBuildingAudience ? '抽出中...' : 'この条件で未参加者だけ残す'}
          </button>

          {audienceSummary && (
            <div className="space-y-2 rounded-[1.2rem] border border-[#5d151a] bg-[linear-gradient(180deg,rgba(55,8,12,0.88),rgba(17,17,17,0.98))] p-4 text-xs">
              <p className="font-bold text-white">
                {audienceSummary.channelName
                  ? `#${audienceSummary.channelName} の所属を除外しました`
                  : audienceSummary.channelId}
              </p>
              <div className="grid grid-cols-3 gap-2 text-[10px] font-bold uppercase tracking-tight">
                <div className="rounded-xl bg-black/24 p-2">
                  母数: <span className="text-sm">{audienceSummary.sourceCount}</span>
                </div>
                <div className="rounded-xl bg-black/24 p-2">
                  除外: <span className="text-sm">{audienceSummary.excludedCount}</span>
                </div>
                <div className="rounded-xl bg-black/24 p-2">
                  対象: <span className="text-sm">{audienceSummary.targetCount}</span>
                </div>
              </div>
            </div>
          )}

          {audienceError && (
            <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {audienceError}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-[1.8rem] border border-border/70 bg-[#0e0e0e] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                3. 送信対象の可視化
              </label>
              <p className="text-xs text-muted-foreground">
                間違い防止のため、ここで最終対象を確認して不要なユーザーは個別に外せます。
              </p>
            </div>
            <button
              onClick={clearSelectedUsers}
              disabled={selectedUsers.length === 0}
              className="rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              全解除
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[10px] font-bold uppercase tracking-[0.14em] md:grid-cols-4">
            <div className="rounded-[1.1rem] border border-[#232323] bg-[#141414] p-3 text-zinc-200">
              選択中: <span className="text-sm">{selectedUsers.length}</span>
            </div>
            <div className="rounded-[1.1rem] border border-[#232323] bg-[#141414] p-3 text-zinc-200">
              分類済み: <span className="text-sm">{selectedUsers.length - uncategorizedUsers.length}</span>
            </div>
            <div className="rounded-[1.1rem] border border-[#4d3a10] bg-[#17130b] p-3 text-amber-200">
              未分類: <span className="text-sm">{uncategorizedUsers.length}</span>
            </div>
            <div className="rounded-[1.1rem] border border-[#4d1418] bg-[#170b0c] p-3 text-red-100">
              表示フィルター: <span className="text-sm">{currentFilterLabel}</span>
            </div>
          </div>

          {uncategorizedUsers.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
              未分類ユーザーが含まれています。送信前に本当に対象者か確認してください。
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-xl border border-border bg-background/92">
            {selectedUsers.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                まだ対象が選ばれていません。
              </div>
            ) : (
              selectedUsers.map((user) => {
                const categoryLabel = user.categoryId
                  ? categoryLabelMap.get(user.categoryId) ?? user.categoryId
                  : '未分類'

                return (
                  <div
                    key={user.id}
                    className={`flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 ${
                      user.categoryId ? 'bg-background/70' : 'bg-amber-500/10'
                    }`}
                  >
                    {user.avatarUrl && (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full border border-border/50 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{getDisplayName(user)}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {user.name || '-'} / {categoryLabel}
                      </div>
                    </div>
                    {!user.categoryId && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                        未分類
                      </span>
                    )}
                    <button
                      onClick={() => removeSelectedUser(user.id)}
                      className="rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-accent"
                    >
                      除外
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border/60 bg-background p-5">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              4. DM本文
            </label>
            <p className="text-xs text-muted-foreground">
              送信前に対象一覧つきの最終確認ダイアログが開きます。
            </p>
          </div>

          <textarea
            value={dmMessage}
            onChange={(event) => setDmMessage(event.target.value)}
            placeholder="送信したいDM本文を入力..."
            className="min-h-32 w-full rounded-xl border border-input bg-background/92 px-3 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />

          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canDirectMessage}
            className="w-full h-12 rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-[0_24px_50px_-30px_rgba(229,9,20,0.6)] hover:bg-[#f6121d] disabled:opacity-40 transition-all"
          >
            送信対象を確認してDM送信
          </button>

          {isDirectMessaging && dmProgress && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/10 p-4 animate-in fade-in">
              <div className="flex justify-between text-[10px] font-bold text-primary-foreground">
                <span>進行状況</span>
                <span>
                  {dmProgress.done} / {dmProgress.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 shadow-inner">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${dmProgress.total > 0 ? (dmProgress.done / dmProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-center font-medium truncate">
                {dmProgress.userLabel ? `${dmProgress.userLabel} に送信中...` : 'DMを送信中...'}
              </p>
              <button
                onClick={() => void window.api.cancelDirectMessage()}
                className="w-full text-[10px] text-red-600 font-bold hover:underline"
              >
                送信を中止
              </button>
            </div>
          )}

          {dmResult && !isDirectMessaging && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <p className="font-bold text-primary-foreground">
                  {dmResult.cancelled ? 'DM送信を停止しました' : 'DM送信が完了しました'}
                </p>
                <button
                  onClick={() => setDmResult(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <span className="text-lg">×</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-tighter">
                <div className="rounded-lg bg-black/20 p-2">
                  成功: <span className="text-primary-foreground text-sm">{dmResult.totalSucceeded}</span>
                </div>
                <div className="rounded-lg bg-black/20 p-2">
                  失敗: <span className="text-red-300 text-sm">{dmResult.totalFailed}</span>
                </div>
              </div>
            </div>
          )}

          {dmError && (
            <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {dmError}
            </div>
          )}
        </section>
      </div>

      {showConfirm && (
        <DirectMessageConfirm
          selectedUsers={selectedUsers}
          categories={categories}
          message={dmMessage.trim()}
          onConfirm={handleDirectMessage}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
