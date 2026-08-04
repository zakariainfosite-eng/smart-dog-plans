import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  ClipboardList,
  Coins,
  Dog,
  Download,
  FileText,
  FlaskConical,
  Globe,
  Hash,
  MapPin,
  Package,
  Pencil,
  Scale,
  StickyNote,
  Target,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { getAgents } from "@/integrations/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AttachmentDropzone,
  CaseDialogFooter,
  CaseDialogHeader,
  CaseDialogSidebar,
  DialogSectionCard,
  IconFormField,
  ReadFieldCard,
} from "@/components/operational-cases/operational-case-dialog-ui";
import { useI18n } from "@/hooks/use-i18n";
import {
  checkpointLabel,
  deleteCaseAttachment,
  getAttachmentDownloadUrl,
  saveOperationalCase,
  deleteOperationalCase,
  type OperationalCaseAttachment,
  type OperationalCaseWithRelations,
  uploadCaseAttachments,
} from "@/lib/operational-case-api";
import { previewNextOperationalCaseNumber } from "@/lib/operational-case-number";
import {
  CURRENCY_CODES,
  defaultOperationalCaseForm,
  EXPLOSIVE_OBJECT_TYPES,
  formToDbPayload,
  NARCOTICS_DRUG_TYPES,
  NARCOTICS_UNITS,
  operationalCaseToForm,
  specialtyDefaults,
  THREAT_LEVELS,
  validateOperationalCaseForm,
  type OperationalCaseFormValues,
  type OperationalCaseSpecialty,
  type ExplosiveObjectType,
  type SeizureType,
  type SeizureUnit,
  type ThreatLevel,
} from "@/lib/operational-case-form";
import {
  caseSpecialtyLabel,
  currencyCodeLabel,
  drugTypeLabel,
  objectTypeLabel,
  seizureUnitLabel,
  threatLevelLabel,
} from "@/lib/operational-cases";

export type OperationalCaseDialogMode = "create" | "edit" | "view";

type OperationalCaseDialogProps = {
  mode: OperationalCaseDialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseRow?: OperationalCaseWithRelations | null;
  defaultAgentId?: string;
  lockAgent?: boolean;
  onModeChange?: (mode: OperationalCaseDialogMode) => void;
};

const SPECIALTY_ORDER: OperationalCaseSpecialty[] = ["narcotics", "explosives", "currency"];

