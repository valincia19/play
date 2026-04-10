import { memo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RiSparklingLine, RiUploadCloud2Line } from "@remixicon/react"

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void
}

export const UploadDropzone = memo(function UploadDropzone({ onFilesSelected }: UploadDropzoneProps) {
  const [isHovering, setIsHovering] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsHovering(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'))
    if (files.length > 0) {
      onFilesSelected(files)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onFilesSelected(files)
    }
    // Reset so the same file can be selected again
    e.target.value = ''
  }

  return (
    <Card 
      className={`relative overflow-hidden border border-border/60 bg-card/95 shadow-sm transition-all duration-200 ${isHovering ? 'border-primary/60 bg-primary/[0.06] shadow-[0_0_0_1px_rgba(20,184,166,0.15)]' : 'hover:border-border hover:bg-muted/[0.16]'}`}
      onDragOver={(e) => { e.preventDefault(); setIsHovering(true) }}
      onDragLeave={() => setIsHovering(false)}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <input 
        type="file" 
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm" 
        multiple
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={handleFileChange}
      />
      
      <div className="pointer-events-none flex min-h-[168px] flex-col justify-between gap-4 p-4 sm:min-h-[188px] sm:p-4.5">
        <div className="flex items-start justify-between gap-3">
          <Badge variant="outline" className="h-6 border-border/60 bg-background/80 px-2.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Upload Surface
          </Badge>
          <div className="rounded-full border border-border/60 bg-background/80 p-2 text-muted-foreground">
            <RiSparklingLine className="size-4" />
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 text-left">
          <div className={`rounded-xl border p-2.5 transition-colors ${isHovering ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border/60 bg-muted/30 text-muted-foreground'}`}>
            <RiUploadCloud2Line className="size-5" />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              Drop videos here or browse from your device
            </p>
            <p className="max-w-xl text-xs leading-5 text-muted-foreground sm:text-sm">
              Queue multiple files and let the worker handle the rest in background.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground sm:text-[11px]">
          <Badge variant="secondary" className="h-5 rounded-full bg-muted/60 px-2 font-medium">
            MP4
          </Badge>
          <Badge variant="secondary" className="h-5 rounded-full bg-muted/60 px-2 font-medium">
            MOV
          </Badge>
          <Badge variant="secondary" className="h-5 rounded-full bg-muted/60 px-2 font-medium">
            MKV
          </Badge>
          <Badge variant="secondary" className="h-5 rounded-full bg-muted/60 px-2 font-medium">
            WebM
          </Badge>
          <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
            Max 5GB per file
          </span>
        </div>
      </div>
    </Card>
  )
})
