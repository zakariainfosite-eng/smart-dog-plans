import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, FileDown } from "lucide-react";
import { toast } from "sonner";
import type { AgentRow, DogRow } from "@/integrations/database";
import { db } from "@/integrations/database/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DocumentWorkspace } from "@/components/reports-messages/document-workspace";
import { OfficialPdfPreview } from "@/components/reports-messages/official-document/OfficialPdfPreview";
import {
  buildOfficialDocumentFromTemplate,
  exportOfficialDocumentFromTemplate,
  getDocumentTemplateConfig,
  parseMessageDemandeFormData,
  serializeMessageDemandeFormData,
  countMessageDemandeWords,
  type MessageDemandeFormData,
} from "@/lib/reports-messages/document-templates";
import {
  countHeatDogReportWords,
  formatHeatDogDisplayDate,
  parseHeatDogReportFormData,
  serializeHeatDogReportFormData,
  type HeatDogReportFormData,
} from "@/lib/reports-messages/document-templates/heat-dog-report";
import {
  agentFullName,
  heatDogIdentityFromDog,
  heatOfficialSpecialtyLabel,
  listAideSoignantVeterinaire,
  listDogsCurrentlyInHeat,
  resolveMasterFromAgents,
  type HeatExclusionRow,
} from "@/lib/reports-messages/document-templates/heat-dog-in-heat";
import { useEffectiveDocumentTemplate } from "@/lib/reports-messages/document-templates/use-effective-template";
import { sickDogOfficialLabelsFromT } from "@/lib/reports-messages/official-document/build-sick-dog-document";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";
import { cn } from "@/lib/utils";

export type OfficialMessageSaveMeta = {
  dogId: string;
  agentId: string | null;
  sectionId: string | null;
};

type Props = {
  /** Defaults to Message / Demande (`veterinary_message`). */
  templateId?: string;
  initialPayload: RoleDocumentPayload;
  /** Required when `templateId` is the heat-dog report. */
  dogs?: DogRow[];
  /** Required for heat-dog aide-soignant / master grade & matricule. */
  agents?: AgentRow[];
  readOnly?: boolean;
  saving?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onCancel: () => void;
  onSaveDraft: (payload: RoleDocumentPayload, meta?: OfficialMessageSaveMeta) => void;
  onExported?: (payload: RoleDocumentPayload) => void;
};

/**
 * Shared official Message editor (Message / Demande + specialized heat report).
 * Same DocumentWorkspace shell, sticky A4 PDF preview, export, and template chrome.
 * Heat mode does not alter Message / Demande form or free-text body behavior.
 */
