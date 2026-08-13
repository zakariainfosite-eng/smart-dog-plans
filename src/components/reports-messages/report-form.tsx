import { useMemo } from "react";
import type { AgentRow, DogRow, Section } from "@/integrations/database";
import type { ReportFieldDefinition, RoleDocumentPayload } from "@/lib/reports-messages/types";
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

type ReportFormProps = {
  fields: ReportFieldDefinition[];
  payload: RoleDocumentPayload;
  onChange: (next: RoleDocumentPayload) => void;
  agents: AgentRow[];
  dogs: DogRow[];
  sections: Section[];
  t: (key: string) => string;
  disabled?: boolean;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function ReportForm({
  fields,
  payload,
  onChange,
  agents,
  dogs,
  sections,
  t,
  disabled,
}: ReportFormProps) {
  const agentOptions = useMemo(
    () =>
      [...agents].sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
      ),
    [agents],
  );

  const setField = (id: string, value: string) => {
    onChange({ ...payload, [id]: value });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const label = t(`reportsMessages.fields.${field.labelKey}`);
        const value = payload[field.id] ?? "";

        if (field.type === "textarea") {
          return (
            <div key={field.id} className="sm:col-span-2">
              <Label htmlFor={field.id}>{label}</Label>
              <Textarea
                id={field.id}
                rows={field.rows ?? 4}
                value={value}
                disabled={disabled}
                onChange={(event) => setField(field.id, event.target.value)}
                className="mt-1.5"
              />
            </div>
          );
        }

        if (field.type === "agent") {
          return (
            <div key={field.id}>
              <Label>{label}</Label>
              <Select
                value={value || "__none__"}
                disabled={disabled}
                onValueChange={(next) => setField(field.id, next === "__none__" ? "" : next)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={t("reportsMessages.form.selectAgent")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {agentOptions.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.first_name} {agent.last_name} · #{agent.professional_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (field.type === "dog") {
          return (
            <div key={field.id}>
              <Label>{label}</Label>
              <Select
                value={value || "__none__"}
                disabled={disabled}
                onValueChange={(next) => setField(field.id, next === "__none__" ? "" : next)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={t("reportsMessages.form.selectDog")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {dogs.map((dog) => (
                    <SelectItem key={dog.id} value={dog.id}>
                      {dog.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (field.type === "section") {
          return (
            <div key={field.id}>
              <Label>{label}</Label>
              <Select
                value={value || "__none__"}
                disabled={disabled}
                onValueChange={(next) => setField(field.id, next === "__none__" ? "" : next)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={t("reportsMessages.form.selectSection")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (field.type === "month") {
          return (
            <div key={field.id}>
              <Label>{label}</Label>
              <Select
                value={value || "__none__"}
                disabled={disabled}
                onValueChange={(next) => setField(field.id, next === "__none__" ? "" : next)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month} value={String(month)}>
                      {String(month).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (field.type === "year") {
          const currentYear = new Date().getFullYear();
          const years = Array.from({ length: 6 }, (_, index) => currentYear - index);
          return (
            <div key={field.id}>
              <Label>{label}</Label>
              <Select
                value={value || String(currentYear)}
                disabled={disabled}
                onValueChange={(next) => setField(field.id, next)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        return (
          <div
            key={field.id}
            className={field.type === "date" ? "" : "sm:col-span-2 sm:col-span-1"}
          >
            <Label htmlFor={field.id}>{label}</Label>
            <Input
              id={field.id}
              type={field.type === "date" ? "date" : "text"}
              value={value}
              disabled={disabled}
              onChange={(event) => setField(field.id, event.target.value)}
              className="mt-1.5"
            />
          </div>
        );
      })}
    </div>
  );
}
