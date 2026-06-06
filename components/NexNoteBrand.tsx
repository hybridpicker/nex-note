type NexNoteBrandProps = {
  compact?: boolean;
  className?: string;
};

export function NexNoteIcon({ className = 'h-7 w-auto' }: { className?: string }) {
  return (
    <img
      src="/brand/nex-note-icon.png"
      alt=""
      aria-hidden="true"
      className={`${className} object-contain`}
      draggable={false}
    />
  );
}

export default function NexNoteBrand({ compact = false, className = '' }: NexNoteBrandProps) {
  if (compact) {
    return <NexNoteIcon className={`h-[22px] w-auto ${className}`} />;
  }
  return (
    <img
      src="/brand/nex-note-logo.png"
      alt="nex-note"
      className={`h-[32px] w-auto object-contain ${className}`}
      draggable={false}
    />
  );
}
