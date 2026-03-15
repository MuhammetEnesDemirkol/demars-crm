import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'

const statusConfig: Record<string, { label: string; className: string }> = {
  draft:            { label: 'Taslak',           className: 'bg-slate-100 text-slate-600'    },
  pending_payment:  { label: 'Ödeme Bekleniyor', className: 'bg-yellow-100 text-yellow-800'  },
  payment_received: { label: 'Ödeme Alındı',     className: 'bg-green-100 text-green-800'    },
  processing:       { label: 'Hazırlanıyor',     className: 'bg-blue-100 text-blue-800'      },
  shipped:          { label: 'Kargoda',          className: 'bg-purple-100 text-purple-800'  },
  delivered:        { label: 'Teslim Edildi',    className: 'bg-emerald-100 text-emerald-800'},
  cancelled:        { label: 'İptal',            className: 'bg-red-100 text-red-800'        },
}

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('*, customers(display_name, whatsapp_phone)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Siparişler</h1>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Sipariş No', 'Müşteri', 'Ürün', 'Durum', 'Tutar', 'Tarih'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders?.map(order => {
              const customer = order.customers as { display_name?: string; whatsapp_phone: string } | null
              const status = statusConfig[order.status] ?? statusConfig.pending_payment
              const details = order.product_details as { product_name?: string } | null
              return (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.order_number}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{customer?.display_name ?? '-'}</p>
                    <p className="text-xs text-slate-400">{customer?.whatsapp_phone}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{details?.product_name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900">
                    {order.payment_amount
                      ? `₺${Number(order.payment_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {format(new Date(order.created_at), 'd MMM, HH:mm', { locale: tr })}
                  </td>
                </tr>
              )
            })}
            {!orders?.length && (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-400">Henüz sipariş yok</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
