import type {
  SlackUser,
  SlackChannel,
  AuthCredentials,
  InviteResult,
  MultiInviteBatchResult,
  BroadcastBatchResult,
  SlackMessageActivity
} from './types'
import { createReadStream, statSync } from 'fs'
import { basename } from 'path'

const SLACK_API_BASE = 'https://slack.com/api'
const PAGINATION_DELAY_MS = 1000 // ページネーション間のディレイ
const MAX_RETRIES = 5
const HISTORY_LIMIT_PER_CHANNEL = 80

export class RateLimitError extends Error {
  retryAfterSeconds: number
  constructor(message: string, retryAfterSeconds: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class SlackClient {
  private token: string
  private cookie: string

  constructor(credentials: AuthCredentials) {
    this.token = credentials.token
    this.cookie = credentials.cookie
  }

  private async call(method: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${SLACK_API_BASE}/${method}`)
    const body = new URLSearchParams({ token: this.token, ...params })

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `d=${this.cookie}`
        },
        body: body.toString()
      })

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '30', 10)
        if (attempt < MAX_RETRIES) {
          console.log(`Rate limited, waiting ${retryAfter}s... (${attempt}/${MAX_RETRIES})`)
          await sleep(retryAfter * 1000)
          continue
        }
        const minutes = Math.ceil(retryAfter / 60)
        throw new RateLimitError(
          `Slack API のリクエスト制限に達しました。${minutes}分ほど時間をおいてからもう一度お試しください。`,
          retryAfter
        )
      }

      if (!res.ok) {
        throw new Error(`Slack API error: ${res.status} ${res.statusText}`)
      }

      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!data.ok) {
        if (data.error === 'ratelimited') {
          if (attempt < MAX_RETRIES) {
            console.log(`Rate limited (body), waiting 30s... (${attempt}/${MAX_RETRIES})`)
            await sleep(30_000)
            continue
          }
          throw new RateLimitError(
            'Slack API のリクエスト制限に達しました。2〜3分ほど時間をおいてからもう一度お試しください。',
            120
          )
        }
        throw new Error(`Slack API error: ${data.error}`)
      }
      return data
    }

    throw new Error('Slack API: max retries exceeded')
  }

  async validateToken(): Promise<{ userId: string; teamId: string; team: string }> {
    const data = (await this.call('auth.test')) as {
      user_id: string
      team_id: string
      team: string
    }
    return { userId: data.user_id, teamId: data.team_id, team: data.team }
  }

  async *fetchAllUsers(): AsyncGenerator<SlackUser[]> {
    let cursor = ''
    let isFirst = true
    do {
      if (!isFirst) await sleep(PAGINATION_DELAY_MS)
      isFirst = false

      const params: Record<string, string> = { limit: '200' }
      if (cursor) params.cursor = cursor

      const data = (await this.call('users.list', params)) as {
        members: Array<{
          id: string
          name: string
          profile: {
            display_name: string
            real_name: string
            image_72: string
          }
          is_bot: boolean
          deleted: boolean
        }>
        response_metadata?: { next_cursor?: string }
      }

      const users: SlackUser[] = data.members.map((m) => ({
        id: m.id,
        name: m.name, // username = 学籍番号
        displayName: m.profile.display_name,
        realName: m.profile.real_name,
        avatarUrl: m.profile.image_72,
        isBot: m.is_bot,
        isDeleted: m.deleted
      }))

      yield users
      cursor = data.response_metadata?.next_cursor ?? ''
    } while (cursor)
  }

  async *fetchAllChannels(): AsyncGenerator<SlackChannel[]> {
    let cursor = ''
    let isFirst = true
    do {
      if (!isFirst) await sleep(PAGINATION_DELAY_MS)
      isFirst = false

      const params: Record<string, string> = {
        limit: '200',
        types: 'public_channel,private_channel'
      }
      if (cursor) params.cursor = cursor

      const data = (await this.call('conversations.list', params)) as {
        channels: Array<{
          id: string
          name: string
          is_private: boolean
          is_member: boolean
          num_members: number
        }>
        response_metadata?: { next_cursor?: string }
      }

      const channels: SlackChannel[] = data.channels.map((c) => ({
        id: c.id,
        name: c.name,
        isPrivate: c.is_private,
        isMember: c.is_member,
        memberCount: c.num_members
      }))

      yield channels
      cursor = data.response_metadata?.next_cursor ?? ''
    } while (cursor)
  }

  async fetchChannelMembers(channelId: string, candidateUserIds?: string[]): Promise<string[]> {
    const members: string[] = []
    const candidateSet = candidateUserIds ? new Set(candidateUserIds) : null
    let cursor = ''
    let isFirst = true

    do {
      if (!isFirst) await sleep(PAGINATION_DELAY_MS)
      isFirst = false

      const params: Record<string, string> = {
        channel: channelId,
        limit: '1000'
      }
      if (cursor) params.cursor = cursor

      const data = (await this.call('conversations.members', params)) as {
        members: string[]
        response_metadata?: { next_cursor?: string }
      }

      if (candidateSet) {
        for (const memberId of data.members) {
          if (candidateSet.has(memberId)) {
            members.push(memberId)
          }
        }

        if (members.length >= candidateSet.size) {
          break
        }
      } else {
        members.push(...data.members)
      }
      cursor = data.response_metadata?.next_cursor ?? ''
    } while (cursor)

    return members
  }

  async openDirectMessage(userId: string): Promise<string> {
    const data = (await this.call('conversations.open', {
      users: userId,
      return_im: 'true'
    })) as {
      channel?: {
        id?: string
      }
    }

    const channelId = data.channel?.id
    if (!channelId) {
      throw new Error(`DM チャンネルを開けませんでした: ${userId}`)
    }

    return channelId
  }

  async fetchRecentMessagesForChannel(channelId: string): Promise<SlackMessageActivity[]> {
    const data = (await this.call('conversations.history', {
      channel: channelId,
      limit: String(HISTORY_LIMIT_PER_CHANNEL),
      inclusive: 'true'
    })) as {
      messages: SlackApiMessage[]
    }

    const collected = new Map<string, SlackMessageActivity>()

    const addMessages = (messages: SlackApiMessage[]) => {
      for (const message of messages) {
        const activity = this.toMessageActivity(channelId, message)
        if (activity) {
          collected.set(activity.id, activity)
        }
      }
    }

    addMessages(data.messages)

    for (const message of data.messages) {
      if (!message.reply_count || !message.thread_ts || message.thread_ts !== message.ts) continue
      await sleep(PAGINATION_DELAY_MS)
      const replies = (await this.call('conversations.replies', {
        channel: channelId,
        ts: message.thread_ts,
        limit: '100'
      })) as {
        messages: SlackApiMessage[]
      }
      addMessages(replies.messages)
    }

    return Array.from(collected.values())
  }

  private toMessageActivity(
    channelId: string,
    message: SlackApiMessage
  ): SlackMessageActivity | null {
    if (message.hidden || !message.user || !message.text) return null

    const normalizedText = message.text.trim()
    if (!normalizedText) return null

    return {
      id: `${channelId}:${message.ts}`,
      userId: message.user,
      channelId,
      text: normalizedText,
      ts: message.ts,
      threadTs: message.thread_ts ?? null,
      isThreadReply: Boolean(message.thread_ts && message.thread_ts !== message.ts),
      replyCount: message.reply_count ?? 0,
      lastActivityTs: message.latest_reply ?? message.ts
    }
  }

  async postMessage(
    channelId: string,
    text: string,
    imageUrls?: string[] | null,
    fileIds?: string[] | null
  ): Promise<{ ok: boolean; ts: string }> {
    const params: Record<string, string> = {
      channel: channelId
    }

    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text
        }
      }
    ]

    let hasBlocks = false

    // リモートURLの画像
    if (imageUrls && imageUrls.length > 0) {
      for (const url of imageUrls) {
        blocks.push({
          type: 'image',
          image_url: url,
          alt_text: 'image'
        })
      }
      hasBlocks = true
    }

    // Slack 内部ファイルIDの画像 (ネイティブ表示)
    if (fileIds && fileIds.length > 0) {
      for (const fileId of fileIds) {
        blocks.push({
          type: 'image',
          slack_file: {
            id: fileId
          },
          alt_text: 'image'
        })
      }
      hasBlocks = true
    }

    if (hasBlocks) {
      params.blocks = JSON.stringify(blocks)
    } else {
      params.text = text
    }

    try {
      const data = (await this.call('chat.postMessage', params)) as { ok: boolean; ts: string }
      return data
    } catch (error: any) {
      if (error.message.includes('not_in_channel')) {
        console.log(`[SlackClient] Not in channel ${channelId}, attempting to join and retry...`)
        const joined = await this.joinChannel(channelId)
        if (joined) {
          return (await this.call('chat.postMessage', params)) as { ok: boolean; ts: string }
        }
      }
      throw error
    }
  }

  async joinChannel(channelId: string): Promise<boolean> {
    const data = (await this.call('conversations.join', {
      channel: channelId
    })) as { ok: boolean }
    return data.ok
  }

  /** 単発リクエスト（リトライなし）— 高速送信用 */
  async postMessageRaw(channelId: string, text: string, imageUrls?: string[] | null): Promise<boolean> {
    try {
      const url = `${SLACK_API_BASE}/chat.postMessage`
      const params = new URLSearchParams({
        token: this.token,
        channel: channelId
      })

      if (imageUrls && imageUrls.length > 0) {
        const blocks: any[] = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text
            }
          }
        ]
        for (const url of imageUrls) {
          blocks.push({
            type: 'image',
            image_url: url,
            alt_text: 'image'
          })
        }
        params.append('blocks', JSON.stringify(blocks))
      } else {
        params.append('text', text)
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `d=${this.cookie}`
        },
        body: params.toString()
      })
      if (!resp.ok) return false
      const json = (await resp.json()) as { ok: boolean; error?: string }

      if (!json.ok && json.error === 'not_in_channel') {
        console.log(`[Broadcast] Not in channel ${channelId}, attempting to join...`)
        const joined = await this.joinChannel(channelId)
        if (joined) {
          // Joinに成功したら一度だけリトライ
          return await this.postMessageRaw(channelId, text, imageUrls)
        }
      }

      return json.ok === true
    } catch {
      return false
    }
  }

  /** ファイアアンドフォーゲット — レスポンスを待たない最速モード */
  postMessageFireAndForget(channelId: string, text: string): void {
    const url = `${SLACK_API_BASE}/chat.postMessage`
    const body = new URLSearchParams({
      token: this.token,
      channel: channelId,
      text
    })
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `d=${this.cookie}`
      },
      body: body.toString()
    }).catch(() => {}) // 完全にエラーを無視
  }

  async inviteUsersToChannel(channelId: string, userIds: string[]): Promise<InviteResult> {
    const result: InviteResult = {
      channelId,
      succeeded: [],
      failed: [],
      alreadyInChannel: []
    }

    const batchSize = 30
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize)

      try {
        await this.call('conversations.invite', {
          channel: channelId,
          users: batch.join(',')
        })
        result.succeeded.push(...batch)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)

        if (msg.includes('already_in_channel')) {
          result.alreadyInChannel.push(...batch)
        } else {
          for (const userId of batch) {
            try {
              await this.call('conversations.invite', {
                channel: channelId,
                users: userId
              })
              result.succeeded.push(userId)
            } catch (individualError) {
              const individualMsg =
                individualError instanceof Error
                  ? individualError.message
                  : String(individualError)

              if (individualMsg.includes('already_in_channel')) {
                result.alreadyInChannel.push(userId)
              } else {
                result.failed.push({ userId, error: individualMsg })
              }
            }
          }
        }
      }

      // 招待バッチ間もディレイ
      if (i + batchSize < userIds.length) {
        await sleep(PAGINATION_DELAY_MS)
      }
    }

    return result
  }

  private async getExternalUploadTarget(
    fileName: string,
    length: number
  ): Promise<{ uploadUrl: string; fileId: string }> {
    const body = new URLSearchParams({
      token: this.token,
      filename: fileName,
      length: String(length)
    })

    const response = await fetch(`${SLACK_API_BASE}/files.getUploadURLExternal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `d=${this.cookie}`
      },
      body: body.toString()
    })

