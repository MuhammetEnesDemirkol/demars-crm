'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, MessageSquare, ShoppingBag, Bell, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard',               label: 'Genel Bakış',  icon: LayoutDashboard },
  { href: '/dashboard/conversations', label: 'Konuşmalar',   icon: MessageSquare   },
  { href: '/dashboard/orders',        label: 'Siparişler',   icon: ShoppingBag     },
  { href: '/dashboard/notifications', label: 'Bildirimler',  icon: Bell            },
  { href: '/dashboard/settings',      label: 'Ayarlar',      icon: Settings        },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 bg-white border-r flex flex-col h-full shrink-0">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-slate-900">DM Asistan</h1>
        <p className="text-xs text-slate-400 mt-0.5">Firma Paneli</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-slate-500 hover:text-slate-900"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Çıkış Yap
        </Button>
      </div>
    </aside>
  )
}
