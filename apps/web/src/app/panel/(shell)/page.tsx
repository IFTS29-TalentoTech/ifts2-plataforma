import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'Resumen' };

export default function Page() {
  return <Placeholder title="Panel de control" />;
}