export function OperationalCaseDialog({
  mode,
  open,
  onOpenChange,
  caseRow,
  defaultAgentId = "",
  lockAgent = false,
  onModeChange,
}: OperationalCaseDialogProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OperationalCaseFormValues>(defaultOperationalCaseForm(defaultAgentId));
  const [errors, setErrors] = useState<Partial<Record<keyof OperationalCaseFormValues, string>>>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isView = mode === "view";

  const { data: agents } = useQuery({
    queryKey: ["agents-for-operational-case-dialog"],
    queryFn: async () => {
      const rows = await getAgents();
      return rows
        .filter((row) => row.active)
        .map((row) => ({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          professional_number: row.professional_number,
          photo_url: row.photo_url,
          dog_id: row.dog_id,
          dogs: row.dogs
            ? {
                id: row.dogs.id,
                name: row.dogs.name,
                specialty: row.dogs.specialty,
                photo_url: null as string | null,
              }
            : null,
        }))
        .sort((a, b) => a.last_name.localeCompare(b.last_name));
    },
    enabled: open && !isView,
  });

  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints-for-operational-cases"],
    queryFn: async () => {
      const { data, error } = await db
        .from("checkpoints")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: nextCaseNumber, isLoading: nextCaseNumberLoading } = useQuery({
    queryKey: ["next-operational-case-number", form.case_date],
    queryFn: () => previewNextOperationalCaseNumber(db, form.case_date),
    enabled: open && mode === "create",
  });

  useEffect(() => {
    if (mode !== "create" || !nextCaseNumber) return;
    setForm((prev) => (prev.case_number === nextCaseNumber ? prev : { ...prev, case_number: nextCaseNumber }));
  }, [mode, nextCaseNumber]);

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      setForm(defaultOperationalCaseForm(defaultAgentId));
      setPendingFiles([]);
      setErrors({});
      return;
    }
    if (caseRow && (mode === "edit" || mode === "view")) {
      setForm(operationalCaseToForm(caseRow));
      setPendingFiles([]);
      setErrors({});
    }
  }, [open, mode, caseRow, defaultAgentId]);

  const selectedAgent = agents?.find((agent: any) => agent.id === form.agent_id);
  const selectedCheckpoint = checkpoints?.find((cp: any) => cp.id === form.checkpoint_id);

  useEffect(() => {
    if (!selectedAgent || mode !== "create") return;
    const dog = selectedAgent.dogs as { id: string; specialty: string } | null;
    const specialty: OperationalCaseSpecialty =
      dog?.specialty === "explosives"
        ? "explosives"
        : dog?.specialty === "narcotics"
          ? "narcotics"
          : form.specialty;
    setForm((prev) => ({
      ...prev,
      dog_id: dog?.id ?? "",
      specialty,
      ...specialtyDefaults(specialty),
    }));
  }, [form.agent_id, selectedAgent, mode]);

  const save = useMutation({
    mutationFn: async (values: OperationalCaseFormValues & { id?: string }) => {
      const payload = formToDbPayload(values) as Record<string, unknown>;
      if (!values.id && values.case_number.trim()) {
        payload.case_number = values.case_number.trim();
      }
      const caseId = await saveOperationalCase(db, payload, values.id);

      if (caseId && pendingFiles.length > 0) {
        await uploadCaseAttachments(db, caseId, pendingFiles);
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? t("operationalCases.toast.updated") : t("operationalCases.toast.created"));
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["operational-cases"] });
      queryClient.invalidateQueries({ queryKey: ["agent-details"] });
      queryClient.invalidateQueries({ queryKey: ["cases-statistics"] });
      queryClient.invalidateQueries({ queryKey: ["statistics-center"] });
      queryClient.invalidateQueries({ queryKey: ["statistics-operational-cases-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: OperationalCaseWithRelations) => {
      await deleteOperationalCase(db, row.id);
    },
    onSuccess: () => {
      toast.success(t("operationalCases.toast.deleted"));
      setDeleteOpen(false);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["operational-cases"] });
      queryClient.invalidateQueries({ queryKey: ["agent-details"] });
      queryClient.invalidateQueries({ queryKey: ["cases-statistics"] });
      queryClient.invalidateQueries({ queryKey: ["statistics-center"] });
      queryClient.invalidateQueries({ queryKey: ["statistics-operational-cases-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAttachment = useMutation({
    mutationFn: async (attachment: OperationalCaseAttachment) => {
      await deleteCaseAttachment(db, attachment);
    },
    onSuccess: () => {
      toast.success(t("operationalCases.toast.attachmentDeleted"));
      queryClient.invalidateQueries({ queryKey: ["operational-cases"] });
      queryClient.invalidateQueries({ queryKey: ["agent-details"] });
      queryClient.invalidateQueries({ queryKey: ["cases-statistics"] });
      queryClient.invalidateQueries({ queryKey: ["statistics-center"] });
      queryClient.invalidateQueries({ queryKey: ["statistics-operational-cases-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = () => {
    const result = validateOperationalCaseForm(t, form);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate({ ...result.data, id: caseRow?.id });
  };

  const handleSpecialtyChange = (specialty: OperationalCaseSpecialty) => {
    setForm((prev) => ({ ...prev, specialty, ...specialtyDefaults(specialty) }));
  };

  const agentName = useMemo(() => {
    if (caseRow?.agent) return `${caseRow.agent.first_name} ${caseRow.agent.last_name}`;
    if (selectedAgent) return `${selectedAgent.first_name} ${selectedAgent.last_name}`;
    return "";
  }, [caseRow, selectedAgent]);

  const displayCaseNumber =
    mode === "create"
      ? nextCaseNumberLoading
        ? ""
        : form.case_number || nextCaseNumber || ""
      : form.case_number;

  const headerTitle =
    mode === "create"
      ? t("operationalCases.dialog.newTitle")
      : mode === "edit"
        ? t("operationalCases.dialog.editTitle")
        : (caseRow?.case_number ?? t("operationalCases.dialog.editTitle"));

  const headerSubtitle =
    mode === "view"
      ? t("agentDetails.caseDetail.description", { agent: agentName || t("common.none") })
      : mode === "edit"
        ? t("operationalCases.dialog.editDesc")
        : t("operationalCases.dialog.newDesc");

  const todayLabel = format(new Date(), "dd/MM/yyyy");

  const sidebarAgent =
    isView && caseRow?.agent
      ? caseRow.agent
      : selectedAgent
        ? {
            first_name: selectedAgent.first_name,
            last_name: selectedAgent.last_name,
            professional_number: selectedAgent.professional_number,
            photo_url: selectedAgent.photo_url,
          }
        : null;

  const sidebarDog = isView
    ? caseRow?.dog
    : (selectedAgent?.dogs as { name: string; photo_url?: string | null; specialty?: "narcotics" | "explosives" | null } | null);

  const sidebarCheckpointName = isView && caseRow ? checkpointLabel(caseRow) : selectedCheckpoint?.name;
  const sidebarSpecialty = isView && caseRow ? caseRow.specialty : form.specialty;

  const dialogContentClass =
    "flex h-[90vh] max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden rounded-[20px] border-border/60 p-0 shadow-elevated sm:w-[1100px]";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={dialogContentClass}>
          <DialogTitle className="sr-only">{headerTitle}</DialogTitle>

          <CaseDialogHeader
            title={headerTitle}
            subtitle={headerSubtitle}
            caseNumber={displayCaseNumber}
            caseNumberLoading={mode === "create" && nextCaseNumberLoading}
            caseNumberLabel={t("operationalCases.field.caseNumber")}
            autoGeneratedLabel={mode === "create" ? t("operationalCases.field.caseNumberAuto") : undefined}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-5 p-5 md:p-6">
                {isView && caseRow ? (
                  <>
                    <DialogSectionCard title={t("operationalCases.dialog.section.general")} icon={CalendarDays}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ReadFieldCard
                          icon={CalendarDays}
                          label={t("operationalCases.field.date")}
                          value={format(parseISO(caseRow.case_date), "dd/MM/yyyy")}
                        />
                        <ReadFieldCard icon={User} label={t("operationalCases.field.agent")} value={agentName || t("common.none")} />
                        <ReadFieldCard icon={Dog} label={t("operationalCases.field.dog")} value={caseRow.dog?.name ?? t("common.none")} />
                        <ReadFieldCard icon={Target} label={t("operationalCases.field.specialty")} value={caseSpecialtyLabel(caseRow.specialty, t)} />
                        <ReadFieldCard icon={MapPin} label={t("operationalCases.field.checkpoint")} value={checkpointLabel(caseRow)} />
                      </div>
                    </DialogSectionCard>

                    <DialogSectionCard title={t("operationalCases.dialog.section.seizure")} icon={ClipboardList}>
                      {caseRow.specialty === "narcotics" && (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <ReadFieldCard icon={FlaskConical} label={t("operationalCases.field.drugType")} value={drugTypeLabel(caseRow.seizure_type, t)} />
                          <ReadFieldCard icon={Hash} label={t("operationalCases.field.quantity")} value={String(caseRow.quantity ?? "—")} />
                          <ReadFieldCard icon={Scale} label={t("operationalCases.field.unit")} value={seizureUnitLabel(caseRow.unit, t)} />
                        </div>
                      )}
                      {caseRow.specialty === "explosives" && (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <ReadFieldCard icon={Package} label={t("operationalCases.field.objectType")} value={caseRow.object_type ? objectTypeLabel(caseRow.object_type, t) : "—"} />
                          <ReadFieldCard icon={Hash} label={t("operationalCases.field.objectCount")} value={String(caseRow.object_count ?? "—")} />
                          <ReadFieldCard
                            icon={AlertTriangle}
                            label={t("operationalCases.field.threatLevel")}
                            value={caseRow.threat_level ? threatLevelLabel(caseRow.threat_level, t) : t("common.none")}
                          />
                        </div>
                      )}
                      {caseRow.specialty === "currency" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ReadFieldCard icon={Banknote} label={t("operationalCases.field.currency")} value={caseRow.currency_code ? currencyCodeLabel(caseRow.currency_code, t) : "—"} />
                          <ReadFieldCard icon={Coins} label={t("operationalCases.field.totalAmount")} value={String(caseRow.total_amount ?? "—")} />
                          <ReadFieldCard icon={Hash} label={t("operationalCases.field.banknoteCount")} value={String(caseRow.banknote_count ?? "—")} />
                          <ReadFieldCard icon={Globe} label={t("operationalCases.field.country")} value={caseRow.country ?? "—"} />
                        </div>
                      )}
                    </DialogSectionCard>

                    <DialogSectionCard title={t("operationalCases.dialog.section.additional")} icon={FileText}>
                      <ReadFieldCard
                        icon={StickyNote}
                        label={t("operationalCases.field.observations")}
                        value={caseRow.observations?.trim() ? caseRow.observations : t("common.none")}
                      />
                      <div className="mt-4">
                        <AttachmentsSection
                          attachments={caseRow.attachments}
                          editable={false}
                          onDelete={(attachment) => removeAttachment.mutate(attachment)}
                          t={t}
                        />
                      </div>
                    </DialogSectionCard>
                  </>
                ) : (
                  <>
                    <DialogSectionCard title={t("operationalCases.dialog.section.general")} icon={CalendarDays}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <IconFormField label={t("operationalCases.field.date")} icon={CalendarDays} error={errors.case_date}>
                          <Input type="date" value={form.case_date} onChange={(e) => setForm({ ...form, case_date: e.target.value })} />
                        </IconFormField>
                        <IconFormField label={t("operationalCases.field.agent")} icon={User} error={errors.agent_id}>
                          <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })} disabled={lockAgent}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("operationalCases.field.agentPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(agents ?? []).map((agent: any) => (
                                <SelectItem key={agent.id} value={agent.id}>
                                  {agent.first_name} {agent.last_name} (#{agent.professional_number})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </IconFormField>
                        <IconFormField label={t("operationalCases.field.dog")} icon={Dog}>
                          <Input
                            readOnly
                            value={selectedAgent?.dogs ? (selectedAgent.dogs as { name: string }).name : t("common.none")}
                            className="cursor-default bg-muted/30"
                          />
                        </IconFormField>
                        <IconFormField label={t("operationalCases.field.checkpoint")} icon={MapPin} error={errors.checkpoint_id}>
                          <Select value={form.checkpoint_id} onValueChange={(v) => setForm({ ...form, checkpoint_id: v })}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("operationalCases.field.checkpointPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(checkpoints ?? []).map((cp: any) => (
                                <SelectItem key={cp.id} value={cp.id}>
                                  {cp.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </IconFormField>
                        <IconFormField label={t("operationalCases.field.specialty")} icon={Target} error={errors.specialty} className="sm:col-span-2">
                          <Select value={form.specialty} onValueChange={(v) => handleSpecialtyChange(v as OperationalCaseSpecialty)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SPECIALTY_ORDER.map((s: any) => (
                                <SelectItem key={s} value={s}>
                                  {caseSpecialtyLabel(s, t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </IconFormField>
                      </div>
                    </DialogSectionCard>

                    <DialogSectionCard title={t("operationalCases.dialog.section.seizure")} icon={ClipboardList}>
                      {form.specialty === "narcotics" && (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <IconFormField label={t("operationalCases.field.drugType")} icon={FlaskConical} error={errors.drug_type}>
                            <Select value={form.drug_type} onValueChange={(v) => setForm({ ...form, drug_type: v as SeizureType })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NARCOTICS_DRUG_TYPES.map((type: any) => (
                                  <SelectItem key={type} value={type}>
                                    {drugTypeLabel(type, t)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </IconFormField>
                          <IconFormField label={t("operationalCases.field.quantity")} icon={Hash} error={errors.quantity}>
                            <Input type="number" min={0.001} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
                          </IconFormField>
                          <IconFormField label={t("operationalCases.field.unit")} icon={Scale} error={errors.unit}>
                            <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v as SeizureUnit })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NARCOTICS_UNITS.map((unit: any) => (
                                  <SelectItem key={unit} value={unit}>
                                    {seizureUnitLabel(unit, t)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </IconFormField>
                        </div>
                      )}

                      {form.specialty === "explosives" && (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <IconFormField label={t("operationalCases.field.objectType")} icon={Package} error={errors.object_type}>
                            <Select value={form.object_type} onValueChange={(v) => setForm({ ...form, object_type: v as ExplosiveObjectType })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPLOSIVE_OBJECT_TYPES.map((type: any) => (
                                  <SelectItem key={type} value={type}>
                                    {objectTypeLabel(type, t)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </IconFormField>
                          <IconFormField label={t("operationalCases.field.objectCount")} icon={Hash} error={errors.object_count}>
                            <Input type="number" min={1} step={1} value={form.object_count} onChange={(e) => setForm({ ...form, object_count: Number(e.target.value) })} />
                          </IconFormField>
                          <IconFormField label={t("operationalCases.field.threatLevel")} icon={AlertTriangle} error={errors.threat_level}>
                            <Select
                              value={form.threat_level || "none"}
                              onValueChange={(v) => setForm({ ...form, threat_level: v === "none" ? "" : (v as ThreatLevel) })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t("operationalCases.field.threatLevelOptional")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{t("common.none")}</SelectItem>
                                {THREAT_LEVELS.map((level: any) => (
                                  <SelectItem key={level} value={level}>
                                    {threatLevelLabel(level, t)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </IconFormField>
                        </div>
                      )}

                      {form.specialty === "currency" && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <IconFormField label={t("operationalCases.field.currency")} icon={Banknote} error={errors.currency_code}>
                            <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CURRENCY_CODES.map((code: any) => (
                                  <SelectItem key={code} value={code}>
                                    {currencyCodeLabel(code, t)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </IconFormField>
                          <IconFormField label={t("operationalCases.field.totalAmount")} icon={Coins} error={errors.total_amount}>
                            <Input type="number" min={0} step="any" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: Number(e.target.value) })} />
                          </IconFormField>
                          <IconFormField label={t("operationalCases.field.banknoteCount")} icon={Hash} error={errors.banknote_count}>
                            <Input type="number" min={0} step={1} value={form.banknote_count} onChange={(e) => setForm({ ...form, banknote_count: Number(e.target.value) })} />
                          </IconFormField>
                          <IconFormField label={t("operationalCases.field.country")} icon={Globe} error={errors.country}>
                            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder={t("operationalCases.field.countryPlaceholder")} />
                          </IconFormField>
                        </div>
                      )}
                    </DialogSectionCard>

                    <DialogSectionCard title={t("operationalCases.dialog.section.additional")} icon={FileText}>
                      <div className="space-y-5">
                        <IconFormField label={t("operationalCases.field.observations")} icon={StickyNote} error={errors.observations}>
                          <Textarea
                            value={form.observations}
                            onChange={(e) => setForm({ ...form, observations: e.target.value })}
                            rows={5}
                            maxLength={1000}
                            className="min-h-[120px] resize-y"
                          />
                        </IconFormField>

                        <AttachmentDropzone
                          files={pendingFiles}
                          onFilesChange={setPendingFiles}
                          label={t("operationalCases.field.attachments")}
                          hint={t("operationalCases.dialog.dropzone.hint")}
                          pendingLabel={(count) => t("operationalCases.attachments.pending", { count })}
                        />

                        {caseRow && caseRow.attachments.length > 0 && (
                          <AttachmentsSection
                            attachments={caseRow.attachments}
                            editable
                            onDelete={(attachment) => removeAttachment.mutate(attachment)}
                            t={t}
                          />
                        )}
                      </div>
                    </DialogSectionCard>
                  </>
                )}
              </div>
            </div>

            <CaseDialogSidebar
              todayLabel={todayLabel}
              agent={sidebarAgent}
              dogName={sidebarDog?.name}
              dogPhotoUrl={sidebarDog?.photo_url}
              dogSpecialty={sidebarDog?.specialty ?? undefined}
              checkpointName={sidebarCheckpointName}
              specialty={sidebarSpecialty}
              caseNumber={displayCaseNumber}
              caseNumberLoading={mode === "create" && nextCaseNumberLoading}
              t={t}
            />
          </div>

          {isView ? (
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 bg-card/95 px-6 py-4 backdrop-blur-sm">
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("action.delete")}
              </Button>
              <Button onClick={() => onModeChange?.("edit")} className="min-w-[140px] rounded-xl">
                <Pencil className="mr-2 h-4 w-4" />
                {t("action.edit")}
              </Button>
            </footer>
          ) : (
            <CaseDialogFooter
              onCancel={() => onOpenChange(false)}
              onSubmit={handleSubmit}
              submitLabel={save.isPending ? t("action.saving") : mode === "edit" ? t("action.saveChanges") : t("operationalCases.submit.create")}
              cancelLabel={t("action.cancel")}
              isPending={save.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("operationalCases.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("operationalCases.delete.description", { number: caseRow?.case_number })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => caseRow && remove.mutate(caseRow)}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AttachmentsSection({
  attachments,
  editable,
  onDelete,
  t,
}: {
  attachments: OperationalCaseAttachment[];
  editable: boolean;
  onDelete: (attachment: OperationalCaseAttachment) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("operationalCases.attachments.none")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5 text-primary/80" />
        {t("operationalCases.field.attachments")}
      </div>
      <ul className="space-y-2">
        {attachments.map((attachment: any) => (
          <li
            key={attachment.id}
            className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40"
          >
            <span className="truncate text-sm">{attachment.file_name}</span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg"
                onClick={async () => {
                  try {
                    const url = await getAttachmentDownloadUrl(db, attachment.storage_path);
                    window.open(url, "_blank", "noopener,noreferrer");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
              {editable && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg text-destructive"
                  onClick={() => onDelete(attachment)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
