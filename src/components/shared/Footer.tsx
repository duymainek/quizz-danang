export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-center text-xs text-slate-400 py-4 ${className}`}>
      Phát triển bởi <span className="font-medium text-slate-500">@bu</span>
    </footer>
  );
}
