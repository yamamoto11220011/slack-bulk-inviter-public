import { ipcMain, app, safeStorage, BrowserWindow, dialog } from 'electron'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { openAuthWindow } from './auth-window'
import { AuthService } from '../core/auth'
import { AppDatabase } from '../core/database'
import { CategoryEngine } from '../core/category'
import { SlackClient } from '../core/slack-client'
import { SyncService } from '../core/sync'
import { InviteService } from '../core/invite'
import { parseInviteCsv } from '../core/invite-csv'
import { BroadcastManager } from '../core/broadcast-manager'
import { JobManager } from '../core/job-manager'
import { resolveSlackChannelId } from '../core/slack-target'
import type {
  AuditOverview,
  ClassifiedUser,
  CsvInviteImportResult,
  InviteLogEntry,
  InvitePreviewResult,
  InviteRunRecord,
  InviteRunStatus,
  InviteSummary,
  SlackChannel,
  BroadcastBatchResult,
  AudienceSelectionResult,
  DirectMessageBatchResult,
  DirectMessageProgress,
  SlackMessageActivity,
  BroadcastTask,
  BroadcastProgress,
  OperationTaskDetail,
  OperationTaskRecord
} from '../core/types'

let authService: AuthService
let db: AppDatabase | null = null
let categoryEngine: CategoryEngine
let activeInviteCancelled = false
let activeBroadcastCancelled = false
let activeDirectMessageCancelled = false
let broadcastManager: BroadcastManager | null = null
let activeInviteTaskId: string | null = null
let activeBroadcastTaskId: string | null = null
let activeDirectMessageTaskId: string | null = null

function getDataDir(): string {
  return join(app.getPath('userData'), 'data')
}

function getAuthService(): AuthService {
  if (!authService) {
    authService = new AuthService(getDataDir(), safeStorage)
  }
  return authService
}

async function getDatabase(): Promise<AppDatabase> {
  if (!db) {
    const auth = getAuthService()
    const dbKey = await auth.getOrCreateDbKey()
    const dbPath = join(getDataDir(), 'slack-data.sqlite')
    const legacyPath = join(getDataDir(), 'slack-data.enc')
    db = new AppDatabase(dbPath, dbKey, { legacyPath })
  }
  return db
}

function getCategoryEngine(): CategoryEngine {
  if (!categoryEngine) {
    categoryEngine = new CategoryEngine()
    const defaultConfigPath = app.isPackaged
      ? join(process.resourcesPath, 'config', 'categories.yml')
      : join(app.getAppPath(), 'config', 'categories.yml')
    const configCandidates = [
      join(app.getPath('userData'), 'categories.local.yml'),
      join(app.getAppPath(), 'config', 'categories.local.yml'),
      defaultConfigPath
    ]
    categoryEngine.loadFromFirstExisting(configCandidates)
  }
  return categoryEngine
}

async function createSlackClient(): Promise<SlackClient> {
  const auth = getAuthService()
  const creds = await auth.getCredentials()
  if (!creds) throw new Error('未ログインです。先にログインしてください。')
  return new SlackClient(creds)
}

async function createJobManager(): Promise<JobManager> {
  const database = await getDatabase()
  const client = await createSlackClient()
  return new JobManager(database, client)
}

function getUserLabel(user: ClassifiedUser): string {
  return user.displayName || user.realName || user.name || user.id
}

function buildInviteSummaryFromTask(
  userIds: string[],
  channelIds: string[],
  preview: InvitePreviewResult,
  task: OperationTaskDetail
): InviteSummary {
  const alreadyInChannelCount = task.items.filter(
    (item) => item.result?.reason === 'already_in_channel'
  ).length

  return {
    requestedUsers: userIds.length,
    requestedChannels: channelIds.length,
    totalRequested: preview.totalRequested,
    totalSucceeded: task.mode === 'dry-run' ? preview.totalInvitable : task.summary.successCount,
    totalFailed: task.mode === 'dry-run' ? 0 : task.summary.failedCount,
    totalAlreadyInChannel: alreadyInChannelCount
  }
}

