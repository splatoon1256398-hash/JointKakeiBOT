"use client";

import { useState, ReactNode } from "react";
import Image from "next/image";

interface CharacterImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  fallback: ReactNode;
}

export function CharacterImage({ src, alt, width, height, className, fallback }: CharacterImageProps) {
  const [error, setError] = useState(false);

  if (error) return <>{fallback}</>;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={() => setError(true)}
    />
  );
}
