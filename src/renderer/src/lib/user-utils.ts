export function hasStudentId(name: string): boolean {
  const normalized = name.trim()
  return /^(?=.*\d)[a-z0-9_-]{4,}$/i.test(normalized)
}

export function getDisplayName(user: {
  displayName: string
  realName: string
  name: string
}): string {
  return user.displayName || user.realName || user.name || '-'
}
