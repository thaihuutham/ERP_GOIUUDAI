import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { AccessPolicyProvider } from '../components/access-policy-context';
import { UserRoleProvider } from '../components/user-role-context';
import { SYSTEM_PROFILE } from '../lib/system-profile';

export const metadata: Metadata = {
  title: `${SYSTEM_PROFILE.systemName} • ${SYSTEM_PROFILE.companyName}`,
  description: `${SYSTEM_PROFILE.businessDomain} • ${SYSTEM_PROFILE.scale} • ${SYSTEM_PROFILE.governanceVision}.`
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <UserRoleProvider>
          <AccessPolicyProvider>
            <AppShell>{children}</AppShell>
          </AccessPolicyProvider>
        </UserRoleProvider>
      </body>
    </html>
  );
}
