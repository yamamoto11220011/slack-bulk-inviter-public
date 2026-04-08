import { Layers3, ListChecks, PlusSquare } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../stores/app-store'
import { BroadcastTaskList } from './BroadcastTaskList'
import { BroadcastTaskForm } from './BroadcastTaskForm'
import { BroadcastTask } from '../../../core/types'

type Tab = 'quick' | 'tasks' | 'form'

interface Props {
  onQuickBroadcast: () => void
  isQuickBroadcasting: boolean
  quickBroadcastContent: React.ReactNode
}

export function BroadcastTabs({ onQuickBroadcast, isQuickBroadcasting, quickBroadcastContent }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('quick')
  const [editingTask, setEditingTask] = useState<Partial<BroadcastTask> | undefined>(undefined)
  const { upsertTask } = useAppStore(useShallow(state => ({
    upsertTask: state.upsertTask
  })))

  const handleSaveTask = async (task: BroadcastTask) => {
    await upsertTask(task)
    setEditingTask(undefined)
    setActiveTab('tasks')
  }

  const handleEditTask = (task: BroadcastTask) => {
    setEditingTask(task)
    setActiveTab('form')
  }

  const tabs: Array<{ id: Tab; label: string; hint: string; Icon: typeof Layers3 }> = [
    { id: 'quick', label: 'クイック送信', hint: 'いま送る', Icon: Layers3 },
    { id: 'tasks', label: 'タスク管理', hint: '一覧と履歴', Icon: ListChecks },
    { id: 'form', label: editingTask ? 'タスク編集' : '新規作成', hint: editingTask ? '編集中' : '自動送信を追加', Icon: PlusSquare }
  ]

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-[1.4rem] border border-border/70 bg-card/85 p-2 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.42)]">
        <div className="grid gap-2 md:grid-cols-3">
          {tabs.map(({ id, label, hint, Icon }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === 'form' && activeTab === 'form') {
                    setEditingTask(undefined)
                  }
                  setActiveTab(id)
                }}
                className={`flex items-center gap-3 rounded-[1.1rem] px-4 py-3 text-left transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-[0_20px_44px_-28px_rgba(15,23,42,0.72)]'
                    : 'bg-background/65 text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? 'bg-white/12' : 'bg-secondary/80 text-primary'}`}>
                  <Icon size={18} />
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold">{label}</div>
                  <div className={`text-[11px] ${isActive ? 'text-primary-foreground/72' : 'text-muted-foreground'}`}>{hint}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto">
        <div className={activeTab === 'quick' ? 'block' : 'hidden'}>
          <div className="space-y-4">
            {quickBroadcastContent}
          </div>
        </div>

        <div className={activeTab === 'tasks' ? 'block' : 'hidden'}>
          <BroadcastTaskList onEdit={handleEditTask} />
        </div>

        <div className={activeTab === 'form' ? 'block' : 'hidden'}>
          <div className="rounded-[1.5rem] border border-border/70 bg-card/84 p-5 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.42)]">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {editingTask ? 'タスクの編集' : '新しい自動送信タスク'}
            </h3>
            <BroadcastTaskForm
              key={editingTask ? editingTask.id : 'new-form'}
              task={editingTask}
              onSave={handleSaveTask}
              onCancel={() => {
                setEditingTask(undefined)
                setActiveTab('tasks')
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
