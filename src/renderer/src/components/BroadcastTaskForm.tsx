import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Image as ImageIcon, ImagePlus, Paperclip } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { BroadcastTask, ScheduleConfig } from '../../../core/types'
import { useAppStore } from '../stores/app-store'

interface Props {
  task?: Partial<BroadcastTask>
  onSave: (task: BroadcastTask) => void
  onCancel: () => void
}

type ScheduleTab = ScheduleConfig['type']

type BroadcastTaskDraft = {
  name: string
  messages: string[]
  imageUrls: string[]
  localImagePaths: string[]
  channelIds: string[]
  repeatCount: number
  scheduledAt: string
  startDate: string
  repeatUntilStopped: boolean
  daysOfWeek: number[]
  timeOfDay: string
  intervalValue: number
  intervalUnit: 'minutes' | 'hours'
  windowStart: string
  windowEnd: string
  hasEndDate: boolean
  endDate: string
}

type DraftMap = Record<ScheduleTab, BroadcastTaskDraft>

const STORAGE_KEY = 'broadcast-task-form-drafts-v1'
const SCHEDULE_TABS: ScheduleTab[] = ['immediate', 'once', 'daily', 'interval']
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateTimeLocalInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDateInput(date)}T${hours}:${minutes}`
}

function createDefaultDraft(): BroadcastTaskDraft {
  const now = new Date()
  const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  return {
    name: '',
    messages: [''],
    imageUrls: [],
    localImagePaths: [],
    channelIds: [],
    repeatCount: 1,
    scheduledAt: formatDateTimeLocalInput(now),
    startDate: formatDateInput(now),
    repeatUntilStopped: false,
    daysOfWeek: [...ALL_DAYS],
    timeOfDay: '09:00',
    intervalValue: 30,
    intervalUnit: 'minutes',
    windowStart: '09:00',
    windowEnd: '18:00',
    hasEndDate: false,
    endDate: formatDateInput(oneWeekLater)
  }
}

function createDefaultDrafts(): DraftMap {
  return {
    immediate: createDefaultDraft(),
    once: createDefaultDraft(),
    daily: createDefaultDraft(),
    interval: createDefaultDraft()
  }
}

function normalizeTaskToDraft(task: Partial<BroadcastTask>): BroadcastTaskDraft {
  const schedule = task.schedule || { type: 'immediate' as const }
  const base = createDefaultDraft()

  return {
    ...base,
    name: task.name || '',
    messages: task.messages && task.messages.length > 0 ? task.messages : task.message ? [task.message] : [''],
    imageUrls: task.imageUrls || (task.imageUrl ? [task.imageUrl] : []),
    localImagePaths: task.localImagePaths || (task.localImagePath ? [task.localImagePath] : []),
    channelIds: task.channelIds || [],
    repeatCount: task.repeatCount || 1,
    scheduledAt: schedule.scheduledAt ? formatDateTimeLocalInput(new Date(schedule.scheduledAt)) : base.scheduledAt,
    startDate: schedule.startDate ? formatDateInput(new Date(schedule.startDate)) : base.startDate,
    repeatUntilStopped: Boolean(schedule.repeatUntilStopped),
    daysOfWeek: schedule.daysOfWeek && schedule.daysOfWeek.length > 0 ? schedule.daysOfWeek : [...ALL_DAYS],
    timeOfDay: schedule.timeOfDay || base.timeOfDay,
    intervalValue: schedule.intervalValue || base.intervalValue,
    intervalUnit: schedule.intervalUnit || base.intervalUnit,
    windowStart: schedule.windowStart || base.windowStart,
    windowEnd: schedule.windowEnd || base.windowEnd,
    hasEndDate: Boolean(schedule.endDate),
    endDate: schedule.endDate ? formatDateInput(new Date(schedule.endDate)) : base.endDate
  }
}

function loadDraftsFromStorage(): DraftMap {
  const defaults = createDefaultDrafts()

  if (typeof window === 'undefined') {
    return defaults
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults

    const parsed = JSON.parse(raw) as Partial<DraftMap>
    return {
      immediate: { ...defaults.immediate, ...(parsed.immediate || {}) },
      once: { ...defaults.once, ...(parsed.once || {}) },
      daily: { ...defaults.daily, ...(parsed.daily || {}) },
      interval: { ...defaults.interval, ...(parsed.interval || {}) }
    }
  } catch {
    return defaults
  }
}

function saveDraftsToStorage(drafts: DraftMap): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)(\?.*)?$/i.test(url)
}

function getFileChipIcon(path: string) {
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(path)) {
    return <ImageIcon size={14} />
  }
  return <Paperclip size={14} />
}

export function BroadcastTaskForm({ task, onSave, onCancel }: Props) {
  const { channels, setChannels, setSyncProgress, setSyncMeta } = useAppStore(
    useShallow((state) => ({
      channels: state.channels,
      setChannels: state.setChannels,
      setSyncProgress: state.setSyncProgress,
      setSyncMeta: state.setSyncMeta
    }))
  )
  const [isSyncingChannels, setIsSyncingChannels] = useState(false)
  const isEditing = Boolean(task?.id)
  const initialScheduleType: ScheduleTab = task?.schedule?.type || 'immediate'

  const [scheduleType, setScheduleType] = useState<ScheduleTab>(initialScheduleType)
  const [drafts, setDrafts] = useState<DraftMap>(() => {
    const base = isEditing ? createDefaultDrafts() : loadDraftsFromStorage()
    if (task) {
      base[initialScheduleType] = normalizeTaskToDraft(task)
    }
    return base
  })
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    if (isEditing) return
    saveDraftsToStorage(drafts)
  }, [drafts, isEditing])

  const currentDraft = drafts[scheduleType]

  const updateCurrentDraft = useCallback(
    (
      updater:
        | Partial<BroadcastTaskDraft>
        | ((draft: BroadcastTaskDraft) => BroadcastTaskDraft)
    ) => {
      setDrafts((prev) => {
        const nextDraft =
          typeof updater === 'function'
            ? updater(prev[scheduleType])
            : { ...prev[scheduleType], ...updater }
        return { ...prev, [scheduleType]: nextDraft }
      })
    },
    [scheduleType]
  )

  const allChannels = useMemo(
    () => [...channels].sort((a, b) => a.name.localeCompare(b.name)),
    [channels]
  )
  const selectedChannelIds = currentDraft.channelIds
  const selectedChannelIdSet = useMemo(
    () => new Set(selectedChannelIds),
    [selectedChannelIds]
  )

  const filteredChannels = useMemo(() => {
    let list = allChannels
    if (deferredSearch) {
      const query = deferredSearch.toLowerCase()
      list = allChannels.filter((channel) => channel.name.toLowerCase().includes(query))
    }
    return list
  }, [allChannels, deferredSearch])

  const handleSyncChannels = async () => {
    setIsSyncingChannels(true)
    const cleanup = window.api.onSyncProgress((data) => {
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
    } finally {
      setIsSyncingChannels(false)
      setSyncProgress(null)
      cleanup()
    }
  }

  const handlePickLocalImage = async () => {
    const filePaths = await window.api.openImageDialog(true)
    if (filePaths && filePaths.length > 0) {
      updateCurrentDraft((draft) => ({
        ...draft,
        localImagePaths: Array.from(new Set([...draft.localImagePaths, ...filePaths]))
      }))
    }
  }

  const removeLocalImage = (path: string) => {
    updateCurrentDraft((draft) => ({
      ...draft,
      localImagePaths: draft.localImagePaths.filter((item) => item !== path)
    }))
  }

  const removeImageUrl = (index: number) => {
    updateCurrentDraft((draft) => ({
      ...draft,
      imageUrls: draft.imageUrls.filter((_, itemIndex) => itemIndex !== index)
    }))
  }

  const addImageUrl = (url: string) => {
    if (!url.trim()) return
    updateCurrentDraft((draft) => ({
      ...draft,
      imageUrls: [...draft.imageUrls, url.trim()]
    }))
  }

  const toggleChannel = useCallback(
    (id: string) => {
      updateCurrentDraft((draft) => ({
        ...draft,
        channelIds: draft.channelIds.includes(id)
          ? draft.channelIds.filter((channelId) => channelId !== id)
          : [...draft.channelIds, id]
      }))
    },
    [updateCurrentDraft]
  )

  const renderedChannels = useMemo(() => {
    if (filteredChannels.length === 0) {
      return (
        <div className="p-3 text-center text-xs text-muted-foreground italic">
          チャンネルが見つかりません
        </div>
      )
    }

    return filteredChannels.slice(0, 100).map((channel) => (
      <label
        key={channel.id}
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-sm cursor-pointer transition-colors border-b last:border-0 border-border/50"
      >
        <input
          type="checkbox"
          checked={selectedChannelIdSet.has(channel.id)}
          onChange={() => toggleChannel(channel.id)}
          className="rounded border-border text-primary focus:ring-0"
        />
        <span className="truncate flex items-center gap-1">
          {channel.isPrivate ? '🔒' : '#'} {channel.name}
          {!channel.isMember && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-600 px-1 rounded ml-1">
              未参加
            </span>
          )}
        </span>
      </label>
    ))
  }, [filteredChannels, selectedChannelIdSet, toggleChannel])

  const handleSave = () => {
    let schedule: ScheduleConfig = {
      type: scheduleType
    }

    if (scheduleType === 'once') {
      schedule = {
        type: 'once',
        scheduledAt: new Date(currentDraft.scheduledAt).toISOString()
      }
    } else if (scheduleType === 'daily') {
      schedule = {
        type: 'daily',
        startDate: new Date(currentDraft.startDate).toISOString(),
        endDate: currentDraft.hasEndDate ? new Date(currentDraft.endDate).toISOString() : undefined,
        repeatUntilStopped: currentDraft.repeatUntilStopped,
        daysOfWeek: currentDraft.daysOfWeek.length > 0 ? currentDraft.daysOfWeek : undefined,
        timeOfDay: currentDraft.timeOfDay
      }
    } else if (scheduleType === 'interval') {
      schedule = {
        type: 'interval',
        startDate: new Date(currentDraft.startDate).toISOString(),
        endDate: currentDraft.hasEndDate ? new Date(currentDraft.endDate).toISOString() : undefined,
        repeatUntilStopped: currentDraft.repeatUntilStopped,
        daysOfWeek: currentDraft.daysOfWeek.length > 0 ? currentDraft.daysOfWeek : undefined,
        intervalValue: currentDraft.intervalValue,
        intervalUnit: currentDraft.intervalUnit,
        windowStart: currentDraft.windowStart,
        windowEnd: currentDraft.windowEnd
      }
    }

    const nextStatus = scheduleType === 'immediate' ? 'pending' : 'scheduled'

    const newTask: BroadcastTask = {
      id:
        task?.id ||
        (window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : Math.random().toString(36).substring(2, 15) + Date.now().toString(36)),
      name: currentDraft.name || '無題のタスク',
      message: currentDraft.messages[0] || '',
      messages: currentDraft.messages,
      nextMessageIndex: task?.nextMessageIndex || 0,
      imageUrl: null,
      localImagePath: undefined,
      imageUrls: currentDraft.imageUrls,
      localImagePaths: currentDraft.localImagePaths,
      channelIds: currentDraft.channelIds,
      repeatCount: currentDraft.repeatCount,
      schedule,
      status: nextStatus,
      lastRunAt: task?.lastRunAt || null,
      createdAt: task?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    onSave(newTask)
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-background border rounded-lg shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          タスク名
        </label>
        <input
          type="text"
          value={currentDraft.name}
          onChange={(event) => updateCurrentDraft({ name: event.target.value })}
          placeholder="例: 重要なお知らせ"
          className="w-full rounded-md border bg-muted/30 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
        />
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
          <span>メッセージ内容 (回転パターン)</span>
          <span className="text-[9px] normal-case">最大5パターン。順番に送出されます。</span>
        </label>
        <div className="space-y-2">
          {currentDraft.messages.map((message, index) => (
            <div key={index} className="relative group">
              <textarea
                value={message}
                onChange={(event) =>
                  updateCurrentDraft((draft) => {
                    const nextMessages = [...draft.messages]
                    nextMessages[index] = event.target.value
                    return { ...draft, messages: nextMessages }
                  })
                }
                placeholder={`パターン ${index + 1} の内容を入力...`}
                className="min-h-16 w-full rounded-md border bg-muted/30 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all resize-none pr-8"
              />
              {currentDraft.messages.length > 1 && (
                <button
                  onClick={() =>
                    updateCurrentDraft((draft) => ({
                      ...draft,
                      messages: draft.messages.filter((_, itemIndex) => itemIndex !== index)
                    }))
                  }
                  className="absolute top-2 right-2 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {currentDraft.messages.length < 5 && (
            <button
              onClick={() =>
                updateCurrentDraft((draft) => ({
                  ...draft,
                  messages: [...draft.messages, '']
                }))
              }
              className="w-full py-2 border border-dashed border-border rounded-md text-[10px] font-bold text-muted-foreground hover:bg-accent hover:text-primary transition-all"
            >
              + パターンを追加
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>添付ファイル (画像・動画対応 / 複数可)</span>
          <button
            onClick={handlePickLocalImage}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <ImagePlus size={12} />
            <span>PCから追加</span>
          </button>
        </label>

        {currentDraft.localImagePaths.length > 0 && (
          <div className="flex flex-col gap-1">
            {currentDraft.localImagePaths.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-primary/5 text-[11px] text-primary"
              >
                {getFileChipIcon(path)}
                <span className="truncate flex-1">{path.split('/').pop()}</span>
                <button
                  onClick={() => removeLocalImage(path)}
                  className="text-[10px] hover:text-red-500 font-bold px-1"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="画像URLを直接入力 (http://...)"
              className="flex-1 rounded-md border bg-muted/30 px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary outline-none"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  addImageUrl(event.currentTarget.value)
                  event.currentTarget.value = ''
                }
              }}
            />
          </div>

          {currentDraft.imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {currentDraft.imageUrls.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="relative group w-12 h-12 rounded border overflow-hidden bg-muted flex items-center justify-center shrink-0 shadow-sm transition-transform hover:scale-105"
                >
                  {isImageUrl(url) ? (
                    <img src={url} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                  ) : (
                    <Paperclip size={16} className="text-muted-foreground" />
                  )}
                  <button
                    onClick={() => removeImageUrl(index)}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            送信先チャンネル ({currentDraft.channelIds.length} / {allChannels.length})
          </label>
          <button
            onClick={handleSyncChannels}
            disabled={isSyncingChannels}
            className="text-[10px] font-bold text-primary hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {isSyncingChannels ? '同期中...' : '🔄 チャンネル同期'}
          </button>
        </div>
        <input
          type="text"
          placeholder="検索..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        />
        <div className="max-h-32 overflow-y-auto border rounded-md bg-muted/10 relative">
          {search !== deferredSearch && (
            <div className="absolute inset-0 bg-background/50 animate-pulse z-10" />
          )}
          {renderedChannels}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2 block">
            送信スケジュール
          </label>
          <div className="flex bg-muted rounded-md p-1">
            {SCHEDULE_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setScheduleType(tab)}
                className={`flex-1 text-xs py-1.5 rounded-sm font-medium transition-all ${
                  scheduleType === tab
                    ? 'bg-background shadow-sm text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'immediate' && '即時実行'}
                {tab === 'once' && '予約日時'}
                {tab === 'daily' && '毎日ループ'}
                {tab === 'interval' && '間隔ループ'}
              </button>
            ))}
          </div>
          {!isEditing && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              4つのタブはそれぞれ独立した下書きとして自動保存されます。
            </p>
          )}
        </div>

        {scheduleType === 'once' && (
          <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">
              実行日時
            </label>
            <input
              type="datetime-local"
              value={currentDraft.scheduledAt}
              onChange={(event) => updateCurrentDraft({ scheduledAt: event.target.value })}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {(scheduleType === 'daily' || scheduleType === 'interval') && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
            {scheduleType === 'daily' ? (
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">
                  送信時刻 (HH:mm)
                </label>
                <input
                  type="time"
                  value={currentDraft.timeOfDay}
                  onChange={(event) => updateCurrentDraft({ timeOfDay: event.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">
                    定期間隔
                  </label>
                  <div className="flex gap-2 border rounded-md p-1 bg-background">
                    <input
                      type="number"
                      min={1}
                      value={currentDraft.intervalValue}
                      onChange={(event) =>
                        updateCurrentDraft({
                          intervalValue: Math.max(1, Number(event.target.value) || 1)
                        })
                      }
                      className="w-full rounded bg-transparent px-2 text-sm outline-none font-medium"
                    />
                    <select
                      value={currentDraft.intervalUnit}
                      onChange={(event) =>
                        updateCurrentDraft({
                          intervalUnit: event.target.value as 'minutes' | 'hours'
                        })
                      }
                      className="bg-transparent text-sm font-medium outline-none text-muted-foreground border-l pl-2"
                    >
                      <option value="minutes">分間隔</option>
                      <option value="hours">時間間隔</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      実行許可(開始)
                    </label>
                    <input
                      type="time"
                      value={currentDraft.windowStart}
                      onChange={(event) => updateCurrentDraft({ windowStart: event.target.value })}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      実行許可(終了)
                    </label>
                    <input
                      type="time"
                      value={currentDraft.windowEnd}
                      onChange={(event) => updateCurrentDraft({ windowEnd: event.target.value })}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-primary/10 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">
                  開始日
                </label>
                <input
                  type="date"
                  value={currentDraft.startDate}
                  onChange={(event) => updateCurrentDraft({ startDate: event.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">
                  実行曜日
                </label>
                <div className="flex justify-between gap-1">
                  {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
                    <button
                      key={index}
                      onClick={() =>
                        updateCurrentDraft((draft) => ({
                          ...draft,
                          daysOfWeek: draft.daysOfWeek.includes(index)
                            ? draft.daysOfWeek.filter((item) => item !== index)
                            : [...draft.daysOfWeek, index]
                        }))
                      }
                      className={`flex-1 h-8 rounded text-[10px] font-bold transition-all ${
                        currentDraft.daysOfWeek.includes(index)
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentDraft.repeatUntilStopped}
                    onChange={(event) =>
                      updateCurrentDraft({ repeatUntilStopped: event.target.checked })
                    }
                    className="rounded text-primary focus:ring-0 border-primary/50"
                  />
                  <span className="text-xs font-bold text-muted-foreground italic">
                    無限ループ (手動停止まで繰り返す)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentDraft.hasEndDate}
                    onChange={(event) => updateCurrentDraft({ hasEndDate: event.target.checked })}
                    className="rounded text-primary focus:ring-0 border-primary/50"
                  />
                  <span className="text-xs font-bold text-muted-foreground">
                    終了日を指定する
                  </span>
                </label>
              </div>
              {currentDraft.hasEndDate && (
                <input
                  type="date"
                  value={currentDraft.endDate}
                  onChange={(event) => updateCurrentDraft({ endDate: event.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary animate-in fade-in"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-2">
        <button
          onClick={handleSave}
          disabled={
            currentDraft.channelIds.length === 0 ||
            currentDraft.messages.every((message) => !message.trim()) ||
            !currentDraft.name.trim()
          }
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          {task?.id ? '更新して保存' : 'タスクを作成'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-accent transition-all active:scale-95"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
