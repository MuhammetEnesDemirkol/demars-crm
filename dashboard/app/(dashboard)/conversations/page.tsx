import { createClient } from '@/lib/supabase/server'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const stateConfig: Record<string, { label: string; className: string }> = {
  active:           { label: 'Aktif',            className: 'bg-green-50 text-green-700 border-green-200'   },
  awaiting_address: { label: 'Adres Bekleniyor', className: 'bg-yellow-50 text-yellow-700 border-yellow-200'},
  awaiting_payment: { label: 'Ödeme Bekleniyor', className: 'bg-blue-50 text-blue-700 border-blue-200'      },
  summarized:       { label: 'Tamamlandı',        className: 'bg-slate-50 text-slate-500 border-slate-200'  },
  escalated:        { label: 'Devredildi',        className: 'bg-red-50 text-red-700 border-red-200'        },
}

export default async function ConversationsPage() {
  const supabase = await createClient()
  const { data: conversations } = await supabase
    .from('conversations')
    .select('*, customers(display_name, whatsapp_phone)')
    .order('last_message_at', { ascending: false })
    .limit(100)

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Konuşmalar</h1>
      <div className="space-y-2">
        {conversations?.map(conv => {
          const customer = conv.customers as { display_name?: string; whatsapp_phone: string } | null
          const state = stateConfig[conv.state] ?? stateConfig.active
          return (
            <Link key={conv.id} href={`/dashboard/conversations/${conv.id}`}>
              <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-400 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">
                      {customer?.display_name ?? 'Müşteri'}
                    </p>
                    <p className="text-xs text-slate-400">{customer?.whatsapp_phone}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', state.className)}>
                      {state.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: tr })}
                    </span>
                  </div>
                </div>
                {conv.summary && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{conv.summary}</p>
                )}
              </div>
            </Link>
          )
        })}
        {!conversations?.length && (
          <div className="text-center py-16 text-slate-400">Henüz konuşma yok</div>
        )}
      </div>
    </div>
  )
}
