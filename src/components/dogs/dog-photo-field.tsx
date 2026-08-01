import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";

import { DogAvatar } from "@/components/dogs/dog-avatar";
import {
  DOG_PHOTO_ACCEPT,
  DOG_PHOTO_MAX_BYTES,
  validateDogPhotoFile,
} from "@/lib/dog-photo-api";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/database/schema-types";

type Specialty = Database["public"]["Enums"]["dog_specialty"];

type DogPhotoFieldProps = {
  name: string;
  specialty?: Specialty;
  currentPhotoUrl?: string | null;
  pendingFile: File | null;
  removePhoto: boolean;
  onPendingFileChange: (file: File | null) => void;
  onRemovePhotoChange: (remove: boolean) => void;
  onError?: (message: string | null) => void;
  variant?: "default" | "profile";
};

export function DogPhotoField({
  name,
  specialty,
  currentPhotoUrl,
  pendingFile,
  removePhoto,
  onPendingFileChange,
  onRemovePhotoChange,
  onError,
  variant = "default",
}: DogPhotoFieldProps) {
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
    const validationKey = validateDogPhotoFile(file);
    if (validationKey) {
      onError?.(t(`dogs.photo.error.${validationKey}`, { maxMb: DOG_PHOTO_MAX_BYTES / (1024 * 1024) }));
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

  if (variant === "profile") {
    return (
      <div className="flex shrink-0 flex-col items-center gap-3 sm:items-start">
        <DogAvatar
          name={name || "?"}
          photoUrl={displayPhotoUrl}
          specialty={specialty}
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
            {t("dogs.photo.change")}
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
              {t("dogs.photo.removeShort")}
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={DOG_PHOTO_ACCEPT}
          className="hidden"
          onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label>{t("dogs.field.photo")}</Label>
      <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center">
        <DogAvatar
          name={name || "?"}
          photoUrl={displayPhotoUrl}
          specialty={specialty}
          className="h-24 w-24 shadow-soft"
          fallbackClassName="text-lg"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t("dogs.photo.hint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              {displayPhotoUrl ? (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  {t("dogs.photo.change")}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t("dogs.photo.upload")}
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
                {t("dogs.photo.removeShort")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={DOG_PHOTO_ACCEPT}
        className="hidden"
        onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
