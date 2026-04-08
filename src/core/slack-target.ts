const SLACK_CHANNEL_ID_PATTERN = /^[CDG][A-Z0-9]+$/

export function resolveSlackChannelId(input: string): string {
  const trimmed = input.trim()
  if (SLACK_CHANNEL_ID_PATTERN.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const segments = url.pathname.split('/').filter(Boolean)
    const channelId = [...segments].reverse().find((segment) => SLACK_CHANNEL_ID_PATTERN.test(segment))

    if (channelId) {
      return channelId
    }
  } catch {
    // URL でなければ後続のエラーで案内する
  }

  throw new Error(
    'Slack URL またはチャンネルIDを指定してください。例: https://app.slack.com/client/T.../C...'
  )
}
