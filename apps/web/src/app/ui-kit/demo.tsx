'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Eyebrow,
  Input,
  Pagination,
  Select,
  Skeleton,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TR,
  useConfirm,
  useToast,
} from '@/components/ui';

export function UiKitDemo() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const confirm = useConfirm();
  const { toast } = useToast();

  return (
    <main
      id="contenido"
      className="mx-auto flex max-w-container flex-col gap-10 px-gutter py-10 lg:px-gutter-lg"
    >
      <header>
        <Eyebrow>Sistema de diseño</Eyebrow>
        <h1 className="font-display text-3xl font-extrabold">Kit de UI</h1>
        <p className="text-font-strong">
          Todos los colores y fuentes salen de variables CSS (src/styles/tokens.css).
        </p>
      </header>

      <section aria-labelledby="botones" className="flex flex-col gap-3">
        <h2 id="botones" className="font-display text-xl font-bold">
          Botones e insignias
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="danger">Peligro</Button>
          <Button variant="ghost">Texto</Button>
          <Button loading>Guardando</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success">En línea</Badge>
          <Badge tone="warning">Por vencer</Badge>
          <Badge tone="danger">Descartada</Badge>
          <Badge tone="neutral">Mesas</Badge>
          <Badge tone="urgent">Urgente</Badge>
        </div>
      </section>

      <section aria-labelledby="tarjetas" className="grid gap-4 md:grid-cols-2">
        <h2 id="tarjetas" className="font-display text-xl font-bold md:col-span-2">
          Tarjetas
        </h2>
        <Card accentBar>
          <CardTitle>Plan de estudios</CardTitle>
          <CardDescription>Tarjeta con filete lateral del sitio público.</CardDescription>
        </Card>
        <Card>
          <Eyebrow>Avisos activos</Eyebrow>
          <p className="font-display text-3xl font-extrabold">4</p>
          <CardDescription>Tarjeta del Resumen del panel.</CardDescription>
        </Card>
      </section>

      <section aria-labelledby="formularios" className="grid gap-4 md:grid-cols-2">
        <h2 id="formularios" className="font-display text-xl font-bold md:col-span-2">
          Campos
        </h2>
        <Input label="Título del aviso" hint="Máximo 160 caracteres." required />
        <Input label="Correo" error="El correo no tiene un formato válido." defaultValue="ana@" />
        <Textarea label="Texto" className="md:col-span-2" />
        <Select
          label="Destinatario"
          options={[
            { value: 'ALL', label: 'Todos' },
            { value: 'STUDENTS', label: 'Estudiantes' },
          ]}
        />
        <div className="flex flex-col justify-end gap-3">
          <Checkbox label="Confirmo que existe consentimiento para publicar imágenes" />
          <Switch label="Inscripciones a mesas habilitadas" />
        </div>
      </section>

      <section aria-labelledby="dialogos" className="flex flex-col gap-3">
        <h2 id="dialogos" className="font-display text-xl font-bold">
          Diálogos y avisos
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setDialogOpen(true)}>Abrir formulario modal</Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Confirmar (controlado)
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await confirm({
                title: '¿Eliminar el aviso?',
                description: 'Esta acción no se puede deshacer y queda registrada en la auditoría.',
                details: <>Título: Entrega de trabajos prácticos</>,
                tone: 'danger',
                confirmLabel: 'Sí, eliminar',
              });
              toast({
                title: ok ? 'Aviso eliminado' : 'Se canceló la eliminación',
                tone: ok ? 'success' : 'info',
              });
            }}
          >
            Confirmar (imperativo)
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast({
                title: 'Aviso publicado',
                description: 'Ya se ve en Estudiantes.',
                tone: 'success',
              })
            }
          >
            Mostrar aviso breve
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="¿Confirmar publicación?"
          description="El aviso se hará visible de inmediato en la cartelera de estudiantes."
          details={<>Título: Evento Jornada Gastronómica</>}
          confirmLabel="Sí, publicar ahora"
          cancelLabel="Revisar"
          onConfirm={() => toast({ title: 'Publicado', tone: 'success' })}
        />
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Nuevo aviso"
          description="Completá los datos del comunicado."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Guardar</Button>
            </>
          }
        >
          <Input label="Título" required />
        </Dialog>
      </section>

      <section aria-labelledby="tablas" className="flex flex-col gap-4">
        <h2 id="tablas" className="font-display text-xl font-bold">
          Tabla, pestañas y paginación
        </h2>
        <Table caption="Documentos archivados">
          <THead>
            <TR>
              <TH>Documento</TH>
              <TH>Ciclo</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD>Calendario de mesas — Diciembre 2025</TD>
              <TD>2025</TD>
              <TD>
                <Badge tone="neutral">Archivado</Badge>
              </TD>
            </TR>
          </TBody>
        </Table>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Pendientes</TabsTrigger>
            <TabsTrigger value="b">Descartadas</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Publicaciones pendientes.</TabsContent>
          <TabsContent value="b">Publicaciones descartadas.</TabsContent>
        </Tabs>
        <Pagination page={page} pageSize={20} total={95} onPageChange={setPage} />
      </section>

      <section aria-labelledby="estados" className="grid gap-4 md:grid-cols-3">
        <h2 id="estados" className="font-display text-xl font-bold md:col-span-3">
          Estados
        </h2>
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <EmptyState
          title="Sin avisos"
          description="Todavía no hay avisos cargados."
          action={<Button>Nuevo aviso</Button>}
        />
        <ErrorState onRetry={() => toast({ title: 'Reintentando…', tone: 'info' })} />
      </section>
    </main>
  );
}
