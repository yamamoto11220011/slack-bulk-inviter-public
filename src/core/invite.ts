import { SlackClient } from './slack-client'
import type {
  InviteBatchResult,
  InvitePreviewChannelResult,
  InvitePreviewResult,
  MultiInviteBatchResult
} from './types'

const RATE_LIMIT_DELAY_MS = 1200 // ~50 req/min for Tier 3
const PREFETCH_MEMBER_THRESHOLD = 20

export class InviteService {
  constructor(private client: SlackClient) {}

  async previewInvite(
    channelId: string,
    userIds: string[],
    channelName: string | null = null
  ): Promise<InvitePreviewChannelResult> {
    const uniqueUserIds = Array.from(new Set(userIds))
    const existingMembers = new Set(await this.client.fetchChannelMembers(channelId, uniqueUserIds))
    const alreadyInChannelUserIds = uniqueUserIds.filter((userId) => existingMembers.has(userId))
    const invitableUserIds = uniqueUserIds.filter((userId) => !existingMembers.has(userId))

    return {
      channelId,
      channelName,
      requestedCount: uniqueUserIds.length,
      invitableCount: invitableUserIds.length,
      alreadyInChannelCount: alreadyInChannelUserIds.length,
      invitableUserIds,
      alreadyInChannelUserIds
    }
  }

  async previewForChannels(
    channelIds: string[],
    userIds: string[],
    channelNameById?: Map<string, string>
  ): Promise<InvitePreviewResult> {
    const uniqueUserIds = Array.from(new Set(userIds))
    const channelResults: InvitePreviewChannelResult[] = []

    for (const channelId of channelIds) {
      const preview = await this.previewInvite(
        channelId,
        uniqueUserIds,
        channelNameById?.get(channelId) ?? null
      )
      channelResults.push(preview)
    }

    return {
      channelIds: [...channelIds],
      requestedUserIds: uniqueUserIds,
      totalRequested: channelIds.length * uniqueUserIds.length,
      totalInvitable: channelResults.reduce((sum, item) => sum + item.invitableCount, 0),
      totalAlreadyInChannel: channelResults.reduce((sum, item) => sum + item.alreadyInChannelCount, 0),
      channelResults
    }
  }

  async inviteBatch(
    channelId: string,
    userIds: string[],
    onProgress?: (done: number, total: number) => void,
    shouldCancel?: () => boolean
  ): Promise<InviteBatchResult & { processedCount: number; cancelled: boolean }> {
    const uniqueUserIds = Array.from(new Set(userIds))
    const result: InviteBatchResult = {
      channelId,
      totalRequested: uniqueUserIds.length,
      totalSucceeded: 0,
      totalFailed: 0,
      totalAlreadyInChannel: 0,
      details: []
    }

    // Split into chunks to show progress and respect rate limits
    const chunkSize = 30
    let done = 0
    let pendingUserIds = uniqueUserIds

    if (uniqueUserIds.length >= PREFETCH_MEMBER_THRESHOLD) {
      try {
        const existingMembers = new Set(
          await this.client.fetchChannelMembers(channelId, uniqueUserIds)
        )

        if (existingMembers.size > 0) {
          const alreadyInChannel = uniqueUserIds.filter((userId) => existingMembers.has(userId))
          pendingUserIds = uniqueUserIds.filter((userId) => !existingMembers.has(userId))
          result.totalAlreadyInChannel = alreadyInChannel.length
          result.details.push({
            channelId,
            succeeded: [],
            failed: [],
            alreadyInChannel
          })
          done = alreadyInChannel.length
          onProgress?.(done, uniqueUserIds.length)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`Skip invite precheck for channel ${channelId}: ${message}`)
      }
    }

    for (let i = 0; i < pendingUserIds.length; i += chunkSize) {
      if (shouldCancel?.()) {
        return { ...result, processedCount: done, cancelled: true }
      }

      const chunk = pendingUserIds.slice(i, i + chunkSize)
      const inviteResult = await this.client.inviteUsersToChannel(channelId, chunk)

      result.details.push(inviteResult)
      result.totalSucceeded += inviteResult.succeeded.length
      result.totalFailed += inviteResult.failed.length
      result.totalAlreadyInChannel += inviteResult.alreadyInChannel.length

      done += chunk.length
      onProgress?.(done, uniqueUserIds.length)

      // Rate limit pause between chunks
      if (i + chunkSize < pendingUserIds.length) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
      }
    }

    return { ...result, processedCount: done, cancelled: false }
  }

  async inviteToChannels(
    channelIds: string[],
    userIds: string[],
    onProgress?: (done: number, total: number, channelId: string) => void,
    shouldCancel?: () => boolean
  ): Promise<MultiInviteBatchResult> {
    const aggregate: MultiInviteBatchResult = {
      channelIds,
      totalRequested: channelIds.length * userIds.length,
      totalSucceeded: 0,
      totalFailed: 0,
      totalAlreadyInChannel: 0,
      cancelled: false,
      channelResults: []
    }

    let overallDone = 0
    const total = aggregate.totalRequested

    for (const channelId of channelIds) {
      if (shouldCancel?.()) {
        aggregate.cancelled = true
        break
      }

      const channelResult = await this.inviteBatch(
        channelId,
        userIds,
        (done) => onProgress?.(overallDone + done, total, channelId),
        shouldCancel
      )

      aggregate.channelResults.push({
        channelId: channelResult.channelId,
        totalRequested: channelResult.totalRequested,
        totalSucceeded: channelResult.totalSucceeded,
        totalFailed: channelResult.totalFailed,
        totalAlreadyInChannel: channelResult.totalAlreadyInChannel,
        details: channelResult.details
      })
      aggregate.totalSucceeded += channelResult.totalSucceeded
      aggregate.totalFailed += channelResult.totalFailed
      aggregate.totalAlreadyInChannel += channelResult.totalAlreadyInChannel
      overallDone += channelResult.processedCount

      if (channelResult.cancelled) {
        aggregate.cancelled = true
        break
      }
    }

    return aggregate
  }
}
