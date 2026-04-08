import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../stores/app-store'
import { BroadcastProgress, BroadcastTask, BroadcastLog } from '../../../core/types'

interface Props {
  onEdit?: (task: BroadcastTask) => void
}

export function BroadcastTaskList({ onEdit }: Props = {}) {
  const { broadcastTasks, taskProgress, fetchTasks, deleteTask, updateTaskProgress } = useAppStore(useShallow(state => ({
    broadcastTasks: state.broadcastTasks,
    taskProgress: state.taskProgress,
    fetchTasks: state.fetchTasks,
    deleteTask: state.deleteTask,
    updateTaskProgress: state.updateTaskProgress
  })))

  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchTasks()
    const unsubscribe = window.api.onBroadcastProgress((p: BroadcastProgress & { taskId?: string }) => {
      if (p.taskId) {
        updateTaskProgress(p.taskId, p)
        if (p.done === p.total) {
          fetchTasks()
        }
      }
    })
    return () => {
      unsubscribe()
    }
  }, [fetchTasks, updateTaskProgress])

  const handleStart = async (taskId: string) => {
    await window.api.startBroadcastTask(taskId)
    await fetchTasks()
  }

  const handleCancel = async (taskId: string) => {
    await window.api.cancelBroadcastTask(taskId)
  }

  const toggleLogs = (taskId: string) => {
    const next = new Set(expandedLogs)
    if (next.has(taskId)) next.delete(taskId)
    else next.add(taskId)
    setExpandedLogs(next)
  }

  const getStatusColor = (status: BroadcastTask['status']) => {
    switch (status) {
      case 'running': return 'text-blue-500'
      case 'completed': return 'text-green-500'
      case 'failed': return 'text-red-500'
      case 'cancelled': return 'text-yellow-500'
      case 'scheduled': return 'text-purple-500'
      case 'pending': return 'text-muted-foreground'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <div className="space-y-3 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">メッセージタスク一覧</h3>
      {broadcastTasks.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center border-2 border-dashed rounded-lg">
          タスクがありません。「新規作成」から追加してください。
        </div>
      )}
      <div className="space-y-3">
        {broadcastTasks.map((task) => {
          const progress = taskProgress[task.id]
          const isRunning = task.status === 'running'
          const showLogs = expandedLogs.has(task.id)

          return (
            <div key={task.id} className="group relative rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-sm font-semibold truncate max-w-[180px]">{task.name}</h4>
                  <p className="text-[10px] text-muted-foreground">
                    {task.channelIds.length} ch × {task.repeatCount} 回
                    {task.schedule.repeatUntilStopped && ` • 無期限ループ`}
                    {task.schedule.daysOfWeek && ` • ${task.schedule.daysOfWeek.map(d => ['日','月','火','水','木','金','土'][d]).join(',')}曜日`}
                    {task.schedule.type === 'daily' && ` • 毎日 (${task.schedule.timeOfDay})`}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <div className={`text-[10px] font-bold uppercase ${getStatusColor(task.status)}`}>
                    {task.status}
                  </div>
                  {task.lastRunAt && (
                    <div className="text-[8px] text-muted-foreground">
                      {new Date(task.lastRunAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>

              {/* 進捗・ステータス (実行中のみ) */}
              {isRunning && progress && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{progress.done} / {progress.total}</span>
                    <span className="text-green-500 font-medium">✅ {progress.success}</span>
                    <span className="text-red-500 font-medium">❌ {progress.fail}</span>
                  </div>
                </div>
              )}

              <div className="mt-2 text-xs line-clamp-2 text-muted-foreground italic border-l-2 pl-2 py-1 bg-muted/30">
                <div className="font-bold text-[9px] text-muted-foreground/60 mb-0.5">
                  MESSAGE {(task.nextMessageIndex ?? 0) + 1}/{(task.messages?.length ?? 1)}
                </div>
                "{(task.messages && task.nextMessageIndex !== undefined ? task.messages[task.nextMessageIndex] : task.message) || 'No message'}"
              </div>

              <div className="mt-3 flex gap-2">
                {!isRunning ? (
                  <button
                    onClick={() => handleStart(task.id)}
                    className="flex-1 rounded bg-blue-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-blue-700 transition-colors"
                  >
                    ▶️ 今すぐ実行
                  </button>
                ) : (
                  <button
                    onClick={() => handleCancel(task.id)}
                    className="flex-1 rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700 transition-colors"
                  >
                    ⏹ 停止
                  </button>
                )}
                <button
                  onClick={() => toggleLogs(task.id)}
                  className={`rounded border px-2 py-1 text-[10px] transition-colors ${
                    showLogs ? 'bg-secondary text-secondary-foreground' : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                   {showLogs ? '📋 ログを閉じる' : '📋 ログを表示'}
                </button>
                {onEdit && (
                  <button
                    onClick={() => onEdit(task)}
                    className="rounded border border-primary/30 px-2 py-1 text-[10px] text-primary hover:bg-primary/10 transition-colors"
                  >
                    ✏️ 編集
                  </button>
                )}
                <button
                  onClick={() => deleteTask(task.id)}
                  className="rounded border border-destructive/30 px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10 transition-colors"
                >
                  削除
                </button>
              </div>

              {/* ログビューアー */}
              {showLogs && (
                <div className="mt-3 border rounded-md bg-muted/20 overflow-hidden">
                  <div className="bg-muted px-2 py-1 text-[9px] font-bold text-muted-foreground border-b flex justify-between">
                    <span>RECENT LOGS (MAX 100)</span>
                    <span>{task.logs?.length || 0} ITEMS</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto p-1 space-y-1">
                    {task.logs && task.logs.length > 0 ? (
                      task.logs.map((log, i) => (
                        <div key={i} className="text-[10px] p-1.5 rounded bg-card/50 border border-border/40">
                          <div className="flex justify-between items-start mb-0.5">
                            <span className={`font-bold px-1 rounded uppercase text-[8px] ${
                              log.status === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 
                              log.status === 'fail' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
                              'bg-zinc-100 text-zinc-700'
                            }`}>
                              {log.status}
                            </span>
                            <span className="text-muted-foreground text-[8px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-foreground font-medium truncate mb-0.5">
                            Ch: {log.channelId}
                          </div>
                          <div className="text-muted-foreground text-[9px] truncate">
                            {log.message}
                          </div>
                          {log.error && (
                            <div className="text-red-500 text-[9px] mt-0.5 bg-red-50 dark:bg-red-950/20 px-1 py-0.5 rounded border border-red-100 dark:border-red-900/40">
                              Error: {log.error}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-muted-foreground text-[10px]">
                        ログがありません。
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* スケジュール詳細情報 */}
              {task.status === 'scheduled' && (
                <div className="mt-2 text-[10px] text-purple-500 font-medium space-y-0.5">
                  {task.schedule.type === 'once' && task.schedule.scheduledAt && (
                    <div>⏰ 予定: {new Date(task.schedule.scheduledAt).toLocaleString()}</div>
                  )}
                  {task.schedule.startDate && (
                    <div>📅 開始: {new Date(task.schedule.startDate).toLocaleDateString()}</div>
                  )}
                  {task.schedule.endDate && (
                    <div>📅 終了: {new Date(task.schedule.endDate).toLocaleDateString()}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
