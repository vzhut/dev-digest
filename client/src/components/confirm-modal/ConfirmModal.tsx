/* ConfirmModal — the one confirmation dialog for destructive actions (confirm / cancel / ✕).
   Replaces window.confirm so the prompt is styled, testable and can show a pending state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

const WIDTH = 440;

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger = true,
  pending = false,
  onConfirm,
  onClose,
}: {
  title: React.ReactNode;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      width={WIDTH}
      title={title}
      onClose={pending ? undefined : onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose} disabled={pending}>
            {t("actions.cancel")}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} loading={pending} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p style={s.body}>{body}</p>
    </Modal>
  );
}
