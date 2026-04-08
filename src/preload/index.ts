import { contextBridge, ipcRenderer } from 'electron'
import type {
  AudienceSelectionResult,
  BroadcastTask,
  BroadcastProgress,
  DirectMessageBatchResult,
  DirectMessageProgress
} from '../core/types'

const api = {
  // 認証
  login: (workspaceUrl: string): Promise<{ workspace: string }> =>
    ipcRenderer.invoke('auth:login', workspaceUrl),
  getAuthStatus: (): Promise<{
    loggedIn: boolean
    workspace?: string
    team?: string
    userId?: string
    error?: string
  }> => ipcRenderer.invoke('auth:status'),
  logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke('auth:logout'),

  // 同期
  syncAll: () => ipcRenderer.invoke('sync:all'),
  syncUsers: () => ipcRenderer.invoke('sync:users'),
  syncChannels: () => ipcRenderer.invoke('sync:channels'),
  getSyncMeta: (): Promise<{
    lastUserSync: string | null
    lastChannelSync: string | null
    lastMessageSync: string | null
  }> => ipcRenderer.invoke('sync:meta'),

  // データ取得
  getUsers: (categoryId?: string) => ipcRenderer.invoke('users:list', categoryId),
  getChannels: (memberOnly?: boolean) => ipcRenderer.invoke('channels:list', memberOnly),
  getCategories: () => ipcRenderer.invoke('categories:list'),
  excludeChannelMembers: (
    userIds: string[],
    channelInput: string
  ): Promise<AudienceSelectionResult> =>
    ipcRenderer.invoke('audience:excludeMembers', userIds, channelInput),

  // 招待
  executeInvite: (channelIds: string[], userIds: string[]) =>
    ipcRenderer.invoke('invite:execute', channelIds, userIds),
  cancelInvite: () => ipcRenderer.invoke('invite:cancel'),
  executeDirectMessage: (
    userIds: string[],
    message: string,
    imageUrls?: string[],
    localImagePaths?: string[]
  ): Promise<DirectMessageBatchResult> =>
    ipcRenderer.invoke('dm:execute', userIds, message, imageUrls, localImagePaths),
  cancelDirectMessage: (): Promise<{ success: boolean }> => ipcRenderer.invoke('dm:cancel'),

  // メッセージ送りタスク管理
  listBroadcastTasks: (): Promise<BroadcastTask[]> => ipcRenderer.invoke('broadcast:listTasks'),
  upsertBroadcastTask: (task: BroadcastTask): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('broadcast:upsertTask', task),
  deleteBroadcastTask: (taskId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('broadcast:deleteTask', taskId),
  startBroadcastTask: (taskId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('broadcast:startTask', taskId),
  cancelBroadcastTask: (taskId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('broadcast:cancelTask', taskId),

  // メッセージ一括送信 (単発/即時)
  executeBroadcast: (channelIds: string[], message: string, repeatCount: number, imageUrls?: string[], localImagePaths?: string[]) =>
    ipcRenderer.invoke('broadcast:execute', channelIds, message, repeatCount, imageUrls, localImagePaths),
  cancelBroadcast: (): Promise<{ success: boolean }> => ipcRenderer.invoke('broadcast:cancel'),

  // イベントリスナー (進捗通知用)
  onSyncProgress: (callback: (progress: { type: string; count: number }) => void) => {
    const handler = (_event: any, p: any) => callback(p)
    ipcRenderer.on('sync:progress', handler)
    return () => ipcRenderer.removeListener('sync:progress', handler)
  },
  onInviteProgress: (callback: (progress: { done: number; total: number; channelId: string }) => void) => {
    const handler = (_event: any, p: any) => callback(p)
    ipcRenderer.on('invite:progress', handler)
    return () => ipcRenderer.removeListener('invite:progress', handler)
  },
  onBroadcastProgress: (callback: (progress: BroadcastProgress & { taskId?: string }) => void) => {
    const handler = (_event: any, p: any) => callback(p)
    ipcRenderer.on('broadcast:progress', handler)
    return () => ipcRenderer.removeListener('broadcast:progress', handler)
  },
  onDirectMessageProgress: (callback: (progress: DirectMessageProgress) => void) => {
    const handler = (_event: any, p: any) => callback(p)
    ipcRenderer.on('dm:progress', handler)
    return () => ipcRenderer.removeListener('dm:progress', handler)
  },

  // システム拡張
  openImageDialog: (multi?: boolean): Promise<any> => ipcRenderer.invoke('system:openImageDialog', multi)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
