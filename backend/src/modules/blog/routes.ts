import { Elysia } from 'elysia'
import { adminBlogService } from '../admin/blog.service'
import { success } from '../../utils/response'

/**
 * Public (unauthenticated) blog routes.
 * Only serves published posts — no drafts leak.
 */
export const publicBlogRoutes = new Elysia({ prefix: '/blog' })
  .get('/', async () => {
    const posts = await adminBlogService.getPublishedPosts()
    return success(posts)
  })
  .get('/:slug', async ({ params, set }) => {
    const post = await adminBlogService.getPostBySlug(params.slug)
    if (!post || post.status !== 'published') {
      set.status = 404
      return { success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } }
    }
    return success(post)
  })