function buildInviteLogsFromTask(
  task: OperationTaskDetail,
  channelNameById: Map<string, string>,
  userNameById: Map<string, string>
): InviteLogEntry[] {
  return task.items.map((item) => {
    const payload = item.payload ?? {}
    const channelId =
      typeof payload.channelId === 'string' ? payload.channelId : 'unknown-channel'
    const userId = typeof payload.userId === 'string' ? payload.userId : item.targetId
    const reason = typeof item.result?.reason === 'string' ? item.result.reason : null
    let status: InviteLogEntry['status'] = 'planned'

    if (item.status === 'success') {
      status = 'success'
    } else if (item.status === 'failed') {
      status = 'failed'
    } else if (reason === 'already_in_channel') {
      status = 'already_in_channel'
    }

    return {
      timestamp: item.updatedAt,
      channelId,
      channelName: channelNameById.get(channelId) ?? null,
      userId,
      userName: userNameById.get(userId) ?? null,
      status,
      error: item.error ?? undefined
    }
  })
}

function deriveInviteStatusFromTask(task: OperationTaskDetail): InviteRunStatus {
  if (task.status === 'canceled') return 'cancelled'
  if (task.summary.successCount === 0 && task.summary.failedCount > 0) return 'failed'
  return 'completed'
}

function createInviteRunRecord(params: {
  mode: InviteRunRecord['mode']
  status: InviteRunStatus
  csvFileName?: string | null
  channelIds: string[]
  channelNames: string[]
  userIds: string[]
  preview: InvitePreviewResult
  summary: InviteSummary
  logs: InviteLogEntry[]
}): InviteRunRecord {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    mode: params.mode,
    status: params.status,
    csvFileName: params.csvFileName ?? null,
    channelIds: params.channelIds,
    channelNames: params.channelNames,
    userIds: params.userIds,
    preview: params.preview,
    summary: params.summary,
    logs: params.logs,
    createdAt: now,
    updatedAt: now
  }
}

function buildDirectMessageBatchResult(task: OperationTaskDetail): DirectMessageBatchResult {
  return {
    totalRequested: task.summary.totalItems,
    totalSucceeded: task.summary.successCount,
    totalFailed: task.summary.failedCount,
    cancelled: task.status === 'canceled',
    results: task.items.map((item) => ({
      userId: typeof item.payload.userId === 'string' ? item.payload.userId : item.targetId,
      channelId: typeof item.result?.channelId === 'string' ? item.result.channelId : null,
      success: item.status === 'success',
      error: item.error ?? undefined
    }))
  }
}

function buildBroadcastBatchResult(task: OperationTaskDetail): BroadcastBatchResult {
  const channelIds = Array.from(
    new Set(
      task.items
        .map((item) => item.payload.channelId)
        .filter((channelId): channelId is string => typeof channelId === 'string')
    )
  )

  return {
    channelIds,
    totalRequested: task.summary.totalItems,
    totalSucceeded: task.summary.successCount,
    totalFailed: task.summary.failedCount,
    cancelled: task.status === 'canceled',
    channelResults: channelIds.map((channelId) => {
      const channelItems = task.items.filter((item) => item.payload.channelId === channelId)
      return {
        channelId,
        success: channelItems.every((item) => item.status !== 'failed'),
        sentCount: channelItems.filter((item) => item.status === 'success').length,
        errors: channelItems
          .map((item) => item.error)
          .filter((error): error is string => Boolean(error))
      }
    })
  }
}

/** BroadcastManager を初期化して開始 */
async function ensureBroadcastManager() {
  if (broadcastManager) return broadcastManager

  try {
    const database = await getDatabase()
    const client = await createSlackClient()
    broadcastManager = new BroadcastManager(database, client, (progress) => {
      // すべてのウィンドウに進捗を通知
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('broadcast:progress', progress)
      })
    })
    broadcastManager.start()
    return broadcastManager
  } catch (error) {
    console.warn('[BroadcastManager] Skipped initialization (not logged in or Error):', error)
    return null
  }
}

