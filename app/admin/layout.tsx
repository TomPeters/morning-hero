import { getSession } from '@/lib/session';
import AdminPinForm from './AdminPinForm';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.adminAuthed) {
    return <AdminPinForm />;
  }
  return <>{children}</>;
}
