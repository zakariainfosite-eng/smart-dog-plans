import type { DogRow } from "@/integrations/database";
import type { DatabaseBinding } from "@/lib/reports-messages/document-templates/types";

export type DatabaseLinkContext = {
  dog: DogRow | null;
  specialtyLabel: string;
  handlerLabel: string;
  sectionLabel: string;
  agentFunctionLabel: string;
};

/** Resolve a DB binding; empty string if unavailable — never invent. */
export function resolveDatabaseBinding(
  binding: DatabaseBinding,
  ctx: DatabaseLinkContext,
): string {
  switch (binding) {
    case "dog.name":
      return ctx.dog?.name?.trim() ?? "";
    case "dog.specialty":
      return ctx.specialtyLabel.trim();
    case "dog.handler":
      return ctx.handlerLabel.trim();
    case "dog.breed":
      return ctx.dog?.breed?.trim() ?? "";
    case "dog.microchip":
      return ctx.dog?.microchip_number?.trim() ?? "";
    case "dog.section":
      return ctx.sectionLabel.trim();
    case "agent.firstName":
      return ctx.dog?.agent?.first_name?.trim() ?? "";
    case "agent.lastName":
      return ctx.dog?.agent?.last_name?.trim() ?? "";
    case "agent.fullName": {
      const agent = ctx.dog?.agent;
      if (!agent) return "";
      return `${agent.first_name} ${agent.last_name}`.trim();
    }
    case "agent.function":
      return ctx.agentFunctionLabel.trim();
    case "dog.status":
      return ctx.dog?.status ? inputStatusLabel(ctx, ctx.dog.status) : "";
    case "agent.section":
      return ctx.sectionLabel.trim();
    case "exclusion.type":
    case "exclusion.startDate":
    case "exclusion.endDate":
    case "exclusion.status":
      return "";
    default:
      return "";
  }
}

function inputStatusLabel(ctx: DatabaseLinkContext, status: string): string {
  void ctx;
  return status;
}

export function buildDatabaseLinkContext(input: {
  dog: DogRow | null;
  t: (key: string) => string;
}): DatabaseLinkContext {
  const dog = input.dog;
  const specialtyLabel = dog ? input.t(`specialty.${dog.specialty}`) : "";
  const handlerLabel = dog?.agent
    ? `${dog.agent.first_name} ${dog.agent.last_name}`.trim()
    : "";
  const sectionLabel = dog?.agent?.section?.name?.trim() || "";
  return {
    dog,
    specialtyLabel,
    handlerLabel,
    sectionLabel,
    agentFunctionLabel: "",
  };
}
