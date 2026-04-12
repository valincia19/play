import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { RiQrScan2Line, RiArrowLeftLine, RiTimeLine, RiLoader4Line, RiDownloadLine, RiPrinterLine } from "@remixicon/react"
import QRCode from "react-qr-code"

export function DashboardInvoice() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [transaction, setTransaction] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState<string>("--:--")

  useEffect(() => {
    if (!id) return
    
    async function fetchInvoice() {
      try {
        const res = await api.getTransaction(id!)
        if (res.status === 'completed' || res.status === 'paid' || res.status === 'success') {
           toast.success("Payment Received! Redirecting...")
           navigate('/dashboard/billing')
           return
        }
        setTransaction(res)
      } catch (err) {
        toast.error("Invoice not found or expired.")
        navigate('/dashboard/billing')
      } finally {
        setIsLoading(false)
      }
    }

    fetchInvoice()
    
    // Polling status every 5 seconds
    const pollInterval = setInterval(async () => {
        try {
            const res = await api.getTransaction(id!)
            if (res.status === 'completed' || res.status === 'paid' || res.status === 'success') {
                clearInterval(pollInterval)
                toast.success("Payment successful!")
                setTimeout(() => navigate('/dashboard/billing'), 2000)
            }
        } catch (e) {}
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [id, navigate])

  // Timer countdown
  useEffect(() => {
    if (!transaction?.expiredAt) return
    const interval = setInterval(() => {
      const now = new Date().getTime()
      const end = new Date(transaction.expiredAt).getTime()
      const distance = end - now
      if (distance <= 0) {
        clearInterval(interval)
        setTimeLeft("Expired")
      } else {
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((distance % (1000 * 60)) / 1000)
        setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [transaction?.expiredAt])

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <RiLoader4Line className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl pb-12 pt-4">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/dashboard/billing')} className="h-9 w-9">
            <RiArrowLeftLine className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Invoice Details</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono">#{id?.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9"><RiDownloadLine className="size-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9"><RiPrinterLine className="size-4" /></Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <Card className="border-border/60 bg-card overflow-hidden h-fit">
          <div className="bg-primary/5 py-4 border-b border-border/50 text-center">
             <h2 className="font-bold text-primary flex items-center justify-center gap-2">
                <RiQrScan2Line className="size-5" />
                QRIS Payment
             </h2>
          </div>
          <CardContent className="pt-8 pb-8 flex flex-col items-center">
             <div className="p-4 bg-white rounded-2xl shadow-sm ring-1 ring-black/5 mb-6">
                <QRCode 
                  value={transaction?.paymentNumber || "WAITING"} 
                  size={180}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  viewBox={`0 0 256 256`}
                />
             </div>
             <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 rounded-full text-sm font-semibold mb-2">
                <RiTimeLine className="size-4" />
                {timeLeft}
             </div>
             <p className="text-[10px] text-muted-foreground max-w-[200px] text-center italic">
                Scan the QR code above with any payment app that supports QRIS.
             </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
               <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-bold capitalize">{transaction?.planName}</span>
               </div>
               <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-bold text-amber-500 capitalize">{transaction?.status}</span>
               </div>
               <div className="pt-2 border-t border-border flex justify-between items-baseline">
                  <span className="text-base font-bold">Total</span>
                  <span className="text-2xl font-black text-primary">
                    Rp {transaction?.totalPayment?.toLocaleString('id-ID')}
                  </span>
               </div>
            </CardContent>
          </Card>

          <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed">
             <strong>Confirmation:</strong> Your subscription will be updated automatically. Please do not close this page until the payment is detected, or you can go back to billing to check status later.
          </div>
        </div>
      </div>
    </div>
  )
}
