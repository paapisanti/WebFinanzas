export default function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="h-10 w-10 shrink-0 rounded-full bg-brass text-ink text-2xl leading-none font-semibold flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass">+</button>
  )
}
