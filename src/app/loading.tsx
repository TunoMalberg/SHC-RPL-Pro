/**
 * App-level Loading-Skelett. Zeigt sich, während das `force-dynamic`-Layout
 * + Provider hydratisieren. Hält die Seite optisch ruhig statt eines
 * weißen Flashs.
 */

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-red-50/30">
      <div className="border-b border-neutral-200 bg-white/90 backdrop-blur-sm h-16 animate-pulse" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="h-10 bg-slate-200/70 rounded-md animate-pulse w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
      <span className="sr-only">Wird geladen / Loading…</span>
    </div>
  );
}