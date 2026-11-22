export function SellerStatusTabs({ label, tabs, value, onChange }: { label: string; tabs: readonly { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <div role="group" aria-label={label} className="divider mb-2 flex">
    {tabs.map(tab => <button type="button" key={tab.value} aria-pressed={value === tab.value} onClick={() => onChange(tab.value)} className={`min-h-11 min-w-0 flex-1 whitespace-nowrap border-b-2 text-center ${tabs.length > 4 ? 'text-label' : 'text-subhead'} ${value === tab.value ? 'border-ink font-bold text-ink' : 'border-transparent font-normal text-muted'}`}>{tab.label}</button>)}
  </div>;
}
