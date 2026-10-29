import { Placeholder } from '@/components/layout/page-header';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Placeholder
      title="Publicación"
      description={`En construcción. Detalle de la publicación ${id}.`}
    />
  );
}
