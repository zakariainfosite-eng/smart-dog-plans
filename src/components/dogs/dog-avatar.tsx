import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { dogInitials } from "@/lib/dog-photo-api";
import { cn } from "@/lib/utils";

type DogAvatarProps = {
  name: string;
  photoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  specialty?: "narcotics" | "explosives" | "currency" | null;
};

export function DogAvatar({
  name,
  photoUrl,
  className,
  fallbackClassName,
  specialty,
}: DogAvatarProps) {
  const initials = dogInitials(name);
  const specialtyTone =
    specialty === "narcotics"
      ? "bg-emerald-500/10 text-emerald-700"
      : specialty === "explosives"
        ? "bg-red-500/10 text-red-700"
        : "bg-primary/10 text-primary";

  return (
    <Avatar className={cn("overflow-hidden border border-border/60", className)}>
      {photoUrl ? (
        <AvatarImage
          src={photoUrl}
          alt={name}
          className="aspect-square h-full w-full object-cover"
        />
      ) : null}
      <AvatarFallback className={cn("text-xs font-semibold", specialtyTone, fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
