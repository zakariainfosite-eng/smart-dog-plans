import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Dog as DogIcon,
  Briefcase,
  Stethoscope,
  User,
  Pencil,
  Layers,
  BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { db } from "@/integrations/database/client";
import { fetchDogDetails, type DogOperationalCase } from "@/lib/dog-details";
import { formatDogAgeLabel } from "@/lib/dog-ui";
import { formatDogSexLabel } from "@/lib/dog-sex";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import {
  deriveDogOperationalStatus,
  dogOperationalStatusLabelKey,
} from "@/lib/dog-operational-status";
import { DogAvatar } from "@/components/dogs/dog-avatar";
import { DogPhotoLightbox } from "@/components/dogs/dog-photo-lightbox";
import { DogOperationalCasesHistory } from "@/components/dogs/dog-operational-cases-history";
import { AgentExclusionsHistory } from "@/components/agents/agent-exclusions-history";
import { DogStatusBadge } from "@/components/dogs/dog-status-badge";
import {
  OperationalCaseDialog,
  type OperationalCaseDialogMode,
} from "@/components/operational-cases/operational-case-dialog";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { ProfileInfoCard, ProfileField } from "@/components/enterprise/profile-layout";
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

type DogRow = Database["public"]["Tables"]["dogs"]["Row"] & {
  agent?: {
    id: string;
    first_name: string;
    last_name: string;
    section: { id: string; name: string } | null;
  } | null;
};

type DogWithAgentRow = DogRow & {
  agent?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
};

type DogDetailsDrawerProps = {
  dogId: string | null;
  dogRow: DogWithAgentRow | null;
  /** Active exclusions for today — used for status before details finish loading. */
  todayExclusions?: AgentExclusionRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (dog: DogWithAgentRow) => void;
};

