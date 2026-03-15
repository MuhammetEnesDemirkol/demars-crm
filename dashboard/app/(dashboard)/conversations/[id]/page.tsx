import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: conversation }, { data: messages }] = await Promise.all([
    supabase.from('conversations').select('*, customers(display_name, whatsapp_phone)').eq('id', id).single(),
    supabase.from('messages').select('*').eq('conversation_id', id).order('created_at'),
  ])

  if (!conversation) notFound()

  const customer = conversation.customers as { display_name?: string; whatsapp_phone: string } | null

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/conversations" className="text-slate-400 hover:text-slate-900">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{customer?.display_name ?? 'Müşteri'}</h1>
          <p className="text-sm text-slate-400">{customer?.whatsapp_phone}</p>
        </div>
      </div>

      {conversation.summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Özet</p>
          <p className="text-sm text-blue-900">{conversation.summary}</p>
        </div>
      )}

      <div className="space-y-3">
        {messages?.map(msg => (
          <div key={msg.id} className={cn('flex', msg.direction === 'inbound' ? 'justify-start' : 'justify-end')}>
            <div className={cn(
              'max-w-sm px-4 py-2.5 rounded-2xl text-sm',
              msg.direction === 'inbound'
                ? 'bg-white border border-slate-200 text-slate-900'
                : msg.sender_type === 'firm_owner'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-white'
            )}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={cn(
                'text-xs mt-1.5',
                msg.direction === 'inbound' ? 'text-slate-400' : 'text-white/60'
              )}>
                {format(new Date(msg.created_at), 'HH:mm', { locale: tr })}
                {msg.sender_type === 'ai' && ' · AI'}
              </p>
            </div>
          </div>
        ))}
        {!messages?.length && (
          <div className="text-center py-8 text-slate-400 text-sm">Mesaj bulunamadı</div>
        )}
      </div>
    </div>
  )
}
