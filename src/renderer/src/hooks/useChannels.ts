import { useCallback } from 'react'
import { useAppStore } from '../stores/app-store'

export function useChannels() {
  const { channels, setChannels } = useAppStore()

  const loadChannels = useCallback(async () => {
    const data = await window.api.getChannels()
    setChannels(data)
  }, [setChannels])

  return { channels, loadChannels }
}
