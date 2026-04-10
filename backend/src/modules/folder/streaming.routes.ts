import { Elysia, t } from 'elysia'
import { createHash } from 'crypto'
import { folderService } from './service'
import { generateStreamSignature } from '../../utils/streaming'
import { error, errorCodes } from '../../utils/response'
import { db, adSettings } from '../../schema'
import { eq, and } from 'drizzle-orm'

export const folderStreamingRoutes = new Elysia({ prefix: '/f' })

  /**
   * Public metadata endpoint for folder share pages.
   * Returns folder info + list of shareable videos inside it.
   */
  .get('/:id/metadata', async ({ params }) => {
    const folder = await folderService.getFolderById('all_access', params.id)
    if (!folder) throw error(errorCodes.NOT_FOUND, 'Folder not found')

    // Enforce visibility — private folders are not shareable
    if (folder.visibility === 'private') {
      throw error(errorCodes.NOT_FOUND, 'This folder is private')
    }

    // Get public/unlisted videos in this folder
    const folderVideos = await folderService.getPublicVideosInFolder(folder.id)

    // Generate short-lived stream URLs for each video
    const context = 'public_share'
    const expiry = Math.floor(Date.now() / 1000) + 3600 * 2 // 2 hours

    const videosWithUrls = folderVideos.map((v) => {
      const signature = generateStreamSignature(v.id, expiry, context)
      return {
        ...v,
        streamUrl: `/v/${v.id}?token=${signature}&expires=${expiry}&context=${context}`,
        thumbnailUrl: v.thumbnailPath ? `/v/${v.id}/thumbnail` : null,
      }
    })

    // Fetch owner's active ads
    const userAds = await db.select().from(adSettings).where(
      and(
        eq(adSettings.userId, folder.userId),
        eq(adSettings.isActive, true)
      )
    )

    return {
      success: true,
      data: {
        id: folder.id,
        shortId: folder.shortId,
        name: folder.name,
        visibility: folder.visibility,
        createdAt: folder.createdAt,
        videos: videosWithUrls,
        ads: userAds,
      },
    }
  }, {
    params: t.Object({ id: t.String() }),
  })
