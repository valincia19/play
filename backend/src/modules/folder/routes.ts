import { Elysia, t } from 'elysia'
import { enforceAuthenticatedContext, resolveAuthenticatedContext } from '../auth'
import { folderService } from './service'
import { error, errorCodes, success } from '../../utils/response'

export const folderRoutes = new Elysia({ prefix: '/folders' })
  .resolve(resolveAuthenticatedContext)
  .onBeforeHandle(enforceAuthenticatedContext)
  .get('/', async ({ userId, query, set }) => {
    try {
      const parentId = query.parentId
      const folders = parentId
        ? await folderService.getChildFolders(userId!, parentId)
        : await folderService.getRootFolders(userId!)

      let path: any[] = []
      if (parentId) {
        path = await folderService.getFolderPath(userId!, parentId)
      }

      return success({ folders, path })
    } catch (e: any) {
      if (e?.success === false) {
        set.status = 404
        return e
      }
      set.status = 500
      return error(errorCodes.INTERNAL_ERROR || 'INTERNAL_ERROR', 'Failed to retrieve folders')
    }
  }, {
    query: t.Object({
      parentId: t.Optional(t.String())
    })
  })
  .get('/all', async ({ userId }) => {
    const folders = await folderService.getAllFolders(userId!)
    return success(folders)
  })
  .get('/:id', async ({ userId, params }) => {
    const folder = await folderService.getFolderById(userId!, params.id)
    if (!folder) throw error(errorCodes.NOT_FOUND, 'Folder not found')
    return success(folder)
  })
  .get('/:id/children', async ({ userId, params }) => {
    const children = await folderService.getChildFolders(userId!, params.id)
    return success(children)
  })
  .post('/', async ({ userId, body }) => {
    const result = await folderService.createFolder(userId!, body.name, body.parentId)
    return success(result)
  }, {
    body: t.Object({
      name: t.String(),
      parentId: t.Optional(t.String())
    })
  })
  .patch('/:id/move', async ({ userId, params, body }) => {
    const result = await folderService.moveFolder(userId!, params.id, body.newParentId ?? null)
    return success(result)
  }, {
    body: t.Object({
      newParentId: t.Optional(t.String())
    })
  })
  .patch('/:id/rename', async ({ userId, params, body }) => {
    const result = await folderService.renameFolder(userId!, params.id, body.name)
    return success(result)
  }, {
    body: t.Object({
      name: t.String()
    })
  })
  .patch('/:id/visibility', async ({ userId, params, body }) => {
    const result = await folderService.updateVisibility(userId!, params.id, body.visibility)
    return success(result)
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      visibility: t.Union([t.Literal('private'), t.Literal('unlisted'), t.Literal('public')])
    }),
  })
  .delete('/:id', async ({ userId, params }) => {
    const result = await folderService.deleteFolder(userId!, params.id)
    return success(result)
  })
