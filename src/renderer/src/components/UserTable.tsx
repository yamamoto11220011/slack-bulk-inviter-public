import { memo, useDeferredValue, useMemo, useState } from 'react'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { List, type RowComponentProps } from 'react-window'
import { useShallow } from 'zustand/react/shallow'
import { User } from '../../../core/types'
import { useAppStore } from '../stores/app-store'
import { getDisplayName, hasStudentId } from '../lib/user-utils'

type UserRowData = {
  users: User[]
  selectedUserIds: Set<string>
  toggleUser: (userId: string) => void
  categoryLabelMap: Map<string, string>
}

type UserRowProps = RowComponentProps<UserRowData>

export function UserTable() {
  const {
    users,
    activeCategoryFilter,
    activeUserSort,
    selectedUserIds,
    toggleUser,
    selectAllVisible,
    deselectAllVisible,
    categories,
    setUserSort
  } = useAppStore(
    useShallow((state) => ({
      users: state.users,
      activeCategoryFilter: state.activeCategoryFilter,
      activeUserSort: state.activeUserSort,
      selectedUserIds: state.selectedUserIds,
      toggleUser: state.toggleUser,
      selectAllVisible: state.selectAllVisible,
      deselectAllVisible: state.deselectAllVisible,
      categories: state.categories,
      setUserSort: state.setUserSort
    }))
  )
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const filteredUsers = useMemo(() => {
    let list = users

    if (activeCategoryFilter === '__uncategorized__') {
      list = list.filter((user) => !user.categoryId)
    } else if (activeCategoryFilter === '__has_student_id__') {
      list = list.filter((user) => hasStudentId(user.name))
    } else if (activeCategoryFilter === '__no_student_id__') {
      list = list.filter((user) => !hasStudentId(user.name))
    } else if (activeCategoryFilter) {
      list = list.filter((user) => user.categoryId === activeCategoryFilter)
    }

    if (deferredSearch) {
      const query = deferredSearch.toLowerCase()
      list = list.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.displayName.toLowerCase().includes(query) ||
          user.realName.toLowerCase().includes(query)
      )
    }

    return [...list].sort((a, b) => {
      if (activeUserSort === 'displayNameAsc') {
        return getDisplayName(a).localeCompare(getDisplayName(b), 'ja')
      }

      if (activeUserSort === 'categoryAsc') {
        const categoryCompare = (a.categoryId ?? '').localeCompare(b.categoryId ?? '', 'ja')
        if (categoryCompare !== 0) return categoryCompare
        return a.name.localeCompare(b.name, 'ja')
      }

      const studentIdCompare = a.name.localeCompare(b.name, 'ja')
      return activeUserSort === 'studentIdDesc' ? -studentIdCompare : studentIdCompare
    })
  }, [users, activeCategoryFilter, deferredSearch, activeUserSort])

  const visibleIds = useMemo(() => filteredUsers.map((user) => user.id), [filteredUsers])
  const selectedVisibleCount = useMemo(() => {
    let count = 0
    for (const userId of visibleIds) {
      if (selectedUserIds.has(userId)) {
        count += 1
      }
    }
    return count
  }, [visibleIds, selectedUserIds])

  const allSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const someSelected = selectedVisibleCount > 0

  const categoryLabelMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.label])),
    [categories]
  )

  const rowProps = useMemo(
    () => ({
      users: filteredUsers,
      selectedUserIds,
      toggleUser,
      categoryLabelMap
    }),
    [filteredUsers, selectedUserIds, toggleUser, categoryLabelMap]
  )

  const handleSelectAll = () => {
    if (allSelected) {
      deselectAllVisible(visibleIds)
    } else {
      selectAllVisible(visibleIds)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
        <input
          type="text"
          placeholder="ユーザーを検索..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="flex h-9 w-64 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {filteredUsers.length} 人
          {selectedUserIds.size > 0 && (
            <>
              {' '}
              / <span className="font-medium text-foreground">{selectedUserIds.size} 人選択中</span>
            </>
          )}
        </span>
        <select
          value={activeUserSort}
          onChange={(event) => setUserSort(event.target.value as typeof activeUserSort)}
          className="ml-auto h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="studentIdAsc">学籍番号順</option>
          <option value="studentIdDesc">学籍番号 逆順</option>
          <option value="displayNameAsc">表示名順</option>
          <option value="categoryAsc">カテゴリ順</option>
        </select>
      </div>

      <div className="border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center">
          <div className="w-12 px-4 py-2.5 flex justify-center">
            <button
              onClick={handleSelectAll}
              className="flex items-center justify-center"
              title={allSelected ? '全解除' : '全選択'}
            >
              {allSelected ? (
                <CheckSquareIcon className="text-primary" />
              ) : someSelected ? (
                <MinusSquareIcon className="text-primary" />
              ) : (
                <SquareIcon className="text-muted-foreground" />
              )}
            </button>
          </div>
          <div className="flex-1 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
            ユーザー
          </div>
          <div className="w-32 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            学籍番号
          </div>
          <div className="w-40 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            カテゴリ
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-background/50 relative">
        {search !== deferredSearch && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 animate-pulse z-10" />
        )}
        <AutoSizer>
          {({ height, width }: { height: number; width: number }) => (
            <List
              rowCount={filteredUsers.length}
              rowHeight={60}
              rowComponent={UserRow}
              rowProps={rowProps}
              overscanCount={8}
              style={{ height, width }}
            />
          )}
        </AutoSizer>

        {filteredUsers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center pointer-events-none">
            <div className="max-w-xs text-sm text-muted-foreground">
              {users.length === 0
                ? 'ユーザーデータがありません。同期を実行してください。'
                : '条件に一致するユーザーが見つかりません。'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const UserRow = memo(
  ({
    index,
    style,
    ariaAttributes,
    users,
    selectedUserIds,
    toggleUser,
    categoryLabelMap
  }: UserRowProps) => {
    const user = users[index]
    if (!user) return null

    const isSelected = selectedUserIds.has(user.id)
    const categoryLabel = user.categoryId ? categoryLabelMap.get(user.categoryId) : null

    return (
      <div
        {...ariaAttributes}
        style={style}
        onClick={() => toggleUser(user.id)}
        className={`flex items-center cursor-pointer border-b border-border/40 transition-colors ${
          isSelected ? 'bg-primary/5' : 'hover:bg-accent/30'
        }`}
      >
        <div className="w-12 px-4 py-2 flex justify-center shrink-0">
          {isSelected ? (
            <CheckSquareIcon className="text-primary" />
          ) : (
            <SquareIcon className="text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0 px-4 py-2">
          <div className="flex items-center gap-2.5">
            {user.avatarUrl && (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full border border-border/50 shrink-0"
                loading="lazy"
              />
            )}
            <div className="flex flex-col min-w-0 overflow-hidden">
              <span className="text-sm font-medium truncate">{getDisplayName(user)}</span>
              {user.displayName && user.realName && user.displayName !== user.realName && (
                <span className="text-[11px] text-muted-foreground truncate">{user.realName}</span>
              )}
            </div>
          </div>
        </div>
        <div className="w-32 px-4 py-2 shrink-0 overflow-hidden">
          <div className="flex flex-col items-start gap-1">
            <span className="text-[13px] font-mono leading-none truncate w-full">
              {user.name || '-'}
            </span>
            <span
              className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-tight uppercase ${
                hasStudentId(user.name)
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {hasStudentId(user.name) ? 'Student' : 'Other'}
            </span>
          </div>
        </div>
        <div className="w-40 px-4 py-2 shrink-0 overflow-hidden">
          {categoryLabel && (
            <span className="inline-block truncate max-w-full rounded bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {categoryLabel}
            </span>
          )}
        </div>
      </div>
    )
  }
)

UserRow.displayName = 'UserRow'

function CheckSquareIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function SquareIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  )
}

function MinusSquareIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M8 12h8" />
    </svg>
  )
}
