import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiGlobalLine,
  RiCheckLine,
  RiTimeLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiShieldCheckLine,
  RiLoader4Line,
} from "@remixicon/react"
import { cn } from "@/lib/utils"
import { adminApi } from "@/lib/api"
import { toast } from "sonner"
import type { Domain } from "@/lib/types"

// ─── Component ────────────────────────────────────────────────────

export function StudioDomains() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({ domain: "", isActive: true })

  // ── Fetch ──
  const fetchDomains = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await adminApi.domains.getAll()
      setDomains(data)
    } catch {
      toast.error("Failed to load domains")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  // ── Dialog ──
  const openDialog = (domain?: Domain) => {
    if (domain) {
      setEditingDomain(domain)
      setFormData({ domain: domain.domain, isActive: domain.isActive })
    } else {
      setEditingDomain(null)
      setFormData({ domain: "", isActive: true })
    }
    setIsDialogOpen(true)
  }

  // ── Save (Create / Update) ──
  const saveDomain = async () => {
    if (!formData.domain.trim()) {
      toast.error("Domain name is required")
      return
    }

    setIsSaving(true)
    try {
      if (editingDomain) {
        await adminApi.domains.update(editingDomain.id, {
          domain: formData.domain,
          isActive: formData.isActive,
        })
        toast.success("Domain updated")
      } else {
        await adminApi.domains.create({
          domain: formData.domain,
          isActive: formData.isActive,
        })
        toast.success("Domain added — configure your DNS to verify")
      }
      setIsDialogOpen(false)
      fetchDomains()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save domain")
    } finally {
      setIsSaving(false)
    }
  }

  // ── Delete ──
  const deleteDomain = async (id: string) => {
    const target = domains.find(d => d.id === id)
    if (target?.isDefault) {
      toast.error("Cannot delete the default domain")
      return
    }
    if (!confirm("Are you sure you want to remove this domain?")) return
    try {
      await adminApi.domains.delete(id)
      toast.success("Domain removed")
      fetchDomains()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete domain")
    }
  }

  // ── Set Default ──
  const setDefault = async (id: string) => {
    try {
      await adminApi.domains.setDefault(id)
      toast.success("Default domain updated")
      fetchDomains()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to set default domain")
    }
  }

  // ── Verify ──
  const verifyDomain = async (id: string) => {
    try {
      await adminApi.domains.verify(id)
      toast.success("Domain verified and SSL activated")
      fetchDomains()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to verify domain")
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  const getSslBadge = (status: Domain["sslStatus"]) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"><RiCheckLine className="mr-1 size-3" /> SSL Active</Badge>
      case "pending":
        return <Badge variant="secondary" className="text-amber-500"><RiTimeLine className="mr-1 size-3" /> Pending</Badge>
      case "error":
        return <Badge variant="destructive"><RiErrorWarningLine className="mr-1 size-3" /> Error</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom Domains</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage custom domains for your CDN delivery endpoints.
          </p>
        </div>
        <Button size="sm" onClick={() => openDialog()}>
          <RiAddLine className="mr-1 size-4" /> Add Domain
        </Button>
      </div>

      {/* DNS Instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RiGlobalLine className="size-5" /> DNS Configuration
          </CardTitle>
          <CardDescription>
            Point your custom domain to our CDN by adding a CNAME record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
                <p className="font-mono font-semibold mt-0.5">CNAME</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</span>
                <p className="font-mono font-semibold mt-0.5">cdn</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Value</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="font-mono font-semibold">verply.net</p>
                  <button
                    onClick={() => copyToClipboard("verply.net")}
                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Copy"
                  >
                    <RiFileCopyLine className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Domains Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registered Domains</CardTitle>
          <CardDescription>All custom domains linked to your CDN infrastructure.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SSL</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                        <RiLoader4Line className="size-4 animate-spin" /> Loading domains...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : domains.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                      No domains configured. Add your first custom domain.
                    </TableCell>
                  </TableRow>
                ) : (
                  domains.map(d => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{d.domain}</p>
                          {d.isDefault && <Badge variant="default">Default</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {d.isVerified ? (
                            <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">
                              <RiCheckLine className="mr-1 size-3" /> Verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-amber-500">
                              <RiTimeLine className="mr-1 size-3" /> Pending DNS
                            </Badge>
                          )}
                          {d.isActive ? (
                            <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getSslBadge(d.sslStatus)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!d.isVerified && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-primary"
                              onClick={() => verifyDomain(d.id)}
                              title="Mark as verified"
                            >
                              <RiShieldCheckLine className="mr-1 size-3.5" /> Verify
                            </Button>
                          )}
                          {!d.isDefault && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDefault(d.id)}>
                              Set Default
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(d)}>
                            <RiEditLine className="size-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", d.isDefault ? "opacity-30 cursor-not-allowed" : "hover:text-destructive")}
                            onClick={() => deleteDomain(d.id)}
                            disabled={d.isDefault}
                          >
                            <RiDeleteBinLine className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Domain Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDomain ? "Edit Domain" : "Add Custom Domain"}</DialogTitle>
            <DialogDescription>
              {editingDomain
                ? "Update your custom domain configuration."
                : "Enter a domain name and we'll guide you through DNS verification."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Domain Name</Label>
              <Input
                placeholder="cdn.yourdomain.com"
                value={formData.domain}
                onChange={e => setFormData(prev => ({ ...prev, domain: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">
                Use a subdomain like <span className="font-mono">cdn.</span> or <span className="font-mono">media.</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={c => setFormData(prev => ({ ...prev, isActive: c }))}
              />
              <Label>Enable domain immediately</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveDomain} disabled={isSaving}>
              {isSaving ? <RiLoader4Line className="mr-1 size-4 animate-spin" /> : null}
              {editingDomain ? "Save Changes" : "Add Domain"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
