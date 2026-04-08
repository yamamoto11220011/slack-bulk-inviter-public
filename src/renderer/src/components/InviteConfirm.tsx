interface InviteConfirmProps {
  userCount: number
  channelNames: string[]
  summary: Record<string, number>
  onConfirm: () => void
  onCancel: () => void
}

export function InviteConfirm({
  userCount,
  channelNames,
  summary,
  onConfirm,
  onCancel
}: InviteConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* ダイアログ */}
      <div className="relative w-full max-w-md rounded-lg bg-background border border-border p-6 shadow-lg">
        <h2 className="text-lg font-semibold">招待の確認</h2>

        <div className="mt-4 space-y-3">
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm">
              <span className="font-medium">{userCount} 人</span>のユーザーを{' '}
              <span className="font-medium">{channelNames.length} 件のチャンネル</span> に招待します。
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              対象チャンネル
            </p>
            <div className="max-h-28 space-y-1 overflow-auto rounded-md border border-border p-2">
              {channelNames.map((channelName) => (
                <div key={channelName} className="text-sm">
                  {channelName}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              内訳
            </p>
            {Object.entries(summary).map(([label, count]) => (
              <div key={label} className="flex justify-between text-sm">
                <span>{label}</span>
                <span className="text-muted-foreground">{count} 人</span>
              </div>
            ))}
          </div>
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
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            招待する
          </button>
        </div>
      </div>
    </div>
  )
}
