import { SlackClient } from './slack-client'
import type {
  DirectMessageBatchResult,
  DirectMessageProgress,
  DirectMessageUserResult
} from './types'

const DEFAULT_CONCURRENCY = 2
const ATTACHMENT_CONCURRENCY = 1
const PROGRESS_INTERVAL_MS = 300
const MIN_SEND_INTERVAL_MS = 1200

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class DirectMessageService {
  constructor(private client: SlackClient) {}

  private async sendOne(
    userId: string,
    text: string,
    imageUrls?: string[] | null,
    localFilePaths?: string[] | null
  ): Promise<DirectMessageUserResult> {
    try {
      const channelId = await this.client.openDirectMessage(userId)

      if (localFilePaths && localFilePaths.length > 0) {
        const commentParts = [text.trim(), ...(imageUrls || [])].filter(Boolean)
        await this.client.shareLocalFilesToChannel(channelId, localFilePaths, commentParts.join('\n'))
      } else {
        await this.client.postMessage(channelId, text, imageUrls, null)
      }

      return { userId, channelId, success: true }
    } catch (error: any) {
      return {
        userId,
        channelId: null,
        success: false,
        error: error?.message || 'Unknown error'
      }
    }
  }

  async sendBulk(
    userIds: string[],
    message: string,
    imageUrls: string[] | null = null,
    localFilePaths: string[] | null = null,
    onProgress?: (progress: DirectMessageProgress) => void,
    shouldCancel?: () => boolean
  ): Promise<DirectMessageBatchResult> {
    const uniqueUserIds = Array.from(new Set(userIds))
    const total = uniqueUserIds.length
    const workerLimit =
      localFilePaths && localFilePaths.length > 0 ? ATTACHMENT_CONCURRENCY : DEFAULT_CONCURRENCY

    let completed = 0
    let successCount = 0
    let failCount = 0
    let cancelled = false
    let nextTaskIndex = 0
    let lastProgressTime = 0

    const results: DirectMessageUserResult[] = []

    const notifyProgress = (userId: string) => {
      const now = Date.now()
      if (now - lastProgressTime >= PROGRESS_INTERVAL_MS || completed === total) {
        lastProgressTime = now
        onProgress?.({
          done: completed,
          total,
          success: successCount,
          fail: failCount,
          userId
        })
      }
    }

    const worker = async () => {
      while (!cancelled) {
        const loopStart = Date.now()
        const taskIndex = nextTaskIndex++
        if (taskIndex >= total) break

        if (shouldCancel?.()) {
          cancelled = true
          break
        }

        const userId = uniqueUserIds[taskIndex]
        const result = await this.sendOne(userId, message, imageUrls, localFilePaths)
        results.push(result)

        if (result.success) {
          successCount += 1
        } else {
          failCount += 1
        }

        completed += 1
        notifyProgress(userId)

        const elapsed = Date.now() - loopStart
        if (elapsed < MIN_SEND_INTERVAL_MS) {
          await sleep(MIN_SEND_INTERVAL_MS - elapsed)
        }
      }
    }

    const workerCount = Math.min(workerLimit, total)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    return {
      totalRequested: total,
      totalSucceeded: successCount,
      totalFailed: failCount,
      cancelled,
      results
    }
  }
}
