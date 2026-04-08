import { create } from 'zustand'
import { BroadcastTask, BroadcastProgress } from '../../../core/types'
import { hasStudentId } from '../lib/user-utils'

export type UserFilter = string | null
export type UserSort = 'studentIdAsc' | 'studentIdDesc' | 'displayNameAsc' | 'categoryAsc'

interface User {
  id: string
  name: string
  displayName: string
  realName: string
  avatarUrl: string
  categoryId: string | null
}

interface Channel {
  id: string
  name: string
  isPrivate: boolean
  isMember: boolean
  memberCount: number
}

interface Category {
  id: string
  label: string
  type: string
  patterns: string[]
}

interface AppState {
  // 認証
  isLoggedIn: boolean
  workspace: string | null
  team: string | null

  // データ
  users: User[]
  channels: Channel[]
  categories: Category[]

  // 選択状態
  selectedUserIds: Set<string>
  selectedChannelId: string | null
  selectedBroadcastChannelIds: string[]
  activeCategoryFilter: UserFilter
  activeUserSort: UserSort

  // 同期
  isSyncing: boolean
  syncProgress: { type: string; count: number } | null
  lastUserSync: Date | null
  lastChannelSync: Date | null
  lastMessageSync: Date | null

  // 招待
  isInviting: boolean
  inviteProgress: { done: number; total: number; channelName: string | null } | null

  // メッセージ送信タスク
  broadcastTasks: BroadcastTask[]
  taskProgress: Record<string, BroadcastProgress>

  activeTab: 'invite' | 'broadcast' | 'directMessage'
  setActiveTab: (tab: 'invite' | 'broadcast' | 'directMessage') => void

  // 統計・キャッシュデータ (高速化用)
  userStats: {
    allCount: number
    hasStudentIdCount: number
    noStudentIdCount: number
    categoryCounts: Record<string, number>
    categoryUserIds: Record<string, string[]>
    uncategorizedUserIds: string[]
    allUserIds: string[]
    hasStudentIdUserIds: string[]
    noStudentIdUserIds: string[]
  }

  // アクション
  setAuth: (loggedIn: boolean, workspace?: string, team?: string) => void
  setUsers: (users: User[]) => void
  setChannels: (channels: Channel[]) => void
  setCategories: (categories: Category[]) => void
  toggleUser: (userId: string) => void
  setSelectedUsers: (userIds: string[]) => void
  selectAllVisible: (userIds: string[]) => void
  deselectAllVisible: (userIds: string[]) => void
  clearSelection: () => void
  setSelectedChannel: (channelId: string | null) => void
  toggleBroadcastChannel: (channelId: string) => void
  selectAllBroadcastChannels: () => void
  selectNBroadcastChannels: (count: number) => void
  clearBroadcastChannels: () => void
  setCategoryFilter: (categoryId: UserFilter) => void
  setUserSort: (sort: UserSort) => void
  setSyncing: (syncing: boolean) => void
  setSyncProgress: (progress: { type: string; count: number } | null) => void
  setSyncMeta: (
    lastUserSync: Date | null,
    lastChannelSync: Date | null,
    lastMessageSync: Date | null
  ) => void
  setInviting: (inviting: boolean) => void
  setInviteProgress: (
    progress: { done: number; total: number; channelName: string | null } | null
  ) => void

  // タスクアクション
  fetchTasks: () => Promise<void>
  upsertTask: (task: BroadcastTask) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  updateTaskProgress: (taskId: string, progress: BroadcastProgress) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  isLoggedIn: false,
  workspace: null,
  team: null,

  users: [],
  channels: [],
  categories: [],

  selectedUserIds: new Set(),
  selectedChannelId: null,
  selectedBroadcastChannelIds: [],
  activeCategoryFilter: null,
  activeUserSort: 'studentIdAsc',

  isSyncing: false,
  syncProgress: null,
  lastUserSync: null,
  lastChannelSync: null,
  lastMessageSync: null,

  isInviting: false,
  inviteProgress: null,

  broadcastTasks: [],
  taskProgress: {},

  userStats: {
    allCount: 0,
    hasStudentIdCount: 0,
    noStudentIdCount: 0,
    categoryCounts: {},
    categoryUserIds: {},
    uncategorizedUserIds: [],
    allUserIds: [],
    hasStudentIdUserIds: [],
    noStudentIdUserIds: []
  },

