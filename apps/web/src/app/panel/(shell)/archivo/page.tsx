import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'Archivo' };

export default function Page() {
  return <Placeholder title="Archivo" />;
}
