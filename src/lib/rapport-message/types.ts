export type RapportMessageDraft = {
  title: string;
  date: string;
  recipient: string;
  sender: string;
  reference: string;
  body: string;
  signature: string;
};

export type RapportMessage = RapportMessageDraft & {
  id: string;
  createdByUserId: string | null;
  createdByEmail: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type RapportMessageStorePayload = {
  documents: RapportMessage[];
};

export type RapportMessageExportLabels = {
  brand: string;
  documentTitle: string;
  date: string;
  recipient: string;
  sender: string;
  reference: string;
  subject: string;
  signature: string;
  unitName?: string;
};

export const RAPPORT_MESSAGE_SETTINGS_KEY = "RAPPORT_MESSAGE_DOCUMENTS";

export const RAPPORT_MESSAGE_QUERY_KEY = [
  "application-settings",
  RAPPORT_MESSAGE_SETTINGS_KEY,
] as const;

export const EMPTY_RAPPORT_MESSAGE_DRAFT: RapportMessageDraft = {
  title: "",
  date: "",
  recipient: "",
  sender: "",
  reference: "",
  body: "",
  signature: "",
};
