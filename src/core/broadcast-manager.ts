import { AppDatabase } from './database'
import { SlackClient } from './slack-client'
import { JobManager } from './job-manager'
import { BroadcastTask, BroadcastTaskStatus, BroadcastProgress } from './types'

export class BroadcastManager {
  private timer: NodeJS.Timeout | null = null
  private runningTasks = new Set<string>()
  private cancelledTasks = new Set<string>()

  constructor(
    private db: AppDatabase,
    private client: SlackClient,
    private onProgress: (progress: BroadcastProgress & { taskId: string }) => void
  ) {}

  /** スケジューラーを開始 */
  start() {
    if (this.timer) return
    this.recoverInterruptedTasks()
    // 10秒ごとにタスクをチェック
    this.timer = setInterval(() => void this.checkTasks(), 10000)
    // 初回実行
    void this.checkTasks()
  }

  private recoverInterruptedTasks() {
    const tasks = this.db.getBroadcastTasks()
    for (const task of tasks) {
      if (task.status === 'running') {
        this.db.updateBroadcastTaskStatus(task.id, 'stopped')
      }
    }
  }

  /** スケジューラーを停止 */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 実行すべきタスクがあるかチェック */
  private async checkTasks() {
    try {
      const tasks = this.db.getBroadcastTasks()
      const now = new Date()

      for (const task of tasks) {
        if (task.status !== 'scheduled' && task.status !== 'pending') continue
        if (this.runningTasks.has(task.id)) continue

        const schedule = task.schedule || { type: 'immediate' }
        const lastRunDt = task.lastRunAt ? new Date(task.lastRunAt) : null

        // 即時タスクは保存後や再起動時に自動実行しない
        if (schedule.type === 'immediate') {
          continue
        }

        // 1. 開始日チェック
        if (schedule.startDate && now < new Date(schedule.startDate)) {
          continue
        }

        // 2. 終了日チェック
        if (schedule.endDate && now > new Date(schedule.endDate)) {
          // 無限ループ設定がない、または期限が切れている場合は完了
          if (!schedule.repeatUntilStopped) {
            this.db.updateBroadcastTaskStatus(task.id, 'completed')
            continue
          }
        }

        // 3. 曜日チェック
        if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
          if (!schedule.daysOfWeek.includes(now.getDay())) {
            continue
          }
        }

        let shouldRun = false

        // 時間帯(Time Window)のチェック (共通)
        let withinWindow = true
        if (schedule.windowStart && schedule.windowEnd) {
          const currentH = now.getHours()
          const currentM = now.getMinutes()
          const [sH, sM] = schedule.windowStart.split(':').map(Number)
          const [eH, eM] = schedule.windowEnd.split(':').map(Number)
          
          const currentMinutes = currentH * 60 + currentM
          const startMinutes = sH * 60 + sM
          const endMinutes = eH * 60 + eM

          if (startMinutes <= endMinutes) {
            withinWindow = currentMinutes >= startMinutes && currentMinutes <= endMinutes
          } else {
            withinWindow = currentMinutes >= startMinutes || currentMinutes <= endMinutes
          }
        }

        if (schedule.type === 'once') {
          // 予約送信
          if (!lastRunDt && schedule.scheduledAt) {
            if (now >= new Date(schedule.scheduledAt) && withinWindow) {
              shouldRun = true
            }
          }
        } else if (schedule.type === 'daily') {
          // 毎日
          const isSameDay =
            lastRunDt &&
            lastRunDt.getFullYear() === now.getFullYear() &&
            lastRunDt.getMonth() === now.getMonth() &&
            lastRunDt.getDate() === now.getDate()

          if (!isSameDay && withinWindow) {
            const [h, m] = (schedule.timeOfDay || '09:00').split(':').map(Number)
            const targetTime = new Date(now)
            targetTime.setHours(h, m, 0, 0)
            if (now >= targetTime) {
              shouldRun = true
            }
          }
        } else if (schedule.type === 'interval') {
          // 繰り返し（インターバル）
          if (withinWindow) {
            if (!lastRunDt) {
              shouldRun = true
            } else {
              const diffMs = now.getTime() - lastRunDt.getTime()
              const msPerUnit = schedule.intervalUnit === 'hours' ? 60 * 60 * 1000 : 60 * 1000
              const intervalMs = (schedule.intervalValue || 60) * msPerUnit
              if (diffMs >= intervalMs) {
                shouldRun = true
              }
            }
          }
        }

        if (shouldRun) {
          void this.runTask(task)
        }
      }
    } catch (error) {
      console.error('[BroadcastManager] checkTasks error:', error)
    }
  }


  /** タスクを非同期で実行 */
  async runTask(task: BroadcastTask) {
    this.runningTasks.add(task.id)
    this.cancelledTasks.delete(task.id)
    this.db.updateBroadcastTaskStatus(task.id, 'running')

    try {
      const jobManager = new JobManager(this.db, this.client)
      const channelNameById = new Map(
        this.db.getChannels().map((channel) => [channel.id, channel.name])
      )

      // 1. レガシー項目を正規化
      let imageUrls = [...(task.imageUrls || [])]
      const fileIds = [...(task.fileIds || [])]
      const localFilePaths = Array.from(
        new Set([
          ...(task.localImagePaths || []),
          ...(task.localImagePath ? [task.localImagePath] : [])
        ])
      )

      if (task.imageUrl) {
        if (!imageUrls.includes(task.imageUrl)) imageUrls.push(task.imageUrl)
      }

      // 2. メッセージの決定 (マルチパターン対応)
      let currentMessage = task.message
      if (task.messages && task.messages.length > 0) {
        const idx = task.nextMessageIndex || 0
        currentMessage = task.messages[idx % task.messages.length]
      }

      // 3. 共通ジョブ基盤でブロードキャスト開始
      const operationTask = jobManager.createBroadcastTask({
        channelIds: task.channelIds,
        channelNameById,
        message: currentMessage,
        repeatCount: task.repeatCount,
        imageUrls: imageUrls.length > 0 ? imageUrls : null,
        fileIds: fileIds.length > 0 ? fileIds : null,
        localFilePaths: localFilePaths.length > 0 ? localFilePaths : null,
        sourceTaskId: task.id,
        title: task.name
      })
      const resultTask = await jobManager.runBroadcastTask(operationTask.id, {
        onProgress: (p) => {
          this.onProgress({ ...p, taskId: task.id })
        },
        shouldCancel: () => this.cancelledTasks.has(task.id)
      })

      // 4. ログを保存
      const timestamp = new Date().toISOString()
      const channelResults = Array.from(new Set(task.channelIds)).map((channelId) => {
        const items = resultTask.items.filter((item) => item.payload.channelId === channelId)
        return {
          channelId,
          success: items.every((item) => item.status !== 'failed'),
          errors: items
            .map((item) => item.error)
            .filter((error): error is string => Boolean(error))
        }
      })

      for (const chRes of channelResults) {
        this.db.addBroadcastLog(task.id, {
          timestamp,
          channelId: chRes.channelId,
          status: chRes.success ? 'success' : 'fail',
          message: currentMessage.substring(0, 50) + (currentMessage.length > 50 ? '...' : ''),
          error: chRes.errors.join(', ') || undefined,
          patternIndex: task.messages && task.messages.length > 0 ? (task.nextMessageIndex || 0) : undefined
        })
      }

      // 5. メッセージインデックスを進める
      if (task.messages && task.messages.length > 0 && resultTask.status !== 'canceled') {
        task.nextMessageIndex = ((task.nextMessageIndex || 0) + 1) % task.messages.length
        this.db.upsertBroadcastTask(task)
      }

      let nextStatus: BroadcastTaskStatus = resultTask.status === 'canceled' ? 'cancelled' : 'completed'
      if (resultTask.summary.successCount === 0 && resultTask.summary.failedCount === resultTask.summary.totalItems) {
        nextStatus = 'failed'
      }

      // 繰り返し系なら完了させず 'pending' (待機中) に戻す
      const schedule = task.schedule || { type: 'immediate' }
      if (resultTask.status !== 'canceled') {
        if (schedule.type === 'interval' || schedule.type === 'daily' || schedule.repeatUntilStopped) {
          nextStatus = 'pending'
        }
      }

      this.db.updateBroadcastTaskStatus(task.id, nextStatus, new Date().toISOString())
    } catch (error) {
      console.error(`[BroadcastManager] Task ${task.id} execution failed:`, error)
      this.db.updateBroadcastTaskStatus(task.id, 'failed', new Date().toISOString())
    } finally {
      this.runningTasks.delete(task.id)
    }
  }

  /** 実行中のタスクをキャンセル */
  cancelTask(taskId: string) {
    if (this.runningTasks.has(taskId)) {
      this.cancelledTasks.add(taskId)
    }
  }
}
