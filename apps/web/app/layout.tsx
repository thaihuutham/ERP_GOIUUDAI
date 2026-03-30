import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { UserRoleProvider } from '../components/user-role-context';

export const metadata: Metadata = {
  title: 'Retail ERP • SaaS Ready',
  description: 'ERP retail đa module với kiến trúc SaaS-ready shared schema và tenant isolation.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <UserRoleProvider>
          <AppShell>{children}</AppShell>
        </UserRoleProvider>
      </body>
    </html>
  );
}
