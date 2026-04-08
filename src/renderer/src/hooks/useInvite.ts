import { useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

export function useInvite() {
  const { isInviting, inviteProgress, setInviting, setInviteProgress, channels } = useAppStore()

  useEffect(() => {
    const cleanup = window.api.onInviteProgress((data) => {
      const channelName =
        channels.find((channel) => channel.id === data.channelId)?.name ?? data.channelId
      setInviteProgress({ done: data.done, total: data.total, channelName })
    })
    return cleanup
  }, [channels, setInviteProgress])

  const executeInvite = useCallback(
    async (channelIds: string[], userIds: string[]) => {
      setInviting(true)
      setInviteProgress({ done: 0, total: channelIds.length * userIds.length, channelName: null })
      try {
        const result = await window.api.executeInvite(channelIds, userIds)
        return result
      } finally {
        setInviting(false)
        setInviteProgress(null)
      }
    },
    [setInviting, setInviteProgress]
  )

  const cancelInvite = useCallback(async () => {
    await window.api.cancelInvite()
  }, [])

  return { isInviting, inviteProgress, executeInvite, cancelInvite }
}
