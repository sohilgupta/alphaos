import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') {
    redirect('/login');
  }

  redirect('/dashboard?filter=PORTFOLIO');
}
