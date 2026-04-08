import { ipcMain, app, safeStorage, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { openAuthWindow } from './auth-window'
import { AuthService } from '../core/auth'
import { AppDatabase } from '../core/database'
import { CategoryEngine } from '../core/category'
import { SlackClient } from '../core/slack-client'
import { SyncService } from '../core/sync'
import { InviteService } from '../core/invite'
import { BroadcastService } from '../core/broadcast'
import { BroadcastManager } from '../core/broadcast-manager'
import { DirectMessageService } from '../core/direct-message'
import { resolveSlackChannelId } from '../core/slack-target'
import type {
  AuditOverview,
  ClassifiedUser,
  SlackChannel,
  InviteBatchResult,
  MultiInviteBatchResult,
  BroadcastBatchResult,
  AudienceSelectionResult,
  DirectMessageBatchResult,
  DirectMessageProgress,
  SlackMessageActivity,
  BroadcastTask,
  BroadcastProgress
} from '../core/types'

let authService: AuthService
let db: AppDatabase | null = null
let categoryEngine: CategoryEngine
let activeInviteCancelled = false
let activeBroadcastCancelled = false
let activeDirectMessageCancelled = false
let broadcastManager: BroadcastManager | null = null

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

  // ---- 招待 ----
  ipcMain.handle(
    'invite:execute',
    async (event, channelIds: string[], userIds: string[]): Promise<MultiInviteBatchResult> => {
      activeInviteCancelled = false
      const client = await createSlackClient()
      const inviteService = new InviteService(client)
      const result = await inviteService.inviteToChannels(
        channelIds,
        userIds,
        (done, total, channelId) => {
          event.sender.send('invite:progress', { done, total, channelId })
        },
        () => activeInviteCancelled
      )
      return result
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
      const client = await createSlackClient()
      const directMessageService = new DirectMessageService(client)

      let lastIpcSend = 0
      const IPC_THROTTLE_MS = 400

      const result = await directMessageService.sendBulk(
        userIds,
        message,
        imageUrls && imageUrls.length > 0 ? imageUrls : null,
        localImagePaths && localImagePaths.length > 0 ? localImagePaths : null,
        (progress: DirectMessageProgress) => {
          const now = Date.now()
          if (progress.done === progress.total || now - lastIpcSend >= IPC_THROTTLE_MS) {
            lastIpcSend = now
            event.sender.send('dm:progress', progress)
          }
        },
        () => activeDirectMessageCancelled
      )

      return result
    }
  )

  ipcMain.handle('dm:cancel', async () => {
    activeDirectMessageCancelled = true
    return { success: true }
  })

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
      const client = await createSlackClient()
      const broadcastService = new BroadcastService(client)

      // IPC側でも進捗をスロットリング
      let lastIpcSend = 0
      const IPC_THROTTLE_MS = 400

      const result = await broadcastService.broadcastMessage(
        channelIds,
        message,
        imageUrls && imageUrls.length > 0 ? imageUrls : null,
        null,
        localImagePaths && localImagePaths.length > 0 ? localImagePaths : null,
        repeatCount,
        (progress: BroadcastProgress) => {
          const now = Date.now()
          if (progress.done === progress.total || now - lastIpcSend >= IPC_THROTTLE_MS) {
            lastIpcSend = now
            event.sender.send('broadcast:progress', progress)
          }
        },
        () => activeBroadcastCancelled
      )
      return result
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
