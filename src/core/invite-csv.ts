import type { ClassifiedUser, CsvInviteImportResult } from './types'

const HEADER_CANDIDATES = new Set([
  'id',
  'user_id',
  'userid',
  'slack_id',
  'slackid',
  'name',
  'username',
  'slack_name',
  'slackname',
  'student_id',
  'studentid',
  'identifier'
])

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  fields.push(current.trim())
  return fields
}

function parseCsvRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseCsvLine)
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function detectColumn(rows: string[][]): { columnIndex: number; columnName: string | null } {
  if (rows.length === 0) {
    return { columnIndex: 0, columnName: null }
  }

  const header = rows[0]
  const detectedIndex = header.findIndex((value) => HEADER_CANDIDATES.has(normalizeHeader(value)))

  if (detectedIndex >= 0) {
    return {
      columnIndex: detectedIndex,
      columnName: header[detectedIndex] || null
    }
  }

  return { columnIndex: 0, columnName: null }
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase()
}

export function parseInviteCsv(
  text: string,
  users: ClassifiedUser[],
  filePath: string | null,
  fileName: string | null
): CsvInviteImportResult {
  const rows = parseCsvRows(text)
  const { columnIndex, columnName } = detectColumn(rows)
  const dataRows = columnName ? rows.slice(1) : rows

  const byUserId = new Map<string, string>()
  const byIdentifier = new Map<string, string>()

  for (const user of users) {
    byUserId.set(normalizeValue(user.id), user.id)
    byIdentifier.set(normalizeValue(user.name), user.id)
  }

  const matchedUserIds: string[] = []
  const matchedSet = new Set<string>()
  const unmatchedValues: string[] = []
  let duplicateCount = 0
  let parsedCount = 0

  for (const row of dataRows) {
    const value = (row[columnIndex] ?? row[0] ?? '').trim()
    if (!value) continue

    parsedCount += 1
    const normalized = normalizeValue(value)
    const matchedUserId = byUserId.get(normalized) ?? byIdentifier.get(normalized)

    if (!matchedUserId) {
      unmatchedValues.push(value)
      continue
    }

    if (matchedSet.has(matchedUserId)) {
      duplicateCount += 1
      continue
    }

    matchedSet.add(matchedUserId)
    matchedUserIds.push(matchedUserId)
  }

  return {
    filePath,
    fileName,
    columnName,
    parsedCount,
    matchedCount: matchedUserIds.length,
    duplicateCount,
    matchedUserIds,
    unmatchedValues
  }
}
