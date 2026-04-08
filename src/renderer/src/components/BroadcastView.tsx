import { Activity, Gauge, Megaphone, Paperclip, RefreshCw, SendHorizontal, ShieldCheck } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { ChannelPicker } from './ChannelPicker'
import { BroadcastTabs } from './BroadcastTabs'

export function BroadcastView() {
  const {
    channels,
    selectedBroadcastChannelIds,
    broadcastTasks,
    updateTaskProgress,
    fetchTasks
  } = useAppStore()

  const [draftMessage, setDraftMessage] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [localImagePaths, setLocalImagePaths] = useState<string[]>([])
  const [repeatCount, setRepeatCount] = useState<number>(1)
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [broadcastProgress, setBroadcastProgress] = useState<{
    done: number
    total: number
    success: number
    fail: number
    channelName: string | null
  } | null>(null)
  const [showBroadcastConfirm, setShowBroadcastConfirm] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<{
    totalSucceeded: number
    totalFailed: number
    cancelled: boolean
    channelResults: Array<{ channelId: string; success: boolean; sentCount: number; errors: string[] }>
  } | null>(null)

  const totalSends = selectedBroadcastChannelIds.length * repeatCount
  const canBroadcast = selectedBroadcastChannelIds.length > 0 && draftMessage.trim().length > 0 && !isBroadcasting

  useEffect(() => {
    const cleanup = window.api.onBroadcastProgress((data: any) => {
      if (data.taskId) {
        updateTaskProgress(data.taskId, data)
        if (data.done === data.total) fetchTasks()
      } else {
        const channelName = channels.find((c) => c.id === data.channelId)?.name ?? data.channelId
        setBroadcastProgress({
          done: data.done,
          total: data.total,
          success: data.success,
          fail: data.fail,
          channelName
        })
      }
    })
    return cleanup
  }, [channels, updateTaskProgress, fetchTasks])

  const handleBroadcast = useCallback(async () => {
    if (selectedBroadcastChannelIds.length === 0 || draftMessage.trim().length === 0) return
    setShowBroadcastConfirm(false)
    setIsBroadcasting(true)
    setBroadcastProgress({ done: 0, total: totalSends, success: 0, fail: 0, channelName: null })
    setBroadcastResult(null)
    try {
      const res = await window.api.executeBroadcast(
        selectedBroadcastChannelIds,
        draftMessage.trim(),
        repeatCount,
        imageUrls,
        localImagePaths
      )
      setBroadcastResult(res)
      // 送信成功/開始後は画像をクリア（任意）
      setImageUrls([])
      setLocalImagePaths([])
    } catch {
      setBroadcastResult({ totalSucceeded: 0, totalFailed: totalSends, cancelled: false, channelResults: [] })
    } finally {
      setIsBroadcasting(false)
      setBroadcastProgress(null)
    }
  }, [selectedBroadcastChannelIds, draftMessage, repeatCount, totalSends])

  const handleCancelBroadcast = useCallback(async () => {
    await window.api.cancelBroadcast()
  }, [])

  const handlePickLocalImage = async () => {
    const filePaths = await window.api.openImageDialog(true)
    if (filePaths && filePaths.length > 0) {
      setLocalImagePaths((prev) => Array.from(new Set([...prev, ...filePaths])))
    }
  }

  const removeLocalImage = (path: string) => {
    setLocalImagePaths((prev) => prev.filter((p) => p !== path))
  }

  const removeImageUrl = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  const addImageUrl = (url: string) => {
    if (url.trim()) {
      setImageUrls((prev) => [...prev, url.trim()])
    }
  }

  const repeatCountOptions = [
    { value: 1, label: '1回' },
    { value: 10, label: '10回' },
    { value: 100, label: '100回' },
    { value: 1000, label: '1000回' },
    { value: 10000, label: '1万回' },
    { value: 999999, label: '99万回' }
  ]

  const activeTaskCount = broadcastTasks.filter(t => t.status === 'running').length

  const quickBroadcastContent = (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.4rem] border border-border/70 bg-card/92 p-4 shadow-[0_22px_60px_-44px_rgba(0,0,0,0.72)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_18px_34px_-18px_rgba(229,9,20,0.58)]">
              <Megaphone size={18} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Audience</div>
              <div className="text-lg font-semibold">{selectedBroadcastChannelIds.length} channels</div>
            </div>
          </div>
        </div>
        <div className="rounded-[1.4rem] border border-border/70 bg-card/92 p-4 shadow-[0_22px_60px_-44px_rgba(0,0,0,0.72)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <Paperclip size={18} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Attachment</div>
              <div className="text-lg font-semibold">{localImagePaths.length + imageUrls.length} files</div>
            </div>
          </div>
        </div>
        <div className="rounded-[1.4rem] border border-border/70 bg-card/92 p-4 shadow-[0_22px_60px_-44px_rgba(0,0,0,0.72)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <Gauge size={18} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Run Size</div>
              <div className="text-lg font-semibold">{totalSends} deliveries</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-[1.6rem] border border-border/70 bg-card/92 p-5 shadow-[0_26px_70px_-46px_rgba(0,0,0,0.78)]">
          <label className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground/75">メッセージ本文</label>
          <textarea
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            placeholder="送信するメッセージを入力してください..."
            className="min-h-[260px] w-full rounded-[1.3rem] border border-border/70 bg-background/94 p-4 text-sm leading-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all focus:border-ring/45 focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>

        <div className="space-y-3 rounded-[1.6rem] border border-border/70 bg-card/92 p-5 shadow-[0_26px_70px_-46px_rgba(0,0,0,0.78)]">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground/75">添付ファイル</label>
            <button
              onClick={handlePickLocalImage}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/94 px-3 py-1.5 text-[10px] font-semibold text-primary transition-all hover:bg-[#191919]"
            >
              <Paperclip size={12} />
              PCから追加
            </button>
          </div>
          
          <div className="min-h-[260px] w-full rounded-[1.3rem] border border-border/70 bg-[#101010] p-4 space-y-4">
            {/* ローカル画像 */}
            {localImagePaths.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">PC内のファイル</p>
                <div className="grid grid-cols-2 gap-2">
                  {localImagePaths.map((path) => (
                    <div key={path} className="group flex items-center gap-2 rounded-lg border border-border bg-background/92 p-2 text-[10px]">
                      <span className="truncate flex-1 font-medium">{path.split('/').pop()}</span>
                      <button onClick={() => removeLocalImage(path)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* URL入力 */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">画像URLを直接指定</p>
              <input
                type="text"
                placeholder="URLを入力してEnter..."
                className="w-full rounded-xl border border-border/80 bg-background/94 px-3 py-2 text-xs outline-none transition-all focus:border-ring/40 focus:ring-2 focus:ring-ring/16"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addImageUrl(e.currentTarget.value)
                    e.currentTarget.value = ''
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {imageUrls.map((url, idx) => (
                  <div key={idx} className="relative h-14 w-14 overflow-hidden rounded-lg border border-border bg-background shadow-sm shadow-black/30">
                    <img src={url} className="w-full h-full object-cover" />
                    <button onClick={() => removeImageUrl(idx)} className="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center font-bold">×</button>
                  </div>
                ))}
              </div>
            </div>

            {localImagePaths.length === 0 && imageUrls.length === 0 && (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground/40 italic text-xs">
                <span>ファイルは添付されていません</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-[1.6rem] border border-border/70 bg-card/92 p-5 shadow-[0_26px_70px_-46px_rgba(0,0,0,0.78)]">
          <label className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground/75">送信回数</label>
          <div className="flex gap-2 flex-wrap">
            {repeatCountOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRepeatCount(opt.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition-all ${
                  repeatCount === opt.value
                    ? 'border-primary bg-primary text-primary-foreground shadow-[0_18px_40px_-24px_rgba(229,9,20,0.48)]'
                    : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-[#191919]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="number"
              min={1}
              max={999999}
              value={repeatCount}
              onChange={(e) => setRepeatCount(parseInt(e.target.value) || 1)}
              className="h-10 w-24 rounded-xl border border-border/80 bg-background/94 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring/20"
            />
            <span className="text-xs font-medium text-muted-foreground">
              {selectedBroadcastChannelIds.length} ch × {repeatCount} 回 = <span className="font-bold text-primary">{totalSends}</span> 通を送信
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-end rounded-[1.6rem] border border-[#4a0d11] bg-[linear-gradient(145deg,#090909,#160406_52%,#3d0409_78%,#090909)] p-5 text-primary-foreground shadow-[0_34px_90px_-40px_rgba(0,0,0,0.9)]">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="text-sm font-semibold">実行前チェック</div>
              <p className="mt-1 text-xs leading-6 text-primary-foreground/68">
                対象チャンネル、送信回数、添付数を確認したうえで送信します。
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowBroadcastConfirm(true)}
            disabled={!canBroadcast}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_28px_56px_-28px_rgba(229,9,20,0.62)] transition-all hover:-translate-y-0.5 hover:bg-[#f6121d] disabled:shadow-none disabled:opacity-30"
          >
            <SendHorizontal size={16} />
            {isBroadcasting ? '送信中...' : '一括送信を実行'}
          </button>
        </div>
      </div>

      {isBroadcasting && broadcastProgress && (
        <div className="space-y-3 rounded-[1.6rem] border border-border/70 bg-card/94 p-5 shadow-[0_26px_70px_-46px_rgba(0,0,0,0.82)]">
           <div className="mb-1 flex items-center justify-between text-xs font-bold text-primary">
             <span>プログレス</span>
             <span>{broadcastProgress.done} / {broadcastProgress.total}</span>
           </div>
           <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted shadow-inner">
            <div className="h-full bg-primary" style={{ width: `${(broadcastProgress.success / broadcastProgress.total) * 100}%` }} />
            <div className="h-full bg-zinc-500" style={{ width: `${(broadcastProgress.fail / broadcastProgress.total) * 100}%` }} />
          </div>
          <p className="text-xs text-center font-semibold text-muted-foreground">
            {broadcastProgress.channelName} に送信中...
          </p>
          <button onClick={handleCancelBroadcast} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive transition-all hover:bg-destructive/12">
            <Activity size={14} />
            送信を停止
          </button>
        </div>
      )}

      {broadcastResult && !isBroadcasting && (
        <div className="flex items-center justify-between rounded-[1.4rem] border border-primary/30 bg-primary/10 p-4 text-xs">
          <div className="font-semibold text-primary-foreground">
             送信完了: 成功 {broadcastResult.totalSucceeded} / 失敗 {broadcastResult.totalFailed}
          </div>
          <button onClick={() => setBroadcastResult(null)} className="text-muted-foreground hover:text-foreground underline">閉じる</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-full flex-1 gap-4 overflow-hidden p-4">
      {/* チャンネル選択（左） */}
      <aside className="w-80 shrink-0 overflow-auto rounded-[1.7rem] border border-border/70 bg-card/92 shadow-[0_32px_90px_-50px_rgba(0,0,0,0.84)] backdrop-blur-xl">
        <div className="p-4">
          <ChannelPicker />
        </div>
      </aside>

      {/* メイン送信機能（中・右） */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.8rem] border border-border/70 bg-card/92 shadow-[0_32px_90px_-50px_rgba(0,0,0,0.84)] backdrop-blur-xl">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            <header className="rounded-[1.8rem] border border-[#4a0d11] bg-[linear-gradient(155deg,#060606,#110304_38%,#46050a_74%,#0a0a0a)] px-6 py-6 text-primary-foreground shadow-[0_34px_90px_-40px_rgba(0,0,0,0.94)]">
               <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                 <div>
                   <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/72">
                     <Megaphone size={13} />
                     Broadcast Console
                   </div>
                   <h2 className="mt-4 text-3xl font-semibold tracking-tight">Message Broadcast</h2>
                   <p className="mt-2 max-w-2xl text-sm leading-7 text-primary-foreground/68">選択したチャンネルへメッセージをまとめて送り、必要に応じて自動送信タスクとして保存できます。添付つき送信は負荷を抑えた低速モードで動作します。</p>
                 </div>
                 <div className="flex flex-wrap gap-3">
                   <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm">
                     <div className="text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60">Selected</div>
                     <div className="mt-1 font-semibold">{selectedBroadcastChannelIds.length} channels</div>
                   </div>
                   <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm">
                     <div className="text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60">Mode</div>
                     <div className="mt-1 font-semibold">Quick + Scheduled</div>
                   </div>
                 </div>
               </div>
               {activeTaskCount > 0 && (
                 <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/84">
                    <RefreshCw size={12} className="animate-spin" />
                    {activeTaskCount} tasks running
                 </div>
               )}
            </header>

            <BroadcastTabs
              onQuickBroadcast={handleBroadcast}
              isQuickBroadcasting={isBroadcasting}
              quickBroadcastContent={quickBroadcastContent}
            />
          </div>
        </div>

        {showBroadcastConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={() => setShowBroadcastConfirm(false)} />
            <div className="relative w-full max-w-md rounded-[1.8rem] border border-border/70 bg-card p-8 shadow-[0_34px_110px_-46px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-200">
              <h2 className="text-xl font-semibold">送信の最終確認</h2>
              <p className="text-sm text-muted-foreground mt-2">
                <span className="font-semibold text-primary">{selectedBroadcastChannelIds.length}</span> のチャンネルに
                合計 <span className="font-semibold text-primary">{totalSends}</span> 通のメッセージを送信します。
              </p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setShowBroadcastConfirm(false)} className="flex-1 h-12 rounded-2xl border border-border text-sm font-semibold hover:bg-accent transition-all">キャンセル</button>
                <button onClick={handleBroadcast} className="flex-1 h-12 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_24px_54px_-26px_rgba(229,9,20,0.58)] transition-all hover:bg-[#f6121d]">開始する</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
