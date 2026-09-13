import AppShell from '../components/AppShell';

export default function Stub({ title }: { title: string }) {
  return (
    <AppShell tabs={[title]}>
      <section className="panel">
        <div className="stub">
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{title}</span>
          <span style={{ fontSize: 11 }}>Not designed yet.</span>
        </div>
      </section>
    </AppShell>
  );
}
