import { createHash, randomUUID } from 'crypto'
import { AppDatabase } from './database'
import { BroadcastService, type BroadcastProgress } from './broadcast'
import { DirectMessageService } from './direct-message'
import { InviteService } from './invite'
import { SlackClient } from './slack-client'
import type {
  BroadcastExecutionItemResult,
  DirectMessageExecutionItemResult,
  DirectMessageProgress,
  InviteExecutionItemResult,
  InvitePreviewResult,
  OperationJobInput,
  OperationJobItemInput,
  OperationMode,
  OperationSummary,
  OperationTaskDetail,
  OperationTaskInput
} from './types'

function isoNow(): string {
  return new Date().toISOString()
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function completedCount(summary: OperationSummary): number {
  return (
    summary.successCount +
    summary.failedCount +
    summary.skippedCount +
    summary.canceledCount
  )
}

function createSummaryFromStatuses(statuses: Array<'pending' | 'success' | 'failed' | 'skipped' | 'canceled'>): OperationSummary {
  const summary: OperationSummary = {
    totalItems: statuses.length,
    pendingCount: 0,
    processingCount: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    canceledCount: 0
  }

  for (const status of statuses) {
    if (status === 'pending') summary.pendingCount += 1
    if (status === 'success') summary.successCount += 1
    if (status === 'failed') summary.failedCount += 1
    if (status === 'skipped') summary.skippedCount += 1
    if (status === 'canceled') summary.canceledCount += 1
  }

  return summary
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export class JobManager {
  constructor(
    private db: AppDatabase,
    private client: SlackClient
  ) {}

  private getTaskOrThrow(taskId: string): OperationTaskDetail {
    const task = this.db.getOperationTask(taskId)
    if (!task) {
      throw new Error(`ジョブが見つかりません: ${taskId}`)
    }
    return task
  }

  private getJobItemsForRetry(jobId: string) {
    return this.db.getOperationJobItems(jobId, ['pending', 'failed'])
  }

  createInviteTask(params: {
    channelIds: string[]
    channelNameById: Map<string, string>
    userIds: string[]
    userNameById: Map<string, string>
    mode: OperationMode
    csvFileName?: string | null
    preview?: InvitePreviewResult
  }): OperationTaskDetail {
    const now = isoNow()
    const channelIds = unique(params.channelIds)
    const userIds = unique(params.userIds)
    const payloadHash = hashPayload({
      type: 'invite',
      mode: params.mode,
      channelIds: [...channelIds].sort(),
      userIds: [...userIds].sort(),
      csvFileName: params.csvFileName ?? null
    })

    const taskId = randomUUID()
    const previewByChannel = new Map(
      (params.preview?.channelResults ?? []).map((channelResult) => [channelResult.channelId, channelResult])
    )

    const jobs: OperationJobInput[] = []
    const items: OperationJobItemInput[] = []
    const taskStatuses: Array<'pending' | 'success' | 'failed' | 'skipped' | 'canceled'> = []

    for (const channelId of channelIds) {
      const preview = previewByChannel.get(channelId)
      const alreadySet = new Set(preview?.alreadyInChannelUserIds ?? [])
      const jobStatuses: Array<'pending' | 'success' | 'failed' | 'skipped' | 'canceled'> = []
      const jobId = randomUUID()
      const channelName = params.channelNameById.get(channelId) ?? null
      const jobPayloadHash = hashPayload({
        taskPayloadHash: payloadHash,
        channelId,
        userIds: [...userIds].sort()
      })

      for (const userId of userIds) {
        const status =
          alreadySet.has(userId) || params.mode === 'dry-run'
            ? 'skipped'
            : 'pending'
        const result =
          status === 'skipped'
            ? {
                channelId,
                userId,
                reason: alreadySet.has(userId) ? 'already_in_channel' : 'dry_run_preview'
              }
            : null

        items.push({
          id: randomUUID(),
          taskId,
          jobId,
          operationType: 'invite',
          status,
          targetId: userId,
          targetLabel: params.userNameById.get(userId) ?? null,
          idempotencyKey: `invite:${channelId}:${userId}:${payloadHash}`,
          payloadHash: hashPayload({
            taskPayloadHash: payloadHash,
            channelId,
            userId
          }),
          payload: {
            channelId,
            channelName,
            userId,
            userName: params.userNameById.get(userId) ?? null
          },
          result,
          createdAt: now,
          updatedAt: now,
          completedAt: status === 'skipped' ? now : null
        })
        jobStatuses.push(status)
        taskStatuses.push(status)
      }

      jobs.push({
        id: jobId,
        taskId,
        operationType: 'invite',
        title: channelName ? `#${channelName} への招待` : `${channelId} への招待`,
        status: params.mode === 'dry-run' || jobStatuses.every((status) => status === 'skipped')
          ? 'skipped'
          : 'pending',
        targetType: 'channel',
        targetId: channelId,
        targetLabel: channelName,
        idempotencyKey: `invite:${channelId}:${payloadHash}`,
        payloadHash: jobPayloadHash,
        metadata: {
          channelId,
          channelName
        },
        summary: createSummaryFromStatuses(jobStatuses),
        createdAt: now,
        updatedAt: now,
        completedAt:
          params.mode === 'dry-run' || jobStatuses.every((status) => status === 'skipped')
            ? now
            : null
      })
    }

    const taskSummary = createSummaryFromStatuses(taskStatuses)
    const task: OperationTaskInput = {
      id: taskId,
      operationType: 'invite',
      mode: params.mode,
      title: `招待 ${userIds.length}人 x ${channelIds.length}ch`,
      status:
        params.mode === 'dry-run'
          ? 'skipped'
          : taskSummary.pendingCount > 0
            ? 'pending'
            : 'skipped',
      idempotencyKey: `invite:${payloadHash}`,
      payloadHash,
      metadata: {
        channelIds,
        channelNames: channelIds.map((channelId) => params.channelNameById.get(channelId) ?? channelId),
        userIds,
        csvFileName: params.csvFileName ?? null
      },
      totalJobs: jobs.length,
      summary: taskSummary,
      createdAt: now,
      updatedAt: now,
      completedAt: params.mode === 'dry-run' ? now : null
    }

    this.db.createOperationTaskGraph(task, jobs, items)
    return this.getTaskOrThrow(taskId)
  }

  async runInviteTask(
    taskId: string,
    options?: {
      onProgress?: (progress: { done: number; total: number; channelId: string }) => void
      shouldCancel?: () => boolean
    }
  ): Promise<OperationTaskDetail> {
    const task = this.getTaskOrThrow(taskId)
    if (task.operationType !== 'invite') {
      throw new Error('招待ジョブではありません。')
    }
    if (task.mode === 'dry-run') {
      return task
    }

    const inviteService = new InviteService(this.client)
    this.db.markOperationTaskProcessing(taskId)

    let cancelled = false

    for (const job of task.jobs) {
      const pendingItems = this.getJobItemsForRetry(job.id)
      if (pendingItems.length === 0) continue

      this.db.markOperationJobProcessing(job.id)

      const userIds = pendingItems.map((item) => String(item.payload.userId ?? item.targetId))
      const itemIdByUserId = new Map(
        pendingItems.map((item) => [String(item.payload.userId ?? item.targetId), item.id])
      )

      const channelId = job.targetId

      for (const item of pendingItems) {
        this.db.markOperationJobItemProcessing(item.id)
      }

      const result = await inviteService.inviteBatch(
        channelId,
        userIds,
        undefined,
        options?.shouldCancel,
        (item: InviteExecutionItemResult) => {
          const itemId = itemIdByUserId.get(item.userId)
          if (!itemId) return

          this.db.completeOperationJobItem(
            itemId,
            item.status === 'success' ? 'success' : item.status === 'failed' ? 'failed' : 'skipped',
            {
              channelId: item.channelId,
              userId: item.userId,
              reason: item.status,
              error: item.error ?? null
            },
            item.error ?? null
          )

          const refreshedTask = this.getTaskOrThrow(taskId)
          options?.onProgress?.({
            done: completedCount(refreshedTask.summary),
            total: refreshedTask.summary.totalItems,
            channelId: item.channelId
          })
        }
      )

      if (result.cancelled) {
        cancelled = true
        break
      }
    }

    if (cancelled) {
      this.db.markPendingOperationItemsAsCanceled(taskId)
    } else {
      this.db.refreshOperationTask(taskId)
    }

    return this.getTaskOrThrow(taskId)
  }

  createDirectMessageTask(params: {
    userIds: string[]
    userNameById: Map<string, string>
    message: string
    imageUrls?: string[] | null
    localFilePaths?: string[] | null
  }): OperationTaskDetail {
    const now = isoNow()
    const userIds = unique(params.userIds)
    const payloadHash = hashPayload({
      type: 'direct_message',
      userIds: [...userIds].sort(),
      message: params.message,
      imageUrls: params.imageUrls ?? [],
      localFilePaths: params.localFilePaths ?? []
    })
    const taskId = randomUUID()
    const jobId = randomUUID()

    const items = userIds.map<OperationJobItemInput>((userId) => ({
      id: randomUUID(),
      taskId,
      jobId,
      operationType: 'direct_message',
      status: 'pending',
      targetId: userId,
      targetLabel: params.userNameById.get(userId) ?? null,
      idempotencyKey: `direct_message:${userId}:${payloadHash}`,
      payloadHash: hashPayload({
        taskPayloadHash: payloadHash,
        userId
      }),
      payload: {
        userId,
        userName: params.userNameById.get(userId) ?? null
      },
      createdAt: now,
      updatedAt: now
    }))

    const summary = createSummaryFromStatuses(items.map(() => 'pending'))
    const task: OperationTaskInput = {
      id: taskId,
      operationType: 'direct_message',
      mode: 'execute',
      title: `個別DM ${userIds.length}人`,
      status: 'pending',
      idempotencyKey: `direct_message:${payloadHash}`,
      payloadHash,
      metadata: {
        userIds,
        message: params.message,
        imageUrls: params.imageUrls ?? [],
        localFilePaths: params.localFilePaths ?? []
      },
      totalJobs: 1,
      summary,
      createdAt: now,
      updatedAt: now
    }

    const job: OperationJobInput = {
      id: jobId,
      taskId,
      operationType: 'direct_message',
      title: `DM送信 ${userIds.length}件`,
      status: 'pending',
      targetType: 'campaign',
      targetId: taskId,
      idempotencyKey: `direct_message:job:${payloadHash}`,
      payloadHash,
      metadata: {
        audienceSize: userIds.length
      },
      summary,
      createdAt: now,
      updatedAt: now
    }

    this.db.createOperationTaskGraph(task, [job], items)
    return this.getTaskOrThrow(taskId)
  }

  async runDirectMessageTask(
    taskId: string,
    options?: {
      onProgress?: (progress: DirectMessageProgress) => void
      shouldCancel?: () => boolean
    }
  ): Promise<OperationTaskDetail> {
    const task = this.getTaskOrThrow(taskId)
    if (task.operationType !== 'direct_message') {
      throw new Error('DMジョブではありません。')
    }

    const job = task.jobs[0]
    if (!job) return task

    const pendingItems = this.getJobItemsForRetry(job.id)
    if (pendingItems.length === 0) {
      return task
    }

    const metadata = task.metadata ?? {}
    const message = typeof metadata.message === 'string' ? metadata.message : ''
    const imageUrls = toStringArray(metadata.imageUrls)
    const localFilePaths = toStringArray(metadata.localFilePaths)
    const userIds = pendingItems.map((item) => String(item.payload.userId ?? item.targetId))
    const itemIdByUserId = new Map(
      pendingItems.map((item) => [String(item.payload.userId ?? item.targetId), item.id])
    )
    const service = new DirectMessageService(this.client)

    this.db.markOperationTaskProcessing(taskId)
    this.db.markOperationJobProcessing(job.id)

    for (const item of pendingItems) {
      this.db.markOperationJobItemProcessing(item.id)
    }

    const result = await service.sendBulk(
      userIds,
      message,
      imageUrls.length > 0 ? imageUrls : null,
      localFilePaths.length > 0 ? localFilePaths : null,
      undefined,
      options?.shouldCancel,
      (item: DirectMessageExecutionItemResult) => {
        const itemId = itemIdByUserId.get(item.userId)
        if (!itemId) return

        this.db.completeOperationJobItem(
          itemId,
          item.status === 'success' ? 'success' : 'failed',
          {
            userId: item.userId,
            channelId: item.channelId,
            error: item.error ?? null
          },
          item.error ?? null
        )

        const refreshedTask = this.getTaskOrThrow(taskId)
        options?.onProgress?.({
          done: completedCount(refreshedTask.summary),
          total: refreshedTask.summary.totalItems,
          success: refreshedTask.summary.successCount,
          fail: refreshedTask.summary.failedCount,
          userId: item.userId
        })
      }
    )

    if (result.cancelled) {
      this.db.markPendingOperationItemsAsCanceled(taskId)
    } else {
      this.db.refreshOperationTask(taskId)
    }

    return this.getTaskOrThrow(taskId)
  }

  createBroadcastTask(params: {
    channelIds: string[]
    channelNameById: Map<string, string>
    message: string
    repeatCount: number
    imageUrls?: string[] | null
    fileIds?: string[] | null
    localFilePaths?: string[] | null
    sourceTaskId?: string | null
    title?: string
  }): OperationTaskDetail {
    const now = isoNow()
    const channelIds = unique(params.channelIds)
    const repeatCount = Math.max(1, params.repeatCount)
    const payloadHash = hashPayload({
      type: 'broadcast',
      channelIds: [...channelIds].sort(),
      message: params.message,
      repeatCount,
      imageUrls: params.imageUrls ?? [],
      fileIds: params.fileIds ?? [],
      localFilePaths: params.localFilePaths ?? [],
      sourceTaskId: params.sourceTaskId ?? null
    })
    const taskId = randomUUID()
    const jobId = randomUUID()
    const items: OperationJobItemInput[] = []

    for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
      for (const channelId of channelIds) {
        items.push({
          id: randomUUID(),
          taskId,
          jobId,
          operationType: 'broadcast',
          status: 'pending',
          targetId: `${channelId}:${repeatIndex}`,
          targetLabel: params.channelNameById.get(channelId) ?? null,
          idempotencyKey: `broadcast:${channelId}:${repeatIndex}:${payloadHash}`,
          payloadHash: hashPayload({
            taskPayloadHash: payloadHash,
            channelId,
            repeatIndex
          }),
          payload: {
            channelId,
            channelName: params.channelNameById.get(channelId) ?? null,
            repeatIndex
          },
          createdAt: now,
          updatedAt: now
        })
      }
    }

    const summary = createSummaryFromStatuses(items.map(() => 'pending'))
    const task: OperationTaskInput = {
      id: taskId,
      operationType: 'broadcast',
      mode: 'execute',
      title: params.title ?? `一斉送信 ${items.length}件`,
      status: 'pending',
      idempotencyKey: `broadcast:${payloadHash}`,
      payloadHash,
      metadata: {
        channelIds,
        message: params.message,
        repeatCount,
        imageUrls: params.imageUrls ?? [],
        fileIds: params.fileIds ?? [],
        localFilePaths: params.localFilePaths ?? [],
        sourceTaskId: params.sourceTaskId ?? null
      },
      totalJobs: 1,
      summary,
      createdAt: now,
      updatedAt: now
    }

    const job: OperationJobInput = {
      id: jobId,
      taskId,
      operationType: 'broadcast',
      title: params.title ?? `一斉送信 ${items.length}件`,
      status: 'pending',
      targetType: 'campaign',
      targetId: params.sourceTaskId ?? taskId,
      targetLabel: params.title ?? null,
      idempotencyKey: `broadcast:job:${payloadHash}`,
      payloadHash,
      metadata: {
        channelIds,
        repeatCount
      },
      summary,
      createdAt: now,
      updatedAt: now
    }

    this.db.createOperationTaskGraph(task, [job], items)
    return this.getTaskOrThrow(taskId)
  }

  async runBroadcastTask(
    taskId: string,
    options?: {
      onProgress?: (progress: BroadcastProgress) => void
      shouldCancel?: () => boolean
    }
  ): Promise<OperationTaskDetail> {
    const task = this.getTaskOrThrow(taskId)
    if (task.operationType !== 'broadcast') {
      throw new Error('一斉送信ジョブではありません。')
    }

    const job = task.jobs[0]
    if (!job) return task

    const pendingItems = this.getJobItemsForRetry(job.id)
    if (pendingItems.length === 0) {
      return task
    }

    const metadata = task.metadata ?? {}
    const message = typeof metadata.message === 'string' ? metadata.message : ''
    const imageUrls = toStringArray(metadata.imageUrls)
    const fileIds = toStringArray(metadata.fileIds)
    const localFilePaths = toStringArray(metadata.localFilePaths)
    const service = new BroadcastService(this.client)
    const itemIdByKey = new Map(
      pendingItems.map((item) => {
        const channelId = String(item.payload.channelId ?? '')
        const repeatIndex = Number(item.payload.repeatIndex ?? 0)
        return [`${channelId}:${repeatIndex}`, item.id] as const
      })
    )
    const plan = pendingItems
      .map((item) => ({
        channelId: String(item.payload.channelId ?? ''),
        repeatIndex: Number(item.payload.repeatIndex ?? 0)
      }))
      .sort((a, b) => a.repeatIndex - b.repeatIndex)

    this.db.markOperationTaskProcessing(taskId)
    this.db.markOperationJobProcessing(job.id)

    for (const item of pendingItems) {
      this.db.markOperationJobItemProcessing(item.id)
    }

    const result = await service.executeDeliveryPlan(
      plan,
      message,
      imageUrls.length > 0 ? imageUrls : null,
      fileIds.length > 0 ? fileIds : null,
      localFilePaths.length > 0 ? localFilePaths : null,
      options?.onProgress,
      options?.shouldCancel,
      (item: BroadcastExecutionItemResult) => {
        const itemId = itemIdByKey.get(`${item.channelId}:${item.repeatIndex}`)
        if (!itemId) return

        this.db.completeOperationJobItem(
          itemId,
          item.status === 'success' ? 'success' : 'failed',
          {
            channelId: item.channelId,
            repeatIndex: item.repeatIndex,
            error: item.error ?? null
          },
          item.error ?? null
        )

        const refreshedTask = this.getTaskOrThrow(taskId)
        options?.onProgress?.({
          done: completedCount(refreshedTask.summary),
          total: refreshedTask.summary.totalItems,
          success: refreshedTask.summary.successCount,
          fail: refreshedTask.summary.failedCount,
          channelId: item.channelId
        })
      }
    )

    if (result.cancelled) {
      this.db.markPendingOperationItemsAsCanceled(taskId)
    } else {
      this.db.refreshOperationTask(taskId)
    }

    return this.getTaskOrThrow(taskId)
  }

  async resumeTask(
    taskId: string,
    options?: {
      onInviteProgress?: (progress: { done: number; total: number; channelId: string }) => void
      onDirectMessageProgress?: (progress: DirectMessageProgress) => void
      onBroadcastProgress?: (progress: BroadcastProgress) => void
      shouldCancel?: () => boolean
    }
  ): Promise<OperationTaskDetail> {
    const task = this.getTaskOrThrow(taskId)

    if (task.operationType === 'invite') {
      return this.runInviteTask(taskId, {
        onProgress: options?.onInviteProgress,
        shouldCancel: options?.shouldCancel
      })
    }

    if (task.operationType === 'direct_message') {
      return this.runDirectMessageTask(taskId, {
        onProgress: options?.onDirectMessageProgress,
        shouldCancel: options?.shouldCancel
      })
    }

    return this.runBroadcastTask(taskId, {
      onProgress: options?.onBroadcastProgress,
      shouldCancel: options?.shouldCancel
    })
  }

  listTasks(limit = 30) {
    return this.db.listOperationTasks(limit)
  }
}
