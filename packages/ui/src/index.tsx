import type { ReactNode } from 'react';

export const ModuleCard = ({ title, description, children }: { title: string; description: string; children?: ReactNode }) => (
  <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
    <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
    <p style={{ color: '#475569' }}>{description}</p>
    {children}
  </section>
);
