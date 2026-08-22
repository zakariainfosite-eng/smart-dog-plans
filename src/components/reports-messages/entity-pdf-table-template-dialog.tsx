import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/database/client";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FonctionnaireListPdfPreview } from "@/components/reports-messages/fonctionnaire-list-pdf-preview";
import { ChiensListPdfPreview } from "@/components/reports-messages/chiens-list-pdf-preview";
import {
  CHIENS_PDF_TABLE_FIELD_CATALOG,
  CHIENS_PDF_MIN_AGE_YEARS_OPTIONS,
  CHIENS_PDF_SEX_FILTERS,
  DEFAULT_CHIEN_PDF_MIN_AGE_YEARS,
  DEFAULT_CHIEN_PDF_SEX_FILTER,
  normalizeChienPdfMinAgeYears,
  normalizeChienPdfSexFilter,
  type ChienPdfMinAgeYears,
  type ChienPdfSexFilter,
  type ChienPdfTableFieldConfig,
} from "@/lib/reports-messages/chien-pdf-table-fields";
import {
  FONCTIONNAIRE_PDF_TABLE_FIELD_CATALOG,
  DEFAULT_FONCTIONNAIRE_PDF_LIST_SCOPE,
  FONCTIONNAIRE_PDF_LIST_SCOPES,
  normalizeFonctionnairePdfListScope,
  type FonctionnairePdfListScope,
  type FonctionnairePdfTableFieldConfig,
} from "@/lib/reports-messages/fonctionnaire-pdf-table-fields";
import {
  ENTITY_PDF_TABLE_QUERY_KEY,
  canEditEntityPdfTable,
  defaultEntityPdfTableFields,
  fetchChienPdfTemplate,
  fetchFonctionnairePdfTemplate,
  saveChienPdfTemplate,
  saveFonctionnairePdfTemplate,
  type EntityPdfTableFieldConfig,
  type EntityPdfTableKind,
} from "@/lib/reports-messages/entity-pdf-table-store";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  kind: EntityPdfTableKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function fieldLabelKey(kind: EntityPdfTableKind, id: string): string {
  return `entityPdfTable.${kind}.fields.${id}`;
}

