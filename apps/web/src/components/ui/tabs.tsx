'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

/** Pestañas accesibles (flechas del teclado). <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">..</TabsTrigger></TabsList><TabsContent value="a">..</TabsContent></Tabs> */
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex gap-1 overflow-x-auto border-b border-accent-2', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-font-strong',
        'hover:text-accent-3 focus-visible:outline-none focus-visible:shadow-focus',
        'data-[state=active]:border-accent data-[state=active]:text-accent-3',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('pt-5 focus-visible:outline-none', className)}
      {...props}
    />
  );
}
