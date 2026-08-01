import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { agentInitials } from "@/lib/agent-photo-api";
import { cn } from "@/lib/utils";

type AgentAvatarProps = {
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
};

export function AgentAvatar({
  firstName,
  lastName,
  photoUrl,
  className,
  fallbackClassName,
}: AgentAvatarProps) {
  const initials = agentInitials(firstName, lastName);
  const fullName = `${firstName} ${lastName}`.trim();

  return (
    <Avatar className={cn("overflow-hidden border border-border/60", className)}>
      {photoUrl ? (
        <AvatarImage
          src={photoUrl}
          alt={fullName}
          className="aspect-square h-full w-full object-cover"
        />
      ) : null}
      <AvatarFallback
        className={cn("bg-primary/10 text-xs font-semibold text-primary", fallbackClassName)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
