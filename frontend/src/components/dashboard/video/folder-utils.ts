export type FlatFolder = {
  id: string
  name: string
  parentId: string | null
}

export type FolderNode = FlatFolder & {
  children: FolderNode[]
}

/**
 * Build a tree structure from flat folder list.
 * Extracted to avoid React refresh warning with mixed exports.
 */
export function buildFolderTree(flatFolders: FlatFolder[]): FolderNode[] {
  const nodeMap = new Map<string, FolderNode>()
  const roots: FolderNode[] = []

  // Initialize nodes
  flatFolders.forEach(f => {
    nodeMap.set(f.id, { ...f, children: [] })
  })

  // Build tree
  flatFolders.forEach(f => {
    const node = nodeMap.get(f.id)!
    if (f.parentId && nodeMap.has(f.parentId)) {
      nodeMap.get(f.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}
