import React, { useState } from 'react'
import { useAuth } from "@/contexts/auth-context"
import { api, videoApi } from "@/lib/api"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { RiCheckLine, RiFlashlightLine, RiInformationLine, RiLoader4Line, RiArrowRightLine } from "@remixicon/react"
import { formatBytes } from "@/lib/utils"

import type { PlanFeature } from "@/lib/types"

interface BillingSubscription {
  planId: string
  status: 'active' | 'cancelled' | 'expired'
  endDate?: string
}

interface BillingTransaction {
  id: string
  planId: string
  amount: number
  status: string
  createdAt: string
}

interface BillingOverview {
  totalVideos: number
  totalBandwidth: number
  totalStorage: number
}

interface BillingPlan {
  id: string
  name: string
  price: number
  position: number
  maxVideos: number
  maxStorage: number
  maxBandwidth: number
  features?: PlanFeature[]
}

export function DashboardBilling() {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null)
  const [transactions, setTransactions] = useState<BillingTransaction[]>([])
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null)
  const [targetPlan, setTargetPlan] = useState<BillingPlan | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [overview, setOverview] = useState<BillingOverview | null>(null)

  const [dbPlans, setDbPlans] = useState<BillingPlan[]>([])
  const [bwUsage, setBwUsage] = React.useState<{ usedMB: number; maxMB: number; percent: number; isUnlimited: boolean } | null>(null)
  const [storageUsage, setStorageUsage] = React.useState<{ usedMB: number; maxMB: number; percent: number } | null>(null)

  React.useEffect(() => {
    async function loadData() {
      try {
        // Fetch public plans regardless
        const remotePlans = (await api.getPlans()) as unknown as BillingPlan[]
        setDbPlans(remotePlans)

        // Only fetch authenticated contexts if user is loaded
        if (user) {
          const [sub, history, ovw, bw, storage] = await Promise.all([
            api.getSubscription(),
            api.getTransactionHistory(),
            api.get('/analytics/overview').catch(() => null),
            videoApi.getBandwidthUsage().catch(() => null),
            videoApi.getStorageUsage().catch(() => null),
          ])
          setSubscription(sub)
          setTransactions(history as unknown as BillingTransaction[])
          setOverview(ovw as BillingOverview | null)
          if (bw) setBwUsage(bw)
          if (storage) {
            const maxMB = storage.maxMB === -1 ? -1 : storage.maxMB
            setStorageUsage({
              usedMB: storage.usedMB,
              maxMB,
              percent: maxMB === -1 ? 0 : Math.min(Math.round((storage.usedMB / maxMB) * 100), 100),
            })
          }
        }
      } catch (err) {
        console.error("Failed to load billing data:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [user])

  const handleUpgrade = async (planId: string) => {
    try {
      setIsUpgrading(planId)
      await api.upgradePlan(planId)
      window.location.reload()
    } catch (err) {
      console.error("Upgrade failed:", err)
    } finally {
      setIsUpgrading(null)
    }
  }

  // Derive plan from active subscription — NOT from stale user.planId
  // If subscription is missing or not active, user is effectively on free
  const currentPlanId = (subscription && subscription.status === 'active')
    ? subscription.planId
    : 'free'
  const currentPlanData = dbPlans.find((p: BillingPlan) => p.id === currentPlanId)

  // Derive plan limits from DB plan data
  const isFree = currentPlanId === 'free'

  const usedVideos = overview?.totalVideos || 0
  const videoLimit = currentPlanData?.maxVideos ?? 100
  const isUnlimitedVideos = videoLimit === -1
  const videoPercent = isUnlimitedVideos ? 0 : Math.min(100, (usedVideos / videoLimit) * 100)

  // Use real bandwidth data from bandwidth_usage table
  const usedBandwidthMB = bwUsage?.usedMB ?? Math.round((overview?.totalBandwidth || 0) / (1024 * 1024))
  const bandwidthLimitMB = bwUsage?.maxMB ?? (currentPlanData?.maxBandwidth ?? 5000)
  const isUnlimitedBandwidth = bandwidthLimitMB === -1
  const bandwidthPercent = bwUsage?.percent ?? (isUnlimitedBandwidth ? 0 : Math.min(100, (usedBandwidthMB / bandwidthLimitMB) * 100))

  // Use real storage data from storage_usage endpoint
  const usedStorageMB = storageUsage?.usedMB ?? Math.round((overview?.totalStorage || 0) / (1024 * 1024))
  const storageLimitMB = storageUsage?.maxMB ?? (currentPlanData?.maxStorage ?? 2000)
  const isUnlimitedStorage = storageLimitMB === -1
  const storagePercent = storageUsage?.percent ?? (isUnlimitedStorage ? 0 : Math.min(100, (usedStorageMB / storageLimitMB) * 100))

  if (isLoading && dbPlans.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        
        {/* Skeleton for Current Plan */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-48 mb-1.5" />
            <Skeleton className="h-3.5 w-64" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            <div className="flex-1">
              <Skeleton className="h-3 w-24 mb-1" />
              <div className="flex items-baseline gap-1.5 pb-2">
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>

            <div className="flex-1">
              <Skeleton className="h-3 w-24 mb-1" />
              <div className="flex items-baseline gap-1.5 pb-2">
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>

            <div className="flex-1">
              <Skeleton className="h-3 w-40 mb-1" />
              <div className="flex items-baseline gap-1.5 pb-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>

            <div className="flex-1 lg:pl-4">
              <Skeleton className="h-3 w-16 mb-1" />
              <div className="pt-1">
                <Skeleton className="h-5 w-16 rounded-md mb-1" />
              </div>
              <Skeleton className="h-2.5 w-32 mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Skeleton for Pricing Cards */}
        <div>
          <Skeleton className="h-6 w-40 mb-4" />
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className={`flex flex-col ${i === 2 ? 'border-primary shadow-sm relative overflow-hidden' : 'border-border'}`}>
                {i === 2 && <div className="absolute top-0 inset-x-0 h-1 bg-primary" />}
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-24" />
                    {i === 2 && <Skeleton className="h-5 w-20 rounded-sm" />}
                  </div>
                  <Skeleton className="h-3 w-40 mt-1 min-h-[32px]" />
                  <div className="pt-3 flex items-baseline gap-x-1">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </CardHeader>
                <CardContent className="flex-1 pb-6">
                  <ul className="space-y-2.5">
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <li key={j} className="flex gap-x-2.5 items-center">
                        <Skeleton className="h-4 w-4 shrink-0 mt-0.5 rounded-sm" />
                        <Skeleton className={`h-3 w-full max-w-[${160 + (j * 10)}px]`} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing & Plans</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription, view your limits, and upgrade your plan.
        </p>
      </div>

      {/* 1. Current Plan Section */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            Current Plan: <span className="text-primary capitalize">{currentPlanId}</span>
          </CardTitle>
          <CardDescription>
            You are currently on the {currentPlanData?.name} plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Videos Used</p>
            <div className="flex items-baseline gap-1.5 pb-2">
              <span className="text-xl font-bold text-foreground">{usedVideos}</span>
              <span className="text-xs text-muted-foreground">/ {isFree ? '10' : 'Unlimited'}</span>
            </div>
            {isFree && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${videoPercent}%` }} />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storage Space</p>
            <div className="flex items-baseline gap-1.5 pb-2">
              <span className="text-xl font-bold text-foreground">{formatBytes(usedStorageMB * 1024 * 1024)}</span>
              <span className="text-xs text-muted-foreground">/ {isFree ? '2 GB' : currentPlanId === 'creator' ? '50 GB' : 'Unlimited'}</span>
            </div>
            {currentPlanId !== 'pro' && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${storagePercent}%` }} />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bandwidth (Monthly)</p>
            <div className="flex items-baseline gap-1.5 pb-2">
              <span className="text-xl font-bold text-foreground">{formatBytes(usedBandwidthMB * 1024 * 1024)}</span>
              <span className="text-xs text-muted-foreground">/ {isFree ? '5 GB' : currentPlanId === 'creator' ? '100 GB' : 'Unlimited'}</span>
            </div>
            {currentPlanId !== 'pro' && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${bandwidthPercent}%` }} />
              </div>
            )}
          </div>

          <div className="space-y-1 lg:pl-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</p>
            <div className="pt-1">
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                subscription?.status === 'active' 
                  ? 'border-green-500/20 bg-green-500/10 text-green-500' 
                  : currentPlanId === 'free'
                    ? 'border-foreground/20 bg-foreground/10 text-foreground/70'
                    : 'border-red-500/20 bg-red-500/10 text-red-500'
              }`}>
                {subscription ? subscription.status : 'Free / No Cycle'}
              </span>
            </div>
            {subscription && subscription.endDate && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {subscription.status === 'active' 
                  ? `Renews ${new Date(subscription.endDate).toLocaleDateString()}`
                  : `Expired on ${new Date(subscription.endDate).toLocaleDateString()}`
                }
              </p>
            )}
          </div>
        </CardContent>
        {currentPlanId === 'free' && (
          <CardFooter className="bg-primary/5 pt-4 pb-4 border-t border-primary/10">
            <div className="flex items-center gap-2 text-sm text-primary">
              <RiInformationLine className="size-4" />
              <span>You are approaching your video limit. Upgrade to unlock unlimited videos.</span>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* 2. Pricing Cards */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {dbPlans.map((plan) => {
            const isCurrentPlan = currentPlanId === plan.id
            const isCreator = plan.id === 'creator'
            const isDowngrade = currentPlanData && plan.position < currentPlanData.position

            return (
              <Card 
                key={plan.id} 
                className={`flex flex-col ${isCreator ? 'border-primary shadow-sm relative overflow-hidden' : 'border-border'}`}
              >
                {isCreator && (
                  <div className="absolute top-0 inset-x-0 h-1 bg-primary" />
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {isCreator && (
                      <span className="inline-flex items-center rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                        Recommended
                      </span>
                    )}
                  </div>
                  <CardDescription className="pt-1 text-xs min-h-[32px]">
                    {plan.name} features and limits.
                  </CardDescription>
                  <div className="pt-3 flex items-baseline gap-x-1">
                    <span className="text-2xl font-bold tracking-tight text-foreground">
                      Rp {plan.price.toLocaleString('id-ID')}
                    </span>
                    <span className="text-xs font-medium leading-6 text-muted-foreground">/MO</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 pb-6">
                  <ul className="space-y-2.5 text-xs text-muted-foreground">
                    {plan.features?.map((feature: PlanFeature, i: number) => (
                      <li key={i} className={`flex gap-x-2.5 items-start ${feature.highlight ? 'text-foreground font-medium' : ''}`}>
                        <RiCheckLine className={`h-4 w-4 shrink-0 mt-0.5 ${isCreator ? 'text-primary' : 'text-muted-foreground/70'}`} />
                        <span>{feature.label}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    variant={isCurrentPlan ? "outline" : isDowngrade ? "ghost" : isCreator ? "default" : "secondary"}
                    disabled={isCurrentPlan || isDowngrade || isUpgrading !== null}
                    onClick={() => setTargetPlan(plan)}
                  >
                    {isCurrentPlan ? (
                      "Current Plan"
                    ) : isDowngrade ? (
                      <span className="text-muted-foreground">Downgrade Unavailable</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {plan.id !== 'free' && <RiFlashlightLine className="size-4" />}
                        Upgrade to {plan.name}
                      </span>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>
      {/* 3. Transaction History */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight mb-4">Transaction History</h2>
        <Card className="border-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <p className="text-sm text-muted-foreground">No transactions found.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Upgrade your plan to see your billing history here.</p>
              </div>
            ) : (
              <div className="w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">Date</th>
                      <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">Plan ID</th>
                      <th className="h-12 px-6 text-left align-middle font-medium text-muted-foreground">Amount</th>
                      <th className="h-12 px-6 text-right align-middle font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-6 align-middle">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-6 align-middle capitalize">{tx.planId}</td>
                        <td className="p-6 align-middle font-mono">Rp {tx.amount.toLocaleString('id-ID')}</td>
                        <td className="p-6 text-right align-middle">
                          <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                            tx.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Premium Upgrade Modal */}
      <Dialog open={!!targetPlan} onOpenChange={(open) => !open && !isUpgrading && setTargetPlan(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-semibold tracking-tight">Upgrade Plan</DialogTitle>
          </DialogHeader>

            {/* Visual Transition Block */}
            <div className="flex items-stretch rounded-xl overflow-hidden border border-border bg-muted/30 relative">
              
              {/* Left Block - Current Plan */}
              <div className="flex-1 p-5 flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{currentPlanData?.name || 'Free'}</h3>
                  <Badge variant="outline" className="text-[10px] h-5 rounded-full px-2 font-medium">Current Plan</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Monthly Plan</p>
                <p className="text-xs text-muted-foreground mt-1">Expires upon upgrade</p>
              </div>

              {/* Arrow Connector */}
              <div className="w-12 flex items-center justify-center relative z-10 -mx-3">
                <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
                  <RiArrowRightLine className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {/* Right Block - Target Plan */}
              <div className="flex-1 p-5 flex flex-col justify-center bg-primary/5 border-l border-border relative overflow-hidden">
                <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-primary">{targetPlan?.name}</h3>
                    <Badge variant="secondary" className="text-[10px] h-5 rounded-full px-2 font-medium bg-primary/10 text-primary border-0 hover:bg-primary/20">Upgrading</Badge>
                  </div>
                  <p className="text-xs text-primary/70 mt-1.5">Monthly Plan</p>
                  <p className="text-xs text-foreground font-medium mt-1">Effective immediately</p>
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="mt-8 px-1">
              <h4 className="font-medium text-sm mb-4 text-foreground/80 tracking-wide uppercase">Payment Summary</h4>
              
              <div className="space-y-3 pb-4 border-b border-border">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Upgrade Fee</span>
                  <span className="font-medium text-foreground">Rp {targetPlan?.price.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Credits</span>
                  <span className="font-medium text-foreground">-Rp 0</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-medium text-foreground">-Rp 0</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 mt-2 border-t border-border/40">
                <span className="font-semibold text-foreground">Total Due</span>
                <span className="text-xl font-bold text-primary">Rp {targetPlan?.price.toLocaleString('id-ID')}</span>
              </div>
            </div>

          <DialogFooter className="mt-4 sm:justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => setTargetPlan(null)}
              disabled={!!isUpgrading}
              className="min-w-[100px]"
            >
              Cancel
            </Button>
            <Button 
              variant="default"
              onClick={() => handleUpgrade(targetPlan?.id || '')}
              disabled={!!isUpgrading}
              className="min-w-[140px]"
            >
              {isUpgrading ? (
                <>
                  <RiLoader4Line className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : "Confirm Upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
