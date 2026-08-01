import type { ReactNode } from "react";
import {
  Dog as DogIcon,
  Stethoscope,
  Briefcase,
  FileText,
  Venus,
  Mars,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DogPhotoField } from "@/components/dogs/dog-photo-field";
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
import type { Database } from "@/integrations/database/schema-types";
import { formatDogAgeLabel } from "@/lib/dog-ui";
import { DogStatusBadge } from "@/components/dogs/dog-status-badge";

type Gender = Database["public"]["Enums"]["gender_type"];
type Specialty = Database["public"]["Enums"]["dog_specialty"];
type DogStatus = Database["public"]["Enums"]["dog_status"];

export type DogFormValues = {
  name: string;
  gender: Gender;
  specialty: Specialty;
  status: DogStatus;
  active: boolean;
  agent_id: string | null;
  breed: string;
  microchip_number: string;
  date_of_birth: string;
  training_level: string;
  veterinary_notes: string;
  observations: string;
  assignment_date: string;
  vaccination_info: string;
  health_status: string;
};

type AgentOption = {
  id: string;
  first_name: string;
  last_name: string;
  dog_id: string | null;
  active: boolean;
};

type DogFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: { photo_url?: string | null; specialty?: Specialty } | null;
  form: DogFormValues;
  setForm: (values: DogFormValues) => void;
  errors: Partial<Record<keyof DogFormValues, string>>;
  agents: AgentOption[];
  currentAgentId: string | null;
  pendingPhotoFile: File | null;
  removePhoto: boolean;
  onPendingPhotoFileChange: (file: File | null) => void;
  onRemovePhotoChange: (remove: boolean) => void;
  photoError: string | null;
  onPhotoError: (message: string | null) => void;
  onSubmit: () => void;
  isSaving: boolean;
};

