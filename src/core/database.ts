import { existsSync, mkdirSync, readFileSync } from 'fs'
import { createDecipheriv, scryptSync } from 'crypto'
import { dirname } from 'path'
import BetterSqlite3 from 'better-sqlite3'
import type {
  AuditChannelActivity,
  AuditInactiveUser,
  AuditMembershipChangePoint,
  AuditOverview,
  AuditTeamActivity,
  AuditTimelinePoint,
  ClassifiedUser,
  SlackChannel,
  SlackMessageActivity,
  SyncMeta,
  BroadcastTask,
  BroadcastTaskStatus
} from './types'

type Database = BetterSqlite3.Database

interface LegacyDbData {
  users?: Record<string, ClassifiedUser & { syncedAt?: string }>
  channels?: Record<string, SlackChannel & { syncedAt?: string }>
  messages?: Record<string, SlackMessageActivity & { syncedAt?: string }>
  syncMeta?: {
    lastUserSync?: string | null
    lastChannelSync?: string | null
    lastMessageSync?: string | null
  }
}

const LEGACY_ALGORITHM = 'aes-256-gcm'

function decryptLegacy(encryptedText: string, password: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const key = scryptSync(password, 'slack-bulk-inviter-salt', 32)
  const decipher = createDecipheriv(LEGACY_ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function normalizeNullableDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

function isoNow(): string {
  return new Date().toISOString()
}

export class AppDatabase {
  private db: Database

  constructor(
    dbPath: string,
    password: string,
    options?: {
      legacyPath?: string
    }
  ) {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const isNewDatabase = !existsSync(dbPath)
    this.db = new BetterSqlite3(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.initSchema()

    if (isNewDatabase && options?.legacyPath && existsSync(options.legacyPath)) {
      this.migrateLegacyData(options.legacyPath, password)
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        real_name TEXT NOT NULL,
        avatar_url TEXT NOT NULL,
        student_id TEXT,
        has_student_id INTEGER NOT NULL,
        category_id TEXT,
        is_bot INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_private INTEGER NOT NULL,
        is_member INTEGER NOT NULL,
        member_count INTEGER NOT NULL,
        last_history_sync_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS channel_memberships (
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        is_active INTEGER NOT NULL,
        synced_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS membership_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        text TEXT NOT NULL,
        ts TEXT NOT NULL,
        thread_ts TEXT,
        is_thread_reply INTEGER NOT NULL,
        reply_count INTEGER NOT NULL,
        last_activity_ts TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS broadcast_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        channel_ids TEXT NOT NULL, -- JSON array
        message TEXT NOT NULL,
        repeat_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        last_run_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      
      `);

      // 段階的マイグレーション（カラム追加）
      try {
        this.db.exec(`ALTER TABLE broadcast_tasks ADD COLUMN image_urls TEXT;`); // JSON array
      } catch (e) { /* ignore if column exists */ }
      try {
        this.db.exec(`ALTER TABLE broadcast_tasks ADD COLUMN local_image_paths TEXT;`); // JSON array
      } catch (e) { /* ignore if column exists */ }
      try {
        this.db.exec(`ALTER TABLE broadcast_tasks ADD COLUMN schedule_config TEXT;`);
      } catch (e) { /* ignore if column exists */ }
      try {
        this.db.exec(`ALTER TABLE broadcast_tasks ADD COLUMN file_ids TEXT;`); // [NEW] Slack file IDs
      } catch (e) { /* ignore if column exists */ }
      try {
        this.db.exec(`ALTER TABLE broadcast_tasks ADD COLUMN messages TEXT;`); // [NEW] Multiple patterns
      } catch (e) { /* ignore if column exists */ }
      try {
        this.db.exec(`ALTER TABLE broadcast_tasks ADD COLUMN next_message_index INTEGER DEFAULT 0;`); // [NEW] Rotation index
      } catch (e) { /* ignore if column exists */ }
      try {
        this.db.exec(`ALTER TABLE broadcast_tasks ADD COLUMN logs TEXT;`); // [NEW] JSON array of logs
      } catch (e) { /* ignore if column exists */ }

      // 以前のレガシーカラム(scheduled_at, interval_ms等)は無視して扱います。

      this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_category_id ON users(category_id);
      CREATE INDEX IF NOT EXISTS idx_users_has_student_id ON users(has_student_id);
      CREATE INDEX IF NOT EXISTS idx_channels_is_member ON channels(is_member);
      CREATE INDEX IF NOT EXISTS idx_channel_memberships_user_id ON channel_memberships(user_id);
      CREATE INDEX IF NOT EXISTS idx_channel_memberships_active ON channel_memberships(channel_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_messages_user_ts ON messages(user_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_channel_ts ON messages(channel_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_thread_ts ON messages(thread_ts);
      CREATE INDEX IF NOT EXISTS idx_membership_changes_date ON membership_changes(synced_at);
    `)
  }

  private migrateLegacyData(legacyPath: string, password: string): void {
    const raw = readFileSync(legacyPath, 'utf-8')
    if (!raw.includes(':')) return

    const legacy = JSON.parse(decryptLegacy(raw, password)) as LegacyDbData

    if (legacy.users) {
      this.upsertUsers(Object.values(legacy.users).map(({ syncedAt: _, ...user }) => user))
    }
    if (legacy.channels) {
      this.upsertChannels(Object.values(legacy.channels).map(({ syncedAt: _, ...channel }) => channel))
    }
    if (legacy.messages) {
      this.replaceMessagesForChannels(
        Array.from(
          new Set(Object.values(legacy.messages).map((message) => message.channelId))
        ),
        Object.values(legacy.messages).map(({ syncedAt: _, ...message }) => message)
      )
    }
    if (legacy.syncMeta) {
      const mapping = [
        ['users', legacy.syncMeta.lastUserSync ?? null],
        ['channels', legacy.syncMeta.lastChannelSync ?? null],
        ['messages', legacy.syncMeta.lastMessageSync ?? null]
      ] as const

      for (const [key, value] of mapping) {
        if (value) {
          this.setSyncTime(key, value)
        }
      }
    }
  }

  upsertUsers(users: ClassifiedUser[]): void {
    const now = isoNow()
    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, name, display_name, real_name, avatar_url, student_id, has_student_id,
        category_id, is_bot, is_deleted, updated_at
      ) VALUES (
        @id, @name, @display_name, @real_name, @avatar_url, @student_id, @has_student_id,
        @category_id, @is_bot, @is_deleted, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        display_name = excluded.display_name,
        real_name = excluded.real_name,
        avatar_url = excluded.avatar_url,
        student_id = excluded.student_id,
        has_student_id = excluded.has_student_id,
        category_id = excluded.category_id,
        is_bot = excluded.is_bot,
        is_deleted = excluded.is_deleted,
        updated_at = excluded.updated_at
    `)

    const tx = this.db.transaction((items: ClassifiedUser[]) => {
      for (const user of items) {
        stmt.run({
          id: user.id,
          name: user.name,
          display_name: user.displayName,
          real_name: user.realName,
          avatar_url: user.avatarUrl,
          student_id: user.name || null,
          has_student_id: user.name ? 1 : 0,
          category_id: user.categoryId,
          is_bot: user.isBot ? 1 : 0,
          is_deleted: user.isDeleted ? 1 : 0,
          updated_at: now
        })
      }
    })

    tx(users)
  }

  getUsers(categoryId?: string): ClassifiedUser[] {
    let sql = `
      SELECT id, name, display_name, real_name, avatar_url, category_id, is_bot, is_deleted
      FROM users
      WHERE is_bot = 0 AND is_deleted = 0
    `
    const params: unknown[] = []

    if (categoryId) {
      sql += ' AND category_id = ?'
      params.push(categoryId)
    }

    sql += ' ORDER BY name ASC'

    return this.db.prepare(sql).all(...params).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      name: String((row as Record<string, unknown>).name),
      displayName: String((row as Record<string, unknown>).display_name ?? ''),
      realName: String((row as Record<string, unknown>).real_name ?? ''),
      avatarUrl: String((row as Record<string, unknown>).avatar_url ?? ''),
      categoryId: ((row as Record<string, unknown>).category_id as string | null) ?? null,
      isBot: Boolean((row as Record<string, unknown>).is_bot),
      isDeleted: Boolean((row as Record<string, unknown>).is_deleted)
    }))
  }

  upsertChannels(channels: SlackChannel[]): void {
    const now = isoNow()
    const stmt = this.db.prepare(`
      INSERT INTO channels (
        id, name, is_private, is_member, member_count, last_history_sync_at, updated_at
      ) VALUES (
        @id, @name, @is_private, @is_member, @member_count, NULL, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        is_private = excluded.is_private,
        is_member = excluded.is_member,
        member_count = excluded.member_count,
        updated_at = excluded.updated_at
    `)

    const tx = this.db.transaction((items: SlackChannel[]) => {
      for (const channel of items) {
        stmt.run({
          id: channel.id,
          name: channel.name,
          is_private: channel.isPrivate ? 1 : 0,
          is_member: channel.isMember ? 1 : 0,
          member_count: channel.memberCount,
          updated_at: now
        })
      }
    })

    tx(channels)
  }

  /**
   * 取得したチャンネルIDのリストに含まれないチャンネルを「非参加」として更新する。
   */
  deactivateMissingChannels(fetchedChannelIds: string[]): void {
    if (fetchedChannelIds.length === 0) return
    const placeholders = fetchedChannelIds.map(() => '?').join(', ')
    this.db
      .prepare(`UPDATE channels SET is_member = 0, updated_at = ? WHERE id NOT IN (${placeholders})`)
      .run(isoNow(), ...fetchedChannelIds)
  }

  getChannels(memberOnly?: boolean): SlackChannel[] {
    let sql = `
      SELECT id, name, is_private, is_member, member_count
      FROM channels
    `
    const params: unknown[] = []

    if (memberOnly) {
      sql += ' WHERE is_member = 1'
    }

    sql += ' ORDER BY name ASC'

    return this.db.prepare(sql).all(...params).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      name: String((row as Record<string, unknown>).name),
      isPrivate: Boolean((row as Record<string, unknown>).is_private),
      isMember: Boolean((row as Record<string, unknown>).is_member),
      memberCount: Number((row as Record<string, unknown>).member_count ?? 0)
    }))
  }

  replaceChannelMemberships(channelId: string, userIds: string[]): void {
    const now = isoNow()
    const existingRows = this.db
      .prepare('SELECT user_id, is_active FROM channel_memberships WHERE channel_id = ?')
      .all(channelId) as Array<{ user_id: string; is_active: number }>

    const existingActive = new Set(
      existingRows.filter((row) => row.is_active === 1).map((row) => row.user_id)
    )
    const incoming = new Set(userIds)

    const upsertStmt = this.db.prepare(`
      INSERT INTO channel_memberships (channel_id, user_id, is_active, synced_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(channel_id, user_id) DO UPDATE SET
        is_active = 1,
        synced_at = excluded.synced_at
    `)
    const deactivateStmt = this.db.prepare(`
      UPDATE channel_memberships
      SET is_active = 0, synced_at = ?
      WHERE channel_id = ? AND user_id = ?
    `)
    const changeStmt = this.db.prepare(`
      INSERT INTO membership_changes (channel_id, user_id, change_type, synced_at)
      VALUES (?, ?, ?, ?)
    `)

    const tx = this.db.transaction(() => {
      for (const userId of incoming) {
        upsertStmt.run(channelId, userId, now)
        if (!existingActive.has(userId)) {
          changeStmt.run(channelId, userId, 'joined', now)
        }
      }

      for (const userId of existingActive) {
        if (!incoming.has(userId)) {
          deactivateStmt.run(now, channelId, userId)
          changeStmt.run(channelId, userId, 'left', now)
        }
      }
    })

    tx()
  }

  deactivateMembershipsForChannels(channelIds: string[]): void {
    if (channelIds.length === 0) return
    const now = isoNow()
    const stmt = this.db.prepare(`
      UPDATE channel_memberships
      SET is_active = 0, synced_at = ?
      WHERE channel_id = ? AND is_active = 1
    `)
    const tx = this.db.transaction((ids: string[]) => {
      for (const channelId of ids) {
        stmt.run(now, channelId)
      }
    })
    tx(channelIds)
  }

  replaceMessagesForChannels(channelIds: string[], messages: SlackMessageActivity[]): void {
    if (channelIds.length === 0) return

    const now = isoNow()
    const deleteStmt = this.db.prepare('DELETE FROM messages WHERE channel_id = ?')
    const insertStmt = this.db.prepare(`
      INSERT INTO messages (
        id, user_id, channel_id, text, ts, thread_ts, is_thread_reply, reply_count, last_activity_ts, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        channel_id = excluded.channel_id,
        text = excluded.text,
        ts = excluded.ts,
        thread_ts = excluded.thread_ts,
        is_thread_reply = excluded.is_thread_reply,
        reply_count = excluded.reply_count,
        last_activity_ts = excluded.last_activity_ts,
        synced_at = excluded.synced_at
    `)
    const updateChannelSyncStmt = this.db.prepare(`
      UPDATE channels SET last_history_sync_at = ?, updated_at = updated_at WHERE id = ?
    `)

    const grouped = new Map<string, SlackMessageActivity[]>()
    for (const message of messages) {
      const bucket = grouped.get(message.channelId) ?? []
      bucket.push(message)
      grouped.set(message.channelId, bucket)
    }

    const tx = this.db.transaction(() => {
      for (const channelId of channelIds) {
        deleteStmt.run(channelId)
        for (const message of grouped.get(channelId) ?? []) {
          insertStmt.run(
            message.id,
            message.userId,
            message.channelId,
            message.text,
            message.ts,
            message.threadTs,
            message.isThreadReply ? 1 : 0,
            message.replyCount,
            message.lastActivityTs,
            now
          )
        }
        updateChannelSyncStmt.run(now, channelId)
      }
    })

    tx()
  }

  getMessagesByUserIds(userIds: string[], limit = 100): SlackMessageActivity[] {
    if (userIds.length === 0) return []

    const placeholders = userIds.map(() => '?').join(', ')
    const rows = this.db
      .prepare(`
        SELECT id, user_id, channel_id, text, ts, thread_ts, is_thread_reply, reply_count, last_activity_ts
        FROM messages
        WHERE user_id IN (${placeholders})
        ORDER BY CAST(ts AS REAL) DESC
        LIMIT ?
      `)
      .all(...userIds, limit) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      channelId: String(row.channel_id),
      text: String(row.text ?? ''),
      ts: String(row.ts),
      threadTs: (row.thread_ts as string | null) ?? null,
      isThreadReply: Boolean(row.is_thread_reply),
      replyCount: Number(row.reply_count ?? 0),
      lastActivityTs: String(row.last_activity_ts)
    }))
  }

  getAuditOverview(): AuditOverview {
    const threshold = String(Date.now() / 1000 - 30 * 24 * 60 * 60)

    const totalsRow = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE is_bot = 0 AND is_deleted = 0) AS users,
          (SELECT COUNT(*) FROM channels) AS channels,
          (SELECT COUNT(*) FROM channel_memberships WHERE is_active = 1) AS memberships,
          (SELECT COUNT(*) FROM messages) AS messages,
          (
            SELECT COUNT(DISTINCT user_id)
            FROM messages
            WHERE CAST(ts AS REAL) >= CAST(? AS REAL)
          ) AS active_users_30d
      `)
      .get(threshold) as Record<string, unknown>

    const teamActivity = this.db
      .prepare(`
        SELECT
          u.category_id AS category_id,
          COUNT(*) AS message_count,
          COUNT(DISTINCT m.user_id) AS active_users
        FROM messages m
        JOIN users u ON u.id = m.user_id
        WHERE u.is_bot = 0 AND u.is_deleted = 0
        GROUP BY u.category_id
        ORDER BY message_count DESC
      `)
      .all() as Array<Record<string, unknown>>

    const channelActivity = this.db
      .prepare(`
        SELECT
          c.id AS channel_id,
          c.name AS channel_name,
          COUNT(m.id) AS message_count,
          COUNT(DISTINCT m.user_id) AS active_users,
          MAX(m.last_activity_ts) AS last_activity_ts
        FROM channels c
        LEFT JOIN messages m ON m.channel_id = c.id
        GROUP BY c.id, c.name
        ORDER BY message_count DESC, c.name ASC
        LIMIT 12
      `)
      .all() as Array<Record<string, unknown>>

    const inactiveUsers = this.db
      .prepare(`
        SELECT
          u.id AS user_id,
          u.name,
          u.display_name,
          u.real_name,
          u.category_id,
          MAX(m.last_activity_ts) AS last_activity_ts
        FROM users u
        LEFT JOIN messages m ON m.user_id = u.id
        WHERE u.is_bot = 0 AND u.is_deleted = 0
        GROUP BY u.id, u.name, u.display_name, u.real_name, u.category_id
        HAVING last_activity_ts IS NULL OR CAST(last_activity_ts AS REAL) < CAST(? AS REAL)
        ORDER BY
          CASE WHEN last_activity_ts IS NULL THEN 0 ELSE 1 END ASC,
          CAST(last_activity_ts AS REAL) ASC
        LIMIT 20
      `)
      .all(threshold) as Array<Record<string, unknown>>

    const activityTimeline = this.db
      .prepare(`
        SELECT
          date(CAST(ts AS REAL), 'unixepoch', 'localtime') AS date,
          COUNT(*) AS message_count,
          COUNT(DISTINCT user_id) AS active_users
        FROM messages
        WHERE CAST(ts AS REAL) >= CAST(? AS REAL)
        GROUP BY date
        ORDER BY date DESC
        LIMIT 14
      `)
      .all(String(Date.now() / 1000 - 14 * 24 * 60 * 60)) as Array<Record<string, unknown>>

    const membershipChanges = this.db
      .prepare(`
        SELECT
          date(synced_at, 'localtime') AS date,
          SUM(CASE WHEN change_type = 'joined' THEN 1 ELSE 0 END) AS joined_count,
          SUM(CASE WHEN change_type = 'left' THEN 1 ELSE 0 END) AS left_count
        FROM membership_changes
        WHERE synced_at >= datetime('now', '-14 days')
        GROUP BY date
        ORDER BY date DESC
        LIMIT 14
      `)
      .all() as Array<Record<string, unknown>>

    const activeUsers30d = Number(totalsRow.active_users_30d ?? 0)
    const totalUsers = Number(totalsRow.users ?? 0)

    return {
      totals: {
        users: totalUsers,
        channels: Number(totalsRow.channels ?? 0),
        memberships: Number(totalsRow.memberships ?? 0),
        messages: Number(totalsRow.messages ?? 0),
        activeUsers30d,
        inactiveUsers30d: Math.max(totalUsers - activeUsers30d, 0)
      },
      teamActivity: teamActivity.map(
        (row): AuditTeamActivity => ({
          categoryId: (row.category_id as string | null) ?? null,
          messageCount: Number(row.message_count ?? 0),
          activeUsers: Number(row.active_users ?? 0)
        })
      ),
      channelActivity: channelActivity.map(
        (row): AuditChannelActivity => ({
          channelId: String(row.channel_id),
          channelName: String(row.channel_name),
          messageCount: Number(row.message_count ?? 0),
          activeUsers: Number(row.active_users ?? 0),
          lastActivityTs: (row.last_activity_ts as string | null) ?? null
        })
      ),
      inactiveUsers: inactiveUsers.map(
        (row): AuditInactiveUser => ({
          userId: String(row.user_id),
          name: String(row.name ?? ''),
          displayName: String(row.display_name ?? ''),
          realName: String(row.real_name ?? ''),
          categoryId: (row.category_id as string | null) ?? null,
          lastActivityTs: (row.last_activity_ts as string | null) ?? null
        })
      ),
      activityTimeline: activityTimeline
        .map(
          (row): AuditTimelinePoint => ({
            date: String(row.date),
            messageCount: Number(row.message_count ?? 0),
            activeUsers: Number(row.active_users ?? 0)
          })
        )
        .reverse(),
      membershipChanges: membershipChanges
        .map(
          (row): AuditMembershipChangePoint => ({
            date: String(row.date),
            joinedCount: Number(row.joined_count ?? 0),
            leftCount: Number(row.left_count ?? 0)
          })
        )
        .reverse()
    }
  }

  getSyncMeta(): SyncMeta {
    const rows = this.db
      .prepare('SELECT key, value FROM sync_state WHERE key IN (?, ?, ?)')
      .all('users', 'channels', 'messages') as Array<{ key: string; value: string | null }>

    const values = new Map(rows.map((row) => [row.key, row.value]))

    return {
      lastUserSync: normalizeNullableDate(values.get('users') ?? null),
      lastChannelSync: normalizeNullableDate(values.get('channels') ?? null),
      lastMessageSync: normalizeNullableDate(values.get('messages') ?? null)
    }
  }

  setSyncTime(type: 'users' | 'channels' | 'messages', value = isoNow()): void {
    this.db
      .prepare(`
        INSERT INTO sync_state (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(type, value, isoNow())
  }

  getBroadcastTasks(): BroadcastTask[] {
    const rows = this.db
      .prepare('SELECT * FROM broadcast_tasks ORDER BY created_at DESC')
      .all() as any[]
    return rows.map((row) => {
      // JSONパース (万が一失敗した時のフォールバック)
      let schedule = { type: 'immediate' as const }
      if (row.schedule_config) {
        try {
          schedule = JSON.parse(row.schedule_config)
        } catch {}
      }

      return {
        id: row.id,
        name: row.name,
        channelIds: JSON.parse(row.channel_ids),
        message: row.message,
        repeatCount: row.repeat_count,
        imageUrl: row.image_url || null,
        localImagePath: row.local_image_path || null,
        imageUrls: row.image_urls ? JSON.parse(row.image_urls) : [],
        localImagePaths: row.local_image_paths ? JSON.parse(row.local_image_paths) : [],
        fileIds: row.file_ids ? JSON.parse(row.file_ids) : [],
        messages: row.messages ? JSON.parse(row.messages) : [],
        nextMessageIndex: row.next_message_index ?? 0,
        schedule,
        status: row.status as BroadcastTaskStatus,
        lastRunAt: row.last_run_at,
        logs: row.logs ? JSON.parse(row.logs) : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    })
  }

  upsertBroadcastTask(task: BroadcastTask): void {
    const stmt = this.db.prepare(`
      INSERT INTO broadcast_tasks (
        id, name, channel_ids, message, repeat_count, 
        image_url, local_image_path, 
        image_urls, local_image_paths, file_ids,
        messages, next_message_index,
        schedule_config,
        status, last_run_at, logs, created_at, updated_at
      ) VALUES (
        @id, @name, @channel_ids, @message, @repeat_count, 
        @image_url, @local_image_path,
        @image_urls, @local_image_paths, @file_ids,
        @messages, @next_message_index,
        @schedule_config,
        @status, @last_run_at, @logs, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        channel_ids = excluded.channel_ids,
        message = excluded.message,
        repeat_count = excluded.repeat_count,
        image_url = excluded.image_url,
        local_image_path = excluded.local_image_path,
        image_urls = excluded.image_urls,
        local_image_paths = excluded.local_image_paths,
        file_ids = excluded.file_ids,
        messages = excluded.messages,
        next_message_index = excluded.next_message_index,
        schedule_config = excluded.schedule_config,
        status = excluded.status,
        last_run_at = excluded.last_run_at,
        logs = excluded.logs,
        updated_at = excluded.updated_at
    `)

    stmt.run({
      id: task.id,
      name: task.name,
      channel_ids: JSON.stringify(task.channelIds || []),
      message: task.message,
      repeat_count: task.repeatCount,
      image_url: task.imageUrl || null,
      local_image_path: task.localImagePath || null,
      image_urls: JSON.stringify(task.imageUrls || []),
      local_image_paths: JSON.stringify(task.localImagePaths || []),
      file_ids: JSON.stringify(task.fileIds || []),
      messages: JSON.stringify(task.messages || []),
      next_message_index: task.nextMessageIndex || 0,
      schedule_config: JSON.stringify(task.schedule || { type: 'immediate' }),
      status: task.status,
      last_run_at: task.lastRunAt,
      logs: JSON.stringify(task.logs || []),
      created_at: task.createdAt || isoNow(),
      updated_at: isoNow()
    })
  }

  deleteBroadcastTask(id: string): void {
    this.db.prepare('DELETE FROM broadcast_tasks WHERE id = ?').run(id)
  }

  updateBroadcastTaskStatus(id: string, status: BroadcastTaskStatus, lastRunAt?: string): void {
    if (lastRunAt) {
      this.db
        .prepare('UPDATE broadcast_tasks SET status = ?, last_run_at = ?, updated_at = ? WHERE id = ?')
        .run(status, lastRunAt, isoNow(), id)
    } else {
      this.db
        .prepare('UPDATE broadcast_tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run(status, isoNow(), id)
    }
  }

  addBroadcastLog(taskId: string, log: any): void {
    const row = this.db.prepare('SELECT logs FROM broadcast_tasks WHERE id = ?').get(taskId) as {
      logs: string
    }
    if (!row) return

    const logs = row.logs ? JSON.parse(row.logs) : []
    logs.unshift(log) // 先頭に追加
    
    // 最大100件に制限
    const trimmedLogs = logs.slice(0, 100)

    this.db
      .prepare('UPDATE broadcast_tasks SET logs = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(trimmedLogs), isoNow(), taskId)
  }
}
