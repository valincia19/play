import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { RiQrScan2Line, RiPaypalLine, RiBankCardLine, RiBitCoinLine, RiArrowLeftLine, RiSecurePaymentLine, RiLoader4Line } from "@remixicon/react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const PAYMENT_METHODS = [
  { id: 'qris', name: 'QRIS', icon: RiQrScan2Line, desc: 'Instant QR payment (IDR)' },
  { id: 'card', name: 'Debit/Credit Card', icon: RiBankCardLine, desc: 'Visa, Mastercard, JCB', disabled: true },
  { id: 'paypal', name: 'PayPal', icon: RiPaypalLine, desc: 'Pay via PayPal', disabled: true },
  { id: 'crypto', name: 'Crypto', icon: RiBitCoinLine, desc: 'BTC, ETH, USDT', disabled: true },
]

export function DashboardCheckout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMethod, setSelectedMethod] = useState('qris')
  
  const [plans, setPlans] = useState<any[]>([])
  const [subscription, setSubscription] = useState<any>(null)

  const searchParams = new URLSearchParams(location.search)
  const planId = searchParams.get('planId') || ''
  
  useEffect(() => {
    if (!planId) {
      toast.error("No valid plan selected. Redirecting back to billing.")
      navigate('/dashboard/billing')
      return
    }

    async function fetchData() {
      try {
        const [remotePlans, sub] = await Promise.all([
          api.getPlans(),
          api.getSubscription()
        ])
        setPlans(remotePlans as any[])
        setSubscription(sub)
      } catch (err) {
        toast.error("Failed to load checkout details.")
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchData()
  }, [planId, navigate])

  const handlePayment = async () => {
    setIsProcessing(true)
    try {
      const res = await api.createCheckoutSession(planId) as { paymentUrl: string }
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl
      } else {
        toast.error("Failed to generate payment URL")
        setIsProcessing(false)
      }
    } catch (err: any) {
      toast.error(err.message || "Payment failed")
      setIsProcessing(false)
    }
  }

  if (!planId) return null

  // Calculate trusted amounts locally
  let amountDue = 0
  let targetPlanName = planId
  let planPrice = 0
  
  if (!isLoading && plans.length > 0) {
    const targetPlan = plans.find(p => p.id === planId)
    if (targetPlan) {
      targetPlanName = targetPlan.name
      planPrice = targetPlan.price
      
      let proratedDiscount = 0
      const currentPlanId = (subscription && subscription.status === 'active') ? subscription.planId : 'free'
      const currentPlanData = plans.find(p => p.id === currentPlanId)

      if (currentPlanData && currentPlanData.price > 0 && subscription?.status === 'active' && subscription.endDate) {
        const end = new Date(subscription.endDate).getTime()
        const now = Date.now()
        if (end > now) {
          const remainingDays = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)))
          const maxDays = 30
          proratedDiscount = Math.floor((Math.min(remainingDays, maxDays) / maxDays) * currentPlanData.price)
        }
      }

      if (proratedDiscount > targetPlan.price) proratedDiscount = targetPlan.price
      amountDue = Math.max(0, targetPlan.price - proratedDiscount)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8 pt-2">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <RiArrowLeftLine className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Checkout</h1>
          <p className="text-sm text-muted-foreground">Select a payment method.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        {/* Left Column: Payment Methods */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Payment Method</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {PAYMENT_METHODS.map(method => {
              const Icon = method.icon
              const isSelected = selectedMethod === method.id
              const isDisabled = method.disabled
              
              return (
                <div
                  key={method.id}
                  onClick={() => !isDisabled && setSelectedMethod(method.id)}
                  className={`relative flex flex-col p-4 rounded-xl border-2 transition-all ${
                    isDisabled ? 'cursor-not-allowed opacity-60 border-border/40 bg-muted/20' : 'cursor-pointer'
                  } ${
                    isSelected && !isDisabled
                      ? 'border-primary bg-primary/5 shadow-sm' 
                      : !isDisabled ? 'border-border/60 bg-card hover:border-primary/50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/50">
                    <Icon className={`size-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className={`size-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'}`}>
                      {isSelected && <div className="size-2 rounded-full bg-primary" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold ${isSelected ? 'text-primary' : ''}`}>{method.name}</h3>
                    {isDisabled && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 font-medium bg-muted text-muted-foreground">
                        Maintenance
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{method.desc}</p>
                </div>
              )
            })}
          </div>
          
          <div className="rounded-xl border border-border/60 bg-card p-4 flex gap-3 text-sm text-muted-foreground mt-2">
            <RiSecurePaymentLine className="size-5 shrink-0 text-emerald-500" />
            <p className="leading-snug">Payments are 100% secure and encrypted. We do not store your full card details.</p>
          </div>
        </div>

        {/* Right Column: Order Summary */}
        <div>
          <Card className="sticky top-6 border-border/60 bg-card shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                Order Summary
                <Badge variant="secondary" className="px-1.5 uppercase font-medium bg-primary/10 text-primary border-0">Upgrade</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-6 w-full mt-4" />
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center pb-3 border-b border-border">
                    <span className="text-muted-foreground capitalize font-medium">{targetPlanName} Plan</span>
                    <span className="font-medium text-foreground">Rp {planPrice.toLocaleString('id-ID')}</span>
                  </div>
                  
                  {planPrice > amountDue && (
                    <div className="flex justify-between items-center pb-3 border-b border-border">
                      <span className="text-muted-foreground">Prorated Credit</span>
                      <span className="font-medium text-emerald-500">-Rp {(planPrice - amountDue).toLocaleString('id-ID')}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-lg font-bold text-primary pt-1">
                    <span>Total Due</span>
                    <span>Rp {amountDue.toLocaleString('id-ID')}</span>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handlePayment} 
                disabled={isProcessing || isLoading} 
                className="w-full h-11 relative overflow-hidden text-base shadow-lg shadow-primary/20"
              >
                {isProcessing || isLoading ? (
                  <>
                    <RiLoader4Line className="mr-2 size-5 animate-spin" />
                    {isProcessing ? 'Processing Payment...' : 'Loading...'}
                  </>
                ) : (
                  <span className="flex items-center font-bold tracking-wide">
                    Pay Rp {amountDue.toLocaleString('id-ID')}
                  </span>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
