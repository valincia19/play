import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { RiArrowLeftLine, RiTimeLine, RiLoader4Line } from "@remixicon/react"
import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"
import { blogApi } from "@/lib/api"
import type { BlogPost } from "@/lib/api"

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    setIsLoading(true)
    blogApi.getPost(slug)
      .then(setPost)
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false))
  }, [slug])

  /** Very lightweight markdown → HTML (headings, bold, tables, blockquotes, lists, code) */
  function renderMarkdown(md: string) {
    const lines = md.split("\n")
    const html: string[] = []
    let inTable = false
    let tableRows: string[] = []

    const flushTable = () => {
      if (tableRows.length < 2) return
      const headerCells = tableRows[0].split("|").filter(Boolean).map(c => `<th class="px-3 py-2 text-left text-xs font-semibold">${c.trim()}</th>`).join("")
      const bodyRows = tableRows.slice(2).map(row => {
        const cells = row.split("|").filter(Boolean).map(c => `<td class="px-3 py-2 text-sm text-muted-foreground">${c.trim()}</td>`).join("")
        return `<tr class="border-b border-border">${cells}</tr>`
      }).join("")
      html.push(`<div class="overflow-x-auto my-4"><table class="w-full text-sm border border-border rounded-lg"><thead class="bg-muted/50"><tr class="border-b border-border">${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`)
      tableRows = []
      inTable = false
    }

    const parseInline = (text: string) => {
      let parsed = text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
      parsed = parsed.replace(/!\[(.*?)\]\((.*?)\)/g, '<span class="flex justify-center my-8"><img src="$2" alt="$1" class="max-h-[500px] w-auto max-w-full rounded-lg border border-border bg-muted shadow-sm" /></span>')
      parsed = parsed.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary hover:underline font-medium">$1</a>')
      return parsed
    }

    for (const line of lines) {
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        if (!inTable) inTable = true
        tableRows.push(line.trim())
        continue
      } else if (inTable) {
        flushTable()
      }

      if (line.startsWith("### ")) {
        html.push(`<h3 class="text-base font-semibold mt-6 mb-2">${parseInline(line.slice(4))}</h3>`)
      } else if (line.startsWith("## ")) {
        html.push(`<h2 class="text-lg font-bold mt-8 mb-3">${parseInline(line.slice(3))}</h2>`)
      } else if (line.startsWith("> ")) {
        html.push(`<blockquote class="border-l-2 border-primary pl-4 my-4 text-sm text-muted-foreground italic">${parseInline(line.slice(2))}</blockquote>`)
      } else if (/^\d+\.\s/.test(line)) {
        html.push(`<div class="flex gap-2 text-sm leading-relaxed text-muted-foreground ml-2 my-1"><span class="text-foreground font-medium shrink-0">${line.match(/^\d+/)![0]}.</span><span>${parseInline(line.replace(/^\d+\.\s*/, ""))}</span></div>`)
      } else if (line.startsWith("- ")) {
        html.push(`<div class="flex gap-2 text-sm leading-relaxed text-muted-foreground ml-2 my-1"><span class="text-primary">•</span><span>${parseInline(line.slice(2))}</span></div>`)
      } else if (line.trim() === "") {
        html.push("<br/>")
      } else {
        html.push(`<p class="text-sm leading-relaxed text-muted-foreground my-2">${parseInline(line)}</p>`)
      }
    }
    if (inTable) flushTable()
    return html.join("\n")
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <Navbar />

      <section className="relative overflow-hidden bg-background px-6 pt-28 pb-16 md:pt-36 md:pb-24">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

        <div className="relative mx-auto max-w-3xl">
          <Link
            to="/blog"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RiArrowLeftLine className="size-4" />
            Back to Blog
          </Link>

          {isLoading ? (
            <div className="flex flex-col items-center py-20 text-center">
              <RiLoader4Line className="size-6 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Loading article...</p>
            </div>
          ) : notFound || !post ? (
            <div className="py-20 text-center">
              <h1 className="text-2xl font-bold mb-2">Post Not Found</h1>
              <p className="text-muted-foreground">This article doesn't exist or hasn't been published yet.</p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-primary">
                  {post.category}
                </span>
                <span className="flex items-center gap-1">
                  <RiTimeLine className="size-3" />
                  {post.publishedAt
                    ? new Date(post.publishedAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
                    : new Date(post.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>

              <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl mb-4">
                {post.title}
              </h1>

              <p className="text-lg leading-relaxed text-muted-foreground mb-10">
                {post.excerpt}
              </p>

              {post.coverImageUrl && (
                <div className="mb-10 w-full overflow-hidden rounded-xl border border-border bg-muted">
                  <img 
                    src={post.coverImageUrl} 
                    alt={post.title} 
                    className="w-full h-auto object-cover max-h-[500px]" 
                  />
                </div>
              )}

              <div className="border-t border-border pt-8">
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
