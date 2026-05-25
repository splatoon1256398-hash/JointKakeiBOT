"use client";

import { useEffect, useState, ReactNode } from "react";
import Image from "next/image";

interface CharacterImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  fallback?: ReactNode;
  priority?: boolean;
  loading?: "eager" | "lazy";
  sizes?: string;
  unoptimized?: boolean;
}

export function CharacterImage({
  src,
  alt,
  width,
  height,
  className,
  fallback,
  priority = false,
  loading,
  sizes,
  unoptimized = false,
}: CharacterImageProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  if (error) return <>{fallback}</>;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      loading={loading}
      sizes={sizes}
      unoptimized={unoptimized}
      onError={() => setError(true)}
    />
  );
}