  activeTab: 'invite',
  setActiveTab: (tab) => set({ activeTab: tab }),

  setAuth: (loggedIn, workspace, team) =>
    set({ isLoggedIn: loggedIn, workspace: workspace ?? null, team: team ?? null }),

  setUsers: (users) => {
    const hasStudentIdCount = users.filter(u => hasStudentId(u.name)).length
    const categoryCounts: Record<string, number> = {}
    const categoryUserIds: Record<string, string[]> = {}
    const uncategorizedUserIds: string[] = []
    const allUserIds: string[] = []
    const hasStudentIdUserIds: string[] = []
    const noStudentIdUserIds: string[] = []

    for (const u of users) {
      allUserIds.push(u.id)
      const hasSid = hasStudentId(u.name)
      if (hasSid) {
        hasStudentIdUserIds.push(u.id)
      } else {
        noStudentIdUserIds.push(u.id)
      }

      if (u.categoryId) {
        categoryCounts[u.categoryId] = (categoryCounts[u.categoryId] || 0) + 1
        if (!categoryUserIds[u.categoryId]) categoryUserIds[u.categoryId] = []
        categoryUserIds[u.categoryId].push(u.id)
      } else {
        uncategorizedUserIds.push(u.id)
      }
    }

    set({
      users,
      userStats: {
        allCount: users.length,
        hasStudentIdCount,
        noStudentIdCount: users.length - hasStudentIdCount,
        categoryCounts,
        categoryUserIds,
        uncategorizedUserIds,
        allUserIds,
        hasStudentIdUserIds,
        noStudentIdUserIds
      }
    })
  },
  setChannels: (channels) => set({ channels }),
  setCategories: (categories) => set({ categories }),

  toggleUser: (userId) =>
    set((state) => {
      const next = new Set(state.selectedUserIds)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return { selectedUserIds: next }
    }),

  setSelectedUsers: (userIds) => set({ selectedUserIds: new Set(userIds) }),

  selectAllVisible: (userIds) =>
    set((state) => {
      const next = new Set(state.selectedUserIds)
      for (const id of userIds) next.add(id)
      return { selectedUserIds: next }
    }),

  deselectAllVisible: (userIds) =>
    set((state) => {
      const next = new Set(state.selectedUserIds)
      for (const id of userIds) next.delete(id)
      return { selectedUserIds: next }
    }),

  clearSelection: () => set({ selectedUserIds: new Set() }),

  setSelectedChannel: (channelId) => set({ selectedChannelId: channelId }),
  toggleBroadcastChannel: (channelId) =>
    set((state) => {
      const exists = state.selectedBroadcastChannelIds.includes(channelId)
      return {
        selectedBroadcastChannelIds: exists
          ? state.selectedBroadcastChannelIds.filter((id) => id !== channelId)
          : [...state.selectedBroadcastChannelIds, channelId]
      }
    }),
  selectAllBroadcastChannels: () =>
    set((state) => ({
      selectedBroadcastChannelIds: state.channels.map((c) => c.id)
    })),
  selectNBroadcastChannels: (count) =>
    set((state) => ({
      selectedBroadcastChannelIds: state.channels
        .slice(0, count)
        .map((c) => c.id)
    })),
  clearBroadcastChannels: () => set({ selectedBroadcastChannelIds: [] }),
  setCategoryFilter: (categoryId) => set({ activeCategoryFilter: categoryId }),
  setUserSort: (sort) => set({ activeUserSort: sort }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setSyncProgress: (progress) => set({ syncProgress: progress }),
  setSyncMeta: (lastUserSync, lastChannelSync, lastMessageSync) =>
    set({ lastUserSync, lastChannelSync, lastMessageSync }),
  setInviting: (inviting) => set({ isInviting: inviting }),
  setInviteProgress: (progress) => set({ inviteProgress: progress }),

  fetchTasks: async () => {
    const tasks = await window.api.listBroadcastTasks()
    set({ broadcastTasks: tasks })
  },
  upsertTask: async (task) => {
    await window.api.upsertBroadcastTask(task)
    await get().fetchTasks()
  },
  deleteTask: async (taskId) => {
    await window.api.deleteBroadcastTask(taskId)
    await get().fetchTasks()
  },
  updateTaskProgress: (taskId, progress) =>
    set((state) => ({
      taskProgress: { ...state.taskProgress, [taskId]: progress }
    }))
}))
