import {
  CheckCircle2,
  ClipboardList,
  PencilLine,
  Play,
  Square,
  Trash2,
  XCircle
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../stores/app-store'
import { BroadcastProgress, BroadcastTask } from '../../../core/types'
import { describeSchedule } from '../lib/broadcast-schedule'

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
    <div className="space-y-4 p-1">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">メッセージタスク一覧</h3>
      {broadcastTasks.length === 0 && (
        <div className="rounded-[1.4rem] border border-dashed border-border/80 bg-card/60 py-10 text-center text-sm text-muted-foreground">
          タスクがありません。「新規作成」から追加してください。
        </div>
      )}
      <div className="space-y-3">
        {broadcastTasks.map((task) => {
          const progress = taskProgress[task.id]
          const isRunning = task.status === 'running'
          const showLogs = expandedLogs.has(task.id)
          const scheduleSummary = describeSchedule(task.schedule)

          return (
            <div key={task.id} className="group relative rounded-[1.5rem] border border-border/70 bg-card/90 p-4 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.42)] transition-all hover:-translate-y-0.5 hover:shadow-[0_28px_80px_-42px_rgba(15,23,42,0.48)]">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="max-w-[220px] truncate text-sm font-semibold">{task.name}</h4>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {task.channelIds.length} ch × {task.repeatCount} 回
                    {' • '}
                    {scheduleSummary.shortLabel}
                  </p>
                  <p className="mt-1 text-[11px] text-foreground/80">
                    {scheduleSummary.title}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <div className={`rounded-full bg-background/75 px-2.5 py-1 text-[10px] font-bold uppercase ${getStatusColor(task.status)}`}>
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
                    <span className="inline-flex items-center gap-1 font-medium text-green-600"><CheckCircle2 size={11} />{progress.success}</span>
                    <span className="inline-flex items-center gap-1 font-medium text-red-500"><XCircle size={11} />{progress.fail}</span>
                  </div>
                </div>
              )}

              <div className="mt-3 rounded-2xl border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
                  MESSAGE {(task.nextMessageIndex ?? 0) + 1}/{(task.messages?.length ?? 1)}
                </div>
                <div className="line-clamp-2 italic">
                  "{(task.messages && task.nextMessageIndex !== undefined ? task.messages[task.nextMessageIndex] : task.message) || 'No message'}"
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!isRunning ? (
                  <button
                    onClick={() => handleStart(task.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[10px] font-semibold text-primary-foreground transition-all hover:bg-primary/92"
                  >
                    <Play size={12} />
                    今すぐ実行
                  </button>
                ) : (
                  <button
                    onClick={() => handleCancel(task.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-[10px] font-semibold text-destructive-foreground transition-all hover:bg-destructive/92"
                  >
                    <Square size={12} />
                    停止
                  </button>
                )}
                <button
                  onClick={() => toggleLogs(task.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-semibold transition-colors ${
                    showLogs ? 'bg-secondary text-secondary-foreground' : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <ClipboardList size={12} />
                  {showLogs ? 'ログを閉じる' : 'ログを表示'}
                </button>
                {onEdit && (
                  <button
                    onClick={() => onEdit(task)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 px-3 py-2 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    <PencilLine size={12} />
                    編集
                  </button>
                )}
                <button
                  onClick={() => deleteTask(task.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3 py-2 text-[10px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 size={12} />
                  削除
                </button>
              </div>

              {/* ログビューアー */}
              {showLogs && (
                <div className="mt-3 overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
                  <div className="flex justify-between border-b border-border/70 bg-muted px-3 py-2 text-[9px] font-bold text-muted-foreground">
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
                <div className="mt-3 space-y-1 text-[10px] font-medium text-primary/78">
                  {scheduleSummary.details.map((detail) => (
                    <div key={detail}>• {detail}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
