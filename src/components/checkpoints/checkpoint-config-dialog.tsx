import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { z } from "zod";
import { Sun, Moon, CalendarDays, Users, MapPin, Flag } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  CHECKPOINT_PRIORITIES,
  checkpointHasPlanningConfig,
  defaultOperationalConfig,
  operationalConfigFromRow,
  type CheckpointOperationalConfig,
  type CheckpointPriority,
  type CheckpointRowOperational,
  type Weekday,
  WEEKDAYS,
} from "@/lib/checkpoints/operational-config";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

const WEEKDAY_KEYS: Record<Weekday, string> = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

const DIALOG_SHELL =
  "flex max-h-[min(90vh,720px)] w-[calc(100%-1.5rem)] max-w-[940px] flex-col gap-0 overflow-hidden rounded-2xl border border-border/50 bg-white p-0 shadow-[0_4px_24px_rgba(15,23,42,0.08)] sm:max-w-[940px]";

function configSchema(t: TFunction) {
  return z
    .object({
      name: z.string().trim().min(1, t("validation.nameRequired")).max(120),
      active: z.boolean(),
      operating_days: z.array(z.number().int().min(1).max(7)).min(1),
      day_shift_enabled: z.boolean(),
      night_shift_enabled: z.boolean(),
      day_explosives: z.coerce.number().int().min(0),
      day_narcotics: z.coerce.number().int().min(0),
      night_explosives: z.coerce.number().int().min(0),
      night_narcotics: z.coerce.number().int().min(0),
      female_policy: z.enum(["allowed", "preferred", "not_allowed"]),
      priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    })
    .refine(
      (v) =>
        !v.active ||
        (v.day_shift_enabled && v.day_explosives + v.day_narcotics > 0) ||
        (v.night_shift_enabled && v.night_explosives + v.night_narcotics > 0),
      { message: t("checkpoints.validation.shiftRequired"), path: ["day_shift_enabled"] },
    );
}

type CheckpointConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CheckpointRowOperational | null;
  onSubmit: (config: CheckpointOperationalConfig) => void;
  submitting?: boolean;
};

type FormBodyProps = {
  config: CheckpointOperationalConfig;
  setConfig: React.Dispatch<React.SetStateAction<CheckpointOperationalConfig>>;
  errors: Record<string, string>;
  planningWarning: string | null;
  toggleDay: (day: Weekday) => void;
  t: TFunction;
  idPrefix: string;
};

function weekdayPillLabel(day: Weekday, t: TFunction): string {
  const full = t(`weekday.${WEEKDAY_KEYS[day]}`);
  if (full.length <= 4) return full;
  return full.slice(0, 3);
}

function ConfigSection({
  icon: Icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/60 bg-white p-3.5 sm:p-4",
        className,
      )}
    >
      <div className="mb-3 flex items-start gap-2.5 border-b border-border/50 pb-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-sm font-semibold leading-none tracking-tight text-foreground">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function OperatingDayChips({
  config,
  toggleDay,
  t,
}: Pick<FormBodyProps, "config" | "toggleDay" | "t">) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((day) => {
        const selected = config.operating_days.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => toggleDay(day)}
            className={cn(
              "inline-flex h-8 min-w-[2.75rem] items-center justify-center rounded-full border px-2.5 text-xs font-semibold transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/80 bg-white text-muted-foreground hover:border-primary/35 hover:text-foreground",
            )}
            aria-pressed={selected}
          >
            {weekdayPillLabel(day, t)}
          </button>
        );
      })}
    </div>
  );
}

