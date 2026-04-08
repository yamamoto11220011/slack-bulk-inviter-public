import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SyncStatus } from './SyncStatus'
import { DirectMessageCategoryFilter } from './DirectMessageCategoryFilter'
import { DirectMessagePanel } from './DirectMessagePanel'
import { DirectMessageUserTable } from './DirectMessageUserTable'
import { useAppStore, type UserFilter, type UserSort } from '../stores/app-store'
import { hasStudentId } from '../lib/user-utils'

type User = {
  id: string
  name: string
  displayName: string
  realName: string
  avatarUrl: string
  categoryId: string | null
}

type UserStats = {
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

function buildUserStats(users: User[]): UserStats {
  const categoryCounts: Record<string, number> = {}
  const categoryUserIds: Record<string, string[]> = {}
  const uncategorizedUserIds: string[] = []
  const allUserIds: string[] = []

  for (const user of users) {
    allUserIds.push(user.id)
    if (user.categoryId) {
      categoryCounts[user.categoryId] = (categoryCounts[user.categoryId] || 0) + 1
      if (!categoryUserIds[user.categoryId]) categoryUserIds[user.categoryId] = []
      categoryUserIds[user.categoryId].push(user.id)
    } else {
      uncategorizedUserIds.push(user.id)
    }
  }

  return {
    allCount: users.length,
    hasStudentIdCount: users.length,
    noStudentIdCount: 0,
    categoryCounts,
    categoryUserIds,
    uncategorizedUserIds,
    allUserIds,
    hasStudentIdUserIds: allUserIds,
    noStudentIdUserIds: []
  }
}

export function DirectMessageView() {
  const { users, categories } = useAppStore(
    useShallow((state) => ({
      users: state.users,
      categories: state.categories
    }))
  )

  const eligibleUsers = useMemo(() => users.filter((user) => hasStudentId(user.name)), [users])
  const eligibleUserIdSet = useMemo(
    () => new Set(eligibleUsers.map((user) => user.id)),
    [eligibleUsers]
  )
  const eligibleUserStats = useMemo(() => buildUserStats(eligibleUsers), [eligibleUsers])

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<UserFilter>(null)
  const [activeUserSort, setActiveUserSort] = useState<UserSort>('studentIdAsc')
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedUserIds((prev) => {
      const next = new Set(Array.from(prev).filter((userId) => eligibleUserIdSet.has(userId)))
      return next.size === prev.size ? prev : next
    })
  }, [eligibleUserIdSet])

  const handleSelectUsers = (userIds: string[]) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      for (const userId of userIds) {
        if (eligibleUserIdSet.has(userId)) {
          next.add(userId)
        }
      }
      return next
    })
  }

  const handleDeselectUsers = (userIds: string[]) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      for (const userId of userIds) {
        next.delete(userId)
      }
      return next
    })
  }

  const handleToggleUser = (userId: string) => {
    if (!eligibleUserIdSet.has(userId)) return
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  return (
    <div className="flex flex-1 gap-4 overflow-hidden p-4">
      <aside className="flex w-64 shrink-0 flex-col overflow-auto rounded-[1.6rem] border border-border/70 bg-card/82 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <DirectMessageCategoryFilter
          categories={categories}
          userStats={eligibleUserStats}
          activeCategoryFilter={activeCategoryFilter}
          selectedUserIds={selectedUserIds}
          onCategoryChange={setActiveCategoryFilter}
          onSelectUsers={handleSelectUsers}
          onDeselectUsers={handleDeselectUsers}
        />
        <div className="mt-auto border-t border-border/70 bg-background/55 p-3">
          <SyncStatus />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto rounded-[1.8rem] border border-border/70 bg-card/84 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-7xl flex-col gap-6 p-6">
          <div className="mx-auto w-full max-w-4xl">
            <DirectMessagePanel
              users={eligibleUsers}
              categories={categories}
              userStats={eligibleUserStats}
              activeCategoryFilter={activeCategoryFilter}
              selectedUserIds={selectedUserIds}
              onSelectUsers={handleSelectUsers}
              onDeselectUsers={handleDeselectUsers}
              setSelectedUserIds={(userIds) =>
                setSelectedUserIds(new Set(userIds.filter((userId) => eligibleUserIdSet.has(userId))))
              }
              removeSelectedUser={(userId) => handleDeselectUsers([userId])}
              clearSelectedUsers={() => setSelectedUserIds(new Set())}
            />
          </div>

          <div className="flex-1 min-h-[26rem] overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/70 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.5)]">
            <DirectMessageUserTable
              users={eligibleUsers}
              categories={categories}
              activeCategoryFilter={activeCategoryFilter}
              activeUserSort={activeUserSort}
              selectedUserIds={selectedUserIds}
              onSortChange={setActiveUserSort}
              onToggleUser={handleToggleUser}
              onSelectUsers={handleSelectUsers}
              onDeselectUsers={handleDeselectUsers}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
