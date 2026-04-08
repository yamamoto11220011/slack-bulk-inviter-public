import { useEffect, useMemo, useState } from 'react'
import type {
  CsvInviteImportResult,
  InvitePreviewResult,
  InviteRunRecord
} from '../../../core/types'
import { useAppStore } from '../stores/app-store'
import { useInvite } from '../hooks/useInvite'
import { ChannelPicker } from './ChannelPicker'

type PanelTab = 'execute' | 'history'
type PinDialogMode = 'setup' | 'execute' | null

interface ExecutionRequest {
  channelIds: string[]
  userIds: string[]
  csvFileName: string | null
}

function buildSelectionKey(channelIds: string[], userIds: string[], csvFileName: string | null): string {
  return JSON.stringify({
    channelIds: [...channelIds].sort(),
    userIds: [...userIds].sort(),
    csvFileName: csvFileName ?? null
  })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getRunTone(record: InviteRunRecord): string {
  if (record.status === 'failed') return 'border-red-500/25 bg-red-500/10 text-red-200'
  if (record.status === 'cancelled') return 'border-amber-500/20 bg-amber-500/10 text-amber-200'
  if (record.mode === 'dry-run') return 'border-zinc-500/25 bg-zinc-500/10 text-zinc-200'
  return 'border-primary/25 bg-primary/10 text-primary-foreground'
}

function getLogTone(status: InviteRunRecord['logs'][number]['status']): string {
  if (status === 'failed') return 'text-red-300'
  if (status === 'already_in_channel') return 'text-zinc-300'
  if (status === 'planned') return 'text-amber-200'
  return 'text-primary-foreground'
}

export function InvitePanel() {
  const {
    selectedUserIds,
    selectedBroadcastChannelIds,
    channels,
    users,
    categories,
    setSelectedUsers,
    setSelectedBroadcastChannels
  } = useAppStore()
  const { isInviting, inviteProgress, executeInvite, dryRunInvite, cancelInvite } = useInvite()

  const [activeTab, setActiveTab] = useState<PanelTab>('execute')
  const [inviteHistory, setInviteHistory] = useState<InviteRunRecord[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [importedCsv, setImportedCsv] = useState<CsvInviteImportResult | null>(null)
  const [preview, setPreview] = useState<InvitePreviewResult | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [adminConfigured, setAdminConfigured] = useState(false)
  const [showPinDialog, setShowPinDialog] = useState<PinDialogMode>(null)
  const [adminPin, setAdminPin] = useState('')
  const [adminPinConfirm, setAdminPinConfirm] = useState('')
  const [pendingExecution, setPendingExecution] = useState<ExecutionRequest | null>(null)
  const [lastRun, setLastRun] = useState<InviteRunRecord | null>(null)
  const [isSubmittingPin, setIsSubmittingPin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedUserIdList = useMemo(() => Array.from(selectedUserIds), [selectedUserIds])
  const selectedChannelIdSet = useMemo(
    () => new Set(selectedBroadcastChannelIds),
    [selectedBroadcastChannelIds]
  )
  const selectedChannels = useMemo(
    () => channels.filter((channel) => selectedChannelIdSet.has(channel.id)),
    [channels, selectedChannelIdSet]
  )
  const selectedUserIdSet = useMemo(() => new Set(selectedUserIdList), [selectedUserIdList])
  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIdSet.has(user.id)),
    [users, selectedUserIdSet]
  )
  const selectionKey = useMemo(
    () => buildSelectionKey(selectedBroadcastChannelIds, selectedUserIdList, importedCsv?.fileName ?? null),
    [selectedBroadcastChannelIds, selectedUserIdList, importedCsv?.fileName]
  )
  const previewIsCurrent = previewKey === selectionKey
  const canPreview =
    selectedUserIdList.length > 0 && selectedBroadcastChannelIds.length > 0 && !previewLoading && !isInviting
  const canExecute =
    !!preview && previewIsCurrent && preview.totalInvitable > 0 && !previewLoading && !isInviting

  const selectionSummary = useMemo(() => {
    const summary: Record<string, number> = {}
    for (const user of selectedUsers) {
      const label = user.categoryId
        ? categories.find((category) => category.id === user.categoryId)?.label ?? '未分類'
        : '未分類'
      summary[label] = (summary[label] || 0) + 1
    }
    return summary
  }, [categories, selectedUsers])

  const historyDetail = useMemo(
    () => inviteHistory.find((item) => item.id === selectedHistoryId) ?? inviteHistory[0] ?? null,
    [inviteHistory, selectedHistoryId]
  )

  const currentExecutionRequest = useMemo<ExecutionRequest>(
    () => ({
      channelIds: [...selectedBroadcastChannelIds],
      userIds: [...selectedUserIdList],
      csvFileName: importedCsv?.fileName ?? null
    }),
    [importedCsv?.fileName, selectedBroadcastChannelIds, selectedUserIdList]
  )

  const loadHistory = async (preferredId?: string) => {
    setHistoryLoading(true)
    try {
      const history = await window.api.listInviteHistory()
      setInviteHistory(history)
      if (history.length > 0) {
        setSelectedHistoryId(preferredId ?? history[0].id)
      } else {
        setSelectedHistoryId(null)
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadAdminStatus = async () => {
    const status = await window.api.getInviteAdminStatus()
    setAdminConfigured(status.configured)
  }

  useEffect(() => {
    void loadHistory()
    void loadAdminStatus()
  }, [])

  const handleImportCsv = async () => {
    setError(null)
    setNotice(null)
    const result = await window.api.importInviteCsv()
    if (!result.filePath) return

    setImportedCsv(result)
    setSelectedUsers(result.matchedUserIds)
    setPreview(null)
    setPreviewKey(null)

    if (result.matchedCount === 0) {
      setError('CSVから一致するユーザーを見つけられませんでした。Slack user ID か識別子の列を確認してください。')
      return
    }

    setNotice(`CSVから ${result.matchedCount} 人を選択しました。実行前にプレビューを更新してください。`)
  }

  const handleGeneratePreview = async (
    request: ExecutionRequest = currentExecutionRequest
  ): Promise<InvitePreviewResult | null> => {
    if (request.channelIds.length === 0 || request.userIds.length === 0) return null

    setError(null)
    setNotice(null)
    setPreviewLoading(true)
    try {
      const nextPreview = await window.api.previewInvite(request.channelIds, request.userIds)
      setPreview(nextPreview)
      setPreviewKey(buildSelectionKey(request.channelIds, request.userIds, request.csvFileName))
      return nextPreview
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プレビューの生成に失敗しました。')
      return null
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDryRun = async () => {
    if (!canPreview) return

    setError(null)
    setNotice(null)
    try {
      const record = await dryRunInvite(
        currentExecutionRequest.channelIds,
        currentExecutionRequest.userIds,
        currentExecutionRequest.csvFileName
      )
      setPreview(record.preview)
      setPreviewKey(selectionKey)
      setLastRun(record)
      await loadHistory(record.id)
      setActiveTab('history')
      setNotice('dry-run を保存しました。履歴から結果を確認できます。')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'dry-run の保存に失敗しました。')
    }
  }

  const requestExecution = async (request: ExecutionRequest) => {
    if (request.channelIds.length === 0 || request.userIds.length === 0) return

    const requestKey = buildSelectionKey(request.channelIds, request.userIds, request.csvFileName)
    if (!preview || previewKey !== requestKey) {
      const generated = await handleGeneratePreview(request)
      if (!generated) return
    }

    setPendingExecution(request)
    setAdminPin('')
    setAdminPinConfirm('')
    setShowPinDialog(adminConfigured ? 'execute' : 'setup')
  }

  const executePendingRequest = async (pin: string) => {
    if (!pendingExecution) return

    setError(null)
    setNotice(null)
    try {
      const record = await executeInvite(
        pendingExecution.channelIds,
        pendingExecution.userIds,
        pin,
        pendingExecution.csvFileName
      )
      setLastRun(record)
      setPreview(record.preview)
      setPreviewKey(
        buildSelectionKey(
          pendingExecution.channelIds,
          pendingExecution.userIds,
          pendingExecution.csvFileName
        )
      )
      await loadHistory(record.id)
      setActiveTab('history')
      setNotice('招待履歴を保存しました。履歴から再実行もできます。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待の実行に失敗しました。')
    } finally {
      setPendingExecution(null)
    }
  }

  const handlePinSubmit = async () => {
    if (!showPinDialog) return

    setIsSubmittingPin(true)
    try {
      if (showPinDialog === 'setup') {
        if (adminPin.trim().length < 4) {
          throw new Error('管理者PINは4文字以上で設定してください。')
        }
        if (adminPin !== adminPinConfirm) {
          throw new Error('確認用PINが一致しません。')
        }
        await window.api.setInviteAdminPin(adminPin)
        setAdminConfigured(true)
        await executePendingRequest(adminPin)
      } else {
        await executePendingRequest(adminPin)
      }

      setShowPinDialog(null)
      setAdminPin('')
      setAdminPinConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '管理者PINの確認に失敗しました。')
    } finally {
      setIsSubmittingPin(false)
    }
  }

  const createImportedCsvStateFromHistory = (
    record: InviteRunRecord,
    validUserIds: string[]
  ): CsvInviteImportResult | null => {
    if (!record.csvFileName) return null
    return {
      filePath: null,
      fileName: record.csvFileName,
      columnName: null,
      parsedCount: record.userIds.length,
      matchedCount: validUserIds.length,
      duplicateCount: 0,
      matchedUserIds: validUserIds,
      unmatchedValues: []
    }
  }

  const restoreHistorySelection = (record: InviteRunRecord) => {
    const validChannelIds = record.channelIds.filter((channelId) =>
      channels.some((channel) => channel.id === channelId)
    )
    const validUserIds = record.userIds.filter((userId) => users.some((user) => user.id === userId))

    setSelectedBroadcastChannels(validChannelIds)
    setSelectedUsers(validUserIds)
    setImportedCsv(createImportedCsvStateFromHistory(record, validUserIds))
    setPreview(record.preview)
    setPreviewKey(null)
    setActiveTab('execute')
    setNotice('履歴の設定を復元しました。実行前にプレビューを更新してください。')
  }

  const handleRerunHistory = async (record: InviteRunRecord) => {
    const validChannelIds = record.channelIds.filter((channelId) =>
      channels.some((channel) => channel.id === channelId)
    )
    const validUserIds = record.userIds.filter((userId) => users.some((user) => user.id === userId))

    if (validChannelIds.length === 0 || validUserIds.length === 0) {
      setError('履歴の再実行に必要なユーザーまたはチャンネルが現在のデータに見つかりません。')
      return
    }

    setSelectedBroadcastChannels(validChannelIds)
    setSelectedUsers(validUserIds)
    setImportedCsv(createImportedCsvStateFromHistory(record, validUserIds))
    setActiveTab('execute')
    const request = {
      channelIds: validChannelIds,
      userIds: validUserIds,
      csvFileName: record.csvFileName
    }
    const generated = await handleGeneratePreview(request)
    if (!generated) return

    setPendingExecution(request)
    setAdminPin('')
    setAdminPinConfirm('')
    setShowPinDialog(adminConfigured ? 'execute' : 'setup')
  }

  return (
    <div className="flex h-full flex-col bg-background/50">
      <div className="border-b border-border/70 px-5 py-4">
        <div className="mb-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground/60">
            Invite Admin
          </h2>
          <h3 className="text-lg font-bold tracking-tight">招待管理</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-1">
          <button
            onClick={() => setActiveTab('execute')}
            className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
              activeTab === 'execute' ? 'bg-card text-foreground shadow-[0_18px_36px_-28px_rgba(0,0,0,0.85)]' : 'text-muted-foreground'
            }`}
          >
            実行
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
              activeTab === 'history' ? 'bg-card text-foreground shadow-[0_18px_36px_-28px_rgba(0,0,0,0.85)]' : 'text-muted-foreground'
            }`}
          >
            履歴
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-5">
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary-foreground">
            {notice}
          </div>
        )}

        {activeTab === 'execute' ? (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                  1. 送信先チャンネル
                </label>
                <span className="text-xs text-muted-foreground">
                  {selectedBroadcastChannelIds.length} 件選択
                </span>
              </div>
              <ChannelPicker />
            </section>

            <section className="space-y-4 rounded-2xl border border-border/60 bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    2. 招待対象
                  </p>
                  <p className="text-sm font-semibold">左の一覧の選択を使うか、CSV で一括選択</p>
                </div>
                <button
                  onClick={() => void handleImportCsv()}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-accent"
                >
                  CSVアップロード
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-background/90 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    選択中ユーザー
                  </div>
                  <div className="mt-2 text-2xl font-black tabular-nums">
                    {selectedUserIdList.length}
                    <span className="ml-1 text-xs font-medium text-muted-foreground">人</span>
                  </div>
                </div>
                <div className="rounded-xl bg-background/90 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    カテゴリ数
                  </div>
                  <div className="mt-2 text-2xl font-black tabular-nums">
                    {Object.keys(selectionSummary).length}
                    <span className="ml-1 text-xs font-medium text-muted-foreground">分類</span>
                  </div>
                </div>
              </div>

              {importedCsv && (
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary-foreground">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{importedCsv.fileName}</p>
                      <p className="text-xs text-primary-foreground/70">
                        {importedCsv.columnName ? `列: ${importedCsv.columnName}` : '先頭列を使用'}
                      </p>
                    </div>
                    <button
                      onClick={() => setImportedCsv(null)}
                      className="text-xs font-bold text-primary-foreground/80 hover:underline"
                    >
                      CSV情報を閉じる
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-black/20 p-2">一致: {importedCsv.matchedCount}</div>
                    <div className="rounded-lg bg-black/20 p-2">重複: {importedCsv.duplicateCount}</div>
                    <div className="rounded-lg bg-black/20 p-2">未一致: {importedCsv.unmatchedValues.length}</div>
                  </div>
                  {importedCsv.unmatchedValues.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-bold">未一致の値</p>
                      <div className="max-h-24 overflow-auto rounded-lg border border-primary/20 bg-black/20 p-2 text-xs">
                        {importedCsv.unmatchedValues.slice(0, 30).map((value) => (
                          <div key={value}>{value}</div>
                        ))}
                        {importedCsv.unmatchedValues.length > 30 && (
                          <div className="text-muted-foreground">
                            他 {importedCsv.unmatchedValues.length - 30} 件
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedUsers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground">選択中ユーザーの一部</p>
                  <div className="max-h-28 overflow-auto rounded-xl border border-border bg-background/90 p-3">
                    {selectedUsers.slice(0, 8).map((user) => (
                      <div key={user.id} className="flex items-center justify-between py-1 text-sm">
                        <span className="truncate font-medium">
                          {user.displayName || user.realName || user.name}
                        </span>
                        <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                          {user.name}
                        </span>
                      </div>
                    ))}
                    {selectedUsers.length > 8 && (
                      <div className="pt-2 text-xs text-muted-foreground">
                        他 {selectedUsers.length - 8} 人
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-border/60 bg-card/90 p-4 shadow-[0_20px_60px_-46px_rgba(0,0,0,0.8)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    3. 実行前プレビュー
                  </p>
                  <p className="text-sm font-semibold">本番招待の前に、既入メンバーを確認</p>
                </div>
                <button
                  onClick={() => void handleGeneratePreview()}
                  disabled={!canPreview}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {previewLoading ? '生成中...' : 'プレビュー生成'}
                </button>
              </div>

              {preview ? (
                <div className={`space-y-3 ${previewIsCurrent ? '' : 'opacity-80'}`}>
                  {!previewIsCurrent && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      選択内容が変わったため、プレビューを更新してください。
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-background/92 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                        総対象
                      </div>
                      <div className="mt-1 text-xl font-black">{preview.totalRequested}</div>
                    </div>
                    <div className="rounded-xl bg-background/92 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                        招待見込み
                      </div>
                      <div className="mt-1 text-xl font-black text-primary">
                        {preview.totalInvitable}
                      </div>
                    </div>
                    <div className="rounded-xl bg-background/92 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                        既入メンバー
                      </div>
                      <div className="mt-1 text-xl font-black text-zinc-200">
                        {preview.totalAlreadyInChannel}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-44 overflow-auto rounded-xl border border-border bg-background/92">
                    {preview.channelResults.map((channelResult) => (
                      <div
                        key={channelResult.channelId}
                        className="grid grid-cols-[1.4fr,0.8fr,0.8fr] gap-3 border-b border-border/60 px-3 py-3 text-sm last:border-b-0"
                      >
                        <div className="truncate font-medium">
                          {channelResult.channelName ?? channelResult.channelId}
                        </div>
                        <div className="text-primary">
                          追加 {channelResult.invitableCount}
                        </div>
                        <div className="text-zinc-300">
                          既入 {channelResult.alreadyInChannelCount}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  プレビューを作ると、チャンネルごとの招待見込みと既入人数がここに表示されます。
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-border/60 bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    4. 実行
                  </p>
                  <p className="text-sm font-semibold">dry-run 保存、本実行、管理者PIN</p>
                </div>
                <button
                  onClick={() => setShowPinDialog('setup')}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-accent"
                >
                  {adminConfigured ? '管理者PINを更新' : '管理者PINを設定'}
                </button>
              </div>

              <div className="rounded-xl bg-background/90 p-3 text-sm">
                <span className="font-medium">管理者認証:</span>{' '}
                {adminConfigured ? '設定済み' : '未設定'}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => void handleDryRun()}
                  disabled={!canPreview}
                  className="rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  dry-run を保存
                </button>
                <button
                  onClick={() => void requestExecution(currentExecutionRequest)}
                  disabled={!canExecute}
                  className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-[0_22px_46px_-24px_rgba(229,9,20,0.56)] hover:bg-[#f6121d] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  本実行
                </button>
              </div>
            </section>

            {isInviting && inviteProgress && (
              <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/10 p-4">
                <div className="flex justify-between text-[10px] font-bold text-primary-foreground">
                  <span>進行状況</span>
                  <span>
                    {inviteProgress.done} / {inviteProgress.total}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/8 shadow-inner">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${inviteProgress.total > 0 ? (inviteProgress.done / inviteProgress.total) * 100 : 0}%`
                    }}
                  />
                </div>
                <p className="truncate text-center text-[10px] text-muted-foreground">
                  {inviteProgress.channelName} に招待中...
                </p>
                <button
                  onClick={() => void cancelInvite()}
                  className="w-full text-[10px] font-bold text-red-300 hover:underline"
                >
                  招待を中止
                </button>
              </div>
            )}

            {lastRun && (
              <div className={`rounded-xl border p-4 text-sm ${getRunTone(lastRun)}`}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-bold">
                    {lastRun.mode === 'dry-run' ? '最新 dry-run' : '最新の実行結果'}
                  </p>
                  <span className="text-xs">{formatDateTime(lastRun.createdAt)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-black/20 p-2">成功 {lastRun.summary.totalSucceeded}</div>
                    <div className="rounded-lg bg-black/20 p-2">失敗 {lastRun.summary.totalFailed}</div>
                    <div className="rounded-lg bg-black/20 p-2">
                    既入 {lastRun.summary.totalAlreadyInChannel}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">招待履歴</p>
                <button
                  onClick={() => void loadHistory(historyDetail?.id)}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  更新
                </button>
              </div>

              {historyLoading ? (
                <div className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  履歴を読み込み中...
                </div>
              ) : inviteHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  招待履歴はまだありません。
                </div>
              ) : (
                <div className="space-y-2">
                  {inviteHistory.map((record) => (
                    <button
                      key={record.id}
                      onClick={() => setSelectedHistoryId(record.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        historyDetail?.id === record.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-accent/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">
                          {record.mode === 'dry-run' ? 'dry-run' : '本実行'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(record.createdAt)}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{record.summary.requestedUsers} 人</span>
                        <span>{record.summary.requestedChannels} チャンネル</span>
                        <span>成功 {record.summary.totalSucceeded}</span>
                        <span>失敗 {record.summary.totalFailed}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {historyDetail && (
              <section className="space-y-4 rounded-2xl border border-border/60 bg-card/90 p-4 shadow-[0_20px_60px_-46px_rgba(0,0,0,0.8)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                      詳細
                    </p>
                    <p className="text-sm font-semibold">
                      {historyDetail.mode === 'dry-run' ? 'dry-run' : '本実行'} /{' '}
                      {formatDateTime(historyDetail.createdAt)}
                    </p>
                  </div>
                    <div className={`rounded-full px-3 py-1 text-xs font-bold ${getRunTone(historyDetail)}`}>
                      {historyDetail.status}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-secondary/30 p-2">
                    対象ユーザー {historyDetail.summary.requestedUsers}
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2">
                    チャンネル {historyDetail.summary.requestedChannels}
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2">
                    成功 {historyDetail.summary.totalSucceeded}
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2">
                    失敗 {historyDetail.summary.totalFailed}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground">チャンネル</p>
                  <div className="flex flex-wrap gap-2">
                    {historyDetail.channelNames.map((name) => (
                      <span key={name} className="rounded-full border border-border bg-background/92 px-3 py-1 text-xs">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                {historyDetail.csvFileName && (
                  <div className="rounded-lg bg-secondary/40 p-3 text-xs">
                    CSV: {historyDetail.csvFileName}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => restoreHistorySelection(historyDetail)}
                    className="rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-accent"
                  >
                    設定を復元
                  </button>
                  <button
                    onClick={() => void handleRerunHistory(historyDetail)}
                    disabled={isInviting}
                    className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground hover:bg-[#f6121d] disabled:opacity-50"
                  >
                    再実行
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground">成功/失敗ログ</p>
                  <div className="max-h-64 overflow-auto rounded-xl border border-border bg-background/92">
                    {historyDetail.logs.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        ログがありません。
                      </div>
                    ) : (
                      historyDetail.logs.slice(0, 80).map((log, index) => (
                        <div
                          key={`${log.channelId}-${log.userId}-${index}`}
                          className="grid grid-cols-[0.8fr,1fr,1.4fr] gap-3 border-b border-border/60 px-3 py-2 text-xs last:border-b-0"
                        >
                          <div className={`font-bold ${getLogTone(log.status)}`}>{log.status}</div>
                          <div className="truncate">{log.channelName ?? log.channelId}</div>
                          <div className="truncate">
                            {log.userName ?? log.userId}
                            {log.error ? ` / ${log.error}` : ''}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showPinDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPinDialog(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[0_28px_80px_-32px_rgba(0,0,0,0.9)]">
            <h4 className="text-lg font-bold">
              {showPinDialog === 'setup' ? '管理者PINを設定' : '管理者PINを入力'}
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              {showPinDialog === 'setup'
                ? '招待の本実行には管理者PINが必要です。ローカル端末に安全に保存されます。'
                : '本実行の前に管理者PINで認証します。'}
            </p>

            <div className="mt-4 space-y-3">
              <input
                type="password"
                placeholder="管理者PIN"
                value={adminPin}
                onChange={(event) => setAdminPin(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
              {showPinDialog === 'setup' && (
                <input
                  type="password"
                  placeholder="確認用PIN"
                  value={adminPinConfirm}
                  onChange={(event) => setAdminPinConfirm(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowPinDialog(null)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                キャンセル
              </button>
              <button
                onClick={() => void handlePinSubmit()}
                disabled={isSubmittingPin}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmittingPin ? '処理中...' : showPinDialog === 'setup' ? '設定して続行' : '認証して実行'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
