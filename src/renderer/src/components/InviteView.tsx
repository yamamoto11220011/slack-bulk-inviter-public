import { CategoryFilter } from './CategoryFilter'
import { UserTable } from './UserTable'
import { InvitePanel } from './InvitePanel'
import { SyncStatus } from './SyncStatus'

export function InviteView() {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* サイドバー: カテゴリ */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-muted/10 overflow-auto">
        <CategoryFilter />
        <div className="mt-auto border-t border-border bg-background p-2">
          <SyncStatus />
        </div>
      </aside>

      {/* メイン: ユーザー一覧 */}
      <main className="flex-1 overflow-hidden bg-background">
        <UserTable />
      </main>

      {/* 右パネル: 招待設定 */}
      <aside className="w-80 shrink-0 border-l border-border bg-card overflow-auto shadow-inner">
        <InvitePanel />
      </aside>
    </div>
  )
}
