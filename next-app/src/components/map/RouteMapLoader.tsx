'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const RouteMap = dynamic(
  () => import('@/components/map/RouteMap').then((mod) => mod.RouteMap),
  { ssr: false }
);

function MapLoadingPlaceholder() {
  return (
    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

export function RouteMapLoader() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <MapLoadingPlaceholder />;
  }

  return <RouteMap />;
}