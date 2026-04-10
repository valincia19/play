import { db, blogPosts } from '../../schema'
import { eq, desc } from 'drizzle-orm'
import { logger } from '../../utils/logger'

class AdminBlogService {
  async getAllPosts() {
    return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt))
  }

  async getPublishedPosts() {
    return db.select().from(blogPosts)
      .where(eq(blogPosts.status, 'published'))
      .orderBy(desc(blogPosts.publishedAt))
  }

  async getPostBySlug(slug: string) {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1)
    return post || null
  }

  async createPost(data: {
    title: string
    slug: string
    coverImageUrl?: string
    excerpt: string
    content: string
    category: string
    status: 'draft' | 'published'
    authorId: string
  }) {
    const [post] = await db.insert(blogPosts).values({
      ...data,
      publishedAt: data.status === 'published' ? new Date() : null,
    }).returning()

    if (!post) throw new Error('Failed to create blog post')
    logger.info({ event: 'blog_post_created', postId: post.id, slug: post.slug })
    return post
  }

  async updatePost(id: string, data: {
    title?: string
    slug?: string
    coverImageUrl?: string
    excerpt?: string
    content?: string
    category?: string
    status?: 'draft' | 'published'
  }) {
    const updateFields: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    }

    // Auto-set publishedAt when transitioning to published
    if (data.status === 'published') {
      const [existing] = await db.select({ status: blogPosts.status }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1)
      if (existing && existing.status !== 'published') {
        updateFields.publishedAt = new Date()
      }
    }

    const [post] = await db.update(blogPosts)
      .set(updateFields)
      .where(eq(blogPosts.id, id))
      .returning()

    if (!post) throw new Error('Blog post not found or update failed')
    logger.info({ event: 'blog_post_updated', postId: post.id })
    return post
  }

  async deletePost(id: string) {
    const [deleted] = await db.delete(blogPosts).where(eq(blogPosts.id, id)).returning({ id: blogPosts.id })
    if (!deleted) throw new Error('Blog post not found')
    logger.info({ event: 'blog_post_deleted', postId: id })
    return deleted
  }
}

export const adminBlogService = new AdminBlogService()
