import { useState } from "react"
import { RiFolder3Fill, RiFolderOpenFill, RiArrowRightSLine, RiArrowDownSLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { buildFolderTree } from "./folder-utils"
import type { FlatFolder, FolderNode } from "./folder-utils"

type FolderTreeItemProps = {
  node: FolderNode
  level: number
  selectedId: string
  onSelect: (id: string) => void
  expandedIds: Set<string>
  toggleExpand: (id: string, e: React.MouseEvent) => void
}

function FolderTreeItem({ node, level, selectedId, onSelect, expandedIds, toggleExpand }: FolderTreeItemProps) {
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedId === node.id
  const hasChildren = node.children.length > 0

  return (
    <div className="w-full">
      <div
        onClick={() => onSelect(node.id)}
        className={cn(
          "flex items-center gap-1.5 py-1.5 pr-2 cursor-pointer rounded-md transition-colors w-full text-sm",
          isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
        )}
        style={{ paddingLeft: `${(level * 16) + 8}px` }}
      >
        <div
          className={cn("size-4 flex items-center justify-center shrink-0", hasChildren ? "cursor-pointer text-muted-foreground hover:text-foreground" : "opacity-0")}
          onClick={(e) => {
            if (hasChildren) toggleExpand(node.id, e)
          }}
        >
          {hasChildren && (
            isExpanded ? <RiArrowDownSLine className="size-4" /> : <RiArrowRightSLine className="size-4" />
          )}
        </div>

        {isExpanded && hasChildren ? (
          <RiFolderOpenFill className="size-4 shrink-0 text-amber-500" />
        ) : (
          <RiFolder3Fill className="size-4 shrink-0 text-amber-500" />
        )}
        <span className="truncate">{node.name}</span>
      </div>

      {isExpanded && hasChildren && (
        <div className="flex flex-col mt-0.5">
          {node.children.map(child => (
            <FolderTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type FolderTreeProps = {
  folders: FlatFolder[]
  selectedId: string
  onSelect: (id: string) => void
}

export function FolderTree({ folders, selectedId, onSelect }: FolderTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const roots = buildFolderTree(folders)

  // Default "Root" virtual node selection state
  const isRootSelected = selectedId === 'root'

  return (
    <div className="flex flex-col w-full overflow-y-auto pr-1" style={{ maxHeight: '300px' }}>
      <div
        onClick={() => onSelect('root')}
        className={cn(
          "flex items-center gap-1.5 py-1.5 px-2 mb-1 cursor-pointer rounded-md transition-colors w-full text-sm",
          isRootSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
        )}
        style={{ paddingLeft: '8px' }}
      >
        <div className="size-4 shrink-0" />
        <RiFolder3Fill className="size-4 shrink-0 text-amber-500" />
        <span>/ Root Directory</span>
      </div>

      <div className="space-y-0.5">
        {roots.map(root => (
          <FolderTreeItem
            key={root.id}
            node={root}
            level={0}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
          />
        ))}
      </div>

      {folders.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">No folders created</p>
      )}
    </div>
  )
}
