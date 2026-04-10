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
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminTransaction } from '@/lib/types'

export function StudioTransactions() {
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const res = await adminApi.getTransactions()
      setTransactions(res || [])
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground mt-1">Audit all billing receipts, giveaways, and subscription cycles.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Comprehensive log of all payment events.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User Email</TableHead>
                    <TableHead>Plan Assigned</TableHead>
                    <TableHead>Amount (IDR)</TableHead>
                    <TableHead>Type & Status</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">{tx.user?.email || tx.userId}</TableCell>
                      <TableCell className="capitalize">{tx.planId}</TableCell>
                      <TableCell>Rp {tx.amount.toLocaleString('id-ID')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={tx.type === 'give' ? 'secondary' : tx.type === 'renew' ? 'outline' : 'default'} className="uppercase text-[10px] tracking-wider">
                            {tx.type}
                          </Badge>
                          <Badge variant={tx.status === 'success' ? 'outline' : 'destructive'} className="uppercase text-[10px] tracking-wider">
                            {tx.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {new Date(tx.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No transactions found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
