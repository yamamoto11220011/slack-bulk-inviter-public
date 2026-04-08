import { useState, useEffect, useCallback } from 'react'

interface Toast {
  id: number
  message: string
}

let toastId = 0
let addToastFn: ((message: string) => void) | null = null

/** どこからでも呼べるエラー通知 */
export function showError(message: string): void {
  addToastFn?.(message)
}

export function ErrorToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 6000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => {
      addToastFn = null
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-lg animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p>{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-destructive/60 hover:text-destructive"
            >
              &times;
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