export function MessageDemandeWorkspace({
  templateId = "veterinary_message",
  initialPayload,
  dogs = [],
  agents = [],
  readOnly = false,
  saving = false,
  t,
  onCancel,
  onSaveDraft,
  onExported,
}: Props) {
  const config = getDocumentTemplateConfig(templateId);
  const { effective } = useEffectiveDocumentTemplate(templateId);
  const isHeatDog = config?.builder === "heat_dog";

  const [messageData, setMessageData] = useState<MessageDemandeFormData>(() =>
    parseMessageDemandeFormData(initialPayload),
  );
  const [heatData, setHeatData] = useState<HeatDogReportFormData>(() =>
    parseHeatDogReportFormData(initialPayload),
  );
  const [exporting, setExporting] = useState(false);
  const [aideOpen, setAideOpen] = useState(false);

  useEffect(() => {
    if (isHeatDog) {
      setHeatData(parseHeatDogReportFormData(initialPayload));
    } else {
      setMessageData(parseMessageDemandeFormData(initialPayload));
    }
  }, [initialPayload, isHeatDog]);

  const { data: heatExclusions = [] } = useQuery({
    queryKey: ["heat-dog-exclusions-active"],
    enabled: isHeatDog,
    queryFn: async (): Promise<HeatExclusionRow[]> => {
      const { data, error } = await db
        .from("agent_exclusions")
        .select("id, dog_id, exclusion_type, start_date, end_date, active, is_deleted")
        .eq("exclusion_type", "female_dog_heat")
        .eq("active", true);
      if (error) throw new Error(error.message);
      return (data ?? []) as HeatExclusionRow[];
    },
  });

  const aideOptions = useMemo(() => listAideSoignantVeterinaire(agents), [agents]);

  const dogsInHeat = useMemo(
    () =>
      listDogsCurrentlyInHeat({
        exclusions: heatExclusions,
        dogs,
        specialtyLabel: (specialty) => heatOfficialSpecialtyLabel(specialty, t),
      }),
    [heatExclusions, dogs, t],
  );

  const selectedDog = useMemo(
    () => (isHeatDog ? dogs.find((dog) => dog.id === heatData.dogId) ?? null : null),
    [dogs, heatData.dogId, isHeatDog],
  );

  useEffect(() => {
    if (!isHeatDog || !selectedDog) return;
    const identity = heatDogIdentityFromDog(selectedDog);
    setHeatData((prev) => {
      if (prev.dogId !== selectedDog.id) return prev;
      const breed = prev.breed.trim() || identity.breed;
      const microchip = prev.microchip.trim() || identity.microchip;
      const dogBirthDate = prev.dogBirthDate.trim() || identity.dogBirthDate;
      const gender = prev.gender.trim() || identity.gender;
      const trainingLevel = prev.trainingLevel.trim() || identity.trainingLevel;
      const assignmentDate = prev.assignmentDate.trim() || identity.assignmentDate;
      const healthStatus = prev.healthStatus.trim() || identity.healthStatus;
      const handlerSection = prev.handlerSection.trim() || identity.handlerSection;
      if (
        breed === prev.breed &&
        microchip === prev.microchip &&
        dogBirthDate === prev.dogBirthDate &&
        gender === prev.gender &&
        trainingLevel === prev.trainingLevel &&
        assignmentDate === prev.assignmentDate &&
        healthStatus === prev.healthStatus &&
        handlerSection === prev.handlerSection
      ) {
        return prev;
      }
      return {
        ...prev,
        breed,
        microchip,
        dogBirthDate,
        gender,
        trainingLevel,
        assignmentDate,
        healthStatus,
        handlerSection,
      };
    });
  }, [isHeatDog, selectedDog]);

  const patchMessage = (partial: Partial<MessageDemandeFormData>) => {
    if (readOnly) return;
    setMessageData((prev) => ({ ...prev, ...partial }));
  };

  const patchHeat = (partial: Partial<HeatDogReportFormData>) => {
    if (readOnly) return;
    setHeatData((prev) => ({ ...prev, ...partial }));
  };

  const applyAideSoignant = (agentId: string) => {
    if (readOnly || !isHeatDog) return;
    const agent = agents.find((row) => row.id === agentId);
    if (!agent) {
      patchHeat({
        aideSoignantId: "",
        aideSoignantName: "",
        aideSoignantGrade: "",
        aideSoignantMatricule: "",
      });
      return;
    }
    patchHeat({
      aideSoignantId: agent.id,
      aideSoignantName: agentFullName(agent),
      aideSoignantGrade: (agent.grade || "").trim(),
      aideSoignantMatricule: (agent.professional_number || "").trim(),
    });
    setAideOpen(false);
  };

  const applyHeatDog = (dogId: string) => {
    if (readOnly || !isHeatDog) return;
    const item = dogsInHeat.find((row) => row.dogId === dogId);
    if (!item) {
      patchHeat({
        dogId: "",
        dogName: "",
        specialty: "",
        breed: "",
        microchip: "",
        dogBirthDate: "",
        gender: "",
        trainingLevel: "",
        assignmentDate: "",
        healthStatus: "",
        handlerId: "",
        handlerName: "",
        handlerGrade: "",
        handlerMatricule: "",
        handlerSection: "",
        hasMaster: false,
        heatStartDate: "",
        heatEndDate: "",
        exclusionId: "",
      });
      return;
    }
    const master = resolveMasterFromAgents(item.handlerId, agents);
    const hasMaster = master.hasMaster || Boolean(item.handlerName.trim());
    const identity = heatDogIdentityFromDog(dogs.find((dog) => dog.id === item.dogId));
    patchHeat({
      dogId: item.dogId,
      dogName: item.dogName,
      specialty: item.specialtyLabel,
      breed: identity.breed,
      microchip: identity.microchip,
      dogBirthDate: identity.dogBirthDate,
      gender: identity.gender,
      trainingLevel: identity.trainingLevel,
      assignmentDate: identity.assignmentDate,
      healthStatus: identity.healthStatus,
      handlerId: item.handlerId ?? "",
      handlerName: master.hasMaster ? master.name : item.handlerName,
      handlerGrade: master.hasMaster ? master.grade : "",
      handlerMatricule: master.hasMaster ? master.matricule : "",
      handlerSection: identity.handlerSection,
      hasMaster,
      heatStartDate: item.heatStartDate,
      heatEndDate: item.heatEndDate,
      exclusionId: item.exclusionId,
    });
  };

  const labels = useMemo(() => {
    const base = sickDogOfficialLabelsFromT(t);
    if (!effective) return base;
    return {
      ...base,
      agencyLine1: effective.header.organizationName || base.agencyLine1,
      agencyLine2: effective.header.department || base.agencyLine2,
      radioTitle: effective.header.radioTitle || base.radioTitle,
    };
  }, [effective, t]);

  const model = useMemo(() => {
    if (!config) return null;
    const resolvedConfig = effective
      ? { ...config, sections: effective.visibleSections }
      : config;
    if (isHeatDog) {
      return buildOfficialDocumentFromTemplate({
        config: resolvedConfig,
        builder: "heat_dog",
        data: heatData,
        dog: selectedDog,
        t,
        effective,
      });
    }
    return buildOfficialDocumentFromTemplate({
      config: resolvedConfig,
      builder: "message_demande",
      data: messageData,
      t,
      effective,
    });
  }, [config, effective, isHeatDog, heatData, messageData, selectedDog, t]);

  const autoWordCount = useMemo(() => {
    if (!model) return 0;
    if (isHeatDog) return countHeatDogReportWords(model.body.messageBody);
    return countMessageDemandeWords(messageData.messageBody);
  }, [isHeatDog, messageData.messageBody, model]);

  const saveDraft = () => {
    if (isHeatDog) {
      const meta: OfficialMessageSaveMeta = {
        dogId: heatData.dogId,
        agentId: heatData.handlerId || selectedDog?.agent?.id || null,
        sectionId: selectedDog?.agent?.section?.id ?? null,
      };
      onSaveDraft(
        serializeHeatDogReportFormData(heatData, {
          agentId: meta.agentId,
          sectionId: meta.sectionId,
        }),
        meta,
      );
      return;
    }
    onSaveDraft(serializeMessageDemandeFormData(messageData));
  };

  const exportPdf = async () => {
    if (!config || exporting) return;
    setExporting(true);
    try {
      const resolvedConfig = effective
        ? { ...config, sections: effective.visibleSections }
        : config;
      if (isHeatDog) {
        await exportOfficialDocumentFromTemplate(
          {
            config: resolvedConfig,
            builder: "heat_dog",
            data: heatData,
            dog: selectedDog,
            t,
            effective,
          },
          `rapport-chienne-chaleur-${heatData.dogName || heatData.reportDate || "brouillon"}.pdf`,
        );
        onExported?.(
          serializeHeatDogReportFormData(heatData, {
            agentId: heatData.handlerId || selectedDog?.agent?.id || null,
            sectionId: selectedDog?.agent?.section?.id ?? null,
          }),
        );
      } else {
        await exportOfficialDocumentFromTemplate(
          {
            config: resolvedConfig,
            builder: "message_demande",
            data: messageData,
            t,
            effective,
          },
          `message-demande-${messageData.reportDate || "brouillon"}.pdf`,
        );
        onExported?.(serializeMessageDemandeFormData(messageData));
      }
    } catch (error) {
      console.error(error);
      toast.error(t("reportsMessages.documentTemplates.errors.exportPdf"));
    } finally {
      setExporting(false);
    }
  };

  if (!config || !model) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const radio = isHeatDog
    ? {
        reportDate: heatData.reportDate,
        referenceNumber: heatData.referenceNumber,
        wordCount: heatData.wordCount,
        departureDateTime: heatData.departureDateTime,
        serviceMention: heatData.serviceMention,
        priority: heatData.priority,
        setReportDate: (v: string) => patchHeat({ reportDate: v }),
        setReferenceNumber: (v: string) => patchHeat({ referenceNumber: v }),
        setWordCount: (v: string) => patchHeat({ wordCount: v }),
        setDepartureDateTime: (v: string) => patchHeat({ departureDateTime: v }),
        setServiceMention: (v: string) => patchHeat({ serviceMention: v }),
        setPriority: (v: "URGENT" | "NORMAL") => patchHeat({ priority: v }),
      }
    : {
        reportDate: messageData.reportDate,
        referenceNumber: messageData.referenceNumber,
        wordCount: messageData.wordCount,
        departureDateTime: messageData.departureDateTime,
        serviceMention: messageData.serviceMention,
        priority: messageData.priority,
        setReportDate: (v: string) => patchMessage({ reportDate: v }),
        setReferenceNumber: (v: string) => patchMessage({ referenceNumber: v }),
        setWordCount: (v: string) => patchMessage({ wordCount: v }),
        setDepartureDateTime: (v: string) => patchMessage({ departureDateTime: v }),
        setServiceMention: (v: string) => patchMessage({ serviceMention: v }),
        setPriority: (v: "URGENT" | "NORMAL") => patchMessage({ priority: v }),
      };

  const selectedAideLabel = heatData.aideSoignantName
    ? `${heatData.aideSoignantName}${
        heatData.aideSoignantGrade || heatData.aideSoignantMatricule
          ? ` — ${heatData.aideSoignantGrade || "—"}${
              heatData.aideSoignantMatricule ? ` / ${heatData.aideSoignantMatricule}` : ""
            }`
          : ""
      }`
    : t("reportsMessages.heatDogReport.selectAide");

  return (
    <DocumentWorkspace
      stickyPreviewSplit
      toolbar={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving || exporting}>
            {t("action.cancel")}
          </Button>
          {!readOnly ? (
            <Button
              type="button"
              variant="secondary"
              onClick={saveDraft}
              disabled={saving || exporting}
            >
              {t("reportsMessages.actions.saveDraft")}
            </Button>
          ) : null}
          <Button type="button" onClick={() => void exportPdf()} disabled={exporting || saving}>
            <FileDown className="mr-1.5 h-4 w-4" />
            {t("reportsMessages.sickDogReport.actions.exportPdf")}
          </Button>
        </>
      }
      form={
        <div className="space-y-5 rounded-xl border border-border/70 bg-card p-4 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">{t(config.titleKey)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isHeatDog
                ? t("reportsMessages.heatDogReport.formHint")
                : t("reportsMessages.messageDemande.formHint")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("reportsMessages.documentTemplates.fields.date")} htmlFor="md-date">
              <Input
                id="md-date"
                type="date"
                value={radio.reportDate}
                disabled={readOnly}
                onChange={(e) => radio.setReportDate(e.target.value)}
              />
            </Field>
            <Field
              label={t("reportsMessages.documentTemplates.fields.reference")}
              htmlFor="md-ref"
            >
              <Input
                id="md-ref"
                value={radio.referenceNumber}
                disabled={readOnly}
                onChange={(e) => radio.setReferenceNumber(e.target.value)}
              />
            </Field>
            <Field
              label={t("reportsMessages.sickDogReport.fields.wordCount")}
              htmlFor="md-words"
              hint={t("reportsMessages.sickDogReport.hints.wordCountAuto", {
                count: autoWordCount,
              })}
            >
              <Input
                id="md-words"
                value={radio.wordCount}
                disabled={readOnly}
                placeholder={String(autoWordCount || "")}
                onChange={(e) => radio.setWordCount(e.target.value)}
              />
            </Field>
            <Field
              label={t("reportsMessages.sickDogReport.fields.departureDateTime")}
              htmlFor="md-depart"
            >
              <Input
                id="md-depart"
                type="datetime-local"
                value={radio.departureDateTime}
                disabled={readOnly}
                onChange={(e) => radio.setDepartureDateTime(e.target.value)}
              />
            </Field>
            <Field
              label={t("reportsMessages.sickDogReport.fields.serviceMention")}
              htmlFor="md-service"
            >
              <Input
                id="md-service"
                value={radio.serviceMention}
                disabled={readOnly}
                onChange={(e) => radio.setServiceMention(e.target.value)}
              />
            </Field>
            <Field label={t("reportsMessages.documentTemplates.fields.priority")}>
              <Select
                value={radio.priority}
                disabled={readOnly}
                onValueChange={(value) =>
                  radio.setPriority(value === "URGENT" ? "URGENT" : "NORMAL")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">
                    {t("reportsMessages.sickDogReport.priority.normal")}
                  </SelectItem>
                  <SelectItem value="URGENT">
                    {t("reportsMessages.sickDogReport.priority.urgent")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isHeatDog ? (
            <>
              <section className="space-y-3 border-t border-border/60 pt-4">
                <h3 className="text-sm font-semibold">
                  {t("reportsMessages.heatDogReport.fields.aideSoignant")}
                </h3>
                <Popover open={aideOpen} onOpenChange={setAideOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={aideOpen}
                      disabled={readOnly}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">{selectedAideLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder={t("reportsMessages.heatDogReport.searchAide")}
                      />
                      <CommandList>
                        <CommandEmpty>{t("reportsMessages.heatDogReport.noAide")}</CommandEmpty>
                        <CommandGroup>
                          {aideOptions.map((agent) => {
                            const label = agentFullName(agent);
                            return (
                              <CommandItem
                                key={agent.id}
                                value={`${label} ${agent.grade} ${agent.professional_number}`}
                                onSelect={() => applyAideSoignant(agent.id)}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    heatData.aideSoignantId === agent.id
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block font-medium">{label}</span>
                                  <span className="block text-xs text-muted-foreground">
                                    {t("reportsMessages.heatDogReport.grade")}:{" "}
                                    {agent.grade || "—"} ·{" "}
                                    {t("reportsMessages.heatDogReport.matricule")}:{" "}
                                    {agent.professional_number || "—"}
                                  </span>
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {heatData.aideSoignantId ? (
                  <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    {heatData.aideSoignantName}
                    <br />
                    {t("reportsMessages.heatDogReport.grade")}:{" "}
                    {heatData.aideSoignantGrade || "—"}
                    <br />
                    {t("reportsMessages.heatDogReport.matricule")}:{" "}
                    {heatData.aideSoignantMatricule || "—"}
                  </p>
                ) : null}
              </section>

              <section className="space-y-3 border-t border-border/60 pt-4">
                <div>
                  <h3 className="text-sm font-semibold">
                    {t("reportsMessages.heatDogReport.sections.inHeat")}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("reportsMessages.heatDogReport.inHeatHint")}
                  </p>
                </div>
                {dogsInHeat.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                    {t("reportsMessages.heatDogReport.noDogsInHeat")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {dogsInHeat.map((item) => {
                      const selected = heatData.dogId === item.dogId;
                      const urgent =
                        item.remainingDays != null && item.remainingDays <= 2;
                      return (
                        <li key={item.exclusionId}>
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => applyHeatDog(item.dogId)}
                            className={cn(
                              "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                              selected
                                ? "border-primary bg-primary/5"
                                : "border-border/70 hover:border-primary/40 hover:bg-muted/30",
                              urgent && !selected ? "border-amber-500/50" : null,
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold uppercase tracking-wide">
                                  {item.dogName}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {t("reportsMessages.documentTemplates.fields.specialty")}:{" "}
                                  {item.specialtyLabel}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t("reportsMessages.documentTemplates.fields.handler")}:{" "}
                                  {item.handlerName ||
                                    t("reportsMessages.heatDogReport.noMaster")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t("reportsMessages.heatDogReport.fields.heatEndDate")}:{" "}
                                  {formatHeatDogDisplayDate(item.heatEndDate)}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                                  urgent
                                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {item.remainingDays == null
                                  ? "—"
                                  : item.remainingDays <= 1
                                    ? t("reportsMessages.heatDogReport.remainingOne", {
                                        count: item.remainingDays,
                                      })
                                    : t("reportsMessages.heatDogReport.remainingMany", {
                                        count: item.remainingDays,
                                      })}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {heatData.dogId ? (
                  <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs space-y-1">
                    <p>
                      <span className="font-medium">
                        {t("reportsMessages.heatDogReport.fields.dogName")}:
                      </span>{" "}
                      {heatData.dogName}
                    </p>
                    <p>
                      <span className="font-medium">
                        {t("reportsMessages.documentTemplates.fields.specialty")}:
                      </span>{" "}
                      {heatData.specialty}
                    </p>
                    {heatData.hasMaster ? (
                      <>
                        <p>
                          <span className="font-medium">
                            {t("reportsMessages.documentTemplates.fields.handler")}:
                          </span>{" "}
                          {heatData.handlerName}
                        </p>
                        <p>
                          {t("reportsMessages.heatDogReport.grade")}:{" "}
                          {heatData.handlerGrade || "—"} ·{" "}
                          {t("reportsMessages.heatDogReport.matricule")}:{" "}
                          {heatData.handlerMatricule || "—"}
                        </p>
                      </>
                    ) : (
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        {t("reportsMessages.heatDogReport.noMaster")}
                      </p>
                    )}
                  </div>
                ) : null}
              </section>

              <p className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {t("reportsMessages.heatDogReport.templateHint")}
              </p>
            </>
          ) : (
            <>
              <Field
                label={t("reportsMessages.documentTemplates.fields.messageBody")}
                htmlFor="md-body"
              >
                <Textarea
                  id="md-body"
                  rows={12}
                  value={messageData.messageBody}
                  disabled={readOnly}
                  className="font-serif text-[15px] leading-relaxed"
                  onChange={(e) => patchMessage({ messageBody: e.target.value })}
                />
              </Field>
              <p className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {t("reportsMessages.messageDemande.signaturesFromTemplateHint")}
              </p>
            </>
          )}
        </div>
      }
      preview={
        <OfficialPdfPreview
          model={model}
          labels={labels}
          title={t("reportsMessages.sickDogReport.preview.a4Label")}
        />
      }
    />
  );
}

function Field({
  label,
  htmlFor,
  children,
  className,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
