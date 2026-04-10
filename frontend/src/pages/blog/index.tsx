import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { RiSearchLine, RiArrowRightLine, RiTimeLine, RiLoader4Line } from "@remixicon/react"
import { Input } from "@/components/ui/input"
import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"
import { blogApi } from "@/lib/api"
import type { BlogPost } from "@/lib/api"

export function BlogIndex() {
  const [search, setSearch] = useState("")
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    blogApi.getPosts()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  const filtered = posts.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.excerpt.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <Navbar />

      {/* Hero — matches landing hero pattern */}
      <section className="relative overflow-hidden bg-background px-6 pt-28 pb-16 md:pt-36 md:pb-24">
        {/* Grid background */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

        {/* Breathing glow */}
        <div className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-[120px] animate-breathe" />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="mb-4 text-sm font-medium text-primary">
            Resource Center
          </p>

          <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
            Insights & Updates{" "}
            <span className="text-muted-foreground">from the team</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Tutorials, monetization tips, and the latest platform updates for
            the Vercelplay video streaming infrastructure.
          </p>

          {/* Search */}
          <div className="relative mt-10 w-full max-w-md group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
              <RiSearchLine className="size-4" />
            </div>
            <Input
              type="text"
              placeholder="Search articles..."
              className="w-full pl-10 h-11 rounded-lg border border-border bg-card text-sm focus-visible:ring-primary transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Posts grid — matches landing card & grid patterns */}
      <section className="bg-background px-6 pb-24 md:pb-32">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <div className="flex flex-col items-center py-20 text-center">
              <RiLoader4Line className="size-6 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Loading articles...</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.length > 0 ? (
                filtered.map((post) => (
                  <Link
                    to={`/blog/${post.slug}`}
                    key={post.id}
                    className="group rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:bg-muted/40"
                  >
                    <div className="relative mb-4 aspect-[2/1] w-full overflow-hidden rounded-md bg-muted">
                      {post.coverImageUrl ? (
                        <img 
                          src={post.coverImageUrl} 
                          alt={post.title} 
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent transition-transform duration-500 group-hover:scale-105" />
                      )}
                    </div>
                    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-primary">
                        {post.category}
                      </span>
                      <span className="flex items-center gap-1">
                        <RiTimeLine className="size-3" />
                        {post.publishedAt
                          ? new Date(post.publishedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
                          : new Date(post.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
                      {post.title}
                    </h3>

                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                      {post.excerpt}
                    </p>

                    <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
                      Read more
                      <RiArrowRightLine className="size-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="col-span-full flex flex-col items-center py-20 text-center">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <RiSearchLine className="size-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">No results found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No articles matched &ldquo;{search}&rdquo;. Try a different
                    keyword.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
