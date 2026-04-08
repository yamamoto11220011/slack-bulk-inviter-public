import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'
import { randomBytes } from 'crypto'
import { dirname, join } from 'path'
import type { AuthCredentials } from './types'

/**
 * 認証情報の保存。
 * GUI モード: Electron の safeStorage API でOSキーチェーン連携暗号化
 * CLI モード: ファイルパーミッション (0o600) のみ。本番ではOSのsecret storeを推奨
 */
export class AuthService {
  private credentialsPath: string
  private dbKeyPath: string
  private encrypt?: (text: string) => Buffer
  private decrypt?: (encrypted: Buffer) => string

  constructor(
    dataDir: string,
    electronSafeStorage?: {
      encryptString: (text: string) => Buffer
      decryptString: (encrypted: Buffer) => string
      isEncryptionAvailable: () => boolean
    }
  ) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    this.credentialsPath = join(dataDir, 'credentials.enc')
    this.dbKeyPath = join(dataDir, 'dbkey.enc')

    if (electronSafeStorage?.isEncryptionAvailable()) {
      this.encrypt = (text) => electronSafeStorage.encryptString(text)
      this.decrypt = (encrypted) => electronSafeStorage.decryptString(encrypted)
    }
  }

  private writeSecure(path: string, data: string): void {
    if (this.encrypt) {
      const encrypted = this.encrypt(data)
      writeFileSync(path, encrypted)
    } else {
      writeFileSync(path, data, { mode: 0o600 })
    }
  }

  private readSecure(path: string): string | null {
    if (!existsSync(path)) return null
    if (this.decrypt) {
      const encrypted = readFileSync(path)
      return this.decrypt(encrypted)
    }
    return readFileSync(path, 'utf-8')
  }

  async saveCredentials(credentials: AuthCredentials): Promise<void> {
    this.writeSecure(this.credentialsPath, JSON.stringify(credentials))
  }

  async getCredentials(): Promise<AuthCredentials | null> {
    const raw = this.readSecure(this.credentialsPath)
    if (!raw) return null
    return JSON.parse(raw) as AuthCredentials
  }

  async clearCredentials(): Promise<void> {
    if (existsSync(this.credentialsPath)) unlinkSync(this.credentialsPath)
  }

  async getOrCreateDbKey(): Promise<string> {
    const existing = this.readSecure(this.dbKeyPath)
    if (existing) return existing

    const key = randomBytes(32).toString('hex')
    this.writeSecure(this.dbKeyPath, key)
    return key
  }
}
