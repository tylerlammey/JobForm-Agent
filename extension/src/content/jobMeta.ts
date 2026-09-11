import type { JobPostingMeta } from "./types";

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function hasJobPostingType(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  return asArray(node["@type"]).map(t => String(t).toLowerCase()).includes("jobposting");
}

function findJobPostingNode(parsed: any): any | null {
  for (const candidate of asArray(parsed)) {
    if (hasJobPostingType(candidate)) return candidate;
    if (candidate && Array.isArray(candidate["@graph"])) {
      const found = candidate["@graph"].find(hasJobPostingType);
      if (found) return found;
    }
  }
  return null;
}

function extractCompanyName(node: any): string | null {
  const org = node?.hiringOrganization;
  if (typeof org === "string") return org.trim() || null;
  if (org && typeof org === "object" && typeof org.name === "string") return org.name.trim() || null;
  return null;
}

function extractLocationText(node: any): string | null {
  const place = asArray(node?.jobLocation)[0];
  if (!place) return null;
  const address = typeof place === "object" ? place.address : place;
  if (typeof address === "string") return address.trim() || null;
  if (address && typeof address === "object") {
    const city = address.addressLocality;
    const region = address.addressRegion;
    const country = typeof address.addressCountry === "string" ? address.addressCountry : address.addressCountry?.name;
    const parts = [city, region, (!city && !region) ? country : undefined]
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

// Never fabricates: returns nulls when no JobPosting structured data is found.
export function extractJobMeta(): JobPostingMeta {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    let parsed: any;
    try {
      parsed = JSON.parse(script.textContent || "");
    } catch {
      continue;
    }
    const node = findJobPostingNode(parsed);
    if (!node) continue;
    const role = typeof node.title === "string" && node.title.trim() ? node.title.trim() : null;
    const company = extractCompanyName(node);
    const location = extractLocationText(node);
    if (role || company || location) return { company, role, location };
  }
  return { company: null, role: null, location: null };
}
