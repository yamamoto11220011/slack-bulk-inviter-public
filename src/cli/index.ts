import { Command } from 'commander'
import { createServer } from 'http'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { AuthService } from '../core/auth'
import { AppDatabase } from '../core/database'
import { CategoryEngine } from '../core/category'
import { renderMessageTemplate } from '../core/message-template'
import { resolveSlackChannelId } from '../core/slack-target'
import { SlackClient } from '../core/slack-client'
import { SyncService } from '../core/sync'
import { InviteService } from '../core/invite'
import type { ClassifiedUser, SlackChannel } from '../core/types'

// ---- 共通ヘルパー ----

const DATA_DIR = join(homedir(), '.slack-bulk-inviter')
const DEFAULT_CONFIG_PATH = join(__dirname, '..', '..', 'config', 'categories.yml')
const PROJECT_LOCAL_CONFIG_PATH = join(__dirname, '..', '..', 'config', 'categories.local.yml')
const USER_LOCAL_CONFIG_PATH = join(DATA_DIR, 'categories.local.yml')

function getAuthService(): AuthService {
  return new AuthService(DATA_DIR)
}

async function getDatabase(): Promise<AppDatabase> {
  const auth = getAuthService()
  const dbKey = await auth.getOrCreateDbKey()
  return new AppDatabase(join(DATA_DIR, 'slack-data.sqlite'), dbKey, {
    legacyPath: join(DATA_DIR, 'slack-data.enc')
  })
}

function getCategoryEngine(): CategoryEngine {
  const engine = new CategoryEngine()
  engine.loadFromFirstExisting([
    USER_LOCAL_CONFIG_PATH,
    PROJECT_LOCAL_CONFIG_PATH,
    DEFAULT_CONFIG_PATH
  ])
  return engine
}

async function requireAuth(): Promise<SlackClient> {
  const auth = getAuthService()
  const creds = await auth.getCredentials()
  if (!creds) {
    console.error('未ログインです。先に `slack-bulk-inviter auth login` を実行してください。')
    process.exit(1)
  }
  return new SlackClient(creds)
}

// ---- テーブル表示 ----

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || '').length))
  )
  const line = widths.map((w) => '-'.repeat(w)).join('-+-')
  const formatRow = (row: string[]) =>
    row.map((cell, i) => (cell || '').padEnd(widths[i])).join(' | ')

  console.log(formatRow(headers))
  console.log(line)
  for (const row of rows) {
    console.log(formatRow(row))
  }
}

// ---- CLI定義 ----

const program = new Command()
  .name('slack-bulk-inviter')
  .description('Slack チャンネルにユーザーを一括招待するCLIツール')
  .version('0.1.0')

// ==== auth ====

const auth = program.command('auth').description('認証管理')

