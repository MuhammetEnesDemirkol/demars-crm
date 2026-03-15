'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Power } from 'lucide-react'

type Product = {
  id: string; firm_id: string; name: string; description: string | null; price: number | null;
  stock_status: string; category: string | null; is_active: boolean
}

const emptyProduct: Omit<Product, 'id' | 'firm_id'> = {
  name: '', description: '', price: null, stock_status: 'available', category: '', is_active: true
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [firmId, setFirmId] = useState<string>('')
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const [open, setOpen] = useState(false)

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: firm } = await supabase.from('firms').select('id').single()
    if (firm) setFirmId(firm.id)
    const { data } = await supabase.from('products').select('*').order('created_at')
    setProducts(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!editing) return
    if (editing.id) {
      await supabase.from('products').update(editing).eq('id', editing.id)
    } else {
      await supabase.from('products').insert({ ...editing, firm_id: firmId })
    }
    setOpen(false); setEditing(null); load()
  }

  const toggleActive = async (p: Product) => {
    await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    load()
  }

  return (
    <div className="max-w-3xl">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button onClick={() => setEditing(emptyProduct)}>
                <Plus className="h-4 w-4 mr-2" /> Ürün Ekle
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing?.id ? 'Ürünü Düzenle' : 'Yeni Ürün'}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label>Ürün Adı *</Label>
                  <Input value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Açıklama</Label>
                  <Textarea value={editing.description ?? ''} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Fiyat (₺)</Label>
                    <Input type="number" step="0.01" value={editing.price ?? ''} onChange={e => setEditing({ ...editing, price: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Kategori</Label>
                    <Input value={editing.category ?? ''} onChange={e => setEditing({ ...editing, category: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Stok Durumu</Label>
                  <Select value={(editing.stock_status ?? 'available') as string} onValueChange={(v: string | null) => setEditing({ ...editing, stock_status: v ?? 'available' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Mevcut</SelectItem>
                      <SelectItem value="out_of_stock">Stok Yok</SelectItem>
                      <SelectItem value="made_to_order">Sipariş Üzerine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={handleSave} disabled={!editing.name}>Kaydet</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {products.map(p => (
          <div key={p.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between transition-opacity ${!p.is_active ? 'opacity-50' : ''}`}>
            <div className="min-w-0">
              <p className="font-medium text-sm text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {p.category && `${p.category} · `}
                {p.price ? `₺${p.price}` : 'Fiyat girilmemiş'} ·{' '}
                {{available: 'Mevcut', out_of_stock: 'Stok Yok', made_to_order: 'Sipariş Üzerine'}[p.stock_status]}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true) }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toggleActive(p)} title={p.is_active ? 'Pasif yap' : 'Aktif yap'}>
                <Power className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {!products.length && <p className="text-slate-400 text-sm text-center py-8">Henüz ürün eklenmemiş</p>}
      </div>
    </div>
  )
}
