import { SuperinvestorMeta } from "./types";
import { buffett } from "./buffett";
import { ackman } from "./ackman";
import { hohn } from "./hohn";
import { tepper } from "./tepper";
import { klarman } from "./klarman";
import { gates } from "./gates";
import { lilu } from "./lilu";
import { einhorn } from "./einhorn";
import { gerstner } from "./gerstner";
import { laffont } from "./laffont";
import { coleman } from "./coleman";
import { aschenbrenner } from "./aschenbrenner";

export * from "./types";
export {
  buffett,
  ackman,
  hohn,
  tepper,
  klarman,
  gates,
  lilu,
  einhorn,
  gerstner,
  laffont,
  coleman,
  aschenbrenner
};

export const SUPERINVESTORS: Record<string, SuperinvestorMeta> = {
  buffett,
  ackman,
  hohn,
  tepper,
  klarman,
  gates,
  lilu,
  einhorn,
  gerstner,
  laffont,
  coleman,
  aschenbrenner
};
