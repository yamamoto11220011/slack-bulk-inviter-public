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

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-border mb-2 bg-muted/20">
        <button
          onClick={() => setActiveTab('quick')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'quick' ? 'border-blue-500 text-blue-500' : 'border-transparent text-muted-foreground'
          }`}
        >
          クイック送信
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'tasks' ? 'border-green-500 text-green-500' : 'border-transparent text-muted-foreground'
          }`}
        >
          タスク管理
        </button>
        <button
          onClick={() => {
            if (activeTab === 'form') {
              setEditingTask(undefined) // 既にフォームを開いている時に押したら新規作成にリセット
            }
            setActiveTab('form')
          }}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'form' ? 'border-purple-500 text-purple-500' : 'border-transparent text-muted-foreground'
          }`}
        >
          {activeTab === 'form' && editingTask ? 'タスク編集 (タップで新規)' : '新規作成'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        <div className={activeTab === 'quick' ? 'block' : 'hidden'}>
          <div className="space-y-4">
            {quickBroadcastContent}
          </div>
        </div>

        <div className={activeTab === 'tasks' ? 'block' : 'hidden'}>
          <BroadcastTaskList onEdit={handleEditTask} />
        </div>

        <div className={activeTab === 'form' ? 'block' : 'hidden'}>
          <div className="p-4">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-4">
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
