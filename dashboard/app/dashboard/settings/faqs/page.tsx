'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type FAQ = { id: string; firm_id: string; question: string; answer: string; category: string | null; is_active: boolean }

const emptyFaq: Omit<FAQ, 'id' | 'firm_id'> = { question: '', answer: '', category: '', is_active: true }

export default function FAQsPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [firmId, setFirmId] = useState<string>('')
  const [editing, setEditing] = useState<Partial<FAQ> | null>(null)
  const [open, setOpen] = useState(false)

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: firm } = await supabase.from('firms').select('id').single()
    if (firm) setFirmId(firm.id)
    const { data } = await supabase.from('faqs').select('*').order('created_at')
    setFaqs(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!editing) return
    if (editing.id) {
      await supabase.from('faqs').update({ question: editing.question, answer: editing.answer, category: editing.category }).eq('id', editing.id)
    } else {
      await supabase.from('faqs').insert({ ...editing, firm_id: firmId })
    }
    setOpen(false); setEditing(null); load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu soruyu silmek istiyor musunuz?')) return
    await supabase.from('faqs').delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-3xl">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button onClick={() => setEditing(emptyFaq)}>
                <Plus className="h-4 w-4 mr-2" /> Soru Ekle
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing?.id ? 'Soruyu Düzenle' : 'Yeni Soru'}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label>Soru *</Label>
                  <Input value={editing.question ?? ''} onChange={e => setEditing({ ...editing, question: e.target.value })} placeholder="Müşterilerin sıkça sorduğu soru" />
                </div>
                <div className="space-y-1">
                  <Label>Cevap *</Label>
                  <Textarea value={editing.answer ?? ''} onChange={e => setEditing({ ...editing, answer: e.target.value })} rows={4} placeholder="AI'ın vereceği cevap" />
                </div>
                <div className="space-y-1">
                  <Label>Kategori</Label>
                  <Input value={editing.category ?? ''} onChange={e => setEditing({ ...editing, category: e.target.value })} placeholder="kargo, ödeme, ürün..." />
                </div>
                <Button className="w-full" onClick={handleSave} disabled={!editing.question || !editing.answer}>Kaydet</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {faqs.map(faq => (
          <div key={faq.id} className="bg-white rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-sm text-slate-900">{faq.question}</p>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{faq.answer}</p>
                {faq.category && <span className="text-xs text-slate-400 mt-1 inline-block">{faq.category}</span>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(faq); setOpen(true) }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(faq.id)} className="text-red-400 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {!faqs.length && <p className="text-slate-400 text-sm text-center py-8">Henüz soru eklenmemiş</p>}
      </div>
    </div>
  )
}
