"use client";

import Image from "next/image";

type BrandLogoProps = {
  className: string;
  width: number;
  height: number;
  priority?: boolean;
};

export function BrandLogo({ className, width, height, priority }: BrandLogoProps) {
  return (
    <>
      <Image
        src="/logo.png"
        alt="EvolvNex"
        width={width}
        height={height}
        className={`hidden dark:block ${className}`}
        priority={priority}
      />
      <Image
        src="/logo-dark.png"
        alt="EvolvNex"
        width={width}
        height={height}
        className={`block dark:hidden ${className}`}
        priority={priority}
      />
    </>
  );
}
