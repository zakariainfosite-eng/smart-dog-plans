import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  User,
  Dog as DogIcon,
  History,
  FileText,
  Phone,
  MapPin,
  Shield,
  Layers,
  Venus,
  Mars,
  Pencil,
  Printer,
  FileDown,
  Loader2,
  RotateCw,
  UserX,
  StickyNote,
  Briefcase,
  Award,
  HeartHandshake,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { db } from "@/integrations/database/client";
import { fetchAgentDetails } from "@/lib/agent-details";
import { formatPgError } from "@/lib/soft-delete";
import {
  buildAgentProfilePrintDocument,
  downloadAgentProfileHtml,
  openAgentProfilePrintWindow,
} from "@/lib/agent-profile-export";
import { agentSpecialty } from "@/lib/agent-ui";
import { formatMaritalStatusLabel } from "@/lib/marital-status";
import { normalizePersonnelFonction } from "@/lib/personnel-fonction";
import {
  OperationalCaseDialog,
  type OperationalCaseDialogMode,
} from "@/components/operational-cases/operational-case-dialog";
import { AgentExclusionsHistory } from "@/components/agents/agent-exclusions-history";
import { AgentOperationalCasesHistory } from "@/components/agents/agent-operational-cases-history";
import { AgentCareerSummarySection } from "@/components/agents/agent-career-summary";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { AgentPhotoLightbox } from "@/components/agents/agent-photo-lightbox";
import type { AgentOperationalCase } from "@/lib/agent-details";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { ProfileInfoCard, ProfileField, ProfileFieldGrid } from "@/components/enterprise/profile-layout";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/status-badge";
import type { Database } from "@/integrations/database/schema-types";

type AgentRow = Database["public"]["Tables"]["agents"]["Row"] & {
  sections: { id: string; name: string } | null;
  dogs: { id: string; name: string; specialty: string; status: string } | null;
};

type AgentDetailsDrawerProps = {
  agentId: string | null;
  agentRow: AgentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (agent: AgentRow) => void;
};

