'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Giriş başarısız. Email veya şifrenizi kontrol edin.')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold">DM Asistan</CardTitle>
          <CardDescription>Firma paneline giriş yapın</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="firma@email.com"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
