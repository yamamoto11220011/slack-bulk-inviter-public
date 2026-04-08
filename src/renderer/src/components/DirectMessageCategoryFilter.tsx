import type { UserFilter } from '../stores/app-store'

interface Category {
  id: string
  label: string
  type: string
  patterns: string[]
}

interface UserStats {
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

interface Props {
  categories: Category[]
  userStats: UserStats
  activeCategoryFilter: UserFilter
  selectedUserIds: Set<string>
  onCategoryChange: (categoryId: UserFilter) => void
  onSelectUsers: (userIds: string[]) => void
  onDeselectUsers: (userIds: string[]) => void
}

export function DirectMessageCategoryFilter({
  categories,
  userStats,
  activeCategoryFilter,
  selectedUserIds,
  onCategoryChange,
  onSelectUsers,
  onDeselectUsers
}: Props) {
  const getCategoryCount = (categoryId: string | null) => {
    if (categoryId === null) return userStats.allCount
    if (categoryId === '__has_student_id__') return userStats.hasStudentIdCount
    if (categoryId === '__uncategorized__') return userStats.uncategorizedUserIds.length
    return userStats.categoryCounts[categoryId] || 0
  }

  const getVisibleUserIds = (categoryId: string | null): string[] => {
    if (categoryId === null) return userStats.allUserIds
    if (categoryId === '__has_student_id__') return userStats.hasStudentIdUserIds
    if (categoryId === '__uncategorized__') return userStats.uncategorizedUserIds
    return userStats.categoryUserIds[categoryId] || []
  }

  const getSelectedCount = (categoryId: string | null) => {
    const ids = getVisibleUserIds(categoryId)
    return ids.filter((id) => selectedUserIds.has(id)).length
  }

  const handleCategoryClick = (categoryId: string | null) => {
    onCategoryChange(activeCategoryFilter === categoryId ? null : categoryId)
  }

  const handleBulkToggle = (categoryId: string) => {
    const ids = getVisibleUserIds(categoryId)
    const allSelected = ids.length > 0 && ids.every((id) => selectedUserIds.has(id))
    if (allSelected) {
      onDeselectUsers(ids)
    } else {
      onSelectUsers(ids)
    }
  }

  const universityCategories = categories.filter((category) => category.type === 'university')
  const highschoolCategories = categories.filter((category) => category.type === 'highschool')

  return (
    <div className="flex flex-col gap-1 p-3">
      <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        DM表示フィルター
      </h2>
      <p className="mb-2 px-2 text-[11px] leading-relaxed text-muted-foreground">
        学籍番号がないユーザーはDM対象から自動除外されています。
      </p>

      <button
        onClick={() => onCategoryChange(null)}
        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
          activeCategoryFilter === null
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-foreground hover:bg-accent/50'
        }`}
      >
        <span>全員</span>
        <span className="text-xs text-muted-foreground">
          {userStats.allCount}
          {getSelectedCount(null) > 0 && ` / ${getSelectedCount(null)}選択`}
        </span>
      </button>

      <div className="mt-3 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        学籍番号
      </div>
      <button
        onClick={() => handleCategoryClick('__has_student_id__')}
        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
          activeCategoryFilter === '__has_student_id__'
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-foreground hover:bg-accent/50'
        }`}
      >
        <span>学籍番号あり</span>
        <span className="text-xs text-muted-foreground">{userStats.hasStudentIdCount}</span>
      </button>

      {universityCategories.length > 0 && (
        <>
          <div className="mt-3 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            大学生
          </div>
          {universityCategories.map((category) => (
            <div key={category.id} className="flex items-center gap-1">
              <button
                onClick={() => handleCategoryClick(category.id)}
                className={`flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  activeCategoryFilter === category.id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <span>{category.label}</span>
                <span className="text-xs text-muted-foreground">{getCategoryCount(category.id)}</span>
              </button>
              <button
                onClick={() => handleBulkToggle(category.id)}
                title={`${category.label} を一括選択/解除`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                {getVisibleUserIds(category.id).every((id) => selectedUserIds.has(id)) &&
                getCategoryCount(category.id) > 0 ? (
                  <CheckSquareIcon />
                ) : (
                  <SquareIcon />
                )}
              </button>
            </div>
          ))}
        </>
      )}

      {highschoolCategories.length > 0 && (
        <>
          <div className="mt-3 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            特別聴講生
          </div>
          {highschoolCategories.map((category) => (
            <div key={category.id} className="flex items-center gap-1">
              <button
                onClick={() => handleCategoryClick(category.id)}
                className={`flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  activeCategoryFilter === category.id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <span>{category.label}</span>
                <span className="text-xs text-muted-foreground">{getCategoryCount(category.id)}</span>
              </button>
              <button
                onClick={() => handleBulkToggle(category.id)}
                title={`${category.label} を一括選択/解除`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                {getVisibleUserIds(category.id).every((id) => selectedUserIds.has(id)) &&
                getCategoryCount(category.id) > 0 ? (
                  <CheckSquareIcon />
                ) : (
                  <SquareIcon />
                )}
              </button>
            </div>
          ))}
        </>
      )}

      <div className="mt-3 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        その他
      </div>
      <button
        onClick={() => handleCategoryClick('__uncategorized__')}
        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
          activeCategoryFilter === '__uncategorized__'
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-foreground hover:bg-accent/50'
        }`}
      >
        <span>未分類</span>
        <span className="text-xs text-muted-foreground">{userStats.uncategorizedUserIds.length}</span>
      </button>
    </div>
  )
}

function CheckSquareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function SquareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  )
}