auth
  .command('login')
  .description('Slack にログイン')
  .option('-w, --workspace <name>', 'ワークスペース名', 'your-workspace')
  .action(async (opts) => {
    const workspace: string = opts.workspace

    console.log(`\nSlack ワークスペース "${workspace}" にログインします。\n`)
    console.log('ブラウザで Slack にログインした後、以下の手順でトークンを取得してください:')
    console.log('')
    console.log('1. ブラウザの開発者ツール (F12) を開く')
    console.log('2. Console タブで以下を実行:')
    console.log('')
    console.log(
      '   JSON.stringify({token: JSON.parse(localStorage.localConfig_v2).teams[JSON.parse(localStorage.localConfig_v2).lastActiveTeamId].token, cookie: document.cookie.match(/d=(xoxd-[^;]+)/)?.[1]})'
    )
    console.log('')

    // localhost サーバーを立ててブラウザからトークンを受け取る方法も提供
    const port = 18923
    console.log(`--- または、以下のブックマークレットを使うとワンクリックで送信できます ---`)
    console.log('')
    console.log(
      `javascript:void(fetch('http://localhost:${port}/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:JSON.parse(localStorage.localConfig_v2).teams[JSON.parse(localStorage.localConfig_v2).lastActiveTeamId].token,cookie:document.cookie.match(/d=(xoxd-[^;]+)/)?.[1]})}).then(()=>document.title='Token sent!').catch(e=>alert('送信失敗: '+e)))`
    )
    console.log('')

    // ブラウザを開く
    const url = `https://${workspace}.slack.com`
    console.log(`ブラウザを開いています: ${url}`)
    try {
      if (process.platform === 'darwin') {
        execSync(`open "${url}"`)
      } else {
        execSync(`start "${url}"`)
      }
    } catch {
      console.log(`ブラウザを自動で開けませんでした。手動で ${url} を開いてください。`)
    }

    console.log(`\nトークンの受信を待機中 (localhost:${port})...`)
    console.log('Ctrl+C で中断できます。\n')

    // ローカルサーバーでトークンを受け取る
    const server = createServer((req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === 'POST' && req.url === '/token') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { token, cookie } = JSON.parse(body)
            if (!token || !cookie) {
              res.writeHead(400)
              res.end('token and cookie are required')
              return
            }

            const authService = getAuthService()
            await authService.saveCredentials({ workspace, token, cookie })

            // トークン検証
            const client = new SlackClient({ workspace, token, cookie })
            const info = await client.validateToken()

            res.writeHead(200)
            res.end('OK')

            console.log(`ログイン成功! ワークスペース: ${info.team}`)
            server.close()
            process.exit(0)
          } catch (err) {
            res.writeHead(500)
            res.end('Error')
            console.error('トークン保存エラー:', err)
          }
        })
        return
      }

      res.writeHead(404)
      res.end()
    })

    server.listen(port)

    // 手動入力のフォールバック（stdin から JSON を受け取る）
    if (process.stdin.isTTY) {
      console.log('--- または、コンソール出力の JSON をここに貼り付けて Enter ---\n')
      process.stdin.setEncoding('utf-8')
      process.stdin.on('data', async (input: string) => {
        const trimmed = input.trim()
        if (!trimmed) return
        try {
          const { token, cookie } = JSON.parse(trimmed)
          if (!token || !cookie) {
            console.error('token と cookie の両方が必要です')
            return
          }

          const authService = getAuthService()
          await authService.saveCredentials({ workspace, token, cookie })

          const client = new SlackClient({ workspace, token, cookie })
          const info = await client.validateToken()

          console.log(`\nログイン成功! ワークスペース: ${info.team}`)
          server.close()
          process.exit(0)
        } catch {
          console.error('JSON のパースに失敗しました。正しい形式で貼り付けてください。')
        }
      })
    }
  })

auth
  .command('status')
  .description('ログイン状態を確認')
  .action(async () => {
    const authService = getAuthService()
    const creds = await authService.getCredentials()
    if (!creds) {
      console.log('未ログイン')
      return
    }
    try {
      const client = new SlackClient(creds)
      const info = await client.validateToken()
      console.log(`ログイン中: ${info.team} (workspace: ${creds.workspace})`)
    } catch {
      console.log(`トークンが無効です (workspace: ${creds.workspace})。再ログインしてください。`)
    }
  })

auth
  .command('logout')
  .description('ログアウト')
  .action(async () => {
    const authService = getAuthService()
    await authService.clearCredentials()
    console.log('ログアウトしました。')
  })

// ==== sync ====

const sync = program.command('sync').description('データ同期')

sync
  .command('users')
  .description('ユーザー一覧を Slack から同期')
  .action(async () => {
    const client = await requireAuth()
    const db = await getDatabase()
    const engine = getCategoryEngine()
    const service = new SyncService(client, db, engine)

    console.log('ユーザーを同期中...')
    const count = await service.syncUsers((n) => {
      process.stdout.write(`\r  ${n} 人取得中...`)
    })
    console.log(`\n完了: ${count} 人のユーザーを同期しました。`)
  })

sync
  .command('channels')
  .description('チャンネル一覧を Slack から同期')
  .action(async () => {
    const client = await requireAuth()
    const db = await getDatabase()
    const engine = getCategoryEngine()
    const service = new SyncService(client, db, engine)

    console.log('チャンネルを同期中...')
    const count = await service.syncChannels((n) => {
      process.stdout.write(`\r  ${n} 件取得中...`)
    })
    console.log(`\n完了: ${count} 件のチャンネルを同期しました。`)
  })

