import type { CanonicalLead } from "../domain/types.js";

/** Every lead source implements this: produce canonical leads. */
export interface Source {
  readonly name: string;
  fetch(): Promise<CanonicalLead[]>;
}
