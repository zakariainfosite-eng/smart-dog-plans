import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  User,
  Dog as DogIcon,
  Phone,
  FileText,
  Layers,
  Venus,
  Mars,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AgentPhotoField } from "@/components/agents/agent-photo-field";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import {
  isChefDeSectionFonction,
  isCynotechnicienFonction,
  PERSONNEL_FONCTIONS,
  type PersonnelFonction,
} from "@/lib/personnel-fonction";
import { MARITAL_STATUSES, type MaritalStatus } from "@/lib/marital-status";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/database/schema-types";

type Gender = Database["public"]["Enums"]["gender_type"];

export type AgentFormValues = {
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: Gender;
  fonction: PersonnelFonction;
  marital_status: MaritalStatus | "";
  section_id: string | null;
  dog_id: string | null;
  phone: string;
  address: string;
  observations: string;
  active: boolean;
};

type SectionOption = {
  id: string;
  name: string;
  shift_type: string;
};

type DogOption = {
  id: string;
  name: string;
  specialty: string;
  status: string;
  active: boolean;
};

type AgentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: { photo_url?: string | null } | null;
  form: AgentFormValues;
  setForm: (
    values: AgentFormValues | ((prev: AgentFormValues) => AgentFormValues),
  ) => void;
  errors: Partial<Record<keyof AgentFormValues, string>>;
  sections: SectionOption[] | undefined;
  dogs: DogOption[] | undefined;
  takenDogIds: Set<string>;
  pendingPhotoFile: File | null;
  removePhoto: boolean;
  onPendingPhotoFileChange: (file: File | null) => void;
  onRemovePhotoChange: (remove: boolean) => void;
  photoError: string | null;
  onPhotoError: (message: string | null) => void;
  onSubmit: () => void;
  isSaving: boolean;
};

