/** Slack ユーザー */
export interface SlackUser {
  id: string
  name: string // Slack API の name (username) — 学籍番号が入るフィールド
  displayName: string // profile.display_name
  realName: string // profile.real_name
  avatarUrl: string
  isBot: boolean
  isDeleted: boolean
}

/** Slack チャンネル */
export interface SlackChannel {
  id: string
  name: string
  isPrivate: boolean
  isMember: boolean
  memberCount: number
}

/** Slack メッセージ活動 */
export interface SlackMessageActivity {
  id: string
  userId: string
  channelId: string
  text: string
  ts: string
  threadTs: string | null
  isThreadReply: boolean
  replyCount: number
  lastActivityTs: string
}

/** チャンネル所属 */
export interface SlackChannelMembership {
  channelId: string
  userId: string
  isActive: boolean
  syncedAt: string
}

export interface AuditTeamActivity {
  categoryId: string | null
  messageCount: number
  activeUsers: number
}

export interface AuditChannelActivity {
  channelId: string
  channelName: string
  messageCount: number
  activeUsers: number
  lastActivityTs: string | null
}

export interface AuditInactiveUser {
  userId: string
  name: string
  displayName: string
  realName: string
  categoryId: string | null
  lastActivityTs: string | null
}

export interface AuditTimelinePoint {
  date: string
  messageCount: number
  activeUsers: number
}

export interface AuditMembershipChangePoint {
  date: string
  joinedCount: number
  leftCount: number
}

export interface AuditOverview {
  totals: {
    users: number
    channels: number
    memberships: number
    messages: number
    activeUsers30d: number
    inactiveUsers30d: number
  }
  teamActivity: AuditTeamActivity[]
  channelActivity: AuditChannelActivity[]
  inactiveUsers: AuditInactiveUser[]
  activityTimeline: AuditTimelinePoint[]
  membershipChanges: AuditMembershipChangePoint[]
}

/** カテゴリ定義 (categories.yml から読み込み) */
export interface CategoryDef {
  id: string
  label: string
  type: 'university' | 'highschool'
  patterns: string[]
}

/** 分類結果 */
export interface ClassifiedUser extends SlackUser {
  categoryId: string | null
}

export type User = ClassifiedUser

/** 招待結果 */
export interface InviteResult {
  channelId: string
  succeeded: string[] // user IDs
  failed: Array<{ userId: string; error: string }>
  alreadyInChannel: string[]
}

/** 招待バッチ結果 */
export interface InviteBatchResult {
  channelId: string
  totalRequested: number
  totalSucceeded: number
  totalFailed: number
  totalAlreadyInChannel: number
  details: InviteResult[]
}

export interface MultiInviteBatchResult {
  channelIds: string[]
  totalRequested: number
  totalSucceeded: number
  totalFailed: number
  totalAlreadyInChannel: number
  cancelled: boolean
  channelResults: InviteBatchResult[]
}

export interface CsvInviteImportResult {
  filePath: string | null
  fileName: string | null
  columnName: string | null
  parsedCount: number
  matchedCount: number
  duplicateCount: number
  matchedUserIds: string[]
  unmatchedValues: string[]
}

export interface InvitePreviewChannelResult {
  channelId: string
  channelName: string | null
  requestedCount: number
  invitableCount: number
  alreadyInChannelCount: number
  invitableUserIds: string[]
  alreadyInChannelUserIds: string[]
}

export interface InvitePreviewResult {
  channelIds: string[]
  requestedUserIds: string[]
  totalRequested: number
  totalInvitable: number
  totalAlreadyInChannel: number
  channelResults: InvitePreviewChannelResult[]
}

export type InviteRunMode = 'dry-run' | 'execute'
export type InviteRunStatus = 'completed' | 'cancelled' | 'failed'

export interface InviteSummary {
  requestedUsers: number
  requestedChannels: number
  totalRequested: number
  totalSucceeded: number
  totalFailed: number
  totalAlreadyInChannel: number
}

export interface InviteLogEntry {
  timestamp: string
  channelId: string
  channelName: string | null
  userId: string
  userName: string | null
  status: 'success' | 'failed' | 'already_in_channel' | 'planned'
  error?: string
}

export interface InviteRunRecord {
  id: string
  mode: InviteRunMode
  status: InviteRunStatus
  csvFileName: string | null
  channelIds: string[]
  channelNames: string[]
  userIds: string[]
  preview: InvitePreviewResult
  summary: InviteSummary
  logs: InviteLogEntry[]
  createdAt: string
  updatedAt: string
}

export type OperationType = 'invite' | 'broadcast' | 'direct_message'
export type OperationMode = 'execute' | 'dry-run'
export type OperationStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'canceled'
export type OperationTargetType = 'channel' | 'user' | 'campaign' | 'run'

export interface OperationSummary {
  totalItems: number
  pendingCount: number
  processingCount: number
  successCount: number
  failedCount: number
  skippedCount: number
  canceledCount: number
}

