import { readTerminalFont } from "@/lib/tauri/terminalFonts";
import type { CustomTerminalFont } from "@/types/terminalFonts";

import {
  DEFAULT_TERMINAL_FONT_ID,
  SYSTEM_MONOSPACE_FONT_FAMILY,
  customTerminalFontId,
  findImportedTerminalFontForProfile,
  getTerminalFontProfile,
  systemTerminalFontFamily,
  systemTerminalFontName,
} from "./terminalFontProfiles";

const bundledLoads = new Map<string, Promise<void>>();
const customFaces = new Map<string, Promise<FontFace>>();

export async function loadTerminalFont(
  selectionId: string,
  customFonts: readonly CustomTerminalFont[],
  systemFontNames: readonly string[],
) {
  const profile = getTerminalFontProfile(selectionId);
  if (profile) {
    if (profile.kind === "bundled") {
      await loadBundledProfile(profile.id, profile.preloadFamilies);
    } else if (
      profile.availabilityFamilies &&
      !profile.availabilityFamilies.some((familyName) =>
        systemFontNames.includes(familyName),
      )
    ) {
      const importedFont = findImportedTerminalFontForProfile(profile, customFonts);
      if (importedFont) {
        return loadCustomTerminalFont(importedFont);
      }
    }
    return profile.fontFamily;
  }

  const systemFontName = systemTerminalFontName(selectionId);
  if (systemFontName) {
    return systemFontNames.includes(systemFontName)
      ? systemTerminalFontFamily(systemFontName)
      : loadDefaultTerminalFont();
  }

  const id = customTerminalFontId(selectionId);
  const customFont = id ? customFonts.find((font) => font.id === id) : null;
  if (!customFont) {
    return loadDefaultTerminalFont();
  }

  return loadCustomTerminalFont(customFont);
}

async function loadCustomTerminalFont(customFont: CustomTerminalFont) {
  const familyName = customFontFamilyName(customFont.id);
  let load = customFaces.get(customFont.id);
  if (!load) {
    load = readTerminalFont(customFont.id)
      .then(async (bytes) => {
        const face = new FontFace(familyName, bytes, {
          display: "block",
          style: "normal",
          weight: "100 900",
        });
        await face.load();
        document.fonts.add(face);
        return face;
      })
      .catch((error: unknown) => {
        customFaces.delete(customFont.id);
        throw error;
      });
    customFaces.set(customFont.id, load);
  }
  await load;
  return `"${familyName}", ${SYSTEM_MONOSPACE_FONT_FAMILY}`;
}

export function releaseCustomTerminalFont(id: string) {
  const load = customFaces.get(id);
  customFaces.delete(id);
  if (load) {
    void load.then((face) => document.fonts.delete(face)).catch(() => undefined);
  }
}

async function loadDefaultTerminalFont() {
  const profile = getTerminalFontProfile(DEFAULT_TERMINAL_FONT_ID);
  if (!profile) {
    return SYSTEM_MONOSPACE_FONT_FAMILY;
  }
  if (profile.kind === "bundled") {
    await loadBundledProfile(profile.id, profile.preloadFamilies);
  }
  return profile.fontFamily;
}

function loadBundledProfile(id: string, preloadFamilies: readonly string[]) {
  let load = bundledLoads.get(id);
  if (!load) {
    load = Promise.all(preloadFamilies.map((font) => document.fonts.load(font)))
      .then(() => undefined)
      .catch((error: unknown) => {
        bundledLoads.delete(id);
        throw error;
      });
    bundledLoads.set(id, load);
  }
  return load;
}

function customFontFamilyName(id: string) {
  return `Connex Custom Terminal ${id}`;
}
