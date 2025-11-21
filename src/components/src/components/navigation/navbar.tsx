// AvilloOS Navbar Placeholder
export default function Navbar() {
  return (
    <header className="w-full h-16 bg-[#0f1522] text-[#f5f1e8] flex items-center justify-end px-6">
      <div className="flex items-center gap-4">
        <button className="hover:text-primary">Theme</button>
        <button className="hover:text-primary">Account</button>
      </div>
    </header>
  );
}
