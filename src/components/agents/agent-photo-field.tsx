import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";

import { AgentAvatar } from "@/components/agents/agent-avatar";
import {
  AGENT_PHOTO_ACCEPT,
  AGENT_PHOTO_MAX_BYTES,
  validateAgentPhotoFile,
} from "@/lib/agent-photo-api";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AgentPhotoFieldProps = {
  firstName: string;
  lastName: string;
  currentPhotoUrl?: string | null;
  pendingFile: File | null;
  removePhoto: boolean;
  onPendingFileChange: (file: File | null) => void;
  onRemovePhotoChange: (remove: boolean) => void;
  onError?: (message: string | null) => void;
  compact?: boolean;
  variant?: "default" | "compact" | "profile";
};

export function AgentPhotoField({
  firstName,
  lastName,
  currentPhotoUrl,
  pendingFile,
  removePhoto,
  onPendingFileChange,
  onRemovePhotoChange,
  onError,
  compact = false,
  variant,
}: AgentPhotoFieldProps) {
  const resolvedVariant = variant ?? (compact ? "compact" : "default");
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (pendingFile) {
      const objectUrl = URL.createObjectURL(pendingFile);
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setPreviewUrl(null);
    return undefined;
  }, [pendingFile]);

  const displayPhotoUrl = removePhoto ? null : (previewUrl ?? currentPhotoUrl ?? null);
  const canRemove = Boolean((currentPhotoUrl || pendingFile) && !removePhoto);

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const validationKey = validateAgentPhotoFile(file);
    if (validationKey) {
      onError?.(t(`employees.photo.error.${validationKey}`, { maxMb: AGENT_PHOTO_MAX_BYTES / (1024 * 1024) }));
      return;
    }
    onError?.(null);
    onRemovePhotoChange(false);
    onPendingFileChange(file);
  };

  const handleRemove = () => {
    onPendingFileChange(null);
    onRemovePhotoChange(true);
    onError?.(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (resolvedVariant === "profile") {
    return (
      <div className="flex shrink-0 flex-col items-center gap-3 sm:items-start">
        <AgentAvatar
          firstName={firstName || "?"}
          lastName={lastName || "?"}
          photoUrl={displayPhotoUrl}
          className="h-[100px] w-[100px] rounded-full border-2 border-border/80 shadow-lg ring-4 ring-background transition-transform duration-200 hover:scale-[1.02]"
          fallbackClassName="text-2xl"
        />

        <div className="flex flex-col gap-2 sm:min-w-[160px]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start rounded-xl transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="mr-2 h-4 w-4 shrink-0" />
            {t("employees.photo.change")}
          </Button>
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start rounded-xl text-destructive transition-all hover:bg-destructive/10 hover:text-destructive"
              onClick={handleRemove}
            >
              <Trash2 className="mr-2 h-4 w-4 shrink-0" />
              {t("employees.photo.removeShort")}
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={AGENT_PHOTO_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            handleFileChange(file);
          }}
        />
      </div>
    );
  }

  return (
    <div className={resolvedVariant === "compact" ? "space-y-2" : "space-y-3"}>
      {resolvedVariant !== "compact" ? <Label>{t("employees.field.photo")}</Label> : null}
      <div
        className={cn(
          resolvedVariant === "compact"
            ? "flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3"
            : "flex flex-col gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center",
        )}
      >
        <AgentAvatar
          firstName={firstName || "?"}
          lastName={lastName || "?"}
          photoUrl={displayPhotoUrl}
          className={
            resolvedVariant === "compact"
              ? "h-16 w-16 shrink-0 shadow-soft"
              : "h-24 w-24 shadow-soft"
          }
          fallbackClassName={resolvedVariant === "compact" ? "text-sm" : "text-lg"}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {resolvedVariant === "compact" ? (
            <p className="text-xs font-medium text-foreground">{t("employees.field.photo")}</p>
          ) : null}
          <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
            {t("employees.photo.hint")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              {displayPhotoUrl ? (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  {t("employees.photo.replace")}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t("employees.photo.upload")}
                </>
              )}
            </Button>
            {canRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleRemove}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("employees.photo.remove")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={AGENT_PHOTO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          handleFileChange(file);
        }}
      />
    </div>
  );
}