export function AgentDetailsDrawer({
  agentId,
  agentRow,
  open,
  onOpenChange,
  onEdit,
}: AgentDetailsDrawerProps) {
  const { t } = useI18n();
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedCase, setSelectedCase] = useState<AgentOperationalCase | null>(null);
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);
  const [caseDialogMode, setCaseDialogMode] = useState<OperationalCaseDialogMode>("view");
  const [photoLightboxOpen, setPhotoLightboxOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["agent-details", agentId],
    queryFn: () => fetchAgentDetails(db, agentId!),
    enabled: open && !!agentId,
  });

  useEffect(() => {
    if (!open) setPhotoLightboxOpen(false);
  }, [open]);

  useEffect(() => {
    setPhotoLightboxOpen(false);
  }, [agentId]);

  useEffect(() => {
    if (!error || !agentId) return;
    const pgError = error as { message?: string; code?: string; details?: string; hint?: string };
    console.error("[AgentDetails] Failed to load agent details", {
      agentId,
      message: pgError.message ?? String(error),
      code: pgError.code,
      details: pgError.details,
      hint: pgError.hint,
      error,
    });
  }, [agentId, error]);

  const fullName = data
    ? `${data.agent.first_name} ${data.agent.last_name}`
    : agentRow
      ? `${agentRow.first_name} ${agentRow.last_name}`
      : "";

  const photoUrl = data?.agent.photo_url ?? agentRow?.photo_url ?? null;
  const firstName = data?.agent.first_name ?? agentRow?.first_name ?? "";
  const lastName = data?.agent.last_name ?? agentRow?.last_name ?? "";

  const specialty = data?.agent.dogs
    ? agentSpecialty({ dogs: data.agent.dogs })
    : null;

  const openCaseDetail = (caseRow: AgentOperationalCase) => {
    setSelectedCase(caseRow);
    setCaseDialogMode("view");
    setCaseDialogOpen(true);
  };

  const printSections = useMemo(() => {
    if (!data) return [];
    const agent = data.agent;
    return [
      {
        title: t("agentDetails.section.personal"),
        rows: [
          { label: t("employees.field.firstName"), value: agent.first_name },
          { label: t("employees.field.lastName"), value: agent.last_name },
          {
            label: t("employees.field.professionalNumber"),
            value: agent.professional_number,
          },
          { label: t("field.grade"), value: agent.grade },
          {
            label: t("employees.field.fonction"),
            value: t(`personnelFonction.${normalizePersonnelFonction(agent.fonction)}`),
          },
          { label: t("field.gender"), value: t(`gender.${agent.gender}`) },
          {
            label: t("employees.field.maritalStatus"),
            value: formatMaritalStatusLabel(
              agent.marital_status ?? agentRow?.marital_status,
              t,
            ),
          },
          { label: t("employees.field.phone"), value: agent.phone ?? t("common.none") },
          { label: t("employees.field.address"), value: agent.address ?? t("common.none") },
          {
            label: t("field.section"),
            value: agent.sections?.name ?? t("common.none"),
          },
          {
            label: t("field.active"),
            value: agent.active ? t("common.active") : t("common.inactive"),
          },
        ],
      },
      {
        title: t("agentDetails.section.k9"),
        rows: [
          {
            label: t("employees.field.assignedDog"),
            value: agent.dogs?.name ?? t("common.none"),
          },
          {
            label: t("field.specialty"),
            value: specialty ? t(`specialty.${specialty}`) : t("common.none"),
          },
          {
            label: t("common.status"),
            value: agent.dogs ? t(`dogStatus.${agent.dogs.status}`) : t("common.none"),
          },
        ],
      },
      {
        title: t("agentDetails.section.notes"),
        rows: [
          {
            label: t("employees.field.observations"),
            value: agent.observations ?? t("common.none"),
          },
        ],
      },
    ];
  }, [agentRow?.marital_status, data, specialty, t]);

  const handlePrint = () => {
    if (!data) return;
    const html = buildAgentProfilePrintDocument(fullName, printSections);
    openAgentProfilePrintWindow(html, "print");
  };

  const handleExportPdf = () => {
    if (!data) return;
    const html = buildAgentProfilePrintDocument(fullName, printSections);
    openAgentProfilePrintWindow(html, "pdf");
    downloadAgentProfileHtml(
      `${fullName.replace(/\s+/g, "-").toLowerCase()}-profile`,
      html,
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 border-l bg-background p-0 sm:max-w-xl lg:max-w-2xl [&>button]:top-5 [&>button]:right-5"
      >
        <SheetHeader className="space-y-0 border-b border-border/60 bg-gradient-to-br from-primary/[0.04] via-card to-muted/20 px-6 py-5 text-left">
          <div className="flex items-start gap-4 pr-8">
            {photoUrl ? (
              <button
                type="button"
                onClick={() => setPhotoLightboxOpen(true)}
                className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={t("agentDetails.photo.viewFullscreen")}
              >
                <AgentAvatar
                  firstName={firstName}
                  lastName={lastName}
                  photoUrl={photoUrl}
                  className="h-20 w-20 cursor-zoom-in shadow-soft transition-opacity hover:opacity-90 sm:h-24 sm:w-24"
                  fallbackClassName="text-base sm:text-lg"
                />
              </button>
            ) : (
              <AgentAvatar
                firstName={firstName}
                lastName={lastName}
                photoUrl={photoUrl}
                className="h-20 w-20 shrink-0 shadow-soft sm:h-24 sm:w-24"
                fallbackClassName="text-base sm:text-lg"
              />
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-xl font-semibold tracking-tight">
                {fullName || t("agentDetails.title")}
              </SheetTitle>
              <SheetDescription className="mt-1 font-mono text-xs">
                #{data?.agent.professional_number ?? agentRow?.professional_number ?? "—"}
              </SheetDescription>
              {data && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge tone={data.agent.active ? "success" : "neutral"}>
                    {data.agent.active ? t("common.active") : t("common.inactive")}
                  </StatusBadge>
                  {specialty && (
                    <StatusBadge tone="primary">{t(`specialty.${specialty}`)}</StatusBadge>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!agentRow}
              onClick={() => agentRow && onEdit(agentRow)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t("agentDetails.action.edit")}
            </Button>
            <Button size="sm" variant="outline" disabled={!data} onClick={handleExportPdf}>
              <FileDown className="mr-2 h-4 w-4" />
              {t("agentDetails.action.exportPdf")}
            </Button>
            <Button size="sm" variant="outline" disabled={!data} onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              {t("agentDetails.action.print")}
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-5">
          <div ref={printRef} className="space-y-5 pb-6">
            {isLoading && <AgentDetailsSkeleton />}
            {isError && (
              <p className="text-sm text-destructive">
                {t("agentDetails.error.loadFailed")}
                {error ? (
                  <span className="mt-1 block font-mono text-xs opacity-80">
                    {formatPgError(error)}
                  </span>
                ) : null}
              </p>
            )}
            {data && (
              <>
                <DetailsSection
                  icon={User}
                  title={t("agentDetails.section.personal")}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      icon={User}
                      label={t("employees.table.name")}
                      value={fullName}
                    />
                    <DetailItem
                      icon={Shield}
                      label={t("employees.field.professionalNumber")}
                      value={`#${data.agent.professional_number}`}
                    />
                    <DetailItem icon={Shield} label={t("field.grade")} value={data.agent.grade} />
                    <DetailItem
                      icon={Briefcase}
                      label={t("employees.field.fonction")}
                      value={t(
                        `personnelFonction.${normalizePersonnelFonction(data.agent.fonction)}`,
                      )}
                    />
                    <DetailItem
                      icon={data.agent.gender === "female" ? Venus : Mars}
                      label={t("field.gender")}
                      value={t(`gender.${data.agent.gender}`)}
                    />
                    <DetailItem
                      icon={HeartHandshake}
                      label={t("employees.field.maritalStatus")}
                      value={formatMaritalStatusLabel(
                        data.agent.marital_status ?? agentRow?.marital_status,
                        t,
                      )}
                    />
                    <DetailItem
                      icon={Phone}
                      label={t("employees.field.phone")}
                      value={data.agent.phone ?? t("common.none")}
                    />
                    <DetailItem
                      icon={MapPin}
                      label={t("employees.field.address")}
                      value={data.agent.address ?? t("common.none")}
                    />
                    <DetailItem
                      icon={Layers}
                      label={t("field.section")}
                      value={data.agent.sections?.name ?? t("common.none")}
                    />
                    <DetailItem
                      icon={Shield}
                      label={t("field.active")}
                      value={
                        data.agent.active ? t("common.active") : t("common.inactive")
                      }
                    />
                  </div>
                </DetailsSection>

                <DetailsSection icon={DogIcon} title={t("agentDetails.section.k9")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      icon={DogIcon}
                      label={t("employees.field.assignedDog")}
                      value={data.agent.dogs?.name ?? t("common.none")}
                    />
                    <DetailItem
                      icon={DogIcon}
                      label={t("field.specialty")}
                      value={specialty ? t(`specialty.${specialty}`) : t("common.none")}
                    />
                    <DetailItem
                      icon={DogIcon}
                      label={t("common.status")}
                      value={
                        data.agent.dogs
                          ? t(`dogStatus.${data.agent.dogs.status}`)
                          : t("common.none")
                      }
                    />
                  </div>
                </DetailsSection>

                <DetailsSection icon={Award} title={t("agentDetails.section.careerSummary")}>
                  {data.sectionErrors?.careerSummary ? (
                    <SectionError message={data.sectionErrors.careerSummary} />
                  ) : (
                    <AgentCareerSummarySection summary={data.careerSummary} />
                  )}
                </DetailsSection>

                <DetailsSection icon={Briefcase} title={t("agentDetails.section.casesHistory")}>
                  {data.sectionErrors?.operationalCases ? (
                    <SectionError message={data.sectionErrors.operationalCases} />
                  ) : (
                    <AgentOperationalCasesHistory
                      cases={data.operationalCases}
                      onCaseClick={openCaseDetail}
                    />
                  )}
                </DetailsSection>

                <DetailsSection icon={UserX} title={t("agentDetails.section.exclusionsHistory")}>
                  {data.sectionErrors?.exclusions ? (
                    <SectionError message={data.sectionErrors.exclusions} />
                  ) : (
                    <AgentExclusionsHistory exclusions={data.exclusions} />
                  )}
                </DetailsSection>

                <DetailsSection icon={History} title={t("agentDetails.section.history")}>
                  {data.sectionErrors?.history ? (
                    <SectionError message={data.sectionErrors.history} />
                  ) : (
                    <div className="space-y-5">
                      <HistoryList
                        icon={RotateCw}
                        title={t("agentDetails.history.rotations")}
                        empty={t("agentDetails.history.emptyRotations")}
                        items={data.recentRotations.map((item) => ({
                          id: item.id,
                          primary: format(parseISO(item.planningDate), "dd/MM/yyyy"),
                          secondary: item.isHqReserve
                            ? t("dailyPlanning.point653.name")
                            : (item.checkpointName ?? t("common.none")),
                        }))}
                      />
                    </div>
                  )}
                </DetailsSection>

                <DetailsSection icon={StickyNote} title={t("agentDetails.section.notes")}>
                  {data.agent.observations ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {data.agent.observations}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("common.none")}</p>
                  )}
                </DetailsSection>
              </>
            )}
          </div>
        </ScrollArea>

        <OperationalCaseDialog
          mode={caseDialogMode}
          caseRow={selectedCase}
          open={caseDialogOpen}
          onOpenChange={setCaseDialogOpen}
          defaultAgentId={agentId ?? undefined}
          lockAgent
          onModeChange={setCaseDialogMode}
        />

        {photoUrl ? (
          <AgentPhotoLightbox
            open={photoLightboxOpen}
            onOpenChange={setPhotoLightboxOpen}
            photoUrl={photoUrl}
            alt={fullName}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <p className="text-sm text-destructive">
      <span className="font-medium">Section unavailable.</span>
      <span className="mt-1 block font-mono text-xs opacity-80">{message}</span>
    </p>
  );
}

function DetailsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <ProfileInfoCard title={title} icon={Icon}>
      {children}
    </ProfileInfoCard>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return <ProfileField icon={Icon} label={label} value={value} />;
}

function HistoryList({
  icon: Icon,
  title,
  empty,
  items,
}: {
  icon: LucideIcon;
  title: string;
  empty: string;
  items: Array<{ id: string; primary: string; secondary: string }>;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
            >
              <p className="font-medium">{item.primary}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.secondary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentDetailsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}
