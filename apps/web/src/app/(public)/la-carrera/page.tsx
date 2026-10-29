import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'La carrera' };

export default function Page() {
  return <Placeholder title="La carrera" />;
}
