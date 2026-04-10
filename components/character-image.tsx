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
      onError={() => setError(true)}
    />
  );
}
