import type { TemplateSectionId } from "@/lib/reports-messages/document-templates/types";

/** Default French titles for the template editor (admin can override). */
export const DEFAULT_SECTION_TITLES: Record<TemplateSectionId, string> = {
  official_header: "En-tête officiel",
  radio_depart_table: "Tableau Radio Départ",
  sender: "Expéditeur",
  recipient: "Destinataire",
  priority: "Priorité",
  subject: "Objet",
  /** Objectif section — available globally; Message / Demande sets showObjectif: false */
  introduction: "Objectif",
  dog_information: "Identification du chien",
  veterinary: "Examen vétérinaire",
  treatment: "Traitement",
  observation: "État de santé / Observations",
  rest_period: "Période de repos",
  user_message: "Message / contenu",
  signatures: "Signature",
  attachments: "Pièces jointes",
};

export const DATABASE_FIELD_OPTIONS: Array<{ value: string; labelKey: string; group: string }> = [
  { value: "dog.name", labelKey: "dogName", group: "dog" },
  { value: "dog.specialty", labelKey: "specialty", group: "dog" },
  { value: "dog.handler", labelKey: "handler", group: "dog" },
  { value: "dog.status", labelKey: "dogStatus", group: "dog" },
  { value: "dog.breed", labelKey: "breed", group: "dog" },
  { value: "dog.microchip", labelKey: "microchip", group: "dog" },
  { value: "dog.section", labelKey: "section", group: "dog" },
  { value: "agent.firstName", labelKey: "agentFirstName", group: "agent" },
  { value: "agent.lastName", labelKey: "agentLastName", group: "agent" },
  { value: "agent.fullName", labelKey: "agentFullName", group: "agent" },
  { value: "agent.function", labelKey: "agentFunction", group: "agent" },
  { value: "agent.section", labelKey: "section", group: "agent" },
  { value: "exclusion.type", labelKey: "exclusionType", group: "exclusion" },
  { value: "exclusion.startDate", labelKey: "exclusionStart", group: "exclusion" },
  { value: "exclusion.endDate", labelKey: "exclusionEnd", group: "exclusion" },
  { value: "exclusion.status", labelKey: "exclusionStatus", group: "exclusion" },
];
