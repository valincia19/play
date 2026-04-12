import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RiAddLine, RiDeleteBinLine, RiEditLine, RiDatabase2Line, RiServerLine, RiCheckLine, RiCloudFill, RiFlaskLine, RiErrorWarningLine } from "@remixicon/react"
import { adminApi } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { StorageBucket, StorageProvider, StorageTestResult } from "@/lib/types"

interface BucketFormData {
  providerId: string
  name: string
  region: string
  endpoint: string
  accessKey: string
  secretKey: string
  maxStorageGB: number
  isDefault: boolean
}

function bytesToGb(value?: number) {
  if (!value) return 0
  return Math.round((value / (1024 * 1024 * 1024)) * 10) / 10
}

export function AdminStorage() {
  const [providers, setProviders] = useState<StorageProvider[]>([])
  const [buckets, setBuckets] = useState<StorageBucket[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [_providers, _buckets] = await Promise.all([
        adminApi.storage.getProviders(),
        adminApi.storage.getBuckets(),
      ])
      setProviders(_providers)
      setBuckets(_buckets)
    } catch {
      toast.error('Failed to fetch storage data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const toggleProvider = async (id: string, currentStatus: boolean) => {
    try {
      await adminApi.storage.toggleProvider(id, !currentStatus)
      setProviders(providers.map(p => p.id === id ? { ...p, isActive: !currentStatus } : p))
      toast.success('Provider status updated')
    } catch {
      toast.error('Failed to update provider')
    }
  }

  const setDefaultBucket = async (id: string) => {
    try {
      await adminApi.storage.setDefaultBucket(id)
      setBuckets(buckets.map(b => ({ ...b, isDefault: b.id === id })))
      toast.success('Default bucket updated')
    } catch {
      toast.error('Failed to update default bucket')
    }
  }

  const deleteBucket = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bucket config?')) return
    try {
      await adminApi.storage.deleteBucket(id)
      setBuckets(buckets.filter(b => b.id !== id))
      toast.success('Bucket deleted')
    } catch {
      toast.error('Failed to delete bucket')
    }
  }

  // Edit Bucket Form
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBucket, setEditingBucket] = useState<StorageBucket | null>(null)
  
  // Test Results
  const [testResults, setTestResults] = useState<StorageTestResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [showTestDialog, setShowTestDialog] = useState(false)

  const testBucket = async (id: string) => {
    setIsTesting(true)
    setTestResults(null)
    setShowTestDialog(true)
    try {
      const res = await adminApi.storage.testBucket(id)
      setTestResults(res)
    } catch {
      toast.error('Connection test failed')
      setShowTestDialog(false)
    } finally {
      setIsTesting(false)
    }
  }
  
  const [formData, setFormData] = useState<BucketFormData>({
    providerId: '',
    name: '',
    region: '',
    endpoint: '',
    accessKey: '',
    secretKey: '',
    maxStorageGB: 0,
    isDefault: false
  })

  const openBucketDialog = (bucket?: StorageBucket) => {
    if (bucket) {
      setEditingBucket(bucket)
      setFormData({
        providerId: bucket.providerId,
        name: bucket.name,
        region: bucket.region || '',
        endpoint: bucket.endpoint || '',
        accessKey: '',
        secretKey: '',
        maxStorageGB: bytesToGb(bucket.maxStorageBytes),
        isDefault: bucket.isDefault
      })
    } else {
      setEditingBucket(null)
      setFormData({
        providerId: providers.length > 0 ? providers[0].id : '',
        name: '',
        region: '',
        endpoint: '',
        accessKey: '',
        secretKey: '',
        maxStorageGB: 0,
        isDefault: buckets.length === 0
      })
    }
    setIsDialogOpen(true)
  }

  const saveBucket = async () => {
    try {
      if (editingBucket) {
        const { accessKey, secretKey, ...rest } = formData
        const payload: Record<string, unknown> = { ...rest }
        if (accessKey) payload.accessKey = accessKey
        if (secretKey) payload.secretKey = secretKey
        
        await adminApi.storage.updateBucket(editingBucket.id, payload)
        toast.success('Bucket updated')
      } else {
        await adminApi.storage.createBucket(formData as unknown as Record<string, unknown>)
        toast.success('Bucket added')
      }
      setIsDialogOpen(false)
      fetchData()
    } catch {
      toast.error('Failed to save bucket config')
    }
  }

  const getProviderName = (id: string) => providers.find(p => p.id === id)?.name || id

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storage Configurations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your object storage providers and bucket capacities.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Providers */}
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 border-b pb-3 mb-2">
                <RiServerLine className="size-5" /> Storage Providers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="text-sm text-muted-foreground text-center">Loading...</div>
              ) : providers.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-md text-primary">
                      {p.type === 'r2' ? <RiCloudFill size={20} /> : <RiDatabase2Line size={20} />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{p.name}</p>
                      <p className="text-xs text-muted-foreground uppercase">{p.type}</p>
                    </div>
                  </div>
                  <div>
                    <Switch checked={p.isActive} onCheckedChange={() => toggleProvider(p.id, p.isActive)} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Buckets */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Linked Buckets</CardTitle>
                <CardDescription>Buckets are used to securely store your DRM-encrypted videos.</CardDescription>
              </div>
              <Button size="sm" onClick={() => openBucketDialog()}><RiAddLine className="mr-1 size-4" /> Add Bucket</Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Bucket Info</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Usage (GB)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Manage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                       <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">Loading...</TableCell></TableRow>
                    ) : buckets.map(b => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <p className="font-semibold">{b.name}</p>
                          <p className="text-xs text-muted-foreground">{b.region || 'global'}</p>
                        </TableCell>
                        <TableCell>
                           <Badge variant="outline">{getProviderName(b.providerId)}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium">
                              {bytesToGb(b.usedStorageBytes)} / {b.maxStorageBytes === 0 ? 'inf' : bytesToGb(b.maxStorageBytes)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {b.isActive ? <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                            {b.isDefault && <Badge variant="default"><RiCheckLine className="mr-1 size-3" /> Default</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => testBucket(b.id)} title="Test Connection" disabled={isTesting}>
                               <RiFlaskLine className={cn("size-4 text-primary", isTesting && "animate-pulse")} />
                             </Button>
                             {!b.isDefault && (
                               <Button variant="ghost" size="sm" onClick={() => setDefaultBucket(b.id)} className="h-8 text-xs">Set Default</Button>
                             )}
                             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openBucketDialog(b)}>
                               <RiEditLine className="size-4 text-muted-foreground" />
                             </Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => deleteBucket(b.id)}>
                               <RiDeleteBinLine className="size-4" />
                             </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!isLoading && buckets.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No storage buckets configured.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBucket ? 'Edit Bucket Configuration' : 'Link New Bucket'}</DialogTitle>
            <DialogDescription>
              {editingBucket ? 'Update your storage bucket credentials and configuration.' : 'Connect a new AWS S3 or Cloudflare R2 bucket.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Select value={formData.providerId} onValueChange={(val) => setFormData(p => ({...p, providerId: val}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.filter(p => p.isActive).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Bucket Name</Label>
              <Input placeholder="my-video-bucket" value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Region (Optional)</Label>
                <Input placeholder="us-east-1" value={formData.region} onChange={e => setFormData(p => ({...p, region: e.target.value}))} />
              </div>
              <div className="grid gap-2">
                <Label>Max Storage limit (GB)</Label>
                <Input type="number" min={0} value={formData.maxStorageGB} onChange={e => setFormData(p => ({...p, maxStorageGB: Number(e.target.value)}))} />
                <p className="text-[10px] text-muted-foreground">0 for unlimited</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Endpoint URL (Optional for typical S3)</Label>
              <Input placeholder="https://<account>.r2.cloudflarestorage.com" value={formData.endpoint} onChange={e => setFormData(p => ({...p, endpoint: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Access Key ID</Label>
              <Input placeholder={editingBucket ? "Leave blank to keep existing" : ""} value={formData.accessKey} onChange={e => setFormData(p => ({...p, accessKey: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Secret Access Key</Label>
              <Input type="password" placeholder={editingBucket ? "Leave blank to keep existing" : ""} value={formData.secretKey} onChange={e => setFormData(p => ({...p, secretKey: e.target.value}))} />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Switch checked={formData.isDefault} onCheckedChange={c => setFormData(p => ({...p, isDefault: c}))} />
              <Label>Set as Default Bucket</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveBucket}>{editingBucket ? 'Save Changes' : 'Connect Bucket'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Results Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RiFlaskLine className="size-5 text-primary" />
              Bucket Connection Test
            </DialogTitle>
            <DialogDescription>
              We are verifying storage connectivity, permissions, and health status.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6">
            {isTesting ? (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="relative">
                  <div className="size-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RiCloudFill size={16} className="text-primary animate-pulse" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm">Testing connection...</p>
                  <p className="text-xs text-muted-foreground mt-1">Verifying credentials, upload, and read permissions</p>
                </div>
              </div>
            ) : testResults ? (
              <div className="space-y-4">
                <div className={cn(
                  "p-3 rounded-lg border flex items-start gap-3",
                  testResults.connected ? "bg-emerald-500/5 border-emerald-500/20" : "bg-destructive/5 border-destructive/20"
                )}>
                  {testResults.connected ? (
                    <RiCheckLine className="size-5 text-emerald-500 shrink-0" />
                  ) : (
                    <RiErrorWarningLine className="size-5 text-destructive shrink-0" />
                  )}
                  <div>
                    <h4 className={cn("text-sm font-bold", testResults.connected ? "text-emerald-500" : "text-destructive uppercase")}>
                      {testResults.connected ? "Connection Successful" : "Connection Failed"}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{testResults.message}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 border rounded-lg bg-muted/30">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5">Network</p>
                    <div className="flex items-center gap-2">
                      <div className={cn("size-2 rounded-full", testResults.connected ? "bg-emerald-500" : "bg-destructive")} />
                      <span className="text-xs font-semibold">Listing Content</span>
                    </div>
                  </div>
                  <div className="p-3 border rounded-lg bg-muted/30">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5">Storage I/O</p>
                    <div className="flex items-center gap-2">
                      <div className={cn("size-2 rounded-full", testResults.upload ? "bg-emerald-500" : "bg-destructive")} />
                      <span className="text-xs font-semibold">Write Permission</span>
                    </div>
                  </div>
                </div>

                {testResults.errors.length > 0 && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-[10px] uppercase font-black text-destructive/80 tracking-widest mb-1.5">Error Log</p>
                    <div className="space-y-1.5">
                      {testResults.errors.map((err: string, i: number) => (
                        <p key={i} className="text-[11px] font-mono leading-tight text-destructive flex items-start gap-1">
                          <span className="shrink-0">•</span> {err}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="pt-2">
                  <Button className="w-full" onClick={() => setShowTestDialog(false)}>Close Results</Button>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
