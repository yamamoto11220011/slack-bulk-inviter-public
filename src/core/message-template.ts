const DEFAULT_LOCALE = 'ja-JP'

function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function formatWithOptions(
  now: Date,
  options: Intl.DateTimeFormatOptions,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    ...options,
    timeZone
  }).format(now)
}

export function renderMessageTemplate(template: string, now: Date = new Date()): string {
  const timeZone = getLocalTimeZone()
  const replacements: Array<[string, string]> = [
    [
      '{{now}}',
      formatWithOptions(
        now,
        {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZoneName: 'short'
        },
        timeZone
      )
    ],
    [
      '{{date}}',
      formatWithOptions(
        now,
        {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        },
        timeZone
      )
    ],
    [
      '{{time}}',
      formatWithOptions(
        now,
        {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        },
        timeZone
      )
    ],
    ['{{iso}}', now.toISOString()],
    ['{{timestamp}}', String(Math.floor(now.getTime() / 1000))],
    ['{{timezone}}', timeZone]
  ]

  return replacements.reduce(
    (result, [placeholder, value]) => result.split(placeholder).join(value),
    template
  )
}
