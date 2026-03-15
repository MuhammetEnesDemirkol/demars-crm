import { createClient } from '@/lib/supabase/server'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Bell, ShoppingBag, CreditCard, MessageSquare, AlertTriangle } from 'lucide-react'

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; iconClass: string; bgClass: string }> = {
  new_order:        { icon: ShoppingBag,   iconClass: 'text-blue-600',   bgClass: 'bg-blue-50'   },
  payment_received: { icon: CreditCard,    iconClass: 'text-green-600',  bgClass: 'bg-green-50'  },
  new_message:      { icon: MessageSquare, iconClass: 'text-purple-600', bgClass: 'bg-purple-50' },
  escalation:       { icon: AlertTriangle, iconClass: 'text-red-600',    bgClass: 'bg-red-50'    },
  reminder:         { icon: Bell,          iconClass: 'text-orange-600', bgClass: 'bg-orange-50' },
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Bildirimler</h1>
      <div className="space-y-2">
        {notifications?.map(notif => {
          const config = typeConfig[notif.type] ?? typeConfig.new_message
          const Icon = config.icon
          return (
            <div key={notif.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4">
              <div className={`p-2 rounded-lg shrink-0 ${config.bgClass}`}>
                <Icon className={`h-4 w-4 ${config.iconClass}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-900">{notif.title}</p>
                {notif.body && <p className="text-sm text-slate-500 mt-0.5">{notif.body}</p>}
                <p className="text-xs text-slate-400 mt-2">
                  {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: tr })}
                </p>
              </div>
            </div>
          )
        })}
        {!notifications?.length && (
          <div className="text-center py-16 text-slate-400">Henüz bildirim yok</div>
        )}
      </div>
    </div>
  )
}
