import Sidebar from '@/components/navigation/sidebar'
import Navbar from '@/components/navigation/navbar'

export default function AppLayout({ children }) {
  return (
    <div className="flex w-full h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
