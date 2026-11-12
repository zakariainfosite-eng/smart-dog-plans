import type { DogRow } from "@/integrations/database";

export type DogHandlerAgentRef = Pick<{ id: string; dog_id: string | null }, "id" | "dog_id">;

/** Same resolution as the Dogs page: nested `agent` or `agents.dog_id` pointing at this dog. */
export function resolveDogHandlerAgentId(
  dog: Pick<DogRow, "id" | "agent">,
  agents: ReadonlyArray<DogHandlerAgentRef> | undefined,
): string | null {
  if (dog.agent?.id) return dog.agent.id;
  return agents?.find((agent) => agent.dog_id === dog.id)?.id ?? null;
}

export function isDogWithoutHandler(
  dog: Pick<DogRow, "id" | "active" | "agent">,
  agents: ReadonlyArray<DogHandlerAgentRef> | undefined,
): boolean {
  if (dog.active === false) return false;
  return resolveDogHandlerAgentId(dog, agents) === null;
}

export function collectDogsWithoutHandler<T extends Pick<DogRow, "id" | "active" | "agent">>(
  dogs: ReadonlyArray<T>,
  agents: ReadonlyArray<DogHandlerAgentRef> | undefined,
): T[] {
  return dogs.filter((dog) => isDogWithoutHandler(dog, agents));
}