    if (!response.ok) {
      throw new Error(`Failed to get upload URL: ${response.status}`)
    }

    const data = (await response.json()) as {
      ok: boolean
      upload_url: string
      file_id: string
      error?: string
    }

    if (!data.ok) {
      throw new Error(`Slack files.getUploadURLExternal error: ${data.error}`)
    }

    return {
      uploadUrl: data.upload_url,
      fileId: data.file_id
    }
  }

  private async uploadBinaryFile(filePath: string, uploadUrl: string, length: number): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(length)
      },
      body: createReadStream(filePath) as any,
      duplex: 'half'
    })

    if (!response.ok) {
      throw new Error(`Failed to upload binary to Slack storage: ${response.status}`)
    }
  }

  private async prepareExternalUpload(filePath: string): Promise<{ fileId: string; fileName: string }> {
    const stats = statSync(filePath)
    const fileName = basename(filePath) || 'attachment'
    const { uploadUrl, fileId } = await this.getExternalUploadTarget(fileName, stats.size)

    await this.uploadBinaryFile(filePath, uploadUrl, stats.size)

    return { fileId, fileName }
  }

  private async completeExternalUpload(
    files: Array<{ id: string; title: string }>,
    options?: {
      channelId?: string
      channels?: string[]
      initialComment?: string
    }
  ): Promise<void> {
    const body = new URLSearchParams({
      token: this.token,
      files: JSON.stringify(files)
    })

    if (options?.channelId) {
      body.set('channel_id', options.channelId)
    }
    if (options?.channels && options.channels.length > 0) {
      body.set('channels', options.channels.join(','))
    }
    if (options?.initialComment) {
      body.set('initial_comment', options.initialComment)
    }

    const response = await fetch(`${SLACK_API_BASE}/files.completeUploadExternal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `d=${this.cookie}`
      },
      body: body.toString()
    })

    if (!response.ok) {
      throw new Error(`Failed to complete upload: ${response.status}`)
    }

    const data = (await response.json()) as { ok: boolean; error?: string }
    if (!data.ok) {
      throw new Error(`Slack files.completeUploadExternal error: ${data.error}`)
    }
  }

  async shareLocalFilesToChannel(
    channelId: string,
    filePaths: string[],
    initialComment?: string
  ): Promise<{ fileIds: string[] }> {
    const uniqueFilePaths = Array.from(new Set(filePaths))
    const uploads: Array<{ fileId: string; fileName: string }> = []

    for (const filePath of uniqueFilePaths) {
      uploads.push(await this.prepareExternalUpload(filePath))
    }

    const completeShare = async () => {
      await this.completeExternalUpload(
        uploads.map((upload) => ({
          id: upload.fileId,
          title: upload.fileName
        })),
        {
          channelId,
          initialComment: initialComment?.trim() || undefined
        }
      )
    }

    try {
      await completeShare()
    } catch (error: any) {
      if (error.message?.includes('not_in_channel')) {
        const joined = await this.joinChannel(channelId)
        if (joined) {
          await completeShare()
        } else {
          throw error
        }
      } else {
        throw error
      }
    }

    return {
      fileIds: uploads.map((upload) => upload.fileId)
    }
  }

  /** 画像をアップロードして、ファイルID（および後方互換性のためのURL）を取得する */
  async uploadImage(filePath: string): Promise<{ fileId: string; publicUrl?: string }> {
    console.log(`[SlackClient] Starting upload (Tiered): ${filePath}`)
    const upload = await this.prepareExternalUpload(filePath)
    await this.completeExternalUpload([{ id: upload.fileId, title: upload.fileName }])
    console.log(`[SlackClient] Upload completely finished: ${upload.fileId}`)

    // 互換性のために一応公開URL作成も試みる
    let publicUrl: string | undefined
    try {
      const sharedRes = await fetch(`${SLACK_API_BASE}/files.sharedPublicURL`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `d=${this.cookie}`
        },
        body: new URLSearchParams({
          token: this.token,
          file: upload.fileId
        })
      })
      const sharedData = await sharedRes.json() as { ok: boolean; file: { permalink_public: string } }
      if (sharedData.ok) {
        publicUrl = sharedData.file.permalink_public
      }
    } catch (e) {
      console.warn(`[SlackClient] Failed to share public URL, but continuing with fileId: ${e}`)
    }

    return { fileId: upload.fileId, publicUrl }
  }

  /** @deprecated uploadImage を使用してください */
  async uploadPublicImage(filePath: string): Promise<string> {
    const { publicUrl, fileId } = await this.uploadImage(filePath)
    return publicUrl || `https://files.slack.com/files-pri/${this.token.split('-')[1]}-${fileId}/`
  }
}

interface SlackApiMessage {
  user?: string
  text?: string
  ts: string
  thread_ts?: string
  reply_count?: number
  latest_reply?: string
  subtype?: string
  hidden?: boolean
}
