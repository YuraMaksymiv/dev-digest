/* nav-extension.ts — adds the Onboarding Tour item to the WORKSPACE nav group
   (after Pull Requests) without editing the vendored UI. Idempotent: module
   re-evaluation (HMR, SSR + client) never inserts a second entry. */
import { NAV, type NavItemDef } from "@devdigest/ui";

export const ONBOARDING_NAV_ITEM: NavItemDef = {
  key: "onboarding-tour",
  label: "Onboarding Tour",
  icon: "Layers",
  href: "/repos/:repoId/onboarding-tour",
};

export function registerOnboardingNav(): void {
  if (NAV.some((g) => g.items.some((i) => i.key === ONBOARDING_NAV_ITEM.key))) return;
  const workspace = NAV.find((g) => g.section === "WORKSPACE");
  if (!workspace) return;
  const pulls = workspace.items.findIndex((i) => i.key === "pulls");
  workspace.items.splice(pulls === -1 ? 0 : pulls + 1, 0, ONBOARDING_NAV_ITEM);
}

registerOnboardingNav();
