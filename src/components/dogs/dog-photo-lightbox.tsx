import { AgentPhotoLightbox } from "@/components/agents/agent-photo-lightbox";

type DogPhotoLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoUrl: string;
  alt: string;
};

/** Reuses the agent lightbox — identical UX for dog profile photos. */
export function DogPhotoLightbox(props: DogPhotoLightboxProps) {
  return <AgentPhotoLightbox {...props} />;
}
