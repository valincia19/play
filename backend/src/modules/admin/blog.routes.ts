import { Elysia, t } from 'elysia'
import { adminBlogService } from './blog.service'
import { success, error } from '../../utils/response'

export const adminBlogRoutes = new Elysia()
  .get('/blog', async () => {
    const posts = await adminBlogService.getAllPosts()
    return success(posts)
  })

  .post('/blog', async ({ body }) => {
    const post = await adminBlogService.createPost(body)
    return success(post)
  }, {
    body: t.Object({
      title: t.String({ minLength: 1 }),
      slug: t.String({ minLength: 1 }),
      coverImageUrl: t.Optional(t.String()),
      excerpt: t.String(),
      content: t.String(),
      category: t.String(),
      status: t.Union([t.Literal('draft'), t.Literal('published')]),
      authorId: t.String(),
    })
  })

  .put('/blog/:id', async ({ params, body }) => {
    const post = await adminBlogService.updatePost(params.id, body)
    return success(post)
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      slug: t.Optional(t.String()),
      coverImageUrl: t.Optional(t.String()),
      excerpt: t.Optional(t.String()),
      content: t.Optional(t.String()),
      category: t.Optional(t.String()),
      status: t.Optional(t.Union([t.Literal('draft'), t.Literal('published')])),
    })
  })

  .delete('/blog/:id', async ({ params }) => {
    const deleted = await adminBlogService.deletePost(params.id)
    return success(deleted)
  })