function ShiftTeamFields({
  prefix,
  title,
  icon: Icon,
  enabled,
  onEnabledChange,
  counts,
  onCountChange,
  t,
  idPrefix,
}: {
  prefix: "day" | "night";
  title: string;
  icon: LucideIcon;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  counts: { explosives: string; narcotics: string };
  onCountChange: (field: "explosives" | "narcotics", value: string) => void;
  t: TFunction;
  idPrefix: string;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-white p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-sm font-semibold tracking-tight text-foreground">{title}</span>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["explosives", "narcotics"] as const).map((field) => (
            <div key={field} className="space-y-1.5">
              <Label
                htmlFor={`${idPrefix}-${prefix}-${field}`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t(`checkpoints.config.team.${field}`)}
              </Label>
              <Input
                id={`${idPrefix}-${prefix}-${field}`}
                type="number"
                min={0}
                className="h-9 bg-white"
                value={counts[field]}
                onChange={(e) => onCountChange(field, e.target.value)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Shared form body — identical for create and edit. */
function CheckpointConfigFormBody({
  config,
  setConfig,
  errors,
  planningWarning,
  toggleDay,
  t,
  idPrefix,
}: FormBodyProps) {
  return (
    <div className="space-y-3.5">
      <ConfigSection
        icon={MapPin}
        title={t("checkpoints.config.general")}
        subtitle={t("checkpoints.field.namePlaceholder")}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-name`} className="text-xs font-medium text-muted-foreground">
              {t("checkpoints.config.name")}
            </Label>
            <Input
              id={`${idPrefix}-name`}
              className="h-9 bg-white"
              value={config.name}
              onChange={(e) => setConfig((p) => ({ ...p, name: e.target.value }))}
              placeholder={t("checkpoints.field.namePlaceholder")}
              autoFocus
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
          </div>

          <div className="flex h-9 items-center justify-between gap-4 rounded-lg border border-border/60 bg-white px-3 sm:min-w-[148px]">
            <Label htmlFor={`${idPrefix}-active`} className="text-sm font-medium text-foreground">
              {t("common.active")}
            </Label>
            <Switch
              id={`${idPrefix}-active`}
              checked={config.active}
              onCheckedChange={(active) => setConfig((p) => ({ ...p, active }))}
            />
          </div>
        </div>
      </ConfigSection>

      <ConfigSection icon={CalendarDays} title={t("checkpoints.config.operatingDays")}>
        <OperatingDayChips config={config} toggleDay={toggleDay} t={t} />
      </ConfigSection>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <ShiftTeamFields
          prefix="day"
          title={t("checkpoints.config.dayShift")}
          icon={Sun}
          enabled={config.day_shift_enabled}
          onEnabledChange={(day_shift_enabled) =>
            setConfig((p) => ({ ...p, day_shift_enabled }))
          }
          counts={{
            explosives: String(config.day.explosives),
            narcotics: String(config.day.narcotics),
          }}
          onCountChange={(field, value) =>
            setConfig((p) => ({
              ...p,
              day: { ...p.day, [field]: value },
            }))
          }
          t={t}
          idPrefix={idPrefix}
        />

        <ShiftTeamFields
          prefix="night"
          title={t("checkpoints.config.nightShift")}
          icon={Moon}
          enabled={config.night_shift_enabled}
          onEnabledChange={(night_shift_enabled) =>
            setConfig((p) => ({ ...p, night_shift_enabled }))
          }
          counts={{
            explosives: String(config.night.explosives),
            narcotics: String(config.night.narcotics),
          }}
          onCountChange={(field, value) =>
            setConfig((p) => ({
              ...p,
              night: { ...p.night, [field]: value },
            }))
          }
          t={t}
          idPrefix={idPrefix}
        />
      </div>

      <ConfigSection
        icon={Flag}
        title={t("checkpoints.config.priority")}
        subtitle={t("checkpoints.config.priorityHint")}
      >
        <RadioGroup
          value={String(config.priority)}
          onValueChange={(value) =>
            setConfig((p) => ({
              ...p,
              priority: Number(value) as CheckpointPriority,
            }))
          }
          className="flex flex-wrap gap-1.5"
        >
          {CHECKPOINT_PRIORITIES.map((value) => {
            const selected = config.priority === value;
            return (
              <div key={value} className="relative">
                <RadioGroupItem
                  value={String(value)}
                  id={`${idPrefix}-priority-${value}`}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`${idPrefix}-priority-${value}`}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/80 bg-white text-muted-foreground hover:border-primary/35 hover:text-foreground",
                  )}
                >
                  {value} — {t(`checkpoints.config.priorityLevel.${value}`)}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </ConfigSection>

      <ConfigSection icon={Users} title={t("checkpoints.config.femaleAgents")}>
        <RadioGroup
          value={config.female_policy}
          onValueChange={(value) =>
            setConfig((p) => ({
              ...p,
              female_policy: value as CheckpointOperationalConfig["female_policy"],
            }))
          }
          className="flex flex-wrap gap-1.5"
        >
          {(["allowed", "preferred", "not_allowed"] as const).map((value) => {
            const selected = config.female_policy === value;
            return (
              <div key={value} className="relative">
                <RadioGroupItem
                  value={value}
                  id={`${idPrefix}-female-${value}`}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`${idPrefix}-female-${value}`}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/80 bg-white text-muted-foreground hover:border-primary/35 hover:text-foreground",
                  )}
                >
                  {t(`checkpoints.config.femalePolicy.${value}`)}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </ConfigSection>

      {planningWarning ? <p className="text-xs text-amber-600">{planningWarning}</p> : null}
      {errors.day_shift_enabled ? (
        <p className="text-xs text-destructive">{errors.day_shift_enabled}</p>
      ) : null}
    </div>
  );
}

export function CheckpointConfigDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  submitting,
}: CheckpointConfigDialogProps) {
  const { t } = useI18n();
  const schema = useMemo(() => configSchema(t), [t]);
  const [config, setConfig] = useState<CheckpointOperationalConfig>(defaultOperationalConfig());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isCreate = !initial;

  useEffect(() => {
    if (open) {
      setConfig(operationalConfigFromRow(initial));
      setErrors({});
    }
  }, [open, initial]);

  const toggleDay = (day: Weekday) => {
    setConfig((prev) => {
      const selected = prev.operating_days.includes(day);
      const next = selected
        ? prev.operating_days.filter((d) => d !== day)
        : ([...new Set([...prev.operating_days, day])].sort((a, b) => a - b) as Weekday[]);
      return { ...prev, operating_days: next };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      name: config.name,
      active: config.active,
      operating_days: config.operating_days,
      day_shift_enabled: config.day_shift_enabled,
      night_shift_enabled: config.night_shift_enabled,
      day_explosives: config.day.explosives,
      day_narcotics: config.day.narcotics,
      night_explosives: config.night.explosives,
      night_narcotics: config.night.narcotics,
      female_policy: config.female_policy,
      priority: config.priority,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join(".")] = issue.message;
      }
      setErrors(next);
      return;
    }
    onSubmit({
      ...config,
      name: parsed.data.name,
      day: {
        explosives: parsed.data.day_explosives,
        narcotics: parsed.data.day_narcotics,
      },
      night: {
        explosives: parsed.data.night_explosives,
        narcotics: parsed.data.night_narcotics,
      },
    });
  };

  const planningWarning =
    config.active && !checkpointHasPlanningConfig(config)
      ? t("checkpoints.validation.shiftRequired")
      : null;

  const formBodyProps: FormBodyProps = {
    config,
    setConfig,
    errors,
    planningWarning,
    toggleDay,
    t,
    idPrefix: "cp-config",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHELL}>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col bg-white">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/50 bg-white px-6 pb-4 pt-6 pr-14 sm:px-8">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              {isCreate ? t("checkpoints.dialog.newTitle") : t("checkpoints.dialog.editTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("checkpoints.config.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-6 py-4 sm:px-8 sm:py-5">
            <CheckpointConfigFormBody {...formBodyProps} />
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/50 bg-white px-6 py-4 sm:justify-between sm:px-8">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("action.saving")
                : isCreate
                  ? t("checkpoints.submit.create")
                  : t("action.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
