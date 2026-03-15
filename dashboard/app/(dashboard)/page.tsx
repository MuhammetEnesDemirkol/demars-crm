import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, ShoppingBag, Bell, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: firm } = await supabase.from('firms').select('name').single()

  const [
    { count: totalOrders },
    { count: pendingOrders },
    { count: activeConvs },
    { count: unreadNotifs },
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending_payment'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).in('state', ['active', 'awaiting_address', 'awaiting_payment']),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false),
  ])

  const stats = [
    { label: 'Toplam Sipariş',     value: totalOrders   ?? 0, icon: ShoppingBag,  color: 'text-blue-600'   },
    { label: 'Ödeme Bekleniyor',   value: pendingOrders  ?? 0, icon: TrendingUp,   color: 'text-yellow-600' },
    { label: 'Aktif Konuşma',      value: activeConvs    ?? 0, icon: MessageSquare, color: 'text-green-600'  },
    { label: 'Okunmamış Bildirim', value: unreadNotifs   ?? 0, icon: Bell,          color: 'text-orange-600' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Hoş geldiniz{firm?.name ? `, ${firm.name}` : ''} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-1">Bugünkü aktivite özetin</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
