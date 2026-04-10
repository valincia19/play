import { useEffect, useState } from 'react'
import { adminApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RiAddLine, RiDeleteBin7Line, RiCheckLine } from "@remixicon/react"
import type { AdminPlan, AdminPlanInput } from '@/lib/types'

interface PlanFormData extends AdminPlanInput {
  id: string
}

const DEFAULT_PLAN_CAPABILITIES: Record<string, boolean> = {
  ads: false,
  redirect: false,
  analyticsAdvanced: false,
}

function createDefaultPlanFormData(position: number): PlanFormData {
  return {
    id: '',
    name: '',
    price: 0,
    durationDays: 30,
    maxVideos: -1,
    maxStorage: -1,
    maxBandwidth: -1,
    isActive: true,
    position,
    capabilities: { ...DEFAULT_PLAN_CAPABILITIES },
    features: [],
  }
}

function normalizePlanFormData(plan: AdminPlan): PlanFormData {
  return {
    id: plan.id,
    name: plan.name,
    price: plan.price,
    durationDays: plan.durationDays,
    maxVideos: plan.maxVideos,
    maxStorage: plan.maxStorage,
    maxBandwidth: plan.maxBandwidth,
    isActive: plan.isActive,
    position: plan.position,
    capabilities: {
      ...DEFAULT_PLAN_CAPABILITIES,
      ...(plan.capabilities || {}),
    },
    features: [...(plan.features || [])],
  }
}

export function StudioPlans() {
  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [editPlan, setEditPlan] = useState<string | null>(null)
  
  // Form State
  const [formData, setFormData] = useState<PlanFormData>(createDefaultPlanFormData(0))

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const res = await adminApi.getPlans()
      setPlans(res || [])
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const openCreate = () => {
    setEditPlan('NEW')
    setFormData(createDefaultPlanFormData(plans.length + 1))
  }

  const openEdit = (plan: AdminPlan) => {
    setEditPlan(plan.id)
    setFormData(normalizePlanFormData(plan))
  }

  const handleSave = async () => {
    try {
      if (editPlan === 'NEW') {
        await adminApi.createPlan(formData)
      } else if (editPlan) {
        await adminApi.updatePlan(editPlan, formData)
      }
      setEditPlan(null)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deletePlan(id)
      loadData()
    } catch (error) {
      console.error(error)
    }
  }

  const handleToggleActive = async (plan: AdminPlan) => {
    try {
      await adminApi.updatePlan(plan.id, { isActive: !plan.isActive })
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plan Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage global subscription plans and limits.</p>
        </div>
        <Button onClick={openCreate}>Create Plan</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Plans</CardTitle>
          <CardDescription>Configure pricing and limits for user packages.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Limits (V / S / B)</TableHead>
                    <TableHead>Price / Dur</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map(plan => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-mono text-xs">{plan.id}</TableCell>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell className="text-[10px] font-mono leading-relaxed">
                        <div className="flex flex-col gap-0.5">
                          <span>Videos: {plan.maxVideos < 0 ? '∞' : plan.maxVideos}</span>
                          <span>Storage: {plan.maxStorage < 0 ? '∞' : plan.maxStorage >= 1000000 ? `${(plan.maxStorage / 1024 / 1024).toFixed(1)} TB` : `${(plan.maxStorage / 1024).toFixed(1)} GB`}</span>
                          <span>Bandwidth: {plan.maxBandwidth < 0 ? '∞' : plan.maxBandwidth >= 1000000 ? `${(plan.maxBandwidth / 1024 / 1024).toFixed(1)} TB` : `${(plan.maxBandwidth / 1024).toFixed(1)} GB`}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-bold">Rp {plan.price.toLocaleString('id-ID')}</span>
                          <span className="text-[10px] text-muted-foreground">{plan.durationDays} days</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch checked={plan.isActive} onCheckedChange={() => handleToggleActive(plan)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(plan)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(plan.id)}>Delete</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {plans.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground h-24">No plans found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editPlan} onOpenChange={(open) => !open && setEditPlan(null)}>
        <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{editPlan === 'NEW' ? 'Create Plan' : 'Edit Plan'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6 p-6 overflow-y-auto overflow-x-hidden max-h-[75vh] custom-scrollbar">
            {editPlan === 'NEW' && (
              <div className="grid gap-2">
                <Label>ID (e.g., 'pro')</Label>
                <Input value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Price (IDR)</Label>
                <Input type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: parseInt(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Duration (Days)</Label>
                <Input type="number" value={formData.durationDays} onChange={e => setFormData({ ...formData, durationDays: parseInt(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Videos (-1 = ∞)</Label>
                <Input type="number" value={formData.maxVideos} onChange={e => setFormData({ ...formData, maxVideos: parseInt(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Idx (Order)</Label>
                <Input type="number" value={formData.position} onChange={e => setFormData({ ...formData, position: parseInt(e.target.value) })} />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Storage (MB)</Label>
                <Input type="number" value={formData.maxStorage} onChange={e => setFormData({ ...formData, maxStorage: parseInt(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Bandwidth (MB)</Label>
                <Input type="number" value={formData.maxBandwidth} onChange={e => setFormData({ ...formData, maxBandwidth: parseInt(e.target.value) })} />
              </div>
            </div>

            <div className="pt-2 border-t border-border mt-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Capabilities</Label>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Monetization (Ads)</Label>
                  <Switch checked={formData.capabilities?.ads} onCheckedChange={(v) => setFormData({ ...formData, capabilities: { ...formData.capabilities, ads: v }})} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Advanced Analytics</Label>
                  <Switch checked={formData.capabilities?.analyticsAdvanced} onCheckedChange={(v) => setFormData({ ...formData, capabilities: { ...formData.capabilities, analyticsAdvanced: v }})} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Monetization Redirect</Label>
                  <Switch checked={formData.capabilities?.redirect} onCheckedChange={(v) => setFormData({ ...formData, capabilities: { ...formData.capabilities, redirect: v }})} />
                </div>
              </div>
            </div>

            <div className="grid gap-2 pt-2 border-t border-border mt-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Marketing Features</Label>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 px-2 text-[10px] gap-1"
                  onClick={() => setFormData({ ...formData, features: [...(formData.features || []), { label: '', highlight: false }] })}
                >
                  <RiAddLine className="size-3" /> Add Feature
                </Button>
              </div>
              
              <div className="space-y-2 mt-2">
                {(formData.features || []).map((feature, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className={`shrink-0 w-8 h-8 rounded border flex items-center justify-center cursor-pointer transition-colors ${feature.highlight ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-muted border-border text-muted-foreground'}`}
                      onClick={() => {
                        const newFeatures = [...formData.features]
                        newFeatures[idx].highlight = !newFeatures[idx].highlight
                        setFormData({ ...formData, features: newFeatures })
                      }}
                      title="Toggle Highlight"
                    >
                      <RiCheckLine className="size-4" />
                    </div>
                    <Input 
                      placeholder="e.g. 4K Ultra HD" 
                      className="h-8 text-xs" 
                      value={feature.label}
                      onChange={(e) => {
                        const newFeatures = [...formData.features]
                        newFeatures[idx].label = e.target.value
                        setFormData({ ...formData, features: newFeatures })
                      }} 
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setFormData({ ...formData, features: formData.features.filter((_, i: number) => i !== idx) })}
                    >
                      <RiDeleteBin7Line className="size-4" />
                    </Button>
                  </div>
                ))}
                {(!formData.features || formData.features.length === 0) && (
                  <p className="text-[10px] text-muted-foreground text-center py-4 border border-dashed rounded-md">No features added yet.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={() => setEditPlan(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
