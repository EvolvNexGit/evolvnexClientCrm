"use client";

import { useState } from "react";
import { getConsultationFileUrl } from "@/lib/consultation-queries";
import { isSafeHttpUrl } from "@/lib/consultation-files";
import type { ConsultationAttachmentRecord } from "@/lib/consultation-types";
import { cn } from "@/lib/utils";

type AttachmentOpenButtonProps = {
  attachment: Pick<ConsultationAttachmentRecord, "file_url" | "storage_path">;
  className?: string;
};

const OPEN_CLASS =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-border px-3 text-sm text-primary hover:bg-muted";

/** Opens a bucket file through a short-lived signed URL, or a legacy http(s) link. Anything else renders nothing. */
export function AttachmentOpenButton({ attachment, className }: AttachmentOpenButtonProps) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const { storage_path: storagePath, file_url: fileUrl } = attachment;

  if (storagePath) {
    const handleOpen = async () => {
      setOpenError(null);

      // Open the tab synchronously inside the click (mobile Safari blocks it after an await).
      // Never navigate the current page: the doctor may have unsaved notes.
      const popup = window.open("about:blank", "_blank");
      if (!popup) {
        setOpenError("Pop-up blocked. Allow pop-ups for this site to open files.");
        return;
      }
      popup.opener = null;

      setOpening(true);
      try {
        popup.location.href = await getConsultationFileUrl(storagePath);
      } catch (openFailure) {
        popup.close();
        setOpenError(openFailure instanceof Error ? openFailure.message : "Unable to open file.");
      } finally {
        setOpening(false);
      }
    };

    return (
      <span className="inline-flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          disabled={opening}
          onClick={() => void handleOpen()}
          className={cn(OPEN_CLASS, "disabled:opacity-60", className)}
        >
          {opening ? "Opening..." : "Open"}
        </button>
        {openError ? (
          <span role="alert" className="text-xs text-primary">
            {openError}
          </span>
        ) : null}
      </span>
    );
  }

  if (isSafeHttpUrl(fileUrl)) {
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(OPEN_CLASS, className)}
      >
        Open
      </a>
    );
  }

  return null;
}
