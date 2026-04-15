import { db, folders, videos } from '../../schema'
import type { DbTransaction } from '../../schema'
import { eq, and, desc, isNull, inArray, or, sql } from 'drizzle-orm'
import { error, errorCodes } from '../../utils/response'

class FolderService {
  async getRootFolders(userId: string) {
    return db.select()
      .from(folders)
      .where(and(eq(folders.userId, userId), isNull(folders.parentId)))
      .orderBy(desc(folders.createdAt))
  }

  async getAllFolders(userId: string) {
    return db.select()
      .from(folders)
      .where(eq(folders.userId, userId))
      .orderBy(folders.path)
  }

  async getChildFolders(userId: string, parentId: string) {
    return db.select()
      .from(folders)
      .where(and(eq(folders.userId, userId), eq(folders.parentId, parentId)))
      .orderBy(desc(folders.createdAt))
  }

  async getFolderById(userId: string, folderId: string) {
    const idMatch = or(eq(folders.id, folderId), eq(folders.shortId, folderId))
    const whereClause = userId === 'all_access'
      ? idMatch
      : and(idMatch, eq(folders.userId, userId))

    const rows = await db.select()
      .from(folders)
      .where(whereClause)
      .limit(1)

    return rows[0] ?? null
  }

  async createFolder(userId: string, name: string, parentId?: string) {
    const id = crypto.randomUUID()
    let depth = 0
    let path = `/${id}`

    if (parentId) {
      const parent = await this.getFolderById(userId, parentId)
      if (!parent) throw error(errorCodes.NOT_FOUND, 'Parent folder not found')
      if (parent.depth >= 10) throw error(errorCodes.INVALID_INPUT, 'Maximum folder nesting depth (10) exceeded')

      depth = parent.depth + 1
      path = `${parent.path}/${id}`
    }

    const result = await db.insert(folders).values({
      id,
      userId,
      name,
      parentId: parentId ?? null,
      path,
      depth,
    }).returning()

    return result[0]!
  }

  async getFolderPath(userId: string, folderId: string) {
    const folder = await this.getFolderById(userId, folderId)
    if (!folder) throw error(errorCodes.NOT_FOUND, 'Folder not found')

    const ids = folder.path.split('/').filter(Boolean)
    if (ids.length === 0) return []

    const pathFolders = await db.select()
      .from(folders)
      .where(inArray(folders.id, ids))

    return pathFolders.sort((a, b) => a.depth - b.depth)
  }

  async moveFolder(userId: string, folderId: string, newParentId: string | null) {
    if (folderId === newParentId) {
      throw error(errorCodes.INVALID_INPUT, 'Cannot move a folder into itself')
    }

    const folder = await this.getFolderById(userId, folderId)
    if (!folder) throw error(errorCodes.NOT_FOUND, 'Folder not found')

    let newDepth = 0
    let newPath = `/${folderId}`

    if (newParentId) {
      const newParent = await this.getFolderById(userId, newParentId)
      if (!newParent) throw error(errorCodes.NOT_FOUND, 'Target parent folder not found')

      if (newParent.path.includes(`/${folderId}`)) {
        throw error(errorCodes.INVALID_INPUT, 'Cannot move a folder into its own subfolder')
      }

      newDepth = newParent.depth + 1
      newPath = `${newParent.path}/${folderId}`
    }

    const depthDiff = newDepth - folder.depth
    const userFolders = await db.select()
      .from(folders)
      .where(eq(folders.userId, userId))
    const descendants = userFolders.filter((f) => f.path.startsWith(folder.path))

    await db.transaction(async (tx: DbTransaction) => {
      await tx.update(folders)
        .set({ parentId: newParentId, path: newPath, depth: newDepth })
        .where(eq(folders.id, folderId))

      for (const child of descendants) {
        if (child.id === folderId) continue
        const relativePath = child.path.substring(folder.path.length)
        await tx.update(folders)
          .set({ path: newPath + relativePath, depth: child.depth + depthDiff })
          .where(eq(folders.id, child.id))
      }
    })

    return { success: true }
  }

  async renameFolder(userId: string, folderId: string, newName: string) {
    const folder = await this.getFolderById(userId, folderId)
    if (!folder) throw error(errorCodes.NOT_FOUND, 'Folder not found')

    await db.update(folders)
      .set({ name: newName })
      .where(eq(folders.id, folderId))

    return { success: true }
  }

  async deleteFolder(userId: string, folderId: string) {
    const folder = await this.getFolderById(userId, folderId)
    if (!folder) throw error(errorCodes.NOT_FOUND, 'Folder not found')

    const userFolders = await db.select()
      .from(folders)
      .where(eq(folders.userId, userId))
    const descendantIds = userFolders
      .filter((f) => f.path.startsWith(folder.path))
      .map((f) => f.id)

    await db.transaction(async (tx: DbTransaction) => {
      if (descendantIds.length > 0) {
        await tx.update(videos)
          .set({ folderId: null })
          .where(inArray(videos.folderId, descendantIds))

        await tx.delete(folders)
          .where(inArray(folders.id, descendantIds))
      }
    })

    return { success: true }
  }

  /** Get public/unlisted subfolders inside a folder (for share page) */
  async getPublicSubfolders(parentId: string) {
    return db.select({
      id: folders.id,
      shortId: folders.shortId,
      name: folders.name,
      visibility: folders.visibility,
      createdAt: folders.createdAt,
    })
      .from(folders)
      .where(
        and(
          eq(folders.parentId, parentId),
          or(eq(folders.visibility, 'public'), eq(folders.visibility, 'unlisted'))
        )
      )
      .orderBy(desc(folders.createdAt))
  }

  /** Get public/unlisted videos inside a folder (for share page) */
  async getPublicVideosInFolder(folderId: string) {
    return db.select({
      id: videos.id,
      shortId: videos.shortId,
      title: videos.title,
      duration: videos.duration,
      fileSizeBytes: videos.fileSizeBytes,
      status: videos.status,
      processingMode: videos.processingMode,
      thumbnailPath: videos.thumbnailPath,
      visibility: videos.visibility,
      createdAt: videos.createdAt,
    })
      .from(videos)
      .where(
        and(
          eq(videos.folderId, folderId),
          eq(videos.status, 'ready'),
          or(eq(videos.visibility, 'public'), eq(videos.visibility, 'unlisted'))
        )
      )
      .orderBy(desc(videos.createdAt))
  }

  /** Update folder visibility */
  async updateVisibility(userId: string, folderId: string, visibility: string) {
    const folder = await this.getFolderById(userId, folderId)
    if (!folder) throw error(errorCodes.NOT_FOUND, 'Folder not found')

    if (!['private', 'unlisted', 'public'].includes(visibility)) {
      throw error(errorCodes.INVALID_INPUT, 'Invalid visibility')
    }

    await db.update(folders)
      .set({ visibility })
      .where(eq(folders.id, folderId))

    return { success: true }
  }
}

export const folderService = new FolderService()
