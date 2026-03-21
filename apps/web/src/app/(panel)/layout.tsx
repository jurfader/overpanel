import { Sidebar } from '@/components/layout/sidebar'
import { PermissionGuard } from '@/components/layout/permission-guard'

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-0 md:ml-60 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <PermissionGuard>{children}</PermissionGuard>
        </main>
      </div>
    </div>
  )
}
