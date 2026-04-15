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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { RiCalendarLine } from '@remixicon/react'
import type { AdminPlan, AdminUserRecord } from '@/lib/types'
import { type DateRange } from "react-day-picker"
import { toast } from 'sonner'

interface EditFormData {
  name: string
  email: string
  password: string
  plan: string
  role: 'user' | 'admin'
  status: 'active' | 'suspended'
}

function ExpiryCountdown({ date, plan }: { date: string | null, plan?: string }) {
  const [timeLeft, setTimeLeft] = useState('')
  const [isExpiringSoon, setIsExpiringSoon] = useState(false)

  useEffect(() => {
    if (!date) {
      setTimeout(() => {
        setTimeLeft(plan === 'free' ? 'LIFETIME' : '-')
        setIsExpiringSoon(false)
      }, 0)
      return
    }

    const calculate = () => {
      const now = new Date().getTime()
      const end = new Date(date).getTime()
      const diff = end - now

      if (diff <= 0) {
        setTimeLeft('EXPIRED')
        setIsExpiringSoon(true)
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const secs = Math.floor((diff % (1000 * 60)) / 1000)

      setIsExpiringSoon(days < 3)

      const parts = []
      if (days > 0) parts.push(`${days}d`)
      if (hours > 0) parts.push(`${hours.toString().padStart(2, '0')}h`)
      parts.push(`${mins.toString().padStart(2, '0')}m`)
      parts.push(`${secs.toString().padStart(2, '0')}s`)

      setTimeLeft(parts.join(' '))
    }

    calculate()
    const timer = setInterval(calculate, 1000)
    return () => clearInterval(timer)
  }, [date, plan])

  if (!date && plan === 'free') {
    return (
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-green-500/80 uppercase tracking-widest bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20 w-fit">
          Lifetime
        </span>
        <span className="text-[9px] text-muted-foreground mt-0.5 ml-0.5">Free Plan</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`text-[11px] font-mono font-bold tracking-tight tabular-nums ${timeLeft === 'EXPIRED' ? 'text-red-500' :
          isExpiringSoon ? 'text-orange-500 animate-pulse' :
            'text-primary'
          }`}>
          {timeLeft}
        </span>
      </div>
      {date && (
        <span className="text-[9px] text-muted-foreground font-medium flex items-center gap-1 px-0.5">
          <span className="w-1 h-1 rounded-full bg-border" />
          Until {new Date(date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      )}
    </div>
  )
}

export function StudioUsers() {
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isFormValid, setIsFormValid] = useState(false)

  const [editUser, setEditUser] = useState<AdminUserRecord | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>({
    name: '',
    email: '',
    password: '',
    plan: 'free',
    role: 'user',
    status: 'active',
  })
  const [editDateRange, setEditDateRange] = useState<DateRange | undefined>(undefined)

  const [givePlanUser, setGivePlanUser] = useState<AdminUserRecord | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [durationOverride, setDurationOverride] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [])

  // Check if form is valid
  useEffect(() => {
    const isValid = (
      editForm.name.trim().length >= 2 &&
      editForm.email.trim().length > 0 &&
      (!editForm.password || editForm.password.length >= 6)
    )
    setIsFormValid(isValid)
  }, [editForm])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [uRes, pRes] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getPlans()
      ])
      setUsers(uRes || [])
      setPlans(pRes || [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditUser = (user: AdminUserRecord) => {
    setEditUser(user)
    let start: Date | undefined
    let end: Date | undefined

    if (user.planStartDate) {
      // Strip 'Z' to force local timezone mapping, preserving the visual date exactly
      start = new Date(user.planStartDate.slice(0, 19))
      start.setHours(0, 0, 0, 0)
    }

    if (user.planEndDate) {
      end = new Date(user.planEndDate.slice(0, 19))
      end.setHours(23, 59, 59, 999)
    }

    setEditDateRange(start || end ? { from: start || new Date(), to: end || start || new Date() } : undefined)
    setEditForm({
      name: user.name,
      email: user.email,
      password: '',
      plan: user.plan || 'free',
      role: user.role,
      status: user.status || 'active',
    })
  }

  const handleUpdateUser = async () => {
    if (!editUser) return

    // Validation (match backend requirements)
    if (!editForm.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (editForm.name.trim().length < 2) {
      toast.error('Name must be at least 2 characters')
      return
    }
    if (!editForm.email.trim()) {
      toast.error('Email is required')
      return
    }
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(editForm.email.trim())) {
      toast.error('Please enter a valid email address')
      return
    }
    // Backend requires min 6 characters for password
    if (editForm.password && editForm.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setIsSaving(true)
    try {
      // Clone dates to avoid mutation issues and handle timezone properly
      const startDate = editDateRange?.from ? new Date(editDateRange.from.getTime()) : undefined
      const endDate = editDateRange?.to ? new Date(editDateRange.to.getTime()) : undefined

      // Build payload — only include fields that have real values
      // Never send undefined/empty strings to the backend
      const raw: Record<string, unknown> = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        plan: editForm.plan,
        role: editForm.role,
        status: editForm.status,
      }

      // Optional fields — only include if they have values
      const pw = editForm.password.trim()
      if (pw) raw.password = pw

      // Force ISO dates using strictly local date segments
      // This prevents the browser from shifting Apr 15 00:00 WIB into Apr 14 17:00 UTC
      if (startDate) {
        const y = startDate.getFullYear()
        const m = String(startDate.getMonth() + 1).padStart(2, '0')
        const d = String(startDate.getDate()).padStart(2, '0')
        raw.planStartDate = `${y}-${m}-${d}T00:00:00.000Z`
      }
      if (endDate) {
        const y = endDate.getFullYear()
        const m = String(endDate.getMonth() + 1).padStart(2, '0')
        const d = String(endDate.getDate()).padStart(2, '0')
        raw.planEndDate = `${y}-${m}-${d}T23:59:59.999Z`
      }

      await adminApi.updateUser(editUser.id, raw)
      toast.success('User updated successfully')
      setEditUser(null)
    } catch (err: unknown) {
      console.error('[EditUser] Update failed:', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to update user'
      toast.error(errorMsg)
    } finally {
      setIsSaving(false)
    }

    // Reload data independently — don't let a reload failure
    // mask a successful update (e.g. if session expired mid-action)
    try {
      await loadData()
    } catch {
      // loadData already shows its own error toast
    }
  }

  const handleGivePlan = async () => {
    if (!givePlanUser || !selectedPlanId) return
    try {
      const duration = durationOverride ? parseInt(durationOverride) : undefined
      await adminApi.givePlan(givePlanUser.id, selectedPlanId, duration)
      toast.success('Plan assigned successfully')
      setGivePlanUser(null)
      setSelectedPlanId('')
      setDurationOverride('')
      loadData()
    } catch (err: unknown) {
      console.error('Give plan failed:', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to assign plan'
      toast.error(errorMsg)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage platform users, roles, and manual assignments.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>A comprehensive list of everyone registered.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                          {user.isVerified && <span className="text-[10px] text-green-500 mt-0.5">Verified</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="capitalize">{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'active' ? 'outline' : 'destructive'} className="capitalize">{user.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className={`w-fit capitalize font-bold text-[10px] px-1.5 py-0 ${user.plan === 'pro' ? 'border-primary/40 bg-primary/5 text-primary' :
                            user.plan === 'creator' ? 'border-purple-500/40 bg-purple-500/5 text-purple-500' :
                              'border-border/60 text-muted-foreground'
                            }`}>
                            {user.plan}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ExpiryCountdown date={user.planEndDate} plan={user.plan} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">Manage</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditUser(user)}>
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setGivePlanUser(user)}>
                              Give Plan
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No users found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => {
  if (!open) {
    setEditUser(null)
    setEditForm({ name: '', email: '', password: '', plan: 'free', role: 'user', status: 'active' })
    setEditDateRange(undefined)
  }
}}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription className="sr-only">Configure user details, plan, and role</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4 py-4" onSubmit={(e) => { e.preventDefault(); handleUpdateUser(); }}>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="User name"
              />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                autoComplete="username"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label>New Password (Optional)</Label>
              <Input
                type="password"
                placeholder="Leave blank to keep current password (min 6 chars)"
                autoComplete="new-password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              />
              {editForm.password && editForm.password.length < 6 && (
                <p className="text-xs text-destructive">Password must be at least 6 characters</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Plan</Label>
              <Select
                value={editForm.plan}
                onValueChange={(value) => setEditForm({ ...editForm, plan: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent position="popper" className="w-[--radix-select-trigger-width]">
                  {!plans.some(p => p.id === 'free') && (
                    <SelectItem value="free" className="capitalize">Free</SelectItem>
                  )}
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="capitalize">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Plan Duration</Label>
                {editDateRange && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditDateRange(undefined)}>
                    Clear
                  </Button>
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={`w-full justify-start font-normal text-left ${!editDateRange && "text-muted-foreground"}`}>
                    <RiCalendarLine className="mr-2 size-4" />
                    {editDateRange?.from ? (
                      editDateRange.to ? (
                        <>
                          {format(editDateRange.from, 'dd MMM yyyy')} - {format(editDateRange.to, 'dd MMM yyyy')}
                        </>
                      ) : (
                        format(editDateRange.from, 'dd MMM yyyy')
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    defaultMonth={editDateRange?.from}
                    selected={editDateRange}
                    onSelect={setEditDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm({ ...editForm, role: value as 'user' | 'admin' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent position="popper" className="w-[--radix-select-trigger-width]">
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(value) => setEditForm({ ...editForm, status: value as 'active' | 'suspended' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent position="popper" className="w-[--radix-select-trigger-width]">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditUser(null)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" disabled={isSaving || !isFormValid}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>

      {/* Give Plan Dialog */ }
  <Dialog open={!!givePlanUser} onOpenChange={(open) => !open && setGivePlanUser(null)}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Give Plan to User</DialogTitle>
        <DialogDescription className="sr-only">Directly assign a plan and duration override to the user</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>Selected User</Label>
          <div className="text-sm p-2 bg-muted rounded-md border border-border text-muted-foreground">
            {givePlanUser?.email}
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Assign Plan</Label>
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[--radix-select-trigger-width]">
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id} className="capitalize">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Duration Override (Days)</Label>
          <Input
            type="number"
            placeholder="Leave blank for plan default"
            value={durationOverride}
            onChange={(e) => setDurationOverride(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setGivePlanUser(null)}>Cancel</Button>
        <Button onClick={handleGivePlan} disabled={!selectedPlanId} className="bg-primary text-primary-foreground">Assign Plan</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
    </div >
  )
}
