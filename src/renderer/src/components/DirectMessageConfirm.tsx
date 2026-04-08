import { useMemo, useState } from 'react'
import { getDisplayName } from '../lib/user-utils'

type SelectedUser = {
  id: string
  name: string
  displayName: string
  realName: string
  avatarUrl: string
  categoryId: string | null
}

interface Props {
  selectedUsers: SelectedUser[]
  categories: Array<{ id: string; label: string }>
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function DirectMessageConfirm({
  selectedUsers,
  categories,
  message,
  onConfirm,
  onCancel
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false)

  const categoryLabelMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.label])),
    [categories]
  )

  const riskyUsers = selectedUsers.filter((user) => !user.categoryId)

  const canConfirm = riskyUsers.length === 0 || acknowledged

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      <div className="relative w-full max-w-3xl rounded-lg bg-background border border-border p-6 shadow-lg">
        <h2 className="text-lg font-semibold">個別DMの最終確認</h2>

        <div className="mt-4 space-y-4">
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm">
              <span className="font-medium">{selectedUsers.length} 人</span> に個別DMを送信します。
            </p>
            <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {message}
            </p>
          </div>

          {riskyUsers.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">要確認のユーザーが {riskyUsers.length} 人います。</p>
              <p className="mt-1 text-xs">
                カテゴリ未分類のユーザーが含まれています。先生や対象外が混ざっていないか確認してください。
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              送信対象一覧
            </p>
            <div className="max-h-80 overflow-auto rounded-md border border-border">
              {selectedUsers.map((user) => {
                const isRisky = !user.categoryId
                const categoryLabel = user.categoryId
                  ? categoryLabelMap.get(user.categoryId) ?? user.categoryId
                  : '未分類'

                return (
                  <div
                    key={user.id}
                    className={`flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 ${
                      isRisky ? 'bg-amber-50/70' : 'bg-background'
                    }`}
                  >
                    {user.avatarUrl && (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full border border-border/50 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{getDisplayName(user)}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {user.name || '-'} / {categoryLabel}
                      </div>
                    </div>
                    {isRisky && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        要確認
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {riskyUsers.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="rounded border-border"
              />
              未分類ユーザーを確認しました
            </label>
          )}
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40"
          >
            この内容で送信
          </button>
        </div>
      </div>
    </div>
  )
}
