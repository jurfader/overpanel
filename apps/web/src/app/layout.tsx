import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'OVERPANEL',
  description: 'VPS Control Panel',
  icons: {
    icon: [{ url: '/logo.png', type: 'image/png' }],
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-[#0A0A0F] text-[#F0F0F8] antialiased">
        {children}
      </body>
    </html>
  )
}