sync
  .command('all')
  .description('ユーザー、チャンネル、コメントを同期')
  .action(async () => {
    const client = await requireAuth()
    const db = await getDatabase()
    const engine = getCategoryEngine()
    const service = new SyncService(client, db, engine)

    console.log('全データを同期中...')
    const result = await service.syncAll((type, count) => {
      const label =
        type === 'users' ? 'ユーザー' : type === 'channels' ? 'チャンネル' : 'コメント'
      process.stdout.write(`\r  ${label}: ${count} 件取得中...`)
    })
    console.log(
      `\n完了: ユーザー ${result.users} 人、チャンネル ${result.channels} 件、コメント ${result.messages} 件`
    )
  })

// ==== users ====

const users = program.command('users').description('ユーザー管理')

users
  .command('list')
  .description('ユーザー一覧を表示')
  .option('-c, --category <id>', 'カテゴリでフィルタ')
  .option('-f, --format <type>', '出力形式 (table|json)', 'table')
  .action(async (opts) => {
    const db = await getDatabase()
    const engine = getCategoryEngine()
    const categories = engine.getCategories()

    let userList: ClassifiedUser[] = db.getUsers()

    if (opts.category) {
      userList = userList.filter((u) => u.categoryId === opts.category)
    }

    if (opts.format === 'json') {
      console.log(JSON.stringify(userList, null, 2))
      return
    }

    // テーブル表示
    console.log(`\n合計: ${userList.length} 人\n`)

    if (userList.length === 0) {
      console.log('ユーザーが見つかりません。`sync users` を実行してください。')
      return
    }

    const rows = userList.map((u) => [
      u.name,
      u.displayName || u.realName || '-',
      categories.find((c) => c.id === u.categoryId)?.label || '-'
    ])

    printTable(['ユーザー名', '表示名', 'カテゴリ'], rows)

    // カテゴリ別サマリ
    console.log('\n--- カテゴリ別 ---')
    const summary: Record<string, number> = {}
    for (const u of userList) {
      const label = categories.find((c) => c.id === u.categoryId)?.label || '未分類'
      summary[label] = (summary[label] || 0) + 1
    }
    for (const [label, count] of Object.entries(summary)) {
      console.log(`  ${label}: ${count} 人`)
    }
  })

// ==== channels ====

const channels = program.command('channels').description('チャンネル管理')

channels
  .command('list')
  .description('チャンネル一覧を表示')
  .option('-m, --member', '参加中のチャンネルのみ')
  .option('-f, --format <type>', '出力形式 (table|json)', 'table')
  .action(async (opts) => {
    const db = await getDatabase()
    const channelList: SlackChannel[] = db.getChannels(opts.member)

    if (opts.format === 'json') {
      console.log(JSON.stringify(channelList, null, 2))
      return
    }

    console.log(`\n合計: ${channelList.length} 件\n`)

    if (channelList.length === 0) {
      console.log('チャンネルが見つかりません。`sync channels` を実行してください。')
      return
    }

    const rows = channelList.map((c) => [
      c.isPrivate ? '🔒' : '#',
      c.name,
      c.isMember ? '参加中' : '-',
      String(c.memberCount)
    ])

    printTable(['', 'チャンネル名', '参加', 'メンバー数'], rows)
  })

// ==== post ====

