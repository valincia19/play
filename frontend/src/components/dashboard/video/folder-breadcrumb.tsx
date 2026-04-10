import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { useNavigate } from "react-router-dom"
import React from "react"

interface FolderBreadcrumbProps {
  currentFolderId?: string
  path: Array<{ id: string; name: string; depth: number }>
}

export function FolderBreadcrumb({ currentFolderId, path }: FolderBreadcrumbProps) {
  const navigate = useNavigate()

  const go = (folderId: string | null) => {
    navigate(folderId ? `/dashboard/videos?folderId=${folderId}` : '/dashboard/videos')
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {currentFolderId ? (
            <BreadcrumbLink className="cursor-pointer" onClick={() => go(null)}>Home</BreadcrumbLink>
          ) : (
            <BreadcrumbPage>Home</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {path.map((folder, idx) => (
          <React.Fragment key={folder.id}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {idx === path.length - 1 ? (
                <BreadcrumbPage>{folder.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink className="cursor-pointer" onClick={() => go(folder.id)}>
                  {folder.name}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
