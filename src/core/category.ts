import { existsSync, readFileSync } from 'fs'
import { parse } from 'yaml'
import type { CategoryDef, SlackUser, ClassifiedUser } from './types'

interface CategoryConfig {
  categories: CategoryDef[]
}

export class CategoryEngine {
  private categories: CategoryDef[] = []

  loadFromFile(path: string): void {
    const raw = readFileSync(path, 'utf-8')
    const config = parse(raw) as CategoryConfig
    this.categories = config.categories
  }

  loadFromFirstExisting(paths: string[]): string {
    const path = paths.find((candidate) => existsSync(candidate))
    if (!path) {
      throw new Error(`カテゴリ設定ファイルが見つかりません: ${paths.join(', ')}`)
    }
    this.loadFromFile(path)
    return path
  }

  loadFromConfig(categories: CategoryDef[]): void {
    this.categories = categories
  }

  getCategories(): CategoryDef[] {
    return this.categories
  }

  classify(user: SlackUser): string | null {
    const name = user.name.toLowerCase()
    for (const cat of this.categories) {
      for (const pattern of cat.patterns) {
        if (name.startsWith(pattern.toLowerCase())) {
          return cat.id
        }
      }
    }
    return null
  }

  classifyAll(users: SlackUser[]): ClassifiedUser[] {
    return users.map((user) => ({
      ...user,
      categoryId: this.classify(user)
    }))
  }

  getUsersByCategory(users: ClassifiedUser[], categoryId: string): ClassifiedUser[] {
    return users.filter((u) => u.categoryId === categoryId)
  }
}
