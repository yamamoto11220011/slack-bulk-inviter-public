import type { ScheduleConfig } from '../../../core/types'

export const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const
export const ALL_SCHEDULE_DAYS = [0, 1, 2, 3, 4, 5, 6] as const
const WEEKDAY_SET = '1,2,3,4,5'
const WEEKEND_SET = '0,6'
const EVERYDAY_SET = '0,1,2,3,4,5,6'

function normalizeDays(days?: number[]): number[] {
  return Array.from(new Set((days ?? []).filter((day) => day >= 0 && day <= 6))).sort((a, b) => a - b)
}

function formatDate(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric'
  }).format(date)
}

function formatDateTime(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function describeDays(days?: number[]): string {
  const normalized = normalizeDays(days)
  const key = normalized.join(',')
  if (!key || key === EVERYDAY_SET) return '毎日'
  if (key === WEEKDAY_SET) return '平日'
  if (key === WEEKEND_SET) return '土日'
  return normalized.map((day) => `${DAY_LABELS[day]}`).join('・')
}

export function describeSchedule(schedule: ScheduleConfig): {
  title: string
  details: string[]
  shortLabel: string
} {
  if (schedule.type === 'immediate') {
    return {
      title: '手動で実行',
      details: ['保存後は自動送信されません。タスク一覧の「今すぐ実行」から開始します。'],
      shortLabel: '手動実行'
    }
  }

  if (schedule.type === 'once') {
    const when = formatDateTime(schedule.scheduledAt) ?? '日時未設定'
    return {
      title: `${when} に1回送信`,
      details: ['Slack の予約投稿に近い使い方です。指定時刻に1度だけ実行されます。'],
      shortLabel: '1回だけ予約'
    }
  }

  if (schedule.type === 'daily') {
    const dayLabel = describeDays(schedule.daysOfWeek)
    const startLabel = formatDate(schedule.startDate)
    const endLabel = formatDate(schedule.endDate)
    const details = [
      startLabel ? `${startLabel} から開始` : '開始日なし',
      endLabel ? `${endLabel} まで` : '停止するまで続ける'
    ]

    return {
      title: `${dayLabel} の ${schedule.timeOfDay ?? '09:00'} に送信`,
      details,
      shortLabel: '毎日・曜日指定'
    }
  }

  const intervalValue = schedule.intervalValue ?? 30
  const intervalUnit = schedule.intervalUnit === 'hours' ? '時間' : '分'
  const dayLabel = describeDays(schedule.daysOfWeek)
  const startLabel = formatDate(schedule.startDate)
  const endLabel = formatDate(schedule.endDate)
  const windowText =
    schedule.windowStart && schedule.windowEnd
      ? `${schedule.windowStart} - ${schedule.windowEnd} の間だけ実行`
      : '時間帯の制限なし'

  return {
    title: `${intervalValue}${intervalUnit}ごとに送信`,
    details: [
      `${dayLabel} に実行`,
      windowText,
      startLabel ? `${startLabel} から開始` : '開始日なし',
      endLabel ? `${endLabel} まで` : '停止するまで続ける'
    ],
    shortLabel: '一定間隔'
  }
}
