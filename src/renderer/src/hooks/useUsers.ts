import { useCallback } from 'react'
import { useAppStore } from '../stores/app-store'

export function useUsers() {
  const { users, setUsers, activeCategoryFilter } = useAppStore()

  const loadUsers = useCallback(async () => {
    const data = await window.api.getUsers()
    setUsers(data)
  }, [setUsers])

  const filteredUsers = activeCategoryFilter
    ? users.filter((u) => u.categoryId === activeCategoryFilter)
    : users

  return { users: filteredUsers, allUsers: users, loadUsers }
}
