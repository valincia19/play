import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { RiQrScan2Line, RiPaypalLine, RiBankCardLine, RiBitCoinLine, RiArrowLeftLine, RiSecurePaymentLine, RiLoader4Line } from "@remixicon/react"
import { Badge } from "@/components/ui/badge"

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
  const [selectedMethod, setSelectedMethod] = useState('qris')
  
  const searchParams = new URLSearchParams(location.search)
  const planId = searchParams.get('planId') || ''
  const amountStr = searchParams.get('amount') || '0'
  const amountDue = parseInt(amountStr, 10)
  
  useEffect(() => {
    if (!planId) {
      toast.error("No valid plan selected. Redirecting back to billing.")
      navigate('/dashboard/billing')
    }
  }, [planId, navigate])

  const handlePayment = async () => {
    setIsProcessing(true)
    const tId = toast.loading("Processing your payment...")
    try {
      // Mock triggering real gateway/upgrade
      await api.upgradePlan(planId)
      toast.success("Payment successful! Your plan has been upgraded.", { id: tId })
      setTimeout(() => {
        window.location.href = '/dashboard/billing'
      }, 1500)
    } catch (err: any) {
      toast.error(err.message || "Payment failed", { id: tId })
      setIsProcessing(false)
    }
  }

  if (!planId) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
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
              <div className="flex justify-between items-center pb-3 border-b border-border">
                <span className="text-muted-foreground capitalize font-medium">{planId} Plan (Monthly)</span>
                <span className="font-medium text-foreground">Rp {amountDue.toLocaleString('id-ID')}</span>
              </div>
              
              <div className="flex justify-between items-center text-lg font-bold text-primary pt-1">
                <span>Total Due</span>
                <span>Rp {amountDue.toLocaleString('id-ID')}</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handlePayment} 
                disabled={isProcessing} 
                className="w-full h-11 relative overflow-hidden text-base shadow-lg shadow-primary/20"
              >
                {isProcessing ? (
                  <>
                    <RiLoader4Line className="mr-2 size-5 animate-spin" />
                    Processing Payment...
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