export interface OperationTaskRecord {
  id: string
  operationType: OperationType
  mode: OperationMode
  title: string
  status: OperationStatus
  idempotencyKey: string
  payloadHash: string
  metadata: Record<string, unknown> | null
  totalJobs: number
  summary: OperationSummary
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface OperationJobRecord {
  id: string
  taskId: string
  operationType: OperationType
  title: string
  status: OperationStatus
  targetType: OperationTargetType
  targetId: string
  targetLabel: string | null
  idempotencyKey: string
  payloadHash: string
  metadata: Record<string, unknown> | null
  summary: OperationSummary
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface OperationJobItemRecord {
  id: string
  taskId: string
  jobId: string
  operationType: OperationType
  status: OperationStatus
  targetId: string
  targetLabel: string | null
  idempotencyKey: string
  payloadHash: string
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  attemptCount: number
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface OperationTaskDetail extends OperationTaskRecord {
  jobs: OperationJobRecord[]
  items: OperationJobItemRecord[]
}

export interface OperationTaskInput {
  id: string
  operationType: OperationType
  mode: OperationMode
  title: string
  status: OperationStatus
  idempotencyKey: string
  payloadHash: string
  metadata?: Record<string, unknown> | null
  totalJobs: number
  summary: OperationSummary
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  completedAt?: string | null
}

export interface OperationJobInput {
  id: string
  taskId: string
  operationType: OperationType
  title: string
  status: OperationStatus
  targetType: OperationTargetType
  targetId: string
  targetLabel?: string | null
  idempotencyKey: string
  payloadHash: string
  metadata?: Record<string, unknown> | null
  summary: OperationSummary
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  completedAt?: string | null
}

export interface OperationJobItemInput {
  id: string
  taskId: string
  jobId: string
  operationType: OperationType
  status: OperationStatus
  targetId: string
  targetLabel?: string | null
  idempotencyKey: string
  payloadHash: string
  payload: Record<string, unknown>
  result?: Record<string, unknown> | null
  error?: string | null
  attemptCount?: number
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  completedAt?: string | null
}

export interface InviteExecutionItemResult {
  channelId: string
  userId: string
  status: 'success' | 'failed' | 'already_in_channel'
  error?: string
}

export interface DirectMessageExecutionItemResult {
  userId: string
  channelId: string | null
  status: 'success' | 'failed'
  error?: string
}

export interface BroadcastExecutionItemResult {
  channelId: string
  repeatIndex: number
  status: 'success' | 'failed'
  error?: string
}

/** メッセージ送信結果（1チャンネル） */
export interface BroadcastChannelResult {
  channelId: string
  success: boolean
  sentCount: number
  errors: string[]
}

/** メッセージ一括送信結果 */
export interface BroadcastBatchResult {
  channelIds: string[]
  totalRequested: number
  totalSucceeded: number
  totalFailed: number
  cancelled: boolean
  channelResults: BroadcastChannelResult[]
}

export interface AudienceSelectionResult {
  channelId: string
  channelName: string | null
  sourceCount: number
  targetCount: number
  excludedCount: number
  selectedUserIds: string[]
  excludedUserIds: string[]
}

export interface DirectMessageUserResult {
  userId: string
  channelId: string | null
  success: boolean
  error?: string
}

export interface DirectMessageBatchResult {
  totalRequested: number
  totalSucceeded: number
  totalFailed: number
  cancelled: boolean
  results: DirectMessageUserResult[]
}

export interface DirectMessageProgress {
  done: number
  total: number
  success: number
  fail: number
  userId: string
}

/** 認証情報 */
export interface AuthCredentials {
  workspace: string
  token: string // xoxc-...
  cookie: string // xoxd-...
}

/** 同期メタデータ */
export interface SyncMeta {
  lastUserSync: Date | null
  lastChannelSync: Date | null
  lastMessageSync: Date | null
}

/** メッセージ送信タスクのステータス */
export type BroadcastTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'scheduled'
  | 'failed'
  | 'stopped'

/** 高度なスケジュール設定 */
export interface ScheduleConfig {
  type: 'immediate' | 'once' | 'daily' | 'interval'
  
  // 'once' の場合
  scheduledAt?: string // ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)

  // 共通の期間設定
  startDate?: string   // 開始日 (ISO YYYY-MM-DD...)
  endDate?: string     // 終了日 (ISO)
  repeatUntilStopped?: boolean // 明示的に停止するまでループ

  // 'daily' の場合
  timeOfDay?: string   // "09:00"
  daysOfWeek?: number[] // 実行する曜日 (0:日, 1:月...)

  // 'interval' の場合
  intervalValue?: number // 例: 15, 2
  intervalUnit?: 'minutes' | 'hours'
  windowStart?: string // 指定時間内にのみ実行 (例: "09:00")
  windowEnd?: string   // (例: "18:00")
}

/** メッセージ送信タスク（予約・ループ対応） */
export interface BroadcastTask {
  id: string
  name: string
  channelIds: string[]
  message: string
  repeatCount: number
  imageUrl: string | null // 画像URL (公開URL) - Legacy
  localImagePath?: string // [NEW] PCローカルの画像パス - Legacy
  
  imageUrls?: string[] // [NEW] 複数画像URL
  localImagePaths?: string[] // [NEW] 複数ローカル画像パス
  fileIds?: string[] // [NEW] Slack 内部ファイル ID (ネイティブ表示用)
  
  schedule: ScheduleConfig // [NEW] 高度なスケジューリング設定
  
  // メッセージパターン (ローテーション用)
  messages?: string[]
  nextMessageIndex?: number
  
  // Legacy fields (維持するが将来削除)
  recurrence?: 'daily' | null
  recurrenceDays?: number | null
  scheduledTime?: string | null
  
  status: BroadcastTaskStatus
  lastRunAt: string | null // 最後に実行が完了（または開始）した時刻
  logs?: BroadcastLog[] // [NEW] 実行履歴ログ
  createdAt: string
  updatedAt: string
}

/** [NEW] 送信ログの詳細 */
export interface BroadcastLog {
  timestamp: string
  channelId: string
  channelName?: string
  status: 'success' | 'fail' | 'skip'
  message: string
  error?: string
  patternIndex?: number // 何番目のメッセージパターンを送ったか
}

/** メッセージ送信進捗 */
export interface BroadcastProgress {
  taskId?: string
  done: number
  total: number
  success: number
  fail: number
  channelId: string
}
