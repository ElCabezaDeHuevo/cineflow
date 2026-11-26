export default function Loading() {
  return (
    <main className="cf-route-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando la ventana…</span>
      <section aria-hidden="true" className="cf-route-loading-content">
        <div className="cf-route-loading-heading">
          <div className="cf-route-skeleton cf-route-skeleton-kicker" />
          <div className="cf-route-skeleton cf-route-skeleton-title" />
          <div className="cf-route-skeleton cf-route-skeleton-copy" />
        </div>
        <div className="cf-route-loading-grid">
          <div className="cf-route-skeleton cf-route-skeleton-panel" />
          <div className="cf-route-skeleton cf-route-skeleton-panel" />
          <div className="cf-route-skeleton cf-route-skeleton-panel cf-route-skeleton-wide" />
        </div>
        <div className="cf-route-loading-progress"><span /></div>
      </section>
    </main>
  );
}