export function AgentFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  errors,
  sections,
  dogs,
  takenDogIds,
  pendingPhotoFile,
  removePhoto,
  onPendingPhotoFileChange,
  onRemovePhotoChange,
  photoError,
  onPhotoError,
  onSubmit,
  isSaving,
}: AgentFormDialogProps) {
  const { t } = useI18n();

  const displayName =
    [form.first_name, form.last_name].filter(Boolean).join(" ").trim() ||
    (editing ? t("employees.dialog.editTitle") : t("employees.dialog.addTitle"));

  const selectedDog = useMemo(
    () => dogs?.find((dog) => dog.id === form.dog_id) ?? null,
    [dogs, form.dog_id],
  );

  const selectedSection = useMemo(
    () => sections?.find((section) => section.id === form.section_id) ?? null,
    [sections, form.section_id],
  );

  const specialty = selectedDog?.specialty ?? null;
  const isCynotechnicien = isCynotechnicienFonction(form.fonction);
  const isChefDeSection = isChefDeSectionFonction(form.fonction);
  const showSectionField = isCynotechnicien || isChefDeSection;

  const patchForm = (patch: Partial<AgentFormValues>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-1.5rem)] max-w-[1000px] flex-col gap-0 overflow-hidden rounded-2xl border-border/80 p-0 shadow-elevated sm:max-w-[1000px]">
        <DialogTitle className="sr-only">
          {editing ? t("employees.dialog.editTitle") : t("employees.dialog.addTitle")}
        </DialogTitle>

        <header className="shrink-0 border-b border-border/60 bg-gradient-to-b from-muted/40 via-background to-background px-6 pb-6 pt-7 pr-14 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <AgentPhotoField
              variant="profile"
              firstName={form.first_name}
              lastName={form.last_name}
              currentPhotoUrl={editing?.photo_url}
              pendingFile={pendingPhotoFile}
              removePhoto={removePhoto}
              onPendingFileChange={onPendingPhotoFileChange}
              onRemovePhotoChange={onRemovePhotoChange}
              onError={onPhotoError}
            />

            <div className="min-w-0 flex-1 space-y-3 pt-1">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {displayName}
                </h2>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  {form.professional_number.trim()
                    ? `#${form.professional_number.trim()}`
                    : t("employees.dialog.matriculePlaceholder")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="primary">
                  {t(`personnelFonction.${form.fonction}`)}
                </StatusBadge>
                <StatusBadge tone={form.active ? "success" : "neutral"}>
                  {form.active ? t("common.active") : t("common.inactive")}
                </StatusBadge>
                {isCynotechnicien && specialty ? (
                  <StatusBadge tone="primary">{t(`specialty.${specialty}`)}</StatusBadge>
                ) : null}
                {showSectionField && selectedSection ? (
                  <StatusBadge tone="info">
                    <Layers className="h-3 w-3 shrink-0" />
                    {selectedSection.name}
                  </StatusBadge>
                ) : null}
              </div>
            </div>
          </div>

          {photoError ? <p className="mt-4 text-xs text-destructive">{photoError}</p> : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/15 px-6 py-6 sm:px-8">
          <div className="grid gap-5 lg:grid-cols-2">
            <FormCard title={t("employees.dialog.card.personal")} icon={User}>
              <FormField label={t("employees.field.fonction")} error={errors.fonction}>
                <Select
                  value={form.fonction}
                  onValueChange={(value) => {
                    const fonction = value as PersonnelFonction;
                    if (isCynotechnicienFonction(fonction)) {
                      patchForm({ fonction });
                      return;
                    }
                    if (isChefDeSectionFonction(fonction)) {
                      patchForm({ fonction, dog_id: null });
                      return;
                    }
                    patchForm({ fonction, section_id: null, dog_id: null });
                  }}
                >
                  <SelectTrigger className="transition-shadow hover:shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONNEL_FONCTIONS.map((fonction) => (
                      <SelectItem key={fonction} value={fonction}>
                        {t(`personnelFonction.${fonction}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t("employees.field.firstName")} error={errors.first_name}>
                  <Input
                    value={form.first_name}
                    onChange={(e) => patchForm({ first_name: e.target.value })}
                    className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                  />
                </FormField>
                <FormField label={t("employees.field.lastName")} error={errors.last_name}>
                  <Input
                    value={form.last_name}
                    onChange={(e) => patchForm({ last_name: e.target.value })}
                    className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                  />
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={t("employees.field.professionalNumber")}
                  error={errors.professional_number}
                >
                  <Input
                    value={form.professional_number}
                    onChange={(e) => patchForm({ professional_number: e.target.value })}
                    className="font-mono transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                  />
                </FormField>
                <FormField label={t("field.grade")} error={errors.grade}>
                  <Input
                    value={form.grade}
                    onChange={(e) => patchForm({ grade: e.target.value })}
                    className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                  />
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t("field.gender")} error={errors.gender}>
                  <Select
                    value={form.gender}
                    onValueChange={(value) => {
                      const gender = value as Gender;
                      patchForm({
                        gender,
                        ...(gender === "female" ? { section_id: null } : {}),
                      });
                    }}
                  >
                    <SelectTrigger className="transition-shadow hover:shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">
                        <span className="inline-flex items-center gap-2">
                          <Mars className="h-3.5 w-3.5" />
                          {t("gender.male")}
                        </span>
                      </SelectItem>
                      <SelectItem value="female">
                        <span className="inline-flex items-center gap-2">
                          <Venus className="h-3.5 w-3.5" />
                          {t("gender.female")}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField
                  label={`${t("employees.field.maritalStatus")} *`}
                  error={errors.marital_status}
                >
                  <Select
                    value={form.marital_status || undefined}
                    onValueChange={(value) =>
                      patchForm({ marital_status: value as MaritalStatus })
                    }
                  >
                    <SelectTrigger className="transition-shadow hover:shadow-sm">
                      <SelectValue
                        placeholder={t("employees.placeholder.maritalStatus")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {MARITAL_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`employees.maritalStatus.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {showSectionField ? (
                  isChefDeSection ? (
                    <FormField
                      label={t("employees.field.sectionResponsible")}
                      error={errors.section_id}
                    >
                      <Select
                        value={form.section_id ?? undefined}
                        onValueChange={(value) =>
                          patchForm({ section_id: value || null })
                        }
                      >
                        <SelectTrigger className="transition-shadow hover:shadow-sm">
                          <SelectValue
                            placeholder={t("employees.placeholder.sectionResponsible")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {sections?.map((section) => (
                            <SelectItem key={section.id} value={section.id}>
                              {section.name} ({t(`shift.${section.shift_type}`)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  ) : form.gender !== "female" ? (
                    <FormField label={t("field.section")} error={errors.section_id}>
                      <Select
                        value={form.section_id ?? "none"}
                        onValueChange={(value) =>
                          patchForm({ section_id: value === "none" ? null : value })
                        }
                      >
                        <SelectTrigger className="transition-shadow hover:shadow-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("common.none")}</SelectItem>
                          {sections?.map((section) => (
                            <SelectItem key={section.id} value={section.id}>
                              {section.name} ({t(`shift.${section.shift_type}`)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  ) : (
                    <FormField label={t("field.section")}>
                      <div className="flex h-10 items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                        {t("employees.hint.femaleNoSection")}
                      </div>
                    </FormField>
                  )
                ) : null}
              </div>
            </FormCard>

            {isCynotechnicien ? (
            <FormCard title={t("employees.dialog.card.dog")} icon={DogIcon}>
              <FormField label={t("employees.field.assignedDog")} error={errors.dog_id}>
                <Select
                  value={form.dog_id ?? "none"}
                  onValueChange={(value) => patchForm({ dog_id: value === "none" ? null : value })}
                >
                  <SelectTrigger className="transition-shadow hover:shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("employees.select.noDog")}</SelectItem>
                    {dogs?.map((dog) => {
                      const taken = takenDogIds.has(dog.id);
                      return (
                        <SelectItem key={dog.id} value={dog.id} disabled={taken}>
                          {dog.name} — {t(`specialty.${dog.specialty}`)}{" "}
                          {taken ? t("employees.select.assigned") : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {t("employees.hint.specialtyInherited")}
                </p>
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField
                  label={t("field.specialty")}
                  value={specialty ? t(`specialty.${specialty}`) : t("common.none")}
                />
                <ReadOnlyField
                  label={t("common.status")}
                  value={
                    selectedDog ? t(`dogStatus.${selectedDog.status}`) : t("common.none")
                  }
                />
              </div>
            </FormCard>
            ) : null}

            <FormCard title={t("employees.dialog.card.contact")} icon={Phone}>
              <FormField label={t("employees.field.phone")} error={errors.phone}>
                <Input
                  type="tel"
                  placeholder="+212 6 XX XX XX XX"
                  value={form.phone}
                  onChange={(e) => patchForm({ phone: e.target.value })}
                  className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
              </FormField>
              <FormField label={t("employees.field.address")} error={errors.address}>
                <Input
                  value={form.address}
                  onChange={(e) => patchForm({ address: e.target.value })}
                  className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
              </FormField>
            </FormCard>

            <FormCard title={t("employees.dialog.card.additional")} icon={FileText}>
              <FormField label={t("employees.field.observations")} error={errors.observations}>
                <Textarea
                  rows={3}
                  maxLength={500}
                  value={form.observations}
                  onChange={(e) => patchForm({ observations: e.target.value })}
                  className="min-h-[88px] resize-none transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
                <p className="text-xs tabular-nums text-muted-foreground">
                  {form.observations.length}/500
                </p>
              </FormField>

              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/80 p-4 transition-colors hover:bg-background">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium">{t("field.active")}</Label>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("employees.hint.inactiveExcluded")}
                  </p>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(active) => patchForm({ active })}
                />
              </div>
            </FormCard>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-3 border-t border-border/60 bg-card px-6 py-4 sm:justify-end sm:px-8">
          <Button
            variant="outline"
            className="min-w-[7rem] transition-colors"
            onClick={() => onOpenChange(false)}
          >
            {t("action.cancel")}
          </Button>
          <Button
            className="min-w-[10rem] transition-all hover:shadow-md"
            onClick={onSubmit}
            disabled={isSaving}
          >
            {isSaving
              ? t("action.saving")
              : editing
                ? t("action.saveChanges")
                : t("action.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-soft transition-shadow hover:shadow-card">
      <CardHeader className="space-y-0 border-b border-border/50 bg-muted/20 px-5 py-4">
        <CardTitle className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-5">{children}</CardContent>
    </Card>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div
        className={cn(
          "rounded-[var(--radius)] border border-border/60 bg-muted/30 px-3 py-2.5",
          "text-sm font-medium text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