program
  .command('post-datetime')
  .description('テンプレート文面を1回投稿')
  .requiredOption(
    '--channel <url-or-id>',
    '投稿先のSlack URLまたはチャンネルID',
    (value: string, previous: string[]) => [...previous, value],
    []
  )
  .option('--template <text>', 'メッセージテンプレート', '現在日時: {{now}}')
  .option('--template-file <path>', 'メッセージテンプレートファイル')
  .option('--image <paths...>', 'ローカル画像パス')
  .option('--file-id <ids...>', '再利用するSlackファイルID')
  .option('--dry-run', '送信せずに本文だけ表示')
  .action(async (opts) => {
    try {
      const channelIds = (opts.channel as string[]).map((value) => resolveSlackChannelId(value))
      const rawTemplate = opts.templateFile
        ? readFileSync(opts.templateFile, 'utf-8')
        : opts.template
      const message = renderMessageTemplate(rawTemplate)

      if (opts.dryRun) {
        console.log(`channels: ${channelIds.join(', ')}`)
        console.log(message)
        if (opts.image?.length) {
          console.log(`images: ${opts.image.join(', ')}`)
        }
        if (opts.fileId?.length) {
          console.log(`fileIds: ${opts.fileId.join(', ')}`)
        }
        return
      }

      const client = await requireAuth()
      const localFiles = opts.image || []

      if (localFiles.length > 0) {
        for (const channelId of channelIds) {
          await client.shareLocalFilesToChannel(channelId, localFiles, message)
          console.log(`投稿しました: channel=${channelId} files=${localFiles.length}`)
        }
        return
      }

      const fileIds = [...(opts.fileId || [])]
      for (const channelId of channelIds) {
        const result = await client.postMessage(
          channelId,
          message,
          null,
          fileIds.length > 0 ? fileIds : null
        )
        console.log(`投稿しました: channel=${channelId} ts=${result.ts}`)
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

program
  .command('upload-image')
  .description('画像をSlackにアップロードしてfileIdを返す')
  .argument('<path>', '画像パス')
  .action(async (filePath: string) => {
    try {
      const client = await requireAuth()
      const upload = await client.uploadImage(filePath)
      console.log(JSON.stringify(upload))
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

// ==== invite ====

program
  .command('invite')
  .description('ユーザーをチャンネルに招待')
  .requiredOption('--channel <name-or-id>', '招待先チャンネル名またはID')
  .option('--category <id>', 'カテゴリで対象を指定')
  .option('--users <ids>', 'ユーザーIDをカンマ区切りで指定')
  .option('--dry-run', '実行せずに対象を表示のみ')
  .action(async (opts) => {
    const db = await getDatabase()
    const engine = getCategoryEngine()
    const categories = engine.getCategories()

    // チャンネル解決
    const allChannels = db.getChannels()
    const channel = allChannels.find(
      (c) => c.id === opts.channel || c.name === opts.channel
    )

    if (!channel) {
      console.error(`チャンネル "${opts.channel}" が見つかりません。sync channels を実行してください。`)
      process.exit(1)
    }

    if (!channel.isMember) {
      console.error(`チャンネル "#${channel.name}" に参加していません。先にSlackで参加してください。`)
      process.exit(1)
    }

    // 対象ユーザー決定
    let targetIds: string[]

    if (opts.users) {
      targetIds = opts.users.split(',').map((s: string) => s.trim())
    } else if (opts.category) {
      const allUsers = db.getUsers()
      targetIds = allUsers
        .filter((u) => u.categoryId === opts.category)
        .map((u) => u.id)
    } else {
      console.error('--category または --users のいずれかを指定してください。')
      process.exit(1)
    }

    if (targetIds.length === 0) {
      console.log('対象ユーザーがいません。')
      return
    }

    const categoryLabel = opts.category
      ? categories.find((c) => c.id === opts.category)?.label || opts.category
      : '指定ユーザー'

    console.log(`\n招待先: #${channel.name}`)
    console.log(`対象: ${categoryLabel} (${targetIds.length} 人)`)

    if (opts.dryRun) {
      console.log('\n[dry-run] 以下のユーザーが招待されます:')
      const allUsers = db.getUsers()
      for (const id of targetIds) {
        const user = allUsers.find((u) => u.id === id)
        console.log(`  ${user?.name || id}  ${user?.displayName || user?.realName || ''}`)
      }
      return
    }

    console.log('\n招待を実行中...')
    const client = await requireAuth()
    const inviteService = new InviteService(client)
    const result = await inviteService.inviteBatch(channel.id, targetIds, (done, total) => {
      process.stdout.write(`\r  ${done}/${total} 処理中...`)
    })

    console.log('\n')
    console.log(`完了!`)
    console.log(`  成功: ${result.totalSucceeded} 人`)
    if (result.totalAlreadyInChannel > 0) {
      console.log(`  既に参加済み: ${result.totalAlreadyInChannel} 人`)
    }
    if (result.totalFailed > 0) {
      console.log(`  失敗: ${result.totalFailed} 人`)
      for (const detail of result.details) {
        for (const f of detail.failed) {
          console.log(`    ${f.userId}: ${f.error}`)
        }
      }
    }
  })

program.parse()
