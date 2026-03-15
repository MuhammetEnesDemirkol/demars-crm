'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Firm = {
  id: string
  name: string
  iban: string | null
  iban_holder_name: string | null
  shipping_instructions: string | null
  whatsapp_phone: string
  instagram_handle: string | null
}

export default function SettingsPage() {
  const [firm, setFirm] = useState<Firm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('firms').select('id,name,iban,iban_holder_name,shipping_instructions,whatsapp_phone,instagram_handle').single()
      .then(({ data }) => setFirm(data))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firm) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('firms').update({
      name: firm.name,
      iban: firm.iban,
      iban_holder_name: firm.iban_holder_name,
      shipping_instructions: firm.shipping_instructions,
      instagram_handle: firm.instagram_handle,
    }).eq('id', firm.id)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!firm) return <div className="animate-pulse text-slate-400 text-sm">Yükleniyor...</div>

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Firma Bilgileri</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Firma Adı</Label>
            <Input value={firm.name ?? ''} onChange={e => setFirm({ ...firm, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>WhatsApp Numarası</Label>
            <Input value={firm.whatsapp_phone} disabled className="bg-slate-50" />
            <p className="text-xs text-slate-400">WhatsApp numarası değiştirilemez</p>
          </div>
          <div className="space-y-1">
            <Label>Instagram Hesabı</Label>
            <Input
              value={firm.instagram_handle ?? ''}
              onChange={e => setFirm({ ...firm, instagram_handle: e.target.value })}
              placeholder="@hesap_adi"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ödeme Bilgileri</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>IBAN</Label>
            <Input
              value={firm.iban ?? ''}
              onChange={e => setFirm({ ...firm, iban: e.target.value })}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
            />
          </div>
          <div className="space-y-1">
            <Label>IBAN Ad Soyad</Label>
            <Input
              value={firm.iban_holder_name ?? ''}
              onChange={e => setFirm({ ...firm, iban_holder_name: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kargo & Teslimat</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={firm.shipping_instructions ?? ''}
            onChange={e => setFirm({ ...firm, shipping_instructions: e.target.value })}
            placeholder="Kargo firması, teslimat süresi, ücretsiz kargo limiti..."
            rows={4}
          />
        </CardContent>
      </Card>

      <Button type="submit" disabled={saving}>
        {saved ? '✓ Kaydedildi' : saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
      </Button>
    </form>
  )
}
