import type { CSSProperties } from "react";
import { FORMS, ATTR_COLOR } from "../game/creatures";
import { MODEL_HASH } from "../three/model-manifest";

/** Rendered by the dev portrait studio (?studio) into public/portraits/; the model's
 *  content hash busts caches when a model (and so its portrait) is regenerated. */
function portraitUrl(formId: string): string {
  return `/portraits/${formId}.webp?v=${MODEL_HASH[formId] ?? "0"}`;
}

/** A form's portrait on an attribute-tinted backdrop. Size comes from CSS. */
export function Portrait({ formId, className = "" }: { formId: string; className?: string }) {
  const form = FORMS[formId];
  const style = { "--attr": form ? ATTR_COLOR[form.attribute] : "#8893b5" } as CSSProperties;
  return (
    <span className={`portrait ${className}`} style={style}>
      <img src={portraitUrl(formId)} alt={form?.name ?? formId} loading="lazy" draggable={false} />
    </span>
  );
}