export function DogFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  errors,
  agents,
  currentAgentId,
  pendingPhotoFile,
  removePhoto,
  onPendingPhotoFileChange,
  onRemovePhotoChange,
  photoError,
  onPhotoError,
  onSubmit,
  isSaving,
}: DogFormDialogProps) {
  const { t } = useI18n();

  const patchForm = (patch: Partial<DogFormValues>) => setForm({ ...form, ...patch });

  const assignedAgentId = form.agent_id ?? currentAgentId;

  const availableAgents = agents.filter(
    (agent) =>
      agent.id === assignedAgentId ||
      (agent.active && agent.dog_id === null),
  );

  const displayName = form.name.trim() || (editing ? t("dogs.dialog.editTitle") : t("dogs.dialog.addTitle"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-1.5rem)] max-w-[1000px] flex-col gap-0 overflow-hidden rounded-2xl border-border/80 p-0 shadow-elevated sm:max-w-[1000px]">
        <DialogTitle className="sr-only">
          {editing ? t("dogs.dialog.editTitle") : t("dogs.dialog.addTitle")}
        </DialogTitle>

        <header className="shrink-0 border-b border-border/60 bg-gradient-to-b from-muted/40 via-background to-background px-6 pb-6 pt-7 pr-14 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <DogPhotoField
              variant="profile"
              name={form.name}
              specialty={form.specialty}
              currentPhotoUrl={editing?.photo_url}
              pendingFile={pendingPhotoFile}
              removePhoto={removePhoto}
              onPendingFileChange={onPendingPhotoFileChange}
              onRemovePhotoChange={onRemovePhotoChange}
              onError={onPhotoError}
            />

            <div className="min-w-0 flex-1 space-y-3 pt-1">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{displayName}</h2>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  {form.microchip_number.trim()
                    ? `#${form.microchip_number.trim()}`
                    : t("dogs.dialog.microchipPlaceholder")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <DogStatusBadge status={form.status} />
                <StatusBadge tone="primary">{t(`specialty.${form.specialty}`)}</StatusBadge>
                <StatusBadge tone={form.active ? "success" : "neutral"}>
                  {form.active ? t("common.active") : t("status.retired")}
                </StatusBadge>
              </div>
            </div>
          </div>

          {photoError ? <p className="mt-4 text-xs text-destructive">{photoError}</p> : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/15 px-6 py-6 sm:px-8">
          <div className="grid gap-5 lg:grid-cols-2">
            <FormCard title={t("dogs.dialog.card.personal")} icon={DogIcon}>
              <FormField label={t("dogs.field.dogName")} error={errors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => patchForm({ name: e.target.value })}
                  maxLength={60}
                  className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t("dogs.field.breed")} error={errors.breed}>
                  <Input
                    value={form.breed}
                    onChange={(e) => patchForm({ breed: e.target.value })}
                    className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                  />
                </FormField>
                <FormField label={t("dogs.field.microchip")} error={errors.microchip_number}>
                  <Input
                    value={form.microchip_number}
                    onChange={(e) => patchForm({ microchip_number: e.target.value })}
                    className="font-mono transition-shadow hover:shadow-sm focus-visible:shadow-sm"
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
                        status: gender === "male" && form.status === "heat" ? "available" : form.status,
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
                          {t("dogs.gender.male")}
                        </span>
                      </SelectItem>
                      <SelectItem value="female">
                        <span className="inline-flex items-center gap-2">
                          <Venus className="h-3.5 w-3.5" />
                          {t("dogs.gender.female")}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={t("common.status")} error={errors.status}>
                  <Select
                    value={form.status}
                    onValueChange={(value) => patchForm({ status: value as DogStatus })}
                  >
                    <SelectTrigger className="transition-shadow hover:shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">{t("dogStatus.available")}</SelectItem>
                      <SelectItem value="sick">{t("dogStatus.sick")}</SelectItem>
                      <SelectItem value="heat" disabled={form.gender === "male"}>
                        {t("dogStatus.heat")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t("dogs.field.dateOfBirth")} error={errors.date_of_birth}>
                  <Input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => patchForm({ date_of_birth: e.target.value })}
                    className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                  />
                </FormField>
                <FormField label={t("dogs.field.age")}>
                  <div className="rounded-[var(--radius)] border border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-foreground">
                    {formatDogAgeLabel(form.date_of_birth || null, t)}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("dogs.field.ageReadOnly")}</p>
                </FormField>
              </div>
            </FormCard>

            <FormCard title={t("dogs.dialog.card.operational")} icon={Briefcase}>
              <FormField label={t("field.specialty")} error={errors.specialty}>
                <Select
                  value={form.specialty}
                  onValueChange={(value) => patchForm({ specialty: value as Specialty })}
                >
                  <SelectTrigger className="transition-shadow hover:shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="narcotics">{t("specialty.narcoticsDetection")}</SelectItem>
                    <SelectItem value="explosives">{t("specialty.explosivesDetection")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label={t("dogs.field.currentAgent")}>
                <Select
                  value={form.agent_id ?? "none"}
                  onValueChange={(value) => {
                    const agentId = value === "none" ? null : value;
                    patchForm({
                      agent_id: agentId,
                      assignment_date:
                        agentId && !form.assignment_date
                          ? new Date().toISOString().slice(0, 10)
                          : agentId
                            ? form.assignment_date
                            : "",
                    });
                  }}
                >
                  <SelectTrigger className="transition-shadow hover:shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("dogs.select.unassigned")}</SelectItem>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.first_name} {agent.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {t("dogs.hint.agentsWithoutDog")}
                </p>
              </FormField>

              <FormField label={t("dogs.field.assignmentDate")} error={errors.assignment_date}>
                <Input
                  type="date"
                  value={form.assignment_date}
                  onChange={(e) => patchForm({ assignment_date: e.target.value })}
                  disabled={!form.agent_id}
                  className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
              </FormField>

              <FormField label={t("dogs.field.trainingLevel")} error={errors.training_level}>
                <Input
                  value={form.training_level}
                  onChange={(e) => patchForm({ training_level: e.target.value })}
                  className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
              </FormField>
            </FormCard>

            <FormCard title={t("dogs.dialog.card.medical")} icon={Stethoscope}>
              <FormField label={t("dogs.field.veterinaryNotes")} error={errors.veterinary_notes}>
                <Textarea
                  rows={3}
                  maxLength={1000}
                  value={form.veterinary_notes}
                  onChange={(e) => patchForm({ veterinary_notes: e.target.value })}
                  className="min-h-[88px] resize-none transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
              </FormField>
              <FormField label={t("dogs.field.vaccinationInfo")} error={errors.vaccination_info}>
                <Textarea
                  rows={2}
                  value={form.vaccination_info}
                  onChange={(e) => patchForm({ vaccination_info: e.target.value })}
                  className="resize-none transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
              </FormField>
              <FormField label={t("dogs.field.healthStatus")} error={errors.health_status}>
                <Input
                  value={form.health_status}
                  onChange={(e) => patchForm({ health_status: e.target.value })}
                  className="transition-shadow hover:shadow-sm focus-visible:shadow-sm"
                />
              </FormField>
            </FormCard>

            <FormCard title={t("dogs.dialog.card.additional")} icon={FileText}>
              <FormField label={t("dogs.field.observations")} error={errors.observations}>
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
                    {t("dogs.hint.retiredExcluded")}
                  </p>
                </div>
                <Switch checked={form.active} onCheckedChange={(active) => patchForm({ active })} />
              </div>
            </FormCard>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-3 border-t border-border/60 bg-card px-6 py-4 sm:justify-end sm:px-8">
          <Button variant="outline" className="min-w-[7rem]" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button className="min-w-[10rem] transition-all hover:shadow-md" onClick={onSubmit} disabled={isSaving}>
            {isSaving
              ? t("action.saving")
              : editing
                ? t("action.saveChanges")
                : t("dogs.submit.createDog")}
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