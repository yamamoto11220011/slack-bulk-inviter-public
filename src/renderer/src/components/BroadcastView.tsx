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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">メッセージ本文</label>
          <textarea
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            placeholder="送信するメッセージを入力してください..."
            className="min-h-[250px] w-full rounded-xl border border-border bg-background p-4 text-sm shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">添付ファイル (画像・動画対応)</label>
            <button
              onClick={handlePickLocalImage}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-bold hover:bg-blue-100 transition-colors border border-blue-200"
            >
              <span className="text-sm">+</span> PCから追加
            </button>
          </div>
          
          <div className="min-h-[250px] w-full rounded-xl border border-border bg-muted/20 p-4 space-y-4">
            {/* ローカル画像 */}
            {localImagePaths.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">PC内のファイル</p>
                <div className="grid grid-cols-2 gap-2">
                  {localImagePaths.map((path) => (
                    <div key={path} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border text-[10px] group">
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
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addImageUrl(e.currentTarget.value)
                    e.currentTarget.value = ''
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {imageUrls.map((url, idx) => (
                  <div key={idx} className="relative group w-14 h-14 rounded-lg border border-border overflow-hidden bg-background shadow-sm">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">送信回数</label>
          <div className="flex gap-2 flex-wrap">
            {repeatCountOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRepeatCount(opt.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition-all ${
                  repeatCount === opt.value
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                    : 'bg-background text-foreground border-border hover:border-blue-500/50 hover:bg-blue-50/50'
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
              className="h-10 w-24 rounded-lg border border-border bg-background px-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
            />
            <span className="text-xs font-medium text-muted-foreground">
              {selectedBroadcastChannelIds.length} ch × {repeatCount} 回 = <span className="text-blue-600 font-bold">{totalSends}</span> 通を送信
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-end">
          <button
            onClick={() => setShowBroadcastConfirm(true)}
            disabled={!canBroadcast}
            className="w-full h-12 rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30 disabled:opacity-30 disabled:shadow-none transition-all active:scale-[0.98]"
          >
            {isBroadcasting ? '送信中...' : '🚀 一括送信を実行'}
          </button>
        </div>
      </div>

      {isBroadcasting && broadcastProgress && (
        <div className="space-y-3 rounded-2xl border border-blue-500/20 bg-blue-50/30 p-5 animate-pulse">
           <div className="flex justify-between items-center text-xs font-bold text-blue-700 mb-1">
             <span>プログレス</span>
             <span>{broadcastProgress.done} / {broadcastProgress.total}</span>
           </div>
           <div className="h-3 w-full overflow-hidden rounded-full bg-blue-100 flex shadow-inner">
            <div className="h-full bg-blue-500 shadow-lg shadow-blue-500/50" style={{ width: `${(broadcastProgress.success / broadcastProgress.total) * 100}%` }} />
            <div className="h-full bg-red-500 shadow-lg shadow-red-500/50" style={{ width: `${(broadcastProgress.fail / broadcastProgress.total) * 100}%` }} />
          </div>
          <p className="text-xs text-center font-bold text-blue-600/70">
            {broadcastProgress.channelName} に送信中...
          </p>
          <button onClick={handleCancelBroadcast} className="w-full text-xs font-bold text-red-600 hover:underline">⏹ 送信を強制停止</button>
        </div>
      )}

      {broadcastResult && !isBroadcasting && (
        <div className="rounded-xl border border-green-500/20 bg-green-50/30 p-4 flex justify-between items-center text-xs">
          <div className="font-bold text-green-700">
             送信完了: 成功 {broadcastResult.totalSucceeded} / 失敗 {broadcastResult.totalFailed}
          </div>
          <button onClick={() => setBroadcastResult(null)} className="text-muted-foreground hover:text-foreground underline">閉じる</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* チャンネル選択（左） */}
      <aside className="w-80 shrink-0 border-r border-border bg-card overflow-auto">
        <div className="p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground/60 mb-6">送信先チャンネル</h2>
          <ChannelPicker />
        </div>
      </aside>

      {/* メイン送信機能（中・右） */}
      <main className="flex-1 overflow-hidden flex flex-col bg-background relative">
        <div className="flex-1 overflow-auto p-8 custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-8">
            <header className="flex justify-between items-end border-b border-border pb-4">
               <div>
                 <h2 className="text-2xl font-black tracking-tighter">Message Broadcast</h2>
                 <p className="text-xs font-medium text-muted-foreground mt-1">選択したチャンネルにメッセージを一括で、あるいは予約して送信します。添付ファイル付きの送信は負荷を抑えるため低速モードで動きます。</p>
               </div>
               {activeTaskCount > 0 && (
                 <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase border border-blue-200">
                    <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                    {activeTaskCount} Tasks Running
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
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <h2 className="text-xl font-black">送信の最終確認</h2>
              <p className="text-sm text-muted-foreground mt-2">
                <span className="text-blue-600 font-bold">{selectedBroadcastChannelIds.length}</span> のチャンネルに
                合計 <span className="text-blue-600 font-bold">{totalSends}</span> 通のメッセージを送信します。
              </p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setShowBroadcastConfirm(false)} className="flex-1 h-12 rounded-xl border border-border text-sm font-bold hover:bg-accent transition-all">キャンセル</button>
                <button onClick={handleBroadcast} className="flex-1 h-12 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">開始する</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
