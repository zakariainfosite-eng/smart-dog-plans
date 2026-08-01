import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  alt?: string;
};

export function AppLogo({ className, alt = "CynoPlanning" }: AppLogoProps) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={352}
      height={352}
      decoding="async"
      className={cn("h-auto w-auto object-contain", className)}
    />
  );
}
