'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { VisualAsset } from '../game/types';

export function Artwork({ asset, fallback, className = '', contain = false, priority = false }: {
  asset: VisualAsset; fallback: VisualAsset; className?: string; contain?: boolean; priority?: boolean;
}) {
  return <ArtworkImage key={asset.src} asset={asset} fallback={fallback} className={className} contain={contain} priority={priority} />;
}

function ArtworkImage({ asset, fallback, className, contain, priority }: {
  asset: VisualAsset; fallback: VisualAsset; className: string; contain: boolean; priority: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const image = failed ? fallback : asset;
  return <span className={`artwork ${className}`}>
    <Image src={image.src} alt={image.alt} fill unoptimized priority={priority}
      sizes="(max-width: 700px) 100vw, 40vw"
      style={{ objectFit: contain ? 'contain' : 'cover', objectPosition: image.position ?? '50% 50%' }}
      onError={() => { if (!failed) setFailed(true); }} />
  </span>;
}
