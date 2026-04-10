import { useEffect, useState } from "react"
import { adminApi } from "@/lib/api"
import type { BlogPost, BlogPostInput } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  RiAddLine,
  RiEditLine,
  RiDeleteBinLine,
  RiDraftLine,
  RiEyeLine,
} from "@remixicon/react"

const CATEGORIES = ["General", "Product Update", "Tutorial", "Engineering", "Monetization", "Best Practice", "Growth"]

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

export function StudioBlog() {
  const { user } = useAuth()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null)

  // Form state
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState("General")
  const [status, setStatus] = useState<"draft" | "published">("draft")

  const loadPosts = async () => {
    setIsLoading(true)
    try {
      const data = await adminApi.blog.getAll()
      setPosts(data)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadPosts() }, [])

  const resetForm = () => {
    setTitle("")
    setSlug("")
    setCoverImageUrl("")
    setExcerpt("")
    setContent("")
    setCategory("General")
    setStatus("draft")
    setEditingPost(null)
  }

  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (post: BlogPost) => {
    setEditingPost(post)
    setTitle(post.title)
    setSlug(post.slug)
    setCoverImageUrl(post.coverImageUrl || "")
    setExcerpt(post.excerpt)
    setContent(post.content)
    setCategory(post.category)
    setStatus(post.status)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required")
      return
    }

    try {
      if (editingPost) {
        await adminApi.blog.update(editingPost.id, { title, slug, coverImageUrl, excerpt, content, category, status })
        toast.success("Post updated")
      } else {
        const input: BlogPostInput = {
          title, slug, coverImageUrl, excerpt, content, category, status,
          authorId: user!.id,
        }
        await adminApi.blog.create(input)
        toast.success("Post created")
      }
      setDialogOpen(false)
      resetForm()
      loadPosts()
    } catch (err: any) {
      toast.error(err.message || "Failed to save post")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this blog post? This cannot be undone.")) return
    try {
      await adminApi.blog.delete(id)
      toast.success("Post deleted")
      loadPosts()
    } catch (err: any) {
      toast.error(err.message || "Failed to delete post")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blog Management</h1>
          <p className="text-sm text-muted-foreground">
            Create, edit, and publish blog posts for the public /blog page.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <RiAddLine className="mr-2 size-4" />
          New Post
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Posts</CardTitle>
          <CardDescription>
            {posts.length} post{posts.length !== 1 ? "s" : ""} total · {posts.filter(p => p.status === "published").length} published
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    Loading posts...
                  </TableCell>
                </TableRow>
              ) : posts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    No blog posts yet. Click "New Post" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{post.title}</div>
                        <div className="text-xs text-muted-foreground font-mono">/{post.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{post.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {post.status === "published" ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" variant="outline">
                          <RiEyeLine className="mr-1 size-3" />
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <RiDraftLine className="mr-1 size-3" />
                          Draft
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(post.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(post)}>
                          <RiEditLine className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => handleDelete(post.id)}>
                          <RiDeleteBinLine className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <div className="p-6 overflow-y-auto w-full flex-1">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl">{editingPost ? "Edit Post" : "Create New Post"}</DialogTitle>
              <DialogDescription>
                {editingPost ? "Update the blog post details below." : "Fill in the details to create a new blog post."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (!editingPost) setSlug(slugify(e.target.value))
                }}
                placeholder="My Awesome Blog Post"
              />
            </div>

            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-awesome-blog-post"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">URL: /blog/{slug || "..."}</p>
            </div>

            <div className="space-y-2">
              <Label>Cover Image URL (Optional)</Label>
              <Input
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="font-mono text-sm"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "published")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Excerpt</Label>
              <Textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="A short summary shown in the blog listing..."
                className="h-20"
              />
            </div>

            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Full blog post content (Markdown supported)..."
                className="h-48 font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border mt-6">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>
                {editingPost ? "Save Changes" : "Create Post"}
              </Button>
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
