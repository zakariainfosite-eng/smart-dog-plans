/**
 * Official administrative document model (Radio Départ family).
 * Shared by A4 HTML preview and jsPDF export — one data shape, two renderers.
 */

export type OfficialDocumentKind =
  | "sick_dog_report"
  | "heat_dog_report"
  | "vet_visit_report"
  | "care_report"
  | "follow_up_report"
  | "monthly_report"
  | "generic_message";

export type OfficialPriority = "URGENT" | "NORMAL";

export type OfficialRadioDepartHeader = {
  /** Fixed left agency lines */
  agencyLines: string[];
  /** Fixed right title */
  radioTitle: string;
};

export type OfficialRadioTableCell = {
  label: string;
  value: string;
};

export type OfficialRadioDepartTable = {
  origin: string;
  number: string;
  words: string;
  departureDateTime: string;
  serviceMention: string;
  /**
   * Optional cell list occupying the existing Radio Départ table chrome.
   * When set, the renderer keeps the same 5-column borders/widths and fills
   * these cells in order (wrapping to extra identical rows). When omitted,
   * the five keys above are used unchanged (Message / Demande, sick dog).
   */
  cells?: OfficialRadioTableCell[];
};

export type OfficialRecipientLine = {
  /** Left-aligned text (may include DESTINATAIRE : …) */
  left: string;
  /** Optional right-aligned city on the same row */
  right?: string;
};

export type OfficialCorrespondence = {
  sender: string;
  /** Primary addressee line under "A :" (legacy / standard layout) */
  to: string;
  recipient: string;
  city: string;
  diffusion: string[];
  /**
   * Message / Demande official multiline destinataire block.
   * When set, renderers use this instead of the flat recipient fields.
   */
  recipientLines?: OfficialRecipientLine[];
  /** Layout variant — default keeps existing report behaviour */
  layout?: "standard" | "message_demande";
};

export type OfficialFactRow = {
  label: string;
  value: string;
};

export type OfficialDocumentBody = {
  /** Fixed subject line, e.g. RAPPORT DE CHIEN MALADE */
  subject: string;
  /** Optional introduction paragraph */
  introduction?: string;
  /** Structured facts — only non-empty rows */
  facts: OfficialFactRow[];
  /** User message preserved exactly (may contain \n) */
  messageBody: string;
  /** Optional attachment list (non-empty only) */
  attachments?: string[];
};

export type OfficialSignatory = {
  fullName: string;
  functionTitle: string;
  /** Message / Demande: SIGNÉ or VU */
  endorsement?: "SIGNÉ" | "VU";
};

export type OfficialDocumentModel = {
  kind: OfficialDocumentKind;
  header: OfficialRadioDepartHeader;
  table: OfficialRadioDepartTable;
  correspondence: OfficialCorrespondence;
  priority: OfficialPriority;
  body: OfficialDocumentBody;
  signatories: OfficialSignatory[];
  /** Default: multi-column blocks. message_demande: vertical SIGNÉ rows */
  signatureLayout?: "columns" | "vertical";
};

export type OfficialDocumentBuildContext = {
  labels: {
    agencyLine1: string;
    agencyLine2: string;
    radioTitle: string;
    subject: string;
    de: string;
    a: string;
    destinataire: string;
    diffusion: string;
    factLabels: Record<string, string>;
  };
};
