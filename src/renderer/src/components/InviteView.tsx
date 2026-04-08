import { CategoryFilter } from './CategoryFilter'
import { UserTable } from './UserTable'
import { InvitePanel } from './InvitePanel'
import { SyncStatus } from './SyncStatus'

export function InviteView() {
  return (
    <div className="flex flex-1 gap-4 overflow-hidden p-4">
      {/* サイドバー: カテゴリ */}
      <aside className="flex w-64 shrink-0 flex-col overflow-auto rounded-[1.6rem] border border-border/70 bg-card/82 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <CategoryFilter />
        <div className="mt-auto border-t border-border/70 bg-background/55 p-3">
          <SyncStatus />
        </div>
      </aside>

      {/* メイン: ユーザー一覧 */}
      <main className="min-w-0 flex-1 overflow-hidden rounded-[1.8rem] border border-border/70 bg-card/84 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <UserTable />
      </main>

      {/* 右パネル: 招待設定 */}
      <aside className="w-[30rem] shrink-0 overflow-auto rounded-[1.8rem] border border-border/70 bg-card/90 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <InvitePanel />
      </aside>
    </div>
  )
}