export function EntityPdfTableTemplateDialog({ kind, open, onOpenChange }: Props) {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = canEditEntityPdfTable(role);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EntityPdfTableFieldConfig[]>([]);
  const [listScope, setListScope] = useState<FonctionnairePdfListScope>(
    DEFAULT_FONCTIONNAIRE_PDF_LIST_SCOPE,
  );
  const [sexFilter, setSexFilter] = useState<ChienPdfSexFilter>(DEFAULT_CHIEN_PDF_SEX_FILTER);
  const [minAgeYears, setMinAgeYears] = useState<ChienPdfMinAgeYears>(
    DEFAULT_CHIEN_PDF_MIN_AGE_YEARS,
  );

  const catalog =
    kind === "chien" ? CHIENS_PDF_TABLE_FIELD_CATALOG : FONCTIONNAIRE_PDF_TABLE_FIELD_CATALOG;

  const { data: storedChien } = useQuery({
    queryKey: ENTITY_PDF_TABLE_QUERY_KEY.chien,
    enabled: open && kind === "chien",
    queryFn: () => fetchChienPdfTemplate(db),
  });

  const { data: storedFonctionnaire } = useQuery({
    queryKey: ENTITY_PDF_TABLE_QUERY_KEY.fonctionnaire,
    enabled: open && kind === "fonctionnaire",
    queryFn: () => fetchFonctionnairePdfTemplate(db),
  });

  useEffect(() => {
    if (!open) return;
    if (kind === "chien" && storedChien) {
      setDraft(storedChien.fields);
      setSexFilter(storedChien.sexFilter);
      setMinAgeYears(storedChien.minAgeYears);
      return;
    }
    if (kind === "fonctionnaire" && storedFonctionnaire) {
      setDraft(storedFonctionnaire.fields);
      setListScope(storedFonctionnaire.listScope);
    }
  }, [open, kind, storedChien, storedFonctionnaire]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (kind === "fonctionnaire") {
        return saveFonctionnairePdfTemplate(db, { fields: draft, listScope });
      }
      return saveChienPdfTemplate(db, { fields: draft, sexFilter, minAgeYears });
    },
    onSuccess: (saved) => {
      setDraft(saved.fields);
      if (kind === "fonctionnaire" && "listScope" in saved && saved.listScope) {
        setListScope(saved.listScope);
        queryClient.setQueryData(ENTITY_PDF_TABLE_QUERY_KEY.fonctionnaire, saved);
      } else if (kind === "chien" && "sexFilter" in saved) {
        setSexFilter(saved.sexFilter);
        setMinAgeYears(saved.minAgeYears);
        queryClient.setQueryData(ENTITY_PDF_TABLE_QUERY_KEY.chien, saved);
      } else {
        queryClient.setQueryData(ENTITY_PDF_TABLE_QUERY_KEY[kind], saved.fields);
      }
      void queryClient.invalidateQueries({ queryKey: ENTITY_PDF_TABLE_QUERY_KEY[kind] });
      toast.success(t("entityPdfTable.toast.saved"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetToDefaults = () => {
    setDraft(defaultEntityPdfTableFields(kind));
    if (kind === "fonctionnaire") setListScope(DEFAULT_FONCTIONNAIRE_PDF_LIST_SCOPE);
    if (kind === "chien") {
      setSexFilter(DEFAULT_CHIEN_PDF_SEX_FILTER);
      setMinAgeYears(DEFAULT_CHIEN_PDF_MIN_AGE_YEARS);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(`entityPdfTable.${kind}.title`)}</DialogTitle>
          <DialogDescription>{t(`entityPdfTable.${kind}.hint`)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="space-y-4">
            {kind === "fonctionnaire" ? (
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-sm font-medium">{t("entityPdfTable.fonctionnaire.listScope.title")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("entityPdfTable.fonctionnaire.listScope.hint")}
                </p>
                <RadioGroup
                  value={listScope}
                  disabled={!canEdit}
                  onValueChange={(value) => setListScope(normalizeFonctionnairePdfListScope(value))}
                  className="gap-2"
                >
                  {FONCTIONNAIRE_PDF_LIST_SCOPES.map((scope) => (
                    <div key={scope} className="flex items-center gap-2">
                      <RadioGroupItem value={scope} id={`fonctionnaire-list-scope-${scope}`} />
                      <Label
                        htmlFor={`fonctionnaire-list-scope-${scope}`}
                        className="cursor-pointer font-normal"
                      >
                        {t(`entityPdfTable.fonctionnaire.listScope.${scope}`)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ) : null}
            {kind === "chien" ? (
              <div className="space-y-3 rounded-lg border border-border/60 p-3">
                <p className="text-sm font-medium">{t("entityPdfTable.chien.filters.title")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("entityPdfTable.chien.filters.hint")}
                </p>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("entityPdfTable.chien.filters.sex")}
                  </p>
                  <RadioGroup
                    value={sexFilter}
                    disabled={!canEdit}
                    onValueChange={(value) => setSexFilter(normalizeChienPdfSexFilter(value))}
                    className="gap-2"
                  >
                    {CHIENS_PDF_SEX_FILTERS.map((sex) => (
                      <div key={sex} className="flex items-center gap-2">
                        <RadioGroupItem value={sex} id={`chien-pdf-sex-${sex}`} />
                        <Label htmlFor={`chien-pdf-sex-${sex}`} className="cursor-pointer font-normal">
                          {t(`entityPdfTable.chien.filters.sexOptions.${sex}`)}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chien-pdf-min-age">{t("entityPdfTable.chien.filters.minAge")}</Label>
                  <Select
                    value={minAgeYears === "all" ? "all" : String(minAgeYears)}
                    disabled={!canEdit}
                    onValueChange={(value) => setMinAgeYears(normalizeChienPdfMinAgeYears(value))}
                  >
                    <SelectTrigger id="chien-pdf-min-age">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("entityPdfTable.chien.filters.ageAll")}</SelectItem>
                      {CHIENS_PDF_MIN_AGE_YEARS_OPTIONS.map((years) => (
                        <SelectItem key={years} value={String(years)}>
                          {t("entityPdfTable.chien.filters.ageYears", { count: years })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
            {draft.map((row, index) => (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2"
              >
                <Checkbox
                  checked={row.enabled}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => {
                    const next = [...draft];
                    next[index] = { ...row, enabled: checked === true };
                    setDraft(next);
                  }}
                  aria-label={t(fieldLabelKey(kind, row.id))}
                />
                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
                  {index + 1}.
                </span>
                <span className="min-w-0 flex-1 text-sm">{t(fieldLabelKey(kind, row.id))}</span>
                {canEdit ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...draft];
                        const swap = next[index - 1];
                        if (!swap) return;
                        next[index - 1] = row;
                        next[index] = swap;
                        setDraft(next);
                      }}
                      aria-label={t("entityPdfTable.actions.moveUp")}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={index === draft.length - 1}
                      onClick={() => {
                        const next = [...draft];
                        const swap = next[index + 1];
                        if (!swap) return;
                        next[index + 1] = row;
                        next[index] = swap;
                        setDraft(next);
                      }}
                      aria-label={t("entityPdfTable.actions.moveDown")}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {t("entityPdfTable.catalogHint", { count: catalog.length })}
            </p>
            </div>
          </div>

          {kind === "fonctionnaire" ? (
            <FonctionnaireListPdfPreview
              fields={draft as FonctionnairePdfTableFieldConfig[]}
              listScope={listScope}
              title={t("entityPdfTable.previewTitle")}
              className="min-h-[70vh]"
            />
          ) : (
            <ChiensListPdfPreview
              fields={draft as ChienPdfTableFieldConfig[]}
              sexFilter={sexFilter}
              minAgeYears={minAgeYears}
              title={t("entityPdfTable.previewTitle")}
              className="min-h-[70vh]"
            />
          )}
        </div>

        <DialogFooter className="gap-2">
          {canEdit ? (
            <>
              <Button type="button" variant="outline" onClick={resetToDefaults}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("entityPdfTable.actions.reset")}
              </Button>
              <Button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || draft.length === 0}
              >
                <Save className="mr-2 h-4 w-4" />
                {t("entityPdfTable.actions.save")}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
