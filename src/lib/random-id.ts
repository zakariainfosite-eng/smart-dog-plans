import { v4 as uuidv4 } from "uuid";

/** Cross-environment UUID (browser, SSR, Node). */
export function randomId(): string {
  return uuidv4();
}
