import Link from 'next/link'

const tabs = [
  { href: '/dashboard/settings',          label: 'Firma Bilgileri' },
  { href: '/dashboard/settings/products', label: 'Ürünler'         },
  { href: '/dashboard/settings/faqs',     label: 'SSS'             },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Ayarlar</h1>
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {tabs.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-400 transition-colors -mb-px"
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  )
}
