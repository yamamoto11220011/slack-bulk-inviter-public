import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../stores/app-store'

export function CategoryFilter() {
  const {
    categories,
    activeCategoryFilter,
    setCategoryFilter,
    selectedUserIds,
    selectAllVisible,
    deselectAllVisible,
    userStats
  } = useAppStore(useShallow(state => ({
    categories: state.categories,
    activeCategoryFilter: state.activeCategoryFilter,
    setCategoryFilter: state.setCategoryFilter,
    selectedUserIds: state.selectedUserIds,
    selectAllVisible: state.selectAllVisible,
    deselectAllVisible: state.deselectAllVisible,
    userStats: state.userStats
  })))

   const getCategoryCount = (categoryId: string | null) => {
     if (categoryId === null) return userStats.allCount
     if (categoryId === '__has_student_id__') return userStats.hasStudentIdCount
     if (categoryId === '__no_student_id__') return userStats.noStudentIdCount
     if (categoryId === '__uncategorized__') return userStats.uncategorizedUserIds.length
     return userStats.categoryCounts[categoryId] || 0
   }
 
   const getVisibleUserIds = (categoryId: string | null): string[] => {
     if (categoryId === null) return userStats.allUserIds
     if (categoryId === '__has_student_id__') return userStats.hasStudentIdUserIds
     if (categoryId === '__no_student_id__') return userStats.noStudentIdUserIds
     if (categoryId === '__uncategorized__') return userStats.uncategorizedUserIds
     return userStats.categoryUserIds[categoryId] || []
   }
 
   const allCount = userStats.allCount
   const studentIdCount = userStats.hasStudentIdCount
   const noStudentIdCount = userStats.noStudentIdCount
 
   // カテゴリごとの選択数
   const getSelectedCount = (categoryId: string | null) => {
     const ids = getVisibleUserIds(categoryId)
     return ids.filter((id) => selectedUserIds.has(id)).length
   }

  const handleCategoryClick = (categoryId: string | null) => {
    setCategoryFilter(activeCategoryFilter === categoryId ? null : categoryId)
  }

  const handleBulkToggle = (categoryId: string) => {
    const ids = getVisibleUserIds(categoryId)
    const allSelected = ids.every((id) => selectedUserIds.has(id))
    if (allSelected) {
      deselectAllVisible(ids)
    } else {
      selectAllVisible(ids)
    }
  }

  const universityCategories = categories.filter((c) => c.type === 'university')
  const highschoolCategories = categories.filter((c) => c.type === 'highschool')

  return (
    <div className="flex flex-col gap-1 p-3">
      <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        フィルター
      </h2>

      {/* 全員 */}
      <button
        onClick={() => setCategoryFilter(null)}
        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
          activeCategoryFilter === null
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-foreground hover:bg-accent/50'
        }`}
      >
        <span>全員</span>
        <span className="text-xs text-muted-foreground">{allCount}</span>
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
        <span className="text-xs text-muted-foreground">{studentIdCount}</span>
      </button>
      <button
        onClick={() => handleCategoryClick('__no_student_id__')}
        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
          activeCategoryFilter === '__no_student_id__'
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-foreground hover:bg-accent/50'
        }`}
      >
        <span>学籍番号なし</span>
        <span className="text-xs text-muted-foreground">{noStudentIdCount}</span>
      </button>

      {/* 大学 */}
      {universityCategories.length > 0 && (
        <>
          <div className="mt-3 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            大学生
          </div>
          {universityCategories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1">
              <button
                onClick={() => handleCategoryClick(cat.id)}
                className={`flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  activeCategoryFilter === cat.id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-xs text-muted-foreground">{getCategoryCount(cat.id)}</span>
              </button>
              <button
                onClick={() => handleBulkToggle(cat.id)}
                title={`${cat.label} を一括選択/解除`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                {getVisibleUserIds(cat.id).every((id) => selectedUserIds.has(id)) &&
                getCategoryCount(cat.id) > 0 ? (
                  <CheckSquareIcon />
                ) : (
                  <SquareIcon />
                )}
              </button>
            </div>
          ))}
        </>
      )}

      {/* 高校 */}
      {highschoolCategories.length > 0 && (
        <>
          <div className="mt-3 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            特別聴講生
          </div>
          {highschoolCategories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1">
              <button
                onClick={() => handleCategoryClick(cat.id)}
                className={`flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  activeCategoryFilter === cat.id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-xs text-muted-foreground">{getCategoryCount(cat.id)}</span>
              </button>
              <button
                onClick={() => handleBulkToggle(cat.id)}
                title={`${cat.label} を一括選択/解除`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                {getVisibleUserIds(cat.id).every((id) => selectedUserIds.has(id)) &&
                getCategoryCount(cat.id) > 0 ? (
                  <CheckSquareIcon />
                ) : (
                  <SquareIcon />
                )}
              </button>
            </div>
          ))}
        </>
      )}

      {/* 未分類 */}
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
        <span className="text-xs text-muted-foreground">{getCategoryCount(null)}</span>
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
