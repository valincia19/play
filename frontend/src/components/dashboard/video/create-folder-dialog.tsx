import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { folderApi } from "@/lib/api"
import { toast } from "sonner"

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentId?: string
  onSuccess: () => void
}

export function CreateFolderDialog({ open, onOpenChange, parentId, onSuccess }: CreateFolderDialogProps) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Folder name cannot be empty')
      return
    }

    try {
      setLoading(true)
      await folderApi.create(trimmed, parentId)
      toast.success('Folder created')
      onOpenChange(false)
      setName("")
      onSuccess()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create folder'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
          <DialogDescription>Create a new folder to organize your videos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Marketing Videos"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setName('') }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating...' : 'Create Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