export function DogDetailsDrawer({
  dogId,
  dogRow,
  todayExclusions = [],
  open,
  onOpenChange,
  onEdit,
}: DogDetailsDrawerProps) {
  const { t } = useI18n();
  const [selectedCase, setSelectedCase] = useState<DogOperationalCase | null>(null);
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);
  const [caseDialogMode, setCaseDialogMode] = useState<OperationalCaseDialogMode>("view");
  const [photoLightboxOpen, setPhotoLightboxOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dog-details", dogId],
    queryFn: () => fetchDogDetails(db, dogId!),
    enabled: open && !!dogId,
  });

  useEffect(() => {
    if (!open) setPhotoLightboxOpen(false);
  }, [open]);

  useEffect(() => {
    setPhotoLightboxOpen(false);
  }, [dogId]);

  const dog = data?.dog ?? dogRow;
  const name = dog?.name ?? "";
  const photoUrl = data?.dog.photo_url ?? dogRow?.photo_url ?? null;
  const specialty = dog?.specialty ?? null;
  const operationalStatus = dogId
    ? deriveDogOperationalStatus(dogId, data ? data.exclusions : todayExclusions)
    : ({ kind: "available" } as const);

  const openCaseDetail = (caseRow: DogOperationalCase) => {
    setSelectedCase(caseRow);
    setCaseDialogMode("view");
    setCaseDialogOpen(true);
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
                aria-label={t("dogDetails.photo.viewFullscreen")}
              >
                <DogAvatar
                  name={name}
                  photoUrl={photoUrl}
                  specialty={specialty}
                  className="h-20 w-20 cursor-zoom-in shadow-soft transition-opacity hover:opacity-90 sm:h-24 sm:w-24"
                  fallbackClassName="text-base sm:text-lg"
                />
              </button>
            ) : (
              <DogAvatar
                name={name}
                photoUrl={photoUrl}
                specialty={specialty}
                className="h-20 w-20 shrink-0 shadow-soft sm:h-24 sm:w-24"
                fallbackClassName="text-base sm:text-lg"
              />
            )}

            <div className="min-w-0 flex-1">
              <SheetTitle className="text-xl font-semibold tracking-tight">
                {name || t("dogDetails.title")}
              </SheetTitle>
              <SheetDescription className="mt-1 font-mono text-xs">
                #{data?.dog.microchip_number ?? dogRow?.microchip_number ?? "—"}
              </SheetDescription>
              {dog && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <DogStatusBadge status={operationalStatus} />
                  {specialty && (
                    <StatusBadge tone="primary">{t(`specialty.${specialty}`)}</StatusBadge>
                  )}
                  <StatusBadge tone={dog.active ? "success" : "neutral"}>
                    {dog.active ? t("common.active") : t("status.retired")}
                  </StatusBadge>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!dogRow}
              onClick={() => dogRow && onEdit(dogRow)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t("dogDetails.action.edit")}
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-5">
          {isLoading ? (
            <DogDetailsSkeleton />
          ) : isError || !data ? (
            <p className="text-sm text-destructive">{t("dogDetails.error.loadFailed")}</p>
          ) : (
            <div className="space-y-5">
              <DetailsSection title={t("dogDetails.section.information")} icon={DogIcon}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoField label={t("dogs.field.dogName")} value={data.dog.name} />
                  <InfoField
                    label={t("dogs.field.sex")}
                    value={formatDogSexLabel(data.dog.gender, t)}
                  />
                  <InfoField
                    label={t("dogs.field.microchip")}
                    value={valueOrUnspecified(data.dog.microchip_number, t)}
                  />
                  <InfoField
                    label={t("dogs.field.breed")}
                    value={valueOrUnspecified(data.dog.breed, t)}
                  />
                  <InfoField
                    label={t("dogs.field.dateOfBirth")}
                    value={
                      data.dog.date_of_birth
                        ? format(parseISO(data.dog.date_of_birth), "dd/MM/yyyy")
                        : t("dogs.sex.unspecified")
                    }
                  />
                  <InfoField
                    label={t("dogs.field.age")}
                    value={
                      data.dog.date_of_birth
                        ? formatDogAgeLabel(data.dog.date_of_birth, t)
                        : t("dogs.sex.unspecified")
                    }
                  />
                  <InfoField
                    label={t("common.status")}
                    value={t(dogOperationalStatusLabelKey(operationalStatus))}
                  />
                  <InfoField
                    label={t("field.specialty")}
                    value={t(`specialty.${data.dog.specialty}`)}
                  />
                </div>
              </DetailsSection>

              <DetailsSection title={t("dogDetails.section.operational")} icon={Briefcase}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoField
                    label={t("dogs.field.currentAgent")}
                    value={
                      data.dog.agent
                        ? `${data.dog.agent.first_name} ${data.dog.agent.last_name}`
                        : t("dogs.select.unassigned")
                    }
                  />
                  <InfoField
                    label={t("field.section")}
                    value={data.dog.agent?.section?.name ?? t("dogs.sex.unspecified")}
                    icon={Layers}
                  />
                  <InfoField
                    label={t("dogs.field.assignmentDate")}
                    value={
                      data.dog.assignment_date
                        ? format(parseISO(data.dog.assignment_date), "dd/MM/yyyy")
                        : t("dogs.sex.unspecified")
                    }
                  />
                  <InfoField
                    label={t("dogs.field.trainingLevel")}
                    value={valueOrUnspecified(data.dog.training_level, t)}
                  />
                </div>
              </DetailsSection>

              <DetailsSection title={t("dogDetails.section.medical")} icon={Stethoscope}>
                <div className="grid gap-3">
                  <InfoField
                    label={t("dogs.field.veterinaryNotes")}
                    value={valueOrUnspecified(data.dog.veterinary_notes, t)}
                    multiline
                  />
                  <InfoField
                    label={t("dogs.field.vaccinationInfo")}
                    value={valueOrUnspecified(data.dog.vaccination_info, t)}
                    multiline
                  />
                  <InfoField
                    label={t("dogs.field.healthStatus")}
                    value={valueOrUnspecified(data.dog.health_status, t)}
                  />
                </div>
              </DetailsSection>

              <DetailsSection title={t("dogDetails.section.statistics")} icon={BarChart3}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoField
                    label={t("dogDetails.statistics.operationalCases")}
                    value={String(data.statistics.operationalCases)}
                  />
                  <InfoField
                    label={t("dogDetails.statistics.exclusions")}
                    value={String(data.statistics.exclusions)}
                  />
                  <InfoField
                    label={t("dogDetails.statistics.activeExclusions")}
                    value={String(data.statistics.activeExclusions)}
                  />
                </div>
              </DetailsSection>

              <DetailsSection title={t("dogDetails.section.casesHistory")} icon={Briefcase}>
                {data.sectionErrors?.operationalCases ? (
                  <SectionError message={data.sectionErrors.operationalCases} />
                ) : (
                  <DogOperationalCasesHistory
                    cases={data.operationalCases}
                    onCaseClick={openCaseDetail}
                  />
                )}
              </DetailsSection>

              <DetailsSection title={t("dogDetails.section.exclusionsHistory")} icon={User}>
                {data.sectionErrors?.exclusions ? (
                  <SectionError message={data.sectionErrors.exclusions} />
                ) : (
                  <AgentExclusionsHistory exclusions={data.exclusions} />
                )}
              </DetailsSection>

              <DetailsSection title={t("dogDetails.section.notes")} icon={DogIcon}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {data.dog.observations?.trim() || t("dogs.sex.unspecified")}
                </p>
              </DetailsSection>
            </div>
          )}
        </ScrollArea>

        <OperationalCaseDialog
          mode={caseDialogMode}
          caseRow={selectedCase}
          open={caseDialogOpen}
          onOpenChange={setCaseDialogOpen}
          defaultAgentId={data?.dog.agent?.id}
          lockAgent
          onModeChange={setCaseDialogMode}
        />

        {photoUrl ? (
          <DogPhotoLightbox
            open={photoLightboxOpen}
            onOpenChange={setPhotoLightboxOpen}
            photoUrl={photoUrl}
            alt={name}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailsSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <ProfileInfoCard title={title} icon={Icon}>
      {children}
    </ProfileInfoCard>
  );
}

function valueOrUnspecified(
  value: string | null | undefined,
  t: (key: string) => string,
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : t("dogs.sex.unspecified");
}

function InfoField({
  label,
  value,
  multiline,
  icon: Icon,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <ProfileField
      icon={Icon}
      label={label}
      value={<span className={multiline ? "whitespace-pre-wrap" : undefined}>{value}</span>}
    />
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

function DogDetailsSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}
