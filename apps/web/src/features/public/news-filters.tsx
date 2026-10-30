'use client';

/**
 * Filtros de Novedades (año y categoría). Es un formulario GET común: funciona sin JavaScript
 * (botón "Filtrar") y, con JavaScript, se envía solo al cambiar un desplegable.
 * Se usan <select> nativos (teclado y lectores de pantalla resueltos por el navegador) con los
 * mismos estilos de borde y foco del kit. Las opciones vienen de la API (`availableYears`, `categories`).
 */
import { useRef } from 'react';
import { Button } from '@/components/ui';

const selectCls =
  'min-h-11 w-full rounded-md border border-primary bg-surface px-3 py-2.5 text-sm font-medium text-accent-3 ' +
  'focus-visible:outline-none focus-visible:shadow-focus sm:w-auto';

export function NewsFilters({
  years,
  categories,
  year,
  category,
  archived,
}: {
  years: number[];
  categories: { id: string; name: string }[];
  year: number | null;
  category: string | null;
  archived: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();
  return (
    <form
      ref={formRef}
      method="get"
      action="/novedades"
      aria-label="Filtrar novedades"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {archived && <input type="hidden" name="archived" value="true" />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-year" className="text-sm font-semibold text-accent-3">
          Año
        </label>
        <select
          id="f-year"
          name="year"
          defaultValue={year ?? ''}
          onChange={submit}
          className={selectCls}
        >
          <option value="">{archived ? 'Año en curso' : 'Todos los años'}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-cat" className="text-sm font-semibold text-accent-3">
          Categoría
        </label>
        <select
          id="f-cat"
          name="category"
          defaultValue={category ?? ''}
          onChange={submit}
          className={selectCls}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
    </form>
  );
}
