import { BrowserWindow, session } from 'electron'

interface AuthResult {
  token: string
  cookie: string
  workspace: string
}

/**
 * 認証用ウィンドウを開き、Google SAML SSO → Slack ログイン後に
 * xoxc トークンと xoxd Cookie を抽出して返す
 */
export function openAuthWindow(workspaceUrl: string): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    // 認証専用セッション（メインウィンドウと分離）
    const authSession = session.fromPartition('auth')

    const authWindow = new BrowserWindow({
      width: 800,
      height: 700,
      title: 'Slack にログイン',
      webPreferences: {
        session: authSession,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    let resolved = false

    const tryExtractToken = async (): Promise<void> => {
      if (resolved) return

      try {
        const currentUrl = authWindow.webContents.getURL()

        // Slack のクライアントページにいるか確認
        if (!currentUrl.includes('.slack.com/client/')) return

        // localStorage から xoxc トークンを取得
        const token = await authWindow.webContents.executeJavaScript(`
          (() => {
            try {
              const cfg = JSON.parse(localStorage.getItem('localConfig_v2') || '{}');
              if (cfg.teams && cfg.lastActiveTeamId) {
                return cfg.teams[cfg.lastActiveTeamId].token || null;
              }
              return null;
            } catch { return null; }
          })()
        `)

        if (!token) return

        // Cookie から d= (xoxd-) を取得
        const cookies = await authSession.cookies.get({ name: 'd' })
        const dCookie = cookies.find((c) => c.value.startsWith('xoxd-'))

        if (!dCookie) return

        // ワークスペース名を URL から抽出
        const match = currentUrl.match(/https:\/\/([^.]+)\.slack\.com/)
        const workspace = match ? match[1] : workspaceUrl

        resolved = true
        authWindow.close()
        resolve({ token, cookie: dCookie.value, workspace })
      } catch {
        // まだログイン完了していない、リトライする
      }
    }

    // ページ遷移完了のたびにトークン抽出を試行
    authWindow.webContents.on('did-finish-load', () => {
      tryExtractToken()
    })

    // URL変更でも試行（SPA遷移対応）
    authWindow.webContents.on('did-navigate-in-page', () => {
      tryExtractToken()
    })

    authWindow.on('closed', () => {
      if (!resolved) {
        reject(new Error('認証ウィンドウが閉じられました'))
      }
    })

    // ワークスペースの URL にナビゲート
    const url = workspaceUrl.includes('slack.com')
      ? workspaceUrl
      : `https://${workspaceUrl}.slack.com`

    authWindow.loadURL(url)
  })
}
