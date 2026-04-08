import { SlackClient } from './slack-client'
import { renderMessageTemplate } from './message-template'
import type { BroadcastBatchResult } from './types'

const DEFAULT_CONCURRENCY = 2
const ATTACHMENT_CONCURRENCY = 1
const PROGRESS_INTERVAL_MS = 250
const MIN_SEND_INTERVAL_MS = 1500

/** 進捗データ（成功/失敗をリアルタイムで含む） */
export interface BroadcastProgress {
  done: number
  total: number
  success: number
  fail: number
  channelId: string
}

export class BroadcastService {
  constructor(private client: SlackClient) {}

  private async sendOne(
    channelId: string,
    text: string,
    imageUrls?: string[] | null,
    fileIds?: string[] | null,
    localFilePaths?: string[] | null
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      if (localFilePaths && localFilePaths.length > 0) {
        const commentParts = [text.trim(), ...(imageUrls || [])].filter(Boolean)
        await this.client.shareLocalFilesToChannel(channelId, localFilePaths, commentParts.join('\n'))
        return { ok: true }
      }

      await this.client.postMessage(channelId, text, imageUrls, fileIds)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Unknown error' }
    }
  }

  async broadcastMessage(
    channelIds: string[],
    message: string,
    imageUrls: string[] | null = null,
    fileIds: string[] | null = null,
    localFilePaths: string[] | null = null,
    repeatCount: number = 1,
    onProgress?: (progress: BroadcastProgress) => void,
    shouldCancel?: () => boolean
  ): Promise<BroadcastBatchResult> {
    const totalSends = channelIds.length * repeatCount
    const renderedMessage = renderMessageTemplate(message)
    const hasLocalFiles = Boolean(localFilePaths && localFilePaths.length > 0)
    const workerLimit = hasLocalFiles ? ATTACHMENT_CONCURRENCY : DEFAULT_CONCURRENCY

    console.log(
      `[Broadcast] START: ${channelIds.length} ch × ${repeatCount} 回 = ${totalSends} 送信, 並列数=${workerLimit}`
    )
    const globalStartTime = Date.now()

    let completed = 0
    let successCount = 0
    let failCount = 0
    let cancelled = false

    const channelSent = new Map<string, number>()
    const channelFail = new Map<string, number>()
    const channelErrors = new Map<string, string[]>()
    for (const chId of channelIds) {
      channelSent.set(chId, 0)
      channelFail.set(chId, 0)
      channelErrors.set(chId, [])
    }

    let lastProgressTime = 0
    const notifyProgress = (channelId: string) => {
      const now = Date.now()
      if (now - lastProgressTime >= PROGRESS_INTERVAL_MS || completed === totalSends) {
        lastProgressTime = now
        onProgress?.({ done: completed, total: totalSends, success: successCount, fail: failCount, channelId })
      }
    }

    let nextTaskIndex = 0

    const worker = async () => {
      while (!cancelled) {
        const loopStart = Date.now()
        const taskIdx = nextTaskIndex++
        if (taskIdx >= totalSends) break

        if (shouldCancel?.()) {
          cancelled = true
          break
        }

        const channelId = channelIds[taskIdx % channelIds.length]
        const { ok, error } = await this.sendOne(
          channelId,
          renderedMessage,
          imageUrls,
          fileIds,
          localFilePaths
        )

        if (ok) {
          successCount++
          channelSent.set(channelId, (channelSent.get(channelId) || 0) + 1)
        } else {
          failCount++
          channelFail.set(channelId, (channelFail.get(channelId) || 0) + 1)
          const currentErrors = channelErrors.get(channelId) || []
          if (error && !currentErrors.includes(error)) {
            currentErrors.push(error)
            channelErrors.set(channelId, currentErrors)
          }
        }

        completed++
        notifyProgress(channelId)

        // 各ワーカーに最低間隔を設け、CPU/ネットワーク負荷を抑える
        const elapsed = Date.now() - loopStart
        if (elapsed < MIN_SEND_INTERVAL_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_SEND_INTERVAL_MS - elapsed))
        }
      }
    }

    const workerCount = Math.min(workerLimit, totalSends)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    const elapsed = ((Date.now() - globalStartTime) / 1000).toFixed(1)
    const rps = completed > 0 ? (completed / ((Date.now() - globalStartTime) / 1000)).toFixed(0) : '0'
    console.log(`[Broadcast] DONE: ${completed}/${totalSends} 完了 (成功=${successCount}, 失敗=${failCount}, キャンセル=${cancelled}) ${elapsed}秒 (${rps} req/s)`)

    onProgress?.({ done: completed, total: totalSends, success: successCount, fail: failCount, channelId: channelIds[0] })

    return {
      channelIds,
      totalRequested: totalSends,
      totalSucceeded: successCount,
      totalFailed: failCount,
      cancelled,
      channelResults: channelIds.map((channelId) => ({
        channelId,
        success: (channelFail.get(channelId) || 0) === 0,
        sentCount: channelSent.get(channelId) || 0,
        errors: channelErrors.get(channelId) || []
      }))
    }
  }
}
