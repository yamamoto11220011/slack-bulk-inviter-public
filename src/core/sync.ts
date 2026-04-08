import { SlackClient } from './slack-client'
import { AppDatabase } from './database'
import { CategoryEngine } from './category'

export class SyncService {
  constructor(
    private client: SlackClient,
    private db: AppDatabase,
    private categoryEngine: CategoryEngine
  ) {}

  async syncUsers(onProgress?: (count: number) => void): Promise<number> {
    let total = 0
    for await (const batch of this.client.fetchAllUsers()) {
      const classified = this.categoryEngine.classifyAll(batch)
      this.db.upsertUsers(classified)
      total += batch.length
      onProgress?.(total)
    }
    this.db.setSyncTime('users')
    return total
  }

  async syncChannels(onProgress?: (count: number) => void): Promise<number> {
    let total = 0
    const fetchedChannelIds: string[] = []
    for await (const batch of this.client.fetchAllChannels()) {
      this.db.upsertChannels(batch)
      batch.forEach((ch) => fetchedChannelIds.push(ch.id))
      total += batch.length
      onProgress?.(total)
    }

    // 取得できなかったチャンネル（退出・削除）を非アクティブ化
    if (fetchedChannelIds.length > 0) {
      this.db.deactivateMissingChannels(fetchedChannelIds)
    }

    this.db.setSyncTime('channels')
    return total
  }

  async syncChannelMembers(channelId: string): Promise<number> {
    const memberIds = await this.client.fetchChannelMembers(channelId)
    this.db.replaceChannelMemberships(channelId, memberIds)
    return memberIds.length
  }

  async syncMessages(onProgress?: (count: number) => void): Promise<number> {
    let channels = this.db.getChannels(true)

    if (channels.length === 0) {
      for await (const batch of this.client.fetchAllChannels()) {
        this.db.upsertChannels(batch)
      }
      channels = this.db.getChannels(true)
    }

    const allMessages = []
    let total = 0

    for (const channel of channels) {
      try {
        const messages = await this.client.fetchRecentMessagesForChannel(channel.id)
        allMessages.push(...messages)
        total += messages.length
        onProgress?.(total)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (
          message.includes('channel_not_found') ||
          message.includes('not_in_channel') ||
          message.includes('missing_scope')
        ) {
          console.warn(
            `Skip message sync for channel "${channel.name}" (${channel.id}): ${message}`
          )
          continue
        }
        throw error
      }
    }

    this.db.replaceMessagesForChannels(
      channels.map((channel) => channel.id),
      allMessages
    )
    this.db.setSyncTime('messages')
    return total
  }

  async syncAll(
    onProgress?: (type: string, count: number) => void
  ): Promise<{ users: number; channels: number; messages: number }> {
    const users = await this.syncUsers((count) => onProgress?.('users', count))
    const channels = await this.syncChannels((count) => onProgress?.('channels', count))
    const messages = await this.syncMessages((count) => onProgress?.('messages', count))
    return { users, channels, messages }
  }
}