export function registerIpcHandlers(): void {
  // 起動時にマネージャー初期化試行
  void ensureBroadcastManager()

  // ---- 認証 ----
  ipcMain.handle('auth:login', async (_event, workspaceUrl: string) => {
    const result = await openAuthWindow(workspaceUrl)
    const auth = getAuthService()
    await auth.saveCredentials({
      workspace: result.workspace,
      token: result.token,
      cookie: result.cookie
    })
    // ログイン成功後にマネージャーを開始
    void ensureBroadcastManager()
    return { workspace: result.workspace }
  })

  ipcMain.handle('auth:status', async () => {
    const auth = getAuthService()
    const creds = await auth.getCredentials()
    if (!creds) return { loggedIn: false }

    try {
      const client = new SlackClient(creds)
      const info = await client.validateToken()
      return { loggedIn: true, workspace: creds.workspace, team: info.team, userId: info.userId }
    } catch {
      return { loggedIn: false, error: 'トークンが無効です。再ログインしてください。' }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    const auth = getAuthService()
    await auth.clearCredentials()
    if (broadcastManager) {
      broadcastManager.stop()
      broadcastManager = null
    }
    db = null
    return { success: true }
  })

  // ---- 同期 ----
  ipcMain.handle('sync:all', async (event) => {
    const client = await createSlackClient()
    const database = await getDatabase()
    const engine = getCategoryEngine()
    const sync = new SyncService(client, database, engine)
    return await sync.syncAll((type, count) => {
      event.sender.send('sync:progress', { type, count })
    })
  })

  ipcMain.handle('sync:users', async (event) => {
    const client = await createSlackClient()
    const database = await getDatabase()
    const engine = getCategoryEngine()
    const sync = new SyncService(client, database, engine)
    const count = await sync.syncUsers((n) => {
      event.sender.send('sync:progress', { type: 'users', count: n })
    })
    return { count }
  })

  ipcMain.handle('sync:channels', async (event) => {
    const client = await createSlackClient()
    const database = await getDatabase()
    const engine = getCategoryEngine()
    const sync = new SyncService(client, database, engine)
    const count = await sync.syncChannels((n) => {
      event.sender.send('sync:progress', { type: 'channels', count: n })
    })
    return { count }
  })

  ipcMain.handle(
    'audience:excludeMembers',
    async (
      _event,
      userIds: string[],
      channelInput: string
    ): Promise<AudienceSelectionResult> => {
      const client = await createSlackClient()
      const database = await getDatabase()
      const channelId = resolveSlackChannelId(channelInput)
      const matchedMemberIds = await client.fetchChannelMembers(channelId, userIds)
      const excludedSet = new Set(matchedMemberIds)
      const selectedUserIds = userIds.filter((userId) => !excludedSet.has(userId))
      const channelName =
        database.getChannels().find((channel) => channel.id === channelId)?.name ?? null

      return {
        channelId,
        channelName,
        sourceCount: userIds.length,
        targetCount: selectedUserIds.length,
        excludedCount: matchedMemberIds.length,
        selectedUserIds,
        excludedUserIds: matchedMemberIds
      }
    }
  )

  // ---- データ取得 ----
  ipcMain.handle('users:list', async (_event, categoryId?: string): Promise<ClassifiedUser[]> => {
    const database = await getDatabase()
    return database.getUsers(categoryId)
  })

  ipcMain.handle(
    'channels:list',
    async (_event, memberOnly?: boolean): Promise<SlackChannel[]> => {
      const database = await getDatabase()
      return database.getChannels(memberOnly)
    }
  )

  ipcMain.handle('categories:list', () => {
    const engine = getCategoryEngine()
    return engine.getCategories()
  })

  ipcMain.handle('sync:meta', async () => {
    const database = await getDatabase()
    return database.getSyncMeta()
  })

  ipcMain.handle('invite:adminStatus', async () => {
    const auth = getAuthService()
    return { configured: await auth.isAdminPinConfigured() }
  })

  ipcMain.handle('invite:setAdminPin', async (_event, pin: string) => {
    const auth = getAuthService()
    await auth.setAdminPin(pin)
    return { success: true }
  })

  ipcMain.handle('invite:importCsv', async (): Promise<CsvInviteImportResult> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'CSV Files', extensions: ['csv', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return {
        filePath: null,
        fileName: null,
        columnName: null,
        parsedCount: 0,
        matchedCount: 0,
        duplicateCount: 0,
        matchedUserIds: [],
        unmatchedValues: []
      }
    }

    const filePath = result.filePaths[0]
    const text = readFileSync(filePath, 'utf-8')
    const database = await getDatabase()
    const users = database.getUsers()
    const fileName = filePath.split(/[\\/]/).pop() ?? null
    return parseInviteCsv(text, users, filePath, fileName)
  })

  ipcMain.handle(
    'invite:preview',
    async (_event, channelIds: string[], userIds: string[]): Promise<InvitePreviewResult> => {
      const client = await createSlackClient()
      const database = await getDatabase()
      const inviteService = new InviteService(client)
      const channelNameById = new Map(database.getChannels().map((channel) => [channel.id, channel.name]))
      return inviteService.previewForChannels(channelIds, userIds, channelNameById)
    }
  )

  ipcMain.handle('invite:listHistory', async (): Promise<InviteRunRecord[]> => {
    const database = await getDatabase()
    return database.getInviteRuns()
  })

  // ---- 招待 ----
  ipcMain.handle(
    'invite:execute',
    async (
      event,
      channelIds: string[],
      userIds: string[],
      adminPin: string,
      csvFileName?: string | null
    ): Promise<InviteRunRecord> => {
      const auth = getAuthService()
      const adminConfigured = await auth.isAdminPinConfigured()
      if (!adminConfigured) {
        throw new Error('管理者PINが未設定です。先に管理者PINを設定してください。')
      }

      const pinVerified = await auth.verifyAdminPin(adminPin)
      if (!pinVerified) {
        throw new Error('管理者PINが正しくありません。')
      }

      activeInviteCancelled = false
      const database = await getDatabase()
      const client = await createSlackClient()
      const inviteService = new InviteService(client)
      const jobManager = new JobManager(database, client)
      const users = database.getUsers()
      const channels = database.getChannels()
      const channelNameById = new Map(channels.map((channel) => [channel.id, channel.name]))
      const userNameById = new Map(users.map((user) => [user.id, getUserLabel(user)]))
      const uniqueUserIds = Array.from(new Set(userIds))
      const preview = await inviteService.previewForChannels(channelIds, uniqueUserIds, channelNameById)
      const task = jobManager.createInviteTask({
        channelIds,
        channelNameById,
        userIds: uniqueUserIds,
        userNameById,
        mode: 'execute',
        csvFileName,
        preview
      })
      activeInviteTaskId = task.id
      try {
        const executedTask = await jobManager.runInviteTask(task.id, {
          onProgress: (progress) => {
            event.sender.send('invite:progress', progress)
          },
          shouldCancel: () => activeInviteCancelled
        })

        const record = createInviteRunRecord({
          mode: 'execute',
          status: deriveInviteStatusFromTask(executedTask),
          csvFileName,
          channelIds: [...channelIds],
          channelNames: channelIds.map((channelId) => channelNameById.get(channelId) ?? channelId),
          userIds: uniqueUserIds,
          preview,
          summary: buildInviteSummaryFromTask(uniqueUserIds, channelIds, preview, executedTask),
          logs: buildInviteLogsFromTask(executedTask, channelNameById, userNameById)
        })

        database.insertInviteRun(record)
        return record
      } finally {
        activeInviteTaskId = null
      }
    }
  )

  ipcMain.handle(
    'invite:dryRun',
    async (
      _event,
      channelIds: string[],
      userIds: string[],
      csvFileName?: string | null
    ): Promise<InviteRunRecord> => {
      const database = await getDatabase()
      const client = await createSlackClient()
      const inviteService = new InviteService(client)
      const jobManager = new JobManager(database, client)
      const users = database.getUsers()
      const channels = database.getChannels()
      const uniqueUserIds = Array.from(new Set(userIds))
      const channelNameById = new Map(channels.map((channel) => [channel.id, channel.name]))
      const userNameById = new Map(users.map((user) => [user.id, getUserLabel(user)]))
      const preview = await inviteService.previewForChannels(channelIds, uniqueUserIds, channelNameById)
      const task = jobManager.createInviteTask({
        channelIds,
        channelNameById,
        userIds: uniqueUserIds,
        userNameById,
        mode: 'dry-run',
        csvFileName,
        preview
      })

      const record = createInviteRunRecord({
        mode: 'dry-run',
        status: 'completed',
        csvFileName,
        channelIds: [...channelIds],
        channelNames: channelIds.map((channelId) => channelNameById.get(channelId) ?? channelId),
        userIds: uniqueUserIds,
        preview,
        summary: buildInviteSummaryFromTask(uniqueUserIds, channelIds, preview, task),
        logs: buildInviteLogsFromTask(task, channelNameById, userNameById)
      })

      database.insertInviteRun(record)
      return record
    }
  )

  ipcMain.handle('invite:cancel', async () => {
    activeInviteCancelled = true
    return { success: true }
  })

  ipcMain.handle(
    'dm:execute',
    async (
      event,
      userIds: string[],
      message: string,
      imageUrls?: string[],
      localImagePaths?: string[]
    ): Promise<DirectMessageBatchResult> => {
      activeDirectMessageCancelled = false
      const database = await getDatabase()
      const client = await createSlackClient()
      const jobManager = new JobManager(database, client)
      const users = database.getUsers()
      const userNameById = new Map(users.map((user) => [user.id, getUserLabel(user)]))
      const task = jobManager.createDirectMessageTask({
        userIds,
        userNameById,
        message,
        imageUrls: imageUrls && imageUrls.length > 0 ? imageUrls : null,
        localFilePaths: localImagePaths && localImagePaths.length > 0 ? localImagePaths : null
      })
      activeDirectMessageTaskId = task.id

      let lastIpcSend = 0
      const IPC_THROTTLE_MS = 400

      try {
        const executedTask = await jobManager.runDirectMessageTask(task.id, {
          onProgress: (progress: DirectMessageProgress) => {
            const now = Date.now()
            if (progress.done === progress.total || now - lastIpcSend >= IPC_THROTTLE_MS) {
              lastIpcSend = now
              event.sender.send('dm:progress', progress)
            }
          },
          shouldCancel: () => activeDirectMessageCancelled
        })

        return buildDirectMessageBatchResult(executedTask)
      } finally {
        activeDirectMessageTaskId = null
      }
    }
  )

  ipcMain.handle('dm:cancel', async () => {
    activeDirectMessageCancelled = true
    return { success: true }
  })

  ipcMain.handle('jobs:list', async (_event, operationType?: OperationTaskRecord['operationType']) => {
    const database = await getDatabase()
    return database.listOperationTasks(50, operationType)
  })

  ipcMain.handle('jobs:get', async (_event, taskId: string) => {
    const database = await getDatabase()
    return database.getOperationTask(taskId)
  })

  ipcMain.handle(
    'jobs:resume',
    async (_event, taskId: string): Promise<OperationTaskDetail> => {
      const database = await getDatabase()
      const task = database.getOperationTask(taskId)
      if (!task) {
        throw new Error('対象ジョブが見つかりません。')
      }

      if (task.operationType === 'invite') {
        activeInviteCancelled = false
        activeInviteTaskId = taskId
      } else if (task.operationType === 'direct_message') {
        activeDirectMessageCancelled = false
        activeDirectMessageTaskId = taskId
      } else {
        activeBroadcastCancelled = false
        activeBroadcastTaskId = taskId
      }

      const jobManager = await createJobManager()
      try {
        return jobManager.resumeTask(taskId, {
          onInviteProgress: (progress) => {
            BrowserWindow.getAllWindows().forEach((win) => {
              win.webContents.send('invite:progress', progress)
            })
          },
          onDirectMessageProgress: (progress) => {
            BrowserWindow.getAllWindows().forEach((win) => {
              win.webContents.send('dm:progress', progress)
            })
          },
          onBroadcastProgress: (progress) => {
            BrowserWindow.getAllWindows().forEach((win) => {
              win.webContents.send('broadcast:progress', progress)
            })
          },
          shouldCancel: () => {
            if (task.operationType === 'invite') return activeInviteCancelled
            if (task.operationType === 'direct_message') return activeDirectMessageCancelled
            return activeBroadcastCancelled
          }
        })
      } finally {
        if (task.operationType === 'invite') activeInviteTaskId = null
        if (task.operationType === 'direct_message') activeDirectMessageTaskId = null
        if (task.operationType === 'broadcast') activeBroadcastTaskId = null
      }
    }
  )

  // ---- メッセージ送りタスク管理 ----
  ipcMain.handle('broadcast:listTasks', async () => {
    const database = await getDatabase()
    return database.getBroadcastTasks()
  })

  ipcMain.handle('broadcast:upsertTask', async (_event, task: BroadcastTask) => {
    const database = await getDatabase()
    database.upsertBroadcastTask(task)
    return { success: true }
  })

  ipcMain.handle('broadcast:deleteTask', async (_event, taskId: string) => {
    const database = await getDatabase()
    database.deleteBroadcastTask(taskId)
    return { success: true }
  })

  ipcMain.handle('broadcast:startTask', async (_event, taskId: string) => {
    const manager = await ensureBroadcastManager()
    if (manager) {
      const database = await getDatabase()
      const tasks = database.getBroadcastTasks()
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        void manager.runTask(task)
      }
    }
    return { success: true }
  })

  ipcMain.handle('broadcast:cancelTask', async (_event, taskId: string) => {
    if (broadcastManager) {
      broadcastManager.cancelTask(taskId)
    }
    return { success: true }
  })

  // ---- メッセージ一括送信（レガシー互換用 or 単発実行） ----
  ipcMain.handle(
    'broadcast:execute',
    async (
      event,
      channelIds: string[],
      message: string,
      repeatCount: number,
      imageUrls?: string[],
      localImagePaths?: string[]
    ): Promise<BroadcastBatchResult> => {
      activeBroadcastCancelled = false
      const database = await getDatabase()
      const client = await createSlackClient()
      const jobManager = new JobManager(database, client)
      const channels = database.getChannels()
      const channelNameById = new Map(channels.map((channel) => [channel.id, channel.name]))
      const task = jobManager.createBroadcastTask({
        channelIds,
        channelNameById,
        message,
        repeatCount,
        imageUrls: imageUrls && imageUrls.length > 0 ? imageUrls : null,
        localFilePaths: localImagePaths && localImagePaths.length > 0 ? localImagePaths : null
      })
      activeBroadcastTaskId = task.id

      // IPC側でも進捗をスロットリング
      let lastIpcSend = 0
      const IPC_THROTTLE_MS = 400

      try {
        const executedTask = await jobManager.runBroadcastTask(task.id, {
          onProgress: (progress: BroadcastProgress) => {
            const now = Date.now()
            if (progress.done === progress.total || now - lastIpcSend >= IPC_THROTTLE_MS) {
              lastIpcSend = now
              event.sender.send('broadcast:progress', progress)
            }
          },
          shouldCancel: () => activeBroadcastCancelled
        })
        return buildBroadcastBatchResult(executedTask)
      } finally {
        activeBroadcastTaskId = null
      }
    }
  )

  ipcMain.handle('broadcast:cancel', async () => {
    activeBroadcastCancelled = true
    return { success: true }
  })

  // ---- システム拡張 ----
  ipcMain.handle('system:openImageDialog', async (_event, multi?: boolean) => {
    const result = await dialog.showOpenDialog({
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [
        {
          name: 'Media Files',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv']
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return multi ? [] : null
    }
    return multi ? result.filePaths : result.filePaths[0]
  })
}
