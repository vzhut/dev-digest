"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiFailOn, CiPostAs, CiTrigger } from "@devdigest/shared";
import { POST_AS_LABEL_KEY, POST_AS_VALUES, SECRET_KEY, TOKEN_KEY, TRIGGER_VALUES } from "../../constants";
import { s } from "./styles";

/** Step 3: triggers, how results are posted, the secrets to add and the gate policy (read-only here). */
export function ConfigureStep({
  triggers,
  onToggleTrigger,
  postAs,
  onPostAs,
  failOn,
  workflowEdited,
}: {
  triggers: readonly CiTrigger[];
  onToggleTrigger: (t: CiTrigger) => void;
  postAs: CiPostAs;
  onPostAs: (p: CiPostAs) => void;
  failOn: CiFailOn;
  /** The user edited the workflow text in the Preview step. */
  workflowEdited: boolean;
}) {
  const t = useTranslations("ci.exportWizard");
  const ta = useTranslations("agents");
  return (
    <div style={s.wrap}>
      <fieldset style={s.group}>
        <legend style={s.legend}>{t("triggerLabel")}</legend>
        <div style={s.chips}>
          {TRIGGER_VALUES.map((v) => {
            const on = triggers.includes(v);
            return (
              <button key={v} type="button" aria-pressed={on} style={s.chip(on)} onClick={() => onToggleTrigger(v)}>
                {on && <Icon.Check size={13} />}
                <span className="mono">{`pull_request:${v}`}</span>
              </button>
            );
          })}
        </div>
        {triggers.length === 0 && (
          <p role="alert" style={s.error}>
            {t("triggerRequired")}
          </p>
        )}
      </fieldset>

      <fieldset style={s.group}>
        <legend style={s.legend}>{t("postResultsLabel")}</legend>
        <div style={s.radios}>
          {POST_AS_VALUES.map((v) => (
            <label key={v} style={s.radio}>
              <input type="radio" name="ci-post-as" checked={postAs === v} onChange={() => onPostAs(v)} />
              {t(`postAs.${POST_AS_LABEL_KEY[v]}`)}
              {v === "github_review" && (
                <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                  {t("recommended")}
                </Badge>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {workflowEdited && (
        <p role="note" style={s.note}>
          {t("editsDiscardedNote")}
        </p>
      )}

      <section aria-label={t("secretsLabel")} style={s.group}>
        <div style={s.legend}>{t("secretsLabel")}</div>
        <ul style={s.secrets}>
          <li style={s.secret}>
            <span className="mono" style={s.secretKey}>
              {SECRET_KEY}
            </span>
            <span style={s.secretNote}>{t("secretNote", { key: SECRET_KEY })}</span>
            <Badge color="var(--text-secondary)" dot>
              {t("secretUnchecked")}
            </Badge>
          </li>
          <li style={s.secret}>
            <span className="mono" style={s.secretKey}>
              {TOKEN_KEY}
            </span>
            <span style={s.secretNote}>{t("tokenProvided")}</span>
            <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
              {t("tokenReady")}
            </Badge>
          </li>
        </ul>
      </section>

      <section aria-label={t("failOnLabel")} style={s.group}>
        <div style={s.legend}>{t("failOnLabel")}</div>
        <p style={s.text}>
          <strong>{ta(`config.ciFailOnOptions.${failOn}`)}</strong> — {t("failOnNote")}
        </p>
        <p style={s.text}>{t("requiredCheckNote")}</p>
      </section>

      <p role="note" style={s.note}>
        {t("forkNote")}
      </p>
    </div>
  );
}
