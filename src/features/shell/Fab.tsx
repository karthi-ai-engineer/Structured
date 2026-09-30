import { Plus } from 'lucide-react'

/** The floating "+" button on phones (desktop uses the header buttons). */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed right-5 bottom-24 z-30 flex size-14 items-center justify-center rounded-full bg-[#FF6B6B] text-white shadow-lg transition-transform motion-safe:active:scale-95 lg:hidden"
    >
      <Plus className="size-6" />
    </button>
  )
}
